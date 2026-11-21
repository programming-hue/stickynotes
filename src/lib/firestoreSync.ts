import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  decryptJsonPayload,
  encryptJsonPayload,
  generateBoardKeyBase64,
  generateSaltBase64,
  unwrapBoardKeyWithPassphrase,
  wrapBoardKeyWithPassphrase,
} from './crypto';
import type {
  BoardInvite,
  BoardMember,
  BoardSecretMeta,
  BoardSummary,
  BoardTheme,
  NoteItem,
  NotePayload,
} from '../types';

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export async function upsertUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    const email = (user.email || '').slice(0, 254);
    const displayName = (user.displayName || email || 'StickyBoard User').slice(0, 120);
    const photoURL = (user.photoURL || '').slice(0, 1024);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        email,
        displayName,
        photoURL,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

const secretCache = new Map<string, BoardSecretMeta>();

export async function createBoardWithKey(
  user: User,
  title: string,
  theme: BoardTheme = 'light',
  windEnabled = true,
  initialNotes: NoteItem[] = []
): Promise<{ boardId: string; boardKey: string }> {
  const boardId = makeId('brd');
  const boardKey = generateBoardKeyBase64();
  const safeTitle = (title.trim() || 'My Sticky Board').slice(0, 100);
  const boardPath = `boards/${boardId}`;

  const secretMeta: BoardSecretMeta = {
    wrappedKey: boardKey,
    keyVersion: 1,
    isPassphraseProtected: false,
    salt: '',
    keyCheck: '',
  };
  secretCache.set(boardId, secretMeta);

  const batch = writeBatch(db);
  batch.set(doc(db, 'boards', boardId), {
    ownerId: user.uid,
    title: safeTitle,
    theme,
    windEnabled,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'boards', boardId, 'secrets', 'encryption'), {
    ...secretMeta,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const note of initialNotes) {
    const { encryptedPayload, iv } = await encryptNotePayloadSafe(boardKey, note.payload);
    const noteId = note.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || makeId('note');
    const noteRef = doc(db, 'boards', boardId, 'notes', noteId);
    batch.set(noteRef, {
      type: note.type,
      color: note.color,
      font: note.font,
      fontSize: note.fontSize,
      x: clamp(Math.round(note.x), -10000, 50000),
      y: clamp(Math.round(note.y), -10000, 50000),
      width: clamp(Math.round(note.width), 160, 1200),
      height: clamp(Math.round(note.height), 140, 1200),
      tilt: clamp(Number(note.tilt.toFixed(2)), -15, 15),
      zIndex: clamp(Math.round(note.zIndex), 0, 1000000),
      archived: Boolean(note.archived),
      encryptedPayload,
      iv,
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    secretCache.delete(boardId);
    handleFirestoreError(error, OperationType.WRITE, boardPath);
  }

  return { boardId, boardKey };
}

export async function ensureBoardSecret(boardId: string): Promise<BoardSecretMeta> {
  const path = `boards/${boardId}/secrets/encryption`;
  const boardKey = generateBoardKeyBase64();
  const secretMeta: BoardSecretMeta = {
    wrappedKey: boardKey,
    keyVersion: 1,
    isPassphraseProtected: false,
    salt: '',
    keyCheck: '',
  };
  try {
    await setDoc(doc(db, 'boards', boardId, 'secrets', 'encryption'), {
      ...secretMeta,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    secretCache.set(boardId, secretMeta);
    return secretMeta;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBoardMeta(
  boardId: string,
  updates: Partial<{ title: string; theme: BoardTheme; windEnabled: boolean }>
): Promise<void> {
  const path = `boards/${boardId}`;
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (typeof updates.title === 'string') {
    payload.title = (updates.title.trim() || 'Untitled Board').slice(0, 100);
  }
  if (updates.theme) {
    payload.theme = updates.theme;
  }
  if (typeof updates.windEnabled === 'boolean') {
    payload.windEnabled = updates.windEnabled;
  }
  try {
    await updateDoc(doc(db, 'boards', boardId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBoardCascade(boardId: string, noteIds: string[]): Promise<void> {
  const path = `boards/${boardId}`;
  try {
    const batch = writeBatch(db);
    for (const nid of noteIds) {
      batch.delete(doc(db, 'boards', boardId, 'notes', nid));
    }
    batch.delete(doc(db, 'boards', boardId, 'secrets', 'encryption'));
    batch.delete(doc(db, 'boards', boardId));
    await batch.commit();
    secretCache.delete(boardId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchBoardSecret(boardId: string): Promise<BoardSecretMeta | null> {
  const cached = secretCache.get(boardId);
  if (cached) return cached;
  const path = `boards/${boardId}/secrets/encryption`;
  try {
    const snap = await getDoc(doc(db, 'boards', boardId, 'secrets', 'encryption'));
    if (!snap.exists()) return null;
    const data = snap.data() as BoardSecretMeta;
    secretCache.set(boardId, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function enableBoardPassphrase(
  boardId: string,
  rawBoardKey: string,
  passphrase: string
): Promise<BoardSecretMeta> {
  const path = `boards/${boardId}/secrets/encryption`;
  const salt = generateSaltBase64();
  const { wrappedKey, keyCheck } = await wrapBoardKeyWithPassphrase(rawBoardKey, passphrase, salt);
  try {
    await updateDoc(doc(db, 'boards', boardId, 'secrets', 'encryption'), {
      wrappedKey,
      isPassphraseProtected: true,
      salt,
      keyCheck,
      updatedAt: serverTimestamp(),
    });
    const meta: BoardSecretMeta = {
      wrappedKey,
      keyVersion: 1,
      isPassphraseProtected: true,
      salt,
      keyCheck,
    };
    secretCache.set(boardId, meta);
    return meta;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function disableBoardPassphrase(
  boardId: string,
  rawBoardKey: string
): Promise<BoardSecretMeta> {
  const path = `boards/${boardId}/secrets/encryption`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'secrets', 'encryption'), {
      wrappedKey: rawBoardKey,
      isPassphraseProtected: false,
      salt: '',
      keyCheck: '',
      updatedAt: serverTimestamp(),
    });
    const meta: BoardSecretMeta = {
      wrappedKey: rawBoardKey,
      keyVersion: 1,
      isPassphraseProtected: false,
      salt: '',
      keyCheck: '',
    };
    secretCache.set(boardId, meta);
    return meta;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function unlockSecretWithPassphrase(
  secret: BoardSecretMeta,
  passphrase: string
): Promise<string> {
  return unwrapBoardKeyWithPassphrase(secret.wrappedKey, passphrase, secret.salt);
}

async function encryptNotePayloadSafe(
  boardKey: string,
  payload: NotePayload
): Promise<{ encryptedPayload: string; iv: string }> {
  let candidate = { ...payload };
  let encrypted = await encryptJsonPayload(boardKey, candidate);
  if (encrypted.encryptedPayload.length > 65000) {
    candidate = {
      ...candidate,
      body: (candidate.body || '').slice(0, 24000),
      title: (candidate.title || '').slice(0, 200),
    };
    encrypted = await encryptJsonPayload(boardKey, candidate);
  }
  return encrypted;
}

export async function createEncryptedNote(
  boardId: string,
  boardKey: string,
  userUid: string,
  note: NoteItem
): Promise<void> {
  const path = `boards/${boardId}/notes/${note.id}`;
  const { encryptedPayload, iv } = await encryptNotePayloadSafe(boardKey, note.payload);
  try {
    await setDoc(doc(db, 'boards', boardId, 'notes', note.id), {
      type: note.type,
      color: note.color,
      font: note.font,
      fontSize: note.fontSize,
      x: clamp(Math.round(note.x), -10000, 50000),
      y: clamp(Math.round(note.y), -10000, 50000),
      width: clamp(Math.round(note.width), 160, 1200),
      height: clamp(Math.round(note.height), 140, 1200),
      tilt: clamp(Number(note.tilt.toFixed(2)), -15, 15),
      zIndex: clamp(Math.round(note.zIndex), 0, 1000000),
      archived: Boolean(note.archived),
      encryptedPayload,
      iv,
      createdBy: userUid,
      updatedBy: userUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateEncryptedNote(
  boardId: string,
  boardKey: string,
  userUid: string,
  note: NoteItem,
  options?: { payloadChanged?: boolean }
): Promise<void> {
  const path = `boards/${boardId}/notes/${note.id}`;
  const updateData: Record<string, unknown> = {
    type: note.type,
    color: note.color,
    font: note.font,
    fontSize: note.fontSize,
    x: clamp(Math.round(note.x), -10000, 50000),
    y: clamp(Math.round(note.y), -10000, 50000),
    width: clamp(Math.round(note.width), 160, 1200),
    height: clamp(Math.round(note.height), 140, 1200),
    tilt: clamp(Number(note.tilt.toFixed(2)), -15, 15),
    zIndex: clamp(Math.round(note.zIndex), 0, 1000000),
    archived: Boolean(note.archived),
    updatedBy: userUid,
    updatedAt: serverTimestamp(),
  };

  if (options?.payloadChanged !== false) {
    const { encryptedPayload, iv } = await encryptNotePayloadSafe(boardKey, note.payload);
    updateData.encryptedPayload = encryptedPayload;
    updateData.iv = iv;
  }

  try {
    await updateDoc(doc(db, 'boards', boardId, 'notes', note.id), updateData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteNoteDoc(boardId: string, noteId: string): Promise<void> {
  const path = `boards/${boardId}/notes/${noteId}`;
  try {
    await deleteDoc(doc(db, 'boards', boardId, 'notes', noteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeOwnedBoards(
  uid: string,
  onChange: (boards: BoardSummary[]) => void
): Unsubscribe {
  const path = 'boards';
  const q = query(collection(db, 'boards'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      const list: BoardSummary[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: String(data.title || 'My Board'),
          ownerId: String(data.ownerId || uid),
          theme: (data.theme as BoardTheme) || 'light',
          windEnabled: data.windEnabled !== false,
          role: 'owner',
        };
      });
      onChange(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeSharedBoardRefs(
  uid: string,
  onChange: (boards: BoardSummary[]) => void
): Unsubscribe {
  const path = `users/${uid}/boardRefs`;
  return onSnapshot(
    collection(db, 'users', uid, 'boardRefs'),
    async (snap) => {
      const resolved: BoardSummary[] = [];
      for (const refDoc of snap.docs) {
        const refData = refDoc.data();
        const boardId = String(refData.boardId || refDoc.id);
        try {
          const [boardSnap, memberSnap] = await Promise.all([
            getDoc(doc(db, 'boards', boardId)),
            getDoc(doc(db, 'boards', boardId, 'members', uid)),
          ]);
          if (boardSnap.exists() && memberSnap.exists()) {
            const bData = boardSnap.data();
            const mData = memberSnap.data();
            resolved.push({
              id: boardId,
              title: String(bData.title || refData.boardTitle || 'Shared Board'),
              ownerId: String(bData.ownerId || refData.ownerId),
              theme: (bData.theme as BoardTheme) || 'light',
              windEnabled: bData.windEnabled !== false,
              role: mData.role === 'viewer' ? 'viewer' : 'editor',
            });
          } else {
            // Access revoked or board deleted; clean up stale ref silently
            void deleteDoc(doc(db, 'users', uid, 'boardRefs', boardId)).catch(() => {});
          }
        } catch {
          // Permission revoked; clean up stale ref silently
          void deleteDoc(doc(db, 'users', uid, 'boardRefs', boardId)).catch(() => {});
        }
      }
      onChange(resolved);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeBoardNotes(
  boardId: string,
  boardKey: string,
  onNotes: (notes: NoteItem[]) => void,
  onPermissionLost: () => void
): Unsubscribe {
  const path = `boards/${boardId}/notes`;
  return onSnapshot(
    collection(db, 'boards', boardId, 'notes'),
    async (snap) => {
      const notes: NoteItem[] = [];
      for (const d of snap.docs) {
        const raw = d.data();
        let payload: NotePayload = { title: 'Encrypted Note', body: '' };
        try {
          payload = await decryptJsonPayload<NotePayload>(
            boardKey,
            String(raw.encryptedPayload || ''),
            String(raw.iv || '')
          );
        } catch {
          payload = {
            title: 'Encrypted Note',
            body: '_Unable to decrypt with current key._',
          };
        }
        notes.push({
          id: d.id,
          type: raw.type,
          color: raw.color,
          font: raw.font,
          fontSize: raw.fontSize,
          x: Number(raw.x ?? 40),
          y: Number(raw.y ?? 40),
          width: Number(raw.width ?? 260),
          height: Number(raw.height ?? 230),
          tilt: Number(raw.tilt ?? 0),
          zIndex: Number(raw.zIndex ?? 1),
          archived: Boolean(raw.archived),
          payload,
          createdBy: String(raw.createdBy || ''),
          updatedBy: String(raw.updatedBy || ''),
          updatedAtMs: raw.updatedAt?.toMillis ? raw.updatedAt.toMillis() : Date.now(),
        });
      }
      notes.sort((a, b) => a.zIndex - b.zIndex);
      onNotes(notes);
    },
    (error) => {
      if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
        onPermissionLost();
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeBoardMembers(
  boardId: string,
  ownerId: string,
  onChange: (members: BoardMember[]) => void
): Unsubscribe {
  const path = `boards/${boardId}/members`;
  const q = query(collection(db, 'boards', boardId, 'members'), where('boardOwnerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid || d.id),
            boardOwnerId: String(data.boardOwnerId || ownerId),
            email: String(data.email || ''),
            displayName: String(data.displayName || 'Collaborator'),
            photoURL: String(data.photoURL || ''),
            role: data.role === 'viewer' ? 'viewer' : 'editor',
            inviteId: String(data.inviteId || ''),
          };
        })
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeBoardInvitesForOwner(
  ownerId: string,
  boardId: string,
  onChange: (invites: BoardInvite[]) => void
): Unsubscribe {
  const path = 'invites';
  const q = query(collection(db, 'invites'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: BoardInvite[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.boardId === boardId && data.status === 'pending') {
          list.push({
            id: d.id,
            boardId: String(data.boardId),
            boardTitle: String(data.boardTitle || ''),
            ownerId: String(data.ownerId),
            ownerName: String(data.ownerName || ''),
            inviteeEmail: String(data.inviteeEmail || ''),
            role: data.role === 'viewer' ? 'viewer' : 'editor',
            status: data.status,
          });
        }
      }
      onChange(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeIncomingInvites(
  email: string,
  onChange: (invites: BoardInvite[]) => void
): Unsubscribe {
  const path = 'invites';
  const q = query(collection(db, 'invites'), where('inviteeEmail', '==', email.toLowerCase()));
  return onSnapshot(
    q,
    (snap) => {
      const list: BoardInvite[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.status === 'pending') {
          list.push({
            id: d.id,
            boardId: String(data.boardId),
            boardTitle: String(data.boardTitle || 'Shared Board'),
            ownerId: String(data.ownerId),
            ownerName: String(data.ownerName || 'Board Owner'),
            inviteeEmail: String(data.inviteeEmail || ''),
            role: data.role === 'viewer' ? 'viewer' : 'editor',
            status: 'pending',
          });
        }
      }
      onChange(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createBoardInvite(
  user: User,
  board: BoardSummary,
  inviteeEmail: string,
  role: 'editor' | 'viewer'
): Promise<void> {
  const inviteId = makeId('inv');
  const path = `invites/${inviteId}`;
  const cleanEmail = inviteeEmail.trim().toLowerCase().slice(0, 254);
  try {
    await setDoc(doc(db, 'invites', inviteId), {
      boardId: board.id,
      boardTitle: board.title.slice(0, 100),
      ownerId: user.uid,
      ownerName: (user.displayName || user.email || 'Owner').slice(0, 120),
      inviteeEmail: cleanEmail,
      role,
      status: 'pending',
      acceptedByUid: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const path = `invites/${inviteId}`;
  try {
    await updateDoc(doc(db, 'invites', inviteId), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function acceptBoardInvite(user: User, invite: BoardInvite): Promise<void> {
  const path = `invites/${invite.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'invites', invite.id), {
      status: 'accepted',
      acceptedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'boards', invite.boardId, 'members', user.uid), {
      uid: user.uid,
      boardOwnerId: invite.ownerId,
      email: (user.email || '').toLowerCase().slice(0, 254),
      displayName: (user.displayName || user.email || 'Collaborator').slice(0, 120),
      photoURL: (user.photoURL || '').slice(0, 1024),
      role: invite.role,
      inviteId: invite.id,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', user.uid, 'boardRefs', invite.boardId), {
      boardId: invite.boardId,
      ownerId: invite.ownerId,
      boardTitle: invite.boardTitle.slice(0, 100),
      role: invite.role,
      addedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateMemberRole(
  boardId: string,
  memberUid: string,
  role: 'editor' | 'viewer'
): Promise<void> {
  const path = `boards/${boardId}/members/${memberUid}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'members', memberUid), {
      role,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeBoardMember(boardId: string, memberUid: string): Promise<void> {
  const path = `boards/${boardId}/members/${memberUid}`;
  try {
    await deleteDoc(doc(db, 'boards', boardId, 'members', memberUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
