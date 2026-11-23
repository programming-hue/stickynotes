import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, Trash2, Unlock, UserPlus, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  createBoardInvite,
  disableBoardPassphrase,
  enableBoardPassphrase,
  removeBoardMember,
  revokeInvite,
  updateMemberRole,
} from '../lib/firestoreSync';
import type { BoardInvite, BoardMember, BoardSecretMeta, BoardSummary } from '../types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  board: BoardSummary;
  boardKey: string | null;
  secretMeta: BoardSecretMeta | null;
  members: BoardMember[];
  pendingInvites: BoardInvite[];
  onSecretUpdated: (meta: BoardSecretMeta) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  user,
  board,
  boardKey,
  secretMeta,
  members,
  pendingInvites,
  onSecretUpdated,
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [passphrase, setPassphrase] = useState('');
  const [lockLoading, setLockLoading] = useState(false);

  if (!isOpen) return null;

  const isOwner = board.ownerId === user.uid;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setFeedback({ type: 'err', text: 'Enter a valid Google account email.' });
      return;
    }
    if (clean === (user.email || '').toLowerCase()) {
      setFeedback({ type: 'err', text: 'You already own this board.' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await createBoardInvite(user, board, clean, role);
      setEmail('');
      setFeedback({
        type: 'ok',
        text: `Invite sent to ${clean}. When they sign in with Google, they will see it immediately.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to send invite.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardKey) return;
    setLockLoading(true);
    setFeedback(null);
    try {
      if (secretMeta?.isPassphraseProtected) {
        const updated = await disableBoardPassphrase(board.id, boardKey);
        onSecretUpdated(updated);
        setPassphrase('');
        setFeedback({ type: 'ok', text: 'Passphrase lock removed. Sync remains AES-256 encrypted.' });
      } else {
        if (passphrase.trim().length < 6) {
          setFeedback({ type: 'err', text: 'Use at least 6 characters for the board passphrase.' });
          setLockLoading(false);
          return;
        }
        const updated = await enableBoardPassphrase(board.id, boardKey, passphrase.trim());
        onSecretUpdated(updated);
        setPassphrase('');
        setFeedback({
          type: 'ok',
          text: 'Zero-knowledge passphrase enabled. Share this passphrase directly with collaborators.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not update passphrase settings.',
      });
    } finally {
      setLockLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold">Collaborate &amp; Security</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {board.title} · Real-time AES-256 encrypted sync
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {feedback && (
            <div
              className={`px-3 py-2 rounded-lg text-xs border ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {isOwner ? (
            <form onSubmit={handleInvite} className="space-y-2.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Add collaborator by Google email
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@gmail.com"
                  className="w-full sm:flex-1 px-3 py-2.5 sm:py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-400"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
                    className="flex-1 sm:flex-none px-2.5 py-2.5 sm:py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none"
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:px-3.5 sm:py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Invite
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
              You are collaborating on this board with{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {board.role === 'editor' ? 'Edit' : 'View-only'}
              </span>{' '}
              permissions. Only the board owner can invite or remove members.
            </div>
          )}

          {/* Active Collaborators */}
          {isOwner && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                People with access ({members.length + 1})
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{user.displayName || 'You'}</div>
                    <div className="text-xs text-slate-500 truncate">{user.email}</div>
                  </div>
                  <span className="text-xs font-medium text-slate-500 shrink-0">Owner</span>
                </div>

                {members.map((m) => (
                  <div key={m.uid} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.displayName}</div>
                      <div className="text-xs text-slate-500 truncate">{m.email}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={m.role}
                        onChange={(e) =>
                          void updateMemberRole(board.id, m.uid, e.target.value as 'editor' | 'viewer')
                        }
                        className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="editor">Can edit</option>
                        <option value="viewer">Can view</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void removeBoardMember(board.id, m.uid)}
                        title="Revoke access"
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Invites */}
          {isOwner && pendingInvites.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Pending invites ({pendingInvites.length})
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-medium truncate block">{inv.inviteeEmail}</span>
                      <span className="text-slate-500">
                        Role: {inv.role === 'editor' ? 'Can edit' : 'Can view'} · Waiting to sign in
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void revokeInvite(inv.id)}
                      className="text-rose-600 hover:underline font-medium shrink-0"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Encryption & Optional Passphrase Lock */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>End-to-End AES-256-GCM Note Encryption Active</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Every note body, checklist, and habit log is encrypted in your browser before syncing to
              Firebase.
            </p>
            {isOwner && boardKey && (
              <form onSubmit={handleTogglePassphrase} className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                {!secretMeta?.isPassphraseProtected ? (
                  <>
                    <div className="relative flex-1">
                      <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Optional extra passphrase lock..."
                        className="w-full pl-8 pr-3 py-2 sm:py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={lockLoading}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <Lock className="w-3 h-3" /> Lock Key
                    </button>
                  </>
                ) : (
                  <button
                    type="submit"
                    disabled={lockLoading}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Remove Custom Passphrase Lock
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
