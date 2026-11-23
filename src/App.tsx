import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckSquare,
  ChevronDown,
  Clock,
  FolderPlus,
  HeartPulse,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Palette,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Timer,
  Users,
  Wind,
  X,
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { ArchiveDrawer } from './components/ArchiveDrawer';
import { NoteCard } from './components/NoteCard';
import { ShareModal } from './components/ShareModal';
import { createBlankNote, createStarterNotes } from './lib/defaults';
import { auth, googleProvider } from './lib/firebase';
import {
  acceptBoardInvite,
  createBoardWithKey,
  createEncryptedNote,
  deleteBoardCascade,
  deleteNoteDoc,
  ensureBoardSecret,
  fetchBoardSecret,
  subscribeBoardInvitesForOwner,
  subscribeBoardMembers,
  subscribeBoardNotes,
  subscribeIncomingInvites,
  subscribeOwnedBoards,
  subscribeSharedBoardRefs,
  unlockSecretWithPassphrase,
  updateBoardMeta,
  updateEncryptedNote,
  upsertUserProfile,
} from './lib/firestoreSync';
import type {
  BoardInvite,
  BoardMember,
  BoardSecretMeta,
  BoardSummary,
  BoardTheme,
  NoteItem,
  NoteType,
} from './types';

const LOCAL_NOTES_KEY = 'stickyboard_local_notes_v1';
const LOCAL_THEME_KEY = 'stickyboard_local_theme_v1';
const LOCAL_WIND_KEY = 'stickyboard_local_wind_v1';

