import React, { useRef } from 'react';
import { Download, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { NOTE_COLORS } from '../lib/defaults';
import type { NoteItem } from '../types';

interface ArchiveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  archivedNotes: NoteItem[];
  allNotes: NoteItem[];
  canEdit: boolean;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onImportNotes: (notes: NoteItem[]) => void;
}

export const ArchiveDrawer: React.FC<ArchiveDrawerProps> = ({
  isOpen,
  onClose,
  archivedNotes,
  allNotes,
  canEdit,
  onRestore,
  onDeleteForever,
  onImportNotes,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(allNotes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stickyboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '[]')) as NoteItem[];
        if (Array.isArray(parsed)) {
          onImportNotes(parsed);
        }
      } catch {
        // Ignore malformed JSON file
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm h-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-l border-slate-200 dark:border-slate-800 shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold">Archive &amp; Backup</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {archivedNotes.length} archived {archivedNotes.length === 1 ? 'note' : 'notes'}
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {archivedNotes.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500 dark:text-slate-400">
              Archived notes appear here so you can restore them anytime without cluttering your board.
            </div>
          ) : (
            archivedNotes.map((note) => {
              const color = NOTE_COLORS[note.color] || NOTE_COLORS.butter;
              return (
                <div
                  key={note.id}
                  className={`rounded-lg border p-3 text-slate-900 ${color.bg} ${color.border} space-y-2`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate">
                      {note.payload.title || 'Untitled'}
                    </span>
                    <span className="text-[11px] text-slate-700/75 capitalize">{note.type}</span>
                  </div>
                  {note.payload.body && (
                    <p className="text-xs text-slate-800/85 line-clamp-3 whitespace-pre-wrap">
                      {note.payload.body}
                    </p>
                  )}
                  {canEdit && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onRestore(note.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/80 hover:bg-white text-xs font-medium text-slate-900"
                      >
                        <RotateCcw className="w-3 h-3" /> Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteForever(note.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-600/15 hover:bg-rose-600/25 text-xs font-medium text-rose-900"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Upload className="w-3.5 h-3.5" /> Import JSON
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
