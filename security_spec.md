# Security Specification — StickyBoard

## 1. Data Invariants
1. **Identity & PII Isolation**: `/users/{userId}` documents contain user email addresses and profiles and are strictly readable and writable ONLY by `request.auth.uid == userId`. Zero blanket `isSignedIn()` reads.
2. **Board Ownership & Immutability**: Every `/boards/{boardId}` document must have `ownerId == request.auth.uid` on creation, `ownerId` is immutable on update, and only the board owner can update board settings or delete the board.
3. **Master Gate Membership**: Access to `/boards/{boardId}/notes/{noteId}` and `/boards/{boardId}/secrets/{secretId}` is strictly gated by board ownership or active membership in `/boards/{boardId}/members/{request.auth.uid}`. Removing a member revokes all read/write access synchronously.
4. **Role Escalation Prevention**: A collaborator joining via `/invites/{inviteId}` can only create their own `/boards/{boardId}/members/{request.auth.uid}` document with the exact `role` (`editor` or `viewer`) authorized by the pending invite addressed to their verified email (`request.auth.token.email_verified == true`), and only `editor` members or the board `owner` can create/update/delete notes.
5. **Encrypted Payload & Volumetric Bounds**: All note payloads are encrypted client-side with AES-256-GCM (`encryptedPayload <= 65536`, `iv <= 64`), and all string fields/IDs have strict `.size()` and regex bounds.
6. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation, and `updatedAt` must equal `request.time` on updates with `createdAt` remaining immutable.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Identity Spoofing on Board Create**: `{ ownerId: "victim_uid", title: "Hijacked", theme: "light", windEnabled: true, createdAt: serverTime, updatedAt: serverTime }` -> `PERMISSION_DENIED`.
2. **Ghost/Shadow Field Injection**: Creating a note with `{ ..., isAdmin: true }` -> `PERMISSION_DENIED` (`hasOnly` rejects extra keys).
3. **Privilege Escalation on Invite Accept**: Viewer-invited user creates `/boards/{boardId}/members/{uid}` with `role: "editor"` -> `PERMISSION_DENIED` (role mismatch against invite).
4. **PII Scraping on `/users`**: Authenticated user A attempts `getDoc(doc(db, 'users', 'user_B'))` or `getDocs(collection(db, 'users'))` -> `PERMISSION_DENIED`.
5. **Unverified Email Spoof on Invites**: User with `email_verified: false` tries to list or accept `/invites/{inviteId}` -> `PERMISSION_DENIED`.
6. **Orphaned Note / Non-Existent Board**: Authenticated user writes to `/boards/fake_board_id/notes/n1` -> `PERMISSION_DENIED` (parent board missing / not owner or member).
7. **Viewer Write Attempt**: User with `role: "viewer"` in `/boards/{boardId}/members/{uid}` attempts to create or update a note -> `PERMISSION_DENIED`.
8. **Revoked Collaborator Access**: After owner deletes `/boards/{boardId}/members/{uid}`, ex-collaborator attempts to read `/boards/{boardId}/secrets/encryption` or write `/boards/{boardId}/notes/{noteId}` -> `PERMISSION_DENIED`.
9. **ID Poisoning**: Creating a document with a 200-char or slash-containing ID (`bad$id!@#`) -> `PERMISSION_DENIED` (`isValidId` rejects).
10. **Denial of Wallet Payload**: Creating a note with `encryptedPayload` exceeding 65,536 chars -> `PERMISSION_DENIED`.
11. **Terminal State Bypass on Invite**: Accepting an already `'revoked'` or `'accepted'` invite -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Creating a board or note with a backdated `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