function loadLocalNotes(): NoteItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_NOTES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as NoteItem[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return createStarterNotes('local');
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Local fallback state (renders instantaneously at 0ms before auth finishes)
  const [localNotes, setLocalNotes] = useState<NoteItem[]>(() => loadLocalNotes());
  const [localTheme, setLocalTheme] = useState<BoardTheme>(() => {
    const saved = localStorage.getItem(LOCAL_THEME_KEY);
    return saved === 'candy' || saved === 'dark' ? saved : 'light';
  });
  const [localWind, setLocalWind] = useState<boolean>(() => {
    return localStorage.getItem(LOCAL_WIND_KEY) !== 'false';
  });

  // Cloud state
  const [ownedBoards, setOwnedBoards] = useState<BoardSummary[]>([]);
  const [sharedBoards, setSharedBoards] = useState<BoardSummary[]>([]);
  const [ownedLoaded, setOwnedLoaded] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [cloudNotes, setCloudNotes] = useState<NoteItem[]>([]);
  const [boardSecret, setBoardSecret] = useState<BoardSecretMeta | null>(null);
  const [boardKey, setBoardKey] = useState<string | null>(null);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);

  // Collaboration state
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [sentInvites, setSentInvites] = useState<BoardInvite[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<BoardInvite[]>([]);
  const [dismissedInviteIds, setDismissedInviteIds] = useState<string[]>([]);

  // UI modals & controls
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [showNewBoardInput, setShowNewBoardInput] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showArchiveDrawer, setShowArchiveDrawer] = useState(false);
  const [showMobileAddSheet, setShowMobileAddSheet] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );

  const boardMenuRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const saveTimersRef = useRef<Record<string, number>>({});
  const bootstrappingRef = useRef(false);
  const pendingOpenBoardIdRef = useRef<string | null>(null);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);

  // Sync mobile viewport breakpoint with Tailwind md (768px)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setShowMobileAddSheet(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const allBoards = useMemo(() => [...ownedBoards, ...sharedBoards], [ownedBoards, sharedBoards]);

  const activeBoard = useMemo(
    () => allBoards.find((b) => b.id === activeBoardId) || null,
    [allBoards, activeBoardId]
  );

  const isCloudMode = Boolean(user && activeBoard);
  const activeTheme: BoardTheme = activeBoard ? activeBoard.theme : localTheme;
  const activeWind: boolean = activeBoard ? activeBoard.windEnabled : localWind;
  const activeNotes: NoteItem[] = isCloudMode ? cloudNotes : localNotes;
  const canEdit: boolean = !isCloudMode || activeBoard?.role === 'owner' || activeBoard?.role === 'editor';

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (activeTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [activeTheme]);

  // Persist local mode notes/preferences
  useEffect(() => {
    if (user) return;
    try {
      localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(localNotes));
      localStorage.setItem(LOCAL_THEME_KEY, localTheme);
      localStorage.setItem(LOCAL_WIND_KEY, String(localWind));
    } catch {
      // ignore quota errors
    }
  }, [user, localNotes, localTheme, localWind]);

  // Close board menu on outside click
  useEffect(() => {
    if (!showBoardMenu) return;
    const onDown = (e: PointerEvent) => {
      if (boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) {
        setShowBoardMenu(false);
        setShowNewBoardInput(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [showBoardMenu]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        void upsertUserProfile(u);
      } else {
        setOwnedBoards([]);
        setSharedBoards([]);
        setOwnedLoaded(false);
        setActiveBoardId(null);
        setCloudNotes([]);
        setBoardKey(null);
        setBoardSecret(null);
        setNeedsPassphrase(false);
        setIncomingInvites([]);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to user's owned boards, shared board refs, and incoming invites
  useEffect(() => {
    if (!authReady || !user) return;
    const unsubOwned = subscribeOwnedBoards(user.uid, (boards) => {
      setOwnedBoards(boards);
      setOwnedLoaded(true);
    });
    const unsubShared = subscribeSharedBoardRefs(user.uid, (boards) => {
      setSharedBoards(boards);
    });
    const unsubInvites = user.email
      ? subscribeIncomingInvites(user.uid, user.email, (invs) => setIncomingInvites(invs))
      : () => {};

    return () => {
      unsubOwned();
      unsubShared();
      unsubInvites();
    };
  }, [authReady, user]);

  // Auto-create first cloud board on initial Google Sign-In, or select active board
  useEffect(() => {
    if (!user || !ownedLoaded) return;
    if (allBoards.length === 0 && !bootstrappingRef.current) {
      bootstrappingRef.current = true;
      void (async () => {
        try {
          const { boardId } = await createBoardWithKey(
            user,
            'My Sticky Board',
            localTheme,
            localWind,
            localNotes
          );
          setActiveBoardId(boardId);
        } finally {
          bootstrappingRef.current = false;
        }
      })();
      return;
    }

    if (pendingOpenBoardIdRef.current) {
      if (allBoards.some((b) => b.id === pendingOpenBoardIdRef.current)) {
        const targetId = pendingOpenBoardIdRef.current;
        pendingOpenBoardIdRef.current = null;
        if (activeBoardId !== targetId) {
          setActiveBoardId(targetId);
        }
      }
      return;
    }

    if (!activeBoardId || !allBoards.some((b) => b.id === activeBoardId)) {
      if (allBoards.length > 0) {
        setActiveBoardId(allBoards[0].id);
      }
    }
  }, [user, ownedLoaded, allBoards, activeBoardId, localTheme, localWind, localNotes]);

  const activeBoardOwnerId = activeBoard?.ownerId || null;

  // Load encryption secret whenever activeBoardId changes
  useEffect(() => {
    if (!user || !activeBoardId || !activeBoardOwnerId) {
      setBoardKey(null);
      setBoardSecret(null);
      setNeedsPassphrase(false);
      return;
    }
    let cancelled = false;
    setBoardKey(null);
    setNeedsPassphrase(false);
    setPassphraseError(null);
    setCloudNotes([]);

    void (async () => {
      try {
        let secret = await fetchBoardSecret(activeBoardId);
        if (cancelled) return;
        if (!secret && activeBoardOwnerId === user.uid) {
          secret = await ensureBoardSecret(activeBoardId);
          if (cancelled) return;
        }
        setBoardSecret(secret);
        if (!secret) return;
        if (secret.isPassphraseProtected) {
          setNeedsPassphrase(true);
        } else {
          setBoardKey(secret.wrappedKey);
        }
      } catch (err) {
        if (!cancelled) {
          setAuthError(err instanceof Error ? err.message : 'Unable to load board encryption key.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, activeBoardId, activeBoardOwnerId]);

  // Subscribe to encrypted notes once boardKey is unlocked
  useEffect(() => {
    if (!user || !activeBoardId || !boardKey) return;
    const unsub = subscribeBoardNotes(
      activeBoardId,
      boardKey,
      (notes) => setCloudNotes(notes),
      () => {
        // Permission lost (e.g., revoked from shared board)
        setActiveBoardId(null);
      }
    );
    return () => unsub();
  }, [user, activeBoardId, boardKey]);

  // Subscribe to board collaborators & sent invites when user owns the active board
  useEffect(() => {
    if (!user || !activeBoard || activeBoard.ownerId !== user.uid) {
      setMembers([]);
      setSentInvites([]);
      return;
    }
    const unsubMembers = subscribeBoardMembers(activeBoard.id, user.uid, setMembers);
    const unsubSent = subscribeBoardInvitesForOwner(user.uid, activeBoard.id, setSentInvites);
    return () => {
      unsubMembers();
      unsubSent();
    };
  }, [user, activeBoard]);

  // Add note/widget helper
  const addNoteAt = useCallback(
    async (type: NoteType, customX?: number, customY?: number) => {
      if (!canEdit) return;
      const maxZ = activeNotes.reduce((m, n) => Math.max(m, n.zIndex), 0);
      const count = activeNotes.filter((n) => !n.archived).length;
      const x =
        customX ?? Math.max(32, 60 + ((count * 44) % 480) + (canvasRef.current?.scrollLeft || 0));
      const y =
        customY ?? Math.max(32, 56 + ((count * 38) % 320) + (canvasRef.current?.scrollTop || 0));

      const note = createBlankNote(type, x, y, maxZ + 1, user?.uid || 'local');

      if (isCloudMode && user && activeBoardId && boardKey) {
        setCloudNotes((prev) => [...prev, note]);
        await createEncryptedNote(activeBoardId, boardKey, user.uid, note);
      } else {
        setLocalNotes((prev) => [...prev, note]);
      }
    },
    [canEdit, activeNotes, user, isCloudMode, activeBoardId, boardKey]
  );

  // Global keyboard shortcuts (N for new note, Esc to close drawers)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowShareModal(false);
        setShowArchiveDrawer(false);
        setShowBoardMenu(false);
        setShowMobileAddSheet(false);
        setSearchOpen(false);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        void addNoteAt('sticky');
      } else if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addNoteAt]);

  // Bring card to front
  const handleBringToFront = useCallback(
    (id: string) => {
      const target = activeNotes.find((n) => n.id === id);
      if (!target) return;
      const maxZ = activeNotes.reduce((m, n) => Math.max(m, n.zIndex), 0);
      if (target.zIndex >= maxZ && maxZ > 0) return;
      const nextZ = maxZ + 1;
      const updated = { ...target, zIndex: nextZ };

      if (isCloudMode && user && activeBoardId && boardKey) {
        setCloudNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
        if (canEdit) {
          void updateEncryptedNote(activeBoardId, boardKey, user.uid, updated, {
            payloadChanged: false,
          });
        }
      } else {
        setLocalNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      }
    },
    [activeNotes, isCloudMode, user, activeBoardId, boardKey, canEdit]
  );

  // Update note with smart debounce for typing
  const handleNoteChange = useCallback(
    (updated: NoteItem, payloadChanged: boolean) => {
      if (!canEdit) return;
      if (isCloudMode && user && activeBoardId && boardKey) {
        setCloudNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        const existingTimer = saveTimersRef.current[updated.id];
        if (existingTimer) window.clearTimeout(existingTimer);
        saveTimersRef.current[updated.id] = window.setTimeout(() => {
          void updateEncryptedNote(activeBoardId, boardKey, user.uid, updated, {
            payloadChanged,
          });
        }, payloadChanged ? 320 : 80);
      } else {
        setLocalNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      }
    },
    [canEdit, isCloudMode, user, activeBoardId, boardKey]
  );

  const handleArchiveToggle = useCallback(
    (id: string, archived: boolean) => {
      if (!canEdit) return;
      const target = activeNotes.find((n) => n.id === id);
      if (!target) return;
      const updated = { ...target, archived };
      if (isCloudMode && user && activeBoardId && boardKey) {
        setCloudNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
        void updateEncryptedNote(activeBoardId, boardKey, user.uid, updated, {
          payloadChanged: false,
        });
      } else {
        setLocalNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      }
    },
    [canEdit, activeNotes, isCloudMode, user, activeBoardId, boardKey]
  );

  const handleDeleteNote = useCallback(
    (id: string) => {
      if (!canEdit) return;
      if (isCloudMode && activeBoardId) {
        setCloudNotes((prev) => prev.filter((n) => n.id !== id));
        void deleteNoteDoc(activeBoardId, id);
      } else {
        setLocalNotes((prev) => prev.filter((n) => n.id !== id));
      }
    },
    [canEdit, isCloudMode, activeBoardId]
  );

  // Tidy / auto-arrange visible notes cleanly
  const handleTidyBoard = () => {
    if (!canEdit) return;
    const visible = activeNotes.filter((n) => !n.archived);
    const cols = Math.max(1, Math.floor((window.innerWidth - 64) / 310));
    const colHeights = new Array<number>(cols).fill(40);
    const arranged = visible.map((note, idx) => {
      const col = idx % cols;
      const x = 40 + col * 308;
      const y = colHeights[col];
      colHeights[col] += note.height + 28;
      return { ...note, x, y };
    });

    const arrangedMap = new Map(arranged.map((n) => [n.id, n]));
    const nextAll = activeNotes.map((n) => arrangedMap.get(n.id) || n);

    if (isCloudMode && user && activeBoardId && boardKey) {
      setCloudNotes(nextAll);
      for (const n of arranged) {
        void updateEncryptedNote(activeBoardId, boardKey, user.uid, n, { payloadChanged: false });
      }
    } else {
      setLocalNotes(nextAll);
    }
  };

  // Cycle board theme
  const cycleTheme = () => {
    const order: BoardTheme[] = ['light', 'candy', 'dark'];
    const next = order[(order.indexOf(activeTheme) + 1) % order.length];
    if (isCloudMode && activeBoard && activeBoard.role === 'owner') {
      setOwnedBoards((prev) =>
        prev.map((b) => (b.id === activeBoard.id ? { ...b, theme: next } : b))
      );
      void updateBoardMeta(activeBoard.id, { theme: next });
    } else {
      setLocalTheme(next);
    }
  };

  // Toggle wind physics
  const toggleWind = () => {
    const next = !activeWind;
    if (isCloudMode && activeBoard && activeBoard.role === 'owner') {
      setOwnedBoards((prev) =>
        prev.map((b) => (b.id === activeBoard.id ? { ...b, windEnabled: next } : b))
      );
      void updateBoardMeta(activeBoard.id, { windEnabled: next });
    } else {
      setLocalWind(next);
    }
  };

  // Auth actions
  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in cancelled.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // Create new board
  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const title = newBoardTitle.trim() || 'New Workspace';
    setNewBoardTitle('');
    setShowNewBoardInput(false);
    setShowBoardMenu(false);
    const { boardId } = await createBoardWithKey(
      user,
      title,
      activeTheme,
      activeWind,
      createStarterNotes(user.uid).slice(0, 2)
    );
    setActiveBoardId(boardId);
  };

  // Unlock passphrase-protected board
  const handleUnlockBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardSecret) return;
    setPassphraseError(null);
    try {
      const key = await unlockSecretWithPassphrase(boardSecret, passphraseInput);
      setBoardKey(key);
      setNeedsPassphrase(false);
      setPassphraseInput('');
    } catch {
      setPassphraseError('Incorrect passphrase. Please try again.');
    }
  };

  // Import JSON backup notes
  const handleImportNotes = async (imported: NoteItem[]) => {
    if (!canEdit) return;
    const sanitized = imported.slice(0, 100).map((n, idx) => ({
      ...n,
      id: `note_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      zIndex: idx + 1,
      createdBy: user?.uid || 'local',
      updatedBy: user?.uid || 'local',
      updatedAtMs: Date.now(),
    }));
    if (isCloudMode && user && activeBoardId && boardKey) {
      for (const note of sanitized) {
        await createEncryptedNote(activeBoardId, boardKey, user.uid, note);
      }
    } else {
      setLocalNotes((prev) => [...prev, ...sanitized]);
    }
    setShowArchiveDrawer(false);
  };

  // Filter notes by search
  const visibleNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeNotes.filter((n) => {
      if (n.archived) return false;
      if (!q) return true;
      const inTitle = n.payload.title.toLowerCase().includes(q);
      const inBody = n.payload.body.toLowerCase().includes(q);
      const inItems = (n.payload.items || []).some((i) => i.text.toLowerCase().includes(q));
      return inTitle || inBody || inItems;
    });
  }, [activeNotes, searchQuery]);

  const archivedNotes = useMemo(() => activeNotes.filter((n) => n.archived), [activeNotes]);

  const visibleIncomingInvites = useMemo(
    () => incomingInvites.filter((inv) => !dismissedInviteIds.includes(inv.id)),
    [incomingInvites, dismissedInviteIds]
  );

  const canvasBgClass =
    activeTheme === 'dark'
      ? 'board-bg-dark text-slate-100'
      : activeTheme === 'candy'
      ? 'board-bg-candy text-slate-900'
      : 'board-bg-light text-slate-900';

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${canvasBgClass}`}>
      {/* Clean 3-Zone Top Navigation Bar */}
      <header className="relative z-30 h-13 md:h-14 px-3 md:px-6 flex items-center justify-between gap-2 md:gap-8 border-b border-black/[0.07] dark:border-white/[0.08] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shrink-0">
        {/* Zone 1: Brand Wordmark + Board Selector */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <span className="font-display-note text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            StickyBoard
          </span>

          {user && activeBoard && (
            <div ref={boardMenuRef} className="relative min-w-0">
              <button
                type="button"
                onClick={() => setShowBoardMenu((v) => !v)}
                className="inline-flex items-center gap-1 px-1.5 py-1.5 min-h-[36px] text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap max-w-full"
              >
                <span className="truncate max-w-[110px] sm:max-w-[200px]">{activeBoard.title}</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
              </button>

              {showBoardMenu && (
                <div className="absolute left-0 top-10 w-64 max-w-[calc(100vw-24px)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-2 z-50 space-y-1 text-xs">
                  <div className="px-2 py-1 text-[11px] font-medium text-slate-400">
                    Your Boards
                  </div>
                  {allBoards.map((b) => (
                    <div
                      key={b.id}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-2.5 md:py-2 cursor-pointer transition-colors ${
                        b.id === activeBoard.id
                          ? 'bg-slate-100 dark:bg-slate-800 font-semibold text-slate-900 dark:text-white'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                      }`}
                      onClick={() => {
                        setActiveBoardId(b.id);
                        setShowBoardMenu(false);
                      }}
                    >
                      <span className="truncate">{b.title}</span>
                      <span className="text-[11px] text-slate-400 shrink-0 ml-2">
                        {b.role === 'owner' ? 'Owner' : b.role === 'editor' ? 'Editor' : 'Viewer'}
                      </span>
                    </div>
                  ))}

                  {showNewBoardInput ? (
                    <form onSubmit={handleCreateBoard} className="pt-1 flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={newBoardTitle}
                        onChange={(e) => setNewBoardTitle(e.target.value)}
                        placeholder="Board name..."
                        className="flex-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1.5 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-medium"
                      >
                        Create
                      </button>
                    </form>
                  ) : (
                    <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowNewBoardInput(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-medium w-full"
                      >
                        <FolderPlus className="w-3.5 h-3.5" /> New Board
                      </button>
                      {activeBoard.role === 'owner' && ownedBoards.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const ids = cloudNotes.map((n) => n.id);
                            void deleteBoardCascade(activeBoard.id, ids);
                            setShowBoardMenu(false);
                          }}
                          className="px-2 py-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg shrink-0"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Zone 2: Clean Single-Line Nav Actions */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            Search
          </button>
          <button
            type="button"
            onClick={handleTidyBoard}
            disabled={!canEdit}
            className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Tidy
          </button>
          <button
            type="button"
            onClick={() => setShowArchiveDrawer(true)}
            className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 tabular-nums"
          >
            <Archive className="w-3.5 h-3.5" />
            Archive ({archivedNotes.length})
          </button>
          {user && activeBoard && (
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Users className="w-3.5 h-3.5" />
              Collaborate
            </button>
          )}
        </nav>

        {/* Zone 3: Single Primary Action / Account */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {!user ? (
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 text-xs font-medium text-white dark:text-slate-900 bg-slate-900 dark:bg-white rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="sm:hidden">Sign in</span>
              <span className="hidden sm:inline">Sign in with Google</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 sm:gap-2.5">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-700 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                title={`Signed in as ${user.email}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Incoming Collaboration Invite Banner */}
      {visibleIncomingInvites.length > 0 && user && (
        <div className="relative z-20 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-amber-950 dark:text-amber-100">
            <span className="font-semibold">{visibleIncomingInvites[0].ownerName}</span> invited you
            to collaborate on{' '}
            <span className="font-semibold">"{visibleIncomingInvites[0].boardTitle}"</span> (
            {visibleIncomingInvites[0].role === 'editor' ? 'Can edit' : 'Can view'}).
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={acceptingInviteId === visibleIncomingInvites[0].id}
              onClick={async () => {
                const inv = visibleIncomingInvites[0];
                setAcceptingInviteId(inv.id);
                setAuthError(null);
                pendingOpenBoardIdRef.current = inv.boardId;
                try {
                  await acceptBoardInvite(user, inv);
                  setActiveBoardId(inv.boardId);
                } catch (err) {
                  pendingOpenBoardIdRef.current = null;
                  setAuthError(err instanceof Error ? err.message : 'Unable to accept invitation.');
                } finally {
                  setAcceptingInviteId(null);
                }
              }}
              className="px-3 py-1 rounded-md bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {acceptingInviteId === visibleIncomingInvites[0].id ? 'Opening...' : 'Accept & Open'}
            </button>
            <button
              type="button"
              onClick={() =>
                setDismissedInviteIds((prev) => [...prev, visibleIncomingInvites[0].id])
              }
              className="p-1 text-amber-800 dark:text-amber-200 hover:bg-amber-200/50 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Optional Search Bar */}
      {searchOpen && (
        <div className="relative z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter notes by title, Markdown text, or checklist item..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSearchOpen(false);
            }}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {authError && (
        <div className="bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-800 px-4 py-2 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between">
          <span>{authError}</span>
          <button type="button" onClick={() => setAuthError(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Infinite Tactile Canvas (Desktop) / Responsive Vertical Feed (Mobile) */}
      <main
        ref={canvasRef}
        onDoubleClick={(e) => {
          if (isMobile) return;
          if (e.target !== canvasRef.current && !(e.target as HTMLElement).dataset.canvasSurface) {
            return;
          }
          if (!canEdit) return;
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = Math.max(24, Math.round(e.clientX - rect.left + (canvasRef.current?.scrollLeft || 0) - 120));
          const y = Math.max(24, Math.round(e.clientY - rect.top + (canvasRef.current?.scrollTop || 0) - 40));
          void addNoteAt('sticky', x, y);
        }}
        className={`relative flex-1 ${isMobile ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto'}`}
      >
        {needsPassphrase ? (
          <div className="h-full flex items-center justify-center p-4 sm:p-6">
            <form
              onSubmit={handleUnlockBoard}
              className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-lg space-y-4"
            >
              <div className="flex items-center gap-2.5">
                <Lock className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                <h2 className="text-base font-semibold">Board Locked</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter the zero-knowledge passphrase to decrypt notes on "{activeBoard?.title}".
              </p>
              {passphraseError && (
                <div className="text-xs text-rose-600 dark:text-rose-400">{passphraseError}</div>
              )}
              <input
                type="password"
                autoFocus
                required
                value={passphraseInput}
                onChange={(e) => setPassphraseInput(e.target.value)}
                placeholder="Board passphrase..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none"
              />
              <button
                type="submit"
                className="w-full py-2.5 sm:py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800"
              >
                Unlock &amp; Decrypt
              </button>
            </form>
          </div>
        ) : (
          <div
            data-canvas-surface="true"
            className={
              isMobile
                ? 'w-full min-h-full px-3 pt-3 pb-20 flex flex-col gap-3.5'
                : 'relative min-w-[1400px] min-h-[960px] w-full h-full pb-28'
            }
          >
            {visibleNotes.length === 0 ? (
              <div
                data-canvas-surface="true"
                className="h-full flex-1 flex flex-col items-center justify-center text-center p-6 sm:p-8 pointer-events-none"
              >
                <div className="max-w-sm space-y-3 pointer-events-auto">
                  <p className="text-sm font-medium opacity-75">
                    {searchQuery
                      ? 'No notes match your search.'
                      : isMobile
                      ? 'Your board is clear. Tap Add below to pin a sticky note.'
                      : 'Your canvas is clear. Double-click anywhere or press N to pin a note.'}
                  </p>
                  {canEdit && !searchQuery && (
                    <button
                      type="button"
                      onClick={() => void addNoteAt('sticky', 80, 72)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 sm:py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add First Sticky Note
                    </button>
                  )}
                </div>
              </div>
            ) : (
              visibleNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  canEdit={canEdit}
                  windEnabled={activeWind}
                  isMobile={isMobile}
                  onBringToFront={handleBringToFront}
                  onChange={handleNoteChange}
                  onArchive={(id) => handleArchiveToggle(id, true)}
                  onDelete={handleDeleteNote}
                />
              ))
            )}
          </div>
        )}
      </main>

      {/* Desktop Floating Bottom Canvas Dock (AllStickyNotes-style Mini Apps + Controls) */}
      <div className="hidden md:block fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[96vw] overflow-x-auto">
        <div className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/80 shadow-lg text-xs font-medium text-slate-700 dark:text-slate-200">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => void addNoteAt('sticky')}
            title="New Sticky Note (Shortcut: N)"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-200/85 hover:bg-amber-200 text-slate-900 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <StickyNote className="w-3.5 h-3.5" />
            Note
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => void addNoteAt('checklist')}
            title="Add Task Checklist"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Checklist
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => void addNoteAt('pomodoro')}
            title="Add Pomodoro Focus Timer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Timer className="w-3.5 h-3.5" />
            Timer
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => void addNoteAt('habit')}
            title="Add 7-Day Habit Tracker"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Habits
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => void addNoteAt('mood')}
            title="Add Mood & Water Log"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <HeartPulse className="w-3.5 h-3.5" />
            Mood
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => void addNoteAt('clock')}
            title="Add Live Clock & Countdown"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Clock className="w-3.5 h-3.5" />
            Clock
          </button>

          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />

          <button
            type="button"
            onClick={toggleWind}
            title="Toggle gentle wind physics"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeWind
                ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            Wind
          </button>

          <button
            type="button"
            onClick={cycleTheme}
            title="Switch board theme (Light / Candy / Dark)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors capitalize whitespace-nowrap shrink-0"
          >
            {activeTheme}
          </button>
        </div>
      </div>

      {/* Mobile Add Widget Bottom Sheet */}
      {isMobile && showMobileAddSheet && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-slate-950/35 backdrop-blur-[1px]"
          onClick={() => setShowMobileAddSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 pb-6 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                Add to Board
              </span>
              <button
                type="button"
                onClick={() => setShowMobileAddSheet(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs font-medium">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  void addNoteAt('sticky');
                  setShowMobileAddSheet(false);
                }}
                className="flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-xl bg-amber-100/90 text-slate-900 border border-amber-200 disabled:opacity-40"
              >
                <StickyNote className="w-4 h-4" />
                Sticky Note
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  void addNoteAt('checklist');
                  setShowMobileAddSheet(false);
                }}
                className="flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-40"
              >
                <CheckSquare className="w-4 h-4" />
                Checklist
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  void addNoteAt('pomodoro');
                  setShowMobileAddSheet(false);
                }}
                className="flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-40"
              >
                <Timer className="w-4 h-4" />
                Timer
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  void addNoteAt('habit');
                  setShowMobileAddSheet(false);
                }}
                className="flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4" />
                Habits
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  void addNoteAt('mood');
                  setShowMobileAddSheet(false);
                }}
                className="flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-40"
              >
                <HeartPulse className="w-4 h-4" />
                Mood
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  void addNoteAt('clock');
                  setShowMobileAddSheet(false);
                }}
                className="flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-40"
              >
                <Clock className="w-4 h-4" />
                Clock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Compact Bottom Navigation Bar (<= 56px height) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800 grid grid-cols-5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setShowMobileAddSheet((v) => !v)}
          className="flex flex-col items-center justify-center gap-0.5 text-slate-900 dark:text-white disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </button>

        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className={`flex flex-col items-center justify-center gap-0.5 ${
            searchOpen ? 'text-slate-900 dark:text-white font-semibold' : ''
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Search</span>
        </button>

        <button
          type="button"
          onClick={cycleTheme}
          className="flex flex-col items-center justify-center gap-0.5 capitalize"
        >
          <Palette className="w-4 h-4" />
          <span>{activeTheme}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (user && activeBoard) {
              setShowShareModal(true);
            } else {
              void handleGoogleLogin();
            }
          }}
          className="flex flex-col items-center justify-center gap-0.5"
        >
          <Users className="w-4 h-4" />
          <span>{user && activeBoard ? 'Share' : 'Sync'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowArchiveDrawer(true)}
          className="flex flex-col items-center justify-center gap-0.5 tabular-nums"
        >
          <Archive className="w-4 h-4" />
          <span>{archivedNotes.length > 0 ? `Arch (${archivedNotes.length})` : 'Archive'}</span>
        </button>
      </nav>

      {/* Share & Security Modal */}
      {user && activeBoard && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          user={user}
          board={activeBoard}
          boardKey={boardKey}
          secretMeta={boardSecret}
          members={members}
          pendingInvites={sentInvites}
          onSecretUpdated={(meta) => setBoardSecret(meta)}
        />
      )}

      {/* Archive & JSON Backup Drawer */}
      <ArchiveDrawer
        isOpen={showArchiveDrawer}
        onClose={() => setShowArchiveDrawer(false)}
        archivedNotes={archivedNotes}
        allNotes={activeNotes}
        canEdit={canEdit}
        onRestore={(id) => handleArchiveToggle(id, false)}
        onDeleteForever={handleDeleteNote}
        onImportNotes={handleImportNotes}
      />
    </div>
  );
}
