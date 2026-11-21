import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Check,
  GripHorizontal,
  Palette,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { NOTE_COLORS, NOTE_FONTS, playGentleChime } from '../lib/defaults';
import { renderLiteMarkdown } from '../lib/markdown';
import type {
  ChecklistItem,
  HabitRow,
  NoteColor,
  NoteFont,
  NoteFontSize,
  NoteItem,
} from '../types';

interface NoteCardProps {
  note: NoteItem;
  canEdit: boolean;
  windEnabled: boolean;
  onBringToFront: (id: string) => void;
  onChange: (updated: NoteItem, payloadChanged: boolean) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MOOD_OPTIONS = ['Calm', 'Focused', 'Energized', 'Tired', 'Stressed'];

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  canEdit,
  windEnabled,
  onBringToFront,
  onChange,
  onArchive,
  onDelete,
}) => {
  const [isEditingText, setIsEditingText] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [newHabitText, setNewHabitText] = useState('');
  const [nowTime, setNowTime] = useState(() => new Date());

  const cardRef = useRef<HTMLDivElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const colorStyle = NOTE_COLORS[note.color] || NOTE_COLORS.butter;
  const fontClass = NOTE_FONTS[note.font]?.className || NOTE_FONTS.sans.className;
  const sizeClass =
    note.fontSize === 'sm'
      ? 'text-[13px]'
      : note.fontSize === 'lg'
      ? 'text-[16px]'
      : 'text-[14px]';

  // Close style menu on outside click
  useEffect(() => {
    if (!showStyleMenu) return;
    const onDown = (e: PointerEvent) => {
      if (styleMenuRef.current && !styleMenuRef.current.contains(e.target as Node)) {
        setShowStyleMenu(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [showStyleMenu]);

  // Focus textarea when entering Markdown edit mode
  useEffect(() => {
    if (isEditingText && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditingText]);

  // Live clock tick for clock widget
  useEffect(() => {
    if (note.type !== 'clock') return;
    const timer = window.setInterval(() => setNowTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [note.type]);

  // Live Pomodoro countdown tick (ticks locally at 0 Firestore write cost; syncs on start/pause/reset/finish)
  const pomodoro = note.payload.pomodoro;
  const [displaySeconds, setDisplaySeconds] = useState<number>(() => pomodoro?.secondsLeft ?? 1500);

  useEffect(() => {
    if (!pomodoro) return;
    if (!pomodoro.running) {
      setDisplaySeconds(pomodoro.secondsLeft);
      return;
    }
    const computeRemaining = () => {
      if (!pomodoro.lastTickAt) return pomodoro.secondsLeft;
      const elapsed = Math.floor((Date.now() - pomodoro.lastTickAt) / 1000);
      return Math.max(0, pomodoro.secondsLeft - elapsed);
    };
    setDisplaySeconds(computeRemaining());

    const timer = window.setInterval(() => {
      const rem = computeRemaining();
      setDisplaySeconds(rem);
      if (rem <= 0) {
        window.clearInterval(timer);
        if (canEdit) {
          playGentleChime();
          const nextMode = pomodoro.mode === 'work' ? 'break' : 'work';
          const nextSecs =
            (nextMode === 'work' ? pomodoro.workMinutes : pomodoro.breakMinutes) * 60;
          onChange(
            {
              ...note,
              payload: {
                ...note.payload,
                pomodoro: {
                  ...pomodoro,
                  mode: nextMode,
                  secondsLeft: nextSecs,
                  running: false,
                  lastTickAt: undefined,
                },
              },
            },
            true
          );
        }
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [note, pomodoro, canEdit, onChange]);

  // Drag handler (header)
  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canEdit) {
      onBringToFront(note.id);
      return;
    }
    if ((e.target as HTMLElement).closest('button, input, textarea')) return;
    e.preventDefault();
    onBringToFront(note.id);
    setIsDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const originX = note.x;
    const originY = note.y;
    let latestX = originX;
    let latestY = originY;

    const onMove = (ev: PointerEvent) => {
      latestX = Math.max(0, Math.round(originX + (ev.clientX - startX)));
      latestY = Math.max(0, Math.round(originY + (ev.clientY - startY)));
      if (cardRef.current) {
        cardRef.current.style.left = `${latestX}px`;
        cardRef.current.style.top = `${latestY}px`;
      }
    };

    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (latestX !== originX || latestY !== originY) {
        onChange({ ...note, x: latestX, y: latestY }, false);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Resize handler (bottom-right corner)
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    onBringToFront(note.id);
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const originW = note.width;
    const originH = note.height;
    let latestW = originW;
    let latestH = originH;

    const onMove = (ev: PointerEvent) => {
      latestW = Math.min(900, Math.max(200, Math.round(originW + (ev.clientX - startX))));
      latestH = Math.min(900, Math.max(170, Math.round(originH + (ev.clientY - startY))));
      if (cardRef.current) {
        cardRef.current.style.width = `${latestW}px`;
        cardRef.current.style.height = `${latestH}px`;
      }
    };

    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (latestW !== originW || latestH !== originH) {
        onChange({ ...note, width: latestW, height: latestH }, false);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Deterministic wind stagger from note id
  const idSeed = note.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const windDelay = `-${(idSeed % 60) / 10}s`;
  const windDuration = `${5.8 + (idSeed % 22) / 10}s`;

  const shouldWind = windEnabled && !isDragging && !isResizing && !isEditingText && !showStyleMenu;

  const updatePayload = (partial: Partial<NoteItem['payload']>) => {
    onChange(
      {
        ...note,
        payload: { ...note.payload, ...partial },
      },
      true
    );
  };

  // Checklist helpers
  const items = note.payload.items || [];
  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  const addChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newTaskText.trim()) return;
    const next: ChecklistItem[] = [
      ...items,
      { id: crypto.randomUUID().slice(0, 8), text: newTaskText.trim(), done: false },
    ];
    setNewTaskText('');
    updatePayload({ items: next });
  };

  // Habit helpers
  const habits = note.payload.habits || [];
  const addHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newHabitText.trim()) return;
    const next: HabitRow[] = [
      ...habits,
      {
        id: crypto.randomUUID().slice(0, 8),
        name: newHabitText.trim(),
        days: [false, false, false, false, false, false, false],
      },
    ];
    setNewHabitText('');
    updatePayload({ habits: next });
  };

  // Clock helpers
  const clockData = note.payload.clock || { label: 'Target', targetDate: '' };
  const daysRemaining = (() => {
    if (!clockData.targetDate) return null;
    const target = new Date(`${clockData.targetDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86400000);
  })();

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      ref={cardRef}
      onPointerDown={() => onBringToFront(note.id)}
      style={
        {
          left: `${note.x}px`,
          top: `${note.y}px`,
          width: `${note.width}px`,
          height: `${note.height}px`,
          zIndex: note.zIndex,
          transform: shouldWind ? undefined : `rotate(${note.tilt}deg)`,
          '--base-tilt': `${note.tilt}deg`,
          '--wind-delay': windDelay,
          '--wind-duration': windDuration,
        } as React.CSSProperties
      }
      className={`group absolute flex flex-col rounded-lg border text-slate-900 shadow-[0_6px_18px_-6px_rgba(15,23,42,0.18)] transition-shadow duration-150 select-none ${
        colorStyle.bg
      } ${colorStyle.border} ${
        shouldWind ? 'sticky-wind-active' : ''
      } ${isDragging ? 'shadow-[0_18px_32px_-8px_rgba(15,23,42,0.28)] cursor-grabbing' : ''}`}
    >
      {/* Card Top Handle Strip */}
      <div
        onPointerDown={handleDragStart}
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-t-lg border-b border-black/[0.06] ${
          colorStyle.header
        } ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <GripHorizontal className="w-3.5 h-3.5 text-slate-700/45 shrink-0" />
          {canEdit ? (
            <input
              type="text"
              value={note.payload.title}
              onChange={(e) => updatePayload({ title: e.target.value })}
              placeholder="Note title..."
              aria-label="Note title"
              className="w-full bg-transparent text-xs font-semibold text-slate-900 placeholder:text-slate-600/60 focus:outline-none truncate"
            />
          ) : (
            <span className="text-xs font-semibold text-slate-900 truncate">
              {note.payload.title || 'Note'}
            </span>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              onClick={() => setShowStyleMenu((v) => !v)}
              title="Customize color, font & tilt"
              className="p-1 rounded hover:bg-black/10 text-slate-800 transition-colors"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onArchive(note.id)}
              title="Archive note"
              className="p-1 rounded hover:bg-black/10 text-slate-800 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              title="Delete note"
              className="p-1 rounded hover:bg-rose-600/15 hover:text-rose-800 text-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Style Customization Popover */}
      {showStyleMenu && canEdit && (
        <div
          ref={styleMenuRef}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-1 top-9 z-50 w-56 rounded-lg bg-white text-slate-900 border border-slate-200 shadow-lg p-3 space-y-3 text-xs"
        >
          <div>
            <div className="text-[11px] font-medium text-slate-500 mb-1.5">Color</div>
            <div className="flex items-center gap-1.5">
              {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange({ ...note, color: c }, false)}
                  title={NOTE_COLORS[c].label}
                  style={{ backgroundColor: NOTE_COLORS[c].swatch }}
                  className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                    note.color === c ? 'ring-2 ring-slate-900 ring-offset-1 border-slate-900' : 'border-black/15'
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500 mb-1.5">Font</div>
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(NOTE_FONTS) as NoteFont[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onChange({ ...note, font: f }, false)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    note.font === f
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {NOTE_FONTS[f].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium text-slate-500 mb-1">Size</div>
              <div className="flex items-center gap-1">
                {(['sm', 'md', 'lg'] as NoteFontSize[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onChange({ ...note, fontSize: sz }, false)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase ${
                      note.fontSize === sz
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
                <span>Tilt</span>
                <button
                  type="button"
                  onClick={() => onChange({ ...note, tilt: 0 }, false)}
                  className="text-slate-600 hover:text-slate-900 underline"
                >
                  {note.tilt}°
                </button>
              </div>
              <input
                type="range"
                min={-6}
                max={6}
                step={0.5}
                value={note.tilt}
                onChange={(e) => onChange({ ...note, tilt: Number(e.target.value) }, false)}
                className="w-full accent-slate-900 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Card Body by Type */}
      <div className={`flex-1 min-h-0 p-3 overflow-y-auto note-scroll select-text ${fontClass} ${sizeClass}`}>
        {note.type === 'sticky' && (
          <div
            className="h-full"
            onDoubleClick={() => {
              if (canEdit) setIsEditingText(true);
            }}
          >
            {isEditingText && canEdit ? (
              <div className="h-full flex flex-col gap-1.5">
                <textarea
                  ref={textareaRef}
                  value={note.payload.body}
                  onChange={(e) => updatePayload({ body: e.target.value })}
                  onBlur={() => setIsEditingText(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setIsEditingText(false);
                  }}
                  placeholder="Write Markdown (# heading, **bold**, - list, - [ ] task)..."
                  className="w-full flex-1 bg-transparent resize-none focus:outline-none leading-relaxed text-slate-900 placeholder:text-slate-700/45"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-700/70 pt-1 border-t border-black/10">
                  <span>Markdown active · Esc to preview</span>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsEditingText(false);
                    }}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => {
                  if (canEdit && !note.payload.body.trim()) setIsEditingText(true);
                }}
                className={`h-full ${canEdit ? 'cursor-text' : ''}`}
              >
                {renderLiteMarkdown(note.payload.body)}
              </div>
            )}
          </div>
        )}

        {note.type === 'checklist' && (
          <div className="flex flex-col h-full gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-700/80 tabular-nums">
                <span>
                  {doneCount} of {items.length} done
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-black/10 overflow-hidden">
                <div
                  className="h-full bg-slate-900 transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
              {items.map((item) => (
                <div key={item.id} className="group/item flex items-start gap-2 py-0.5">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      const next = items.map((x) =>
                        x.id === item.id ? { ...x, done: !x.done } : x
                      );
                      updatePayload({ items: next });
                    }}
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      item.done
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'border-slate-700/50 bg-white/40 hover:bg-white/70'
                    }`}
                  >
                    {item.done && <Check className="w-3 h-3" />}
                  </button>
                  <span
                    className={`flex-1 leading-snug break-words ${
                      item.done ? 'line-through opacity-55' : ''
                    }`}
                  >
                    {item.text}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        updatePayload({ items: items.filter((x) => x.id !== item.id) });
                      }}
                      className="opacity-0 group-hover/item:opacity-70 hover:!opacity-100 p-0.5 text-slate-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <form onSubmit={addChecklistItem} className="flex items-center gap-1 pt-1 border-t border-black/10">
                <input
                  type="text"
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  placeholder="Add task..."
                  className="flex-1 bg-transparent text-xs placeholder:text-slate-700/50 focus:outline-none"
                />
                <button
                  type="submit"
                  className="p-1 rounded hover:bg-black/10 text-slate-800"
                  title="Add task"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        )}

        {note.type === 'pomodoro' && pomodoro && (
          <div className="flex flex-col items-center justify-between h-full py-1 text-center">
            <div className="flex items-center gap-1 bg-black/[0.07] p-0.5 rounded-md text-xs">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() =>
                  updatePayload({
                    pomodoro: {
                      ...pomodoro,
                      mode: 'work',
                      secondsLeft: pomodoro.workMinutes * 60,
                      running: false,
                      lastTickAt: undefined,
                    },
                  })
                }
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  pomodoro.mode === 'work' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-700'
                }`}
              >
                Focus {pomodoro.workMinutes}m
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() =>
                  updatePayload({
                    pomodoro: {
                      ...pomodoro,
                      mode: 'break',
                      secondsLeft: pomodoro.breakMinutes * 60,
                      running: false,
                      lastTickAt: undefined,
                    },
                  })
                }
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  pomodoro.mode === 'break' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-700'
                }`}
              >
                Break {pomodoro.breakMinutes}m
              </button>
            </div>

            <div className="font-mono-note text-4xl font-semibold tracking-tight text-slate-900 tabular-nums my-2">
              {formatTimer(displaySeconds)}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  if (pomodoro.running) {
                    updatePayload({
                      pomodoro: {
                        ...pomodoro,
                        running: false,
                        secondsLeft: displaySeconds,
                        lastTickAt: undefined,
                      },
                    });
                  } else {
                    updatePayload({
                      pomodoro: {
                        ...pomodoro,
                        running: true,
                        secondsLeft: displaySeconds,
                        lastTickAt: Date.now(),
                      },
                    });
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {pomodoro.running ? (
                  <>
                    <Pause className="w-3.5 h-3.5" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" /> Start
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() =>
                  updatePayload({
                    pomodoro: {
                      ...pomodoro,
                      running: false,
                      lastTickAt: undefined,
                      secondsLeft:
                        (pomodoro.mode === 'work'
                          ? pomodoro.workMinutes
                          : pomodoro.breakMinutes) * 60,
                    },
                  })
                }
                title="Reset timer"
                className="p-1.5 rounded-md bg-black/10 text-slate-800 hover:bg-black/15 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {note.type === 'habit' && (
          <div className="flex flex-col h-full gap-2">
            <div className="grid grid-cols-[1fr_repeat(7,20px)] items-center gap-1 text-[10px] font-semibold text-slate-700/75 pb-1 border-b border-black/10">
              <span>Habit</span>
              {DAY_LABELS.map((d, idx) => (
                <span key={idx} className="text-center">
                  {d}
                </span>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {habits.map((habit) => (
                <div
                  key={habit.id}
                  className="group/h grid grid-cols-[1fr_repeat(7,20px)] items-center gap-1 text-xs"
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="truncate font-medium">{habit.name}</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          updatePayload({
                            habits: habits.filter((h) => h.id !== habit.id),
                          })
                        }
                        className="opacity-0 group-hover/h:opacity-70 hover:!opacity-100 text-slate-700 shrink-0"
                        title="Remove habit"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {habit.days.map((checked, dayIdx) => (
                    <button
                      key={dayIdx}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => {
                        const nextHabits = habits.map((h) => {
                          if (h.id !== habit.id) return h;
                          const nextDays = [...h.days];
                          nextDays[dayIdx] = !nextDays[dayIdx];
                          return { ...h, days: nextDays };
                        });
                        updatePayload({ habits: nextHabits });
                      }}
                      className={`w-4 h-4 mx-auto rounded-full border transition-colors ${
                        checked
                          ? 'bg-slate-900 border-slate-900'
                          : 'border-slate-700/40 bg-white/45 hover:bg-white/80'
                      }`}
                      title={`${habit.name} - ${DAY_LABELS[dayIdx]}`}
                    />
                  ))}
                </div>
              ))}
            </div>
            {canEdit && (
              <form onSubmit={addHabit} className="flex items-center gap-1 pt-1 border-t border-black/10">
                <input
                  type="text"
                  value={newHabitText}
                  onChange={(e) => setNewHabitText(e.target.value)}
                  placeholder="New habit..."
                  className="flex-1 bg-transparent text-xs placeholder:text-slate-700/50 focus:outline-none"
                />
                <button
                  type="submit"
                  className="p-1 rounded hover:bg-black/10 text-slate-800"
                  title="Add habit"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        )}

        {note.type === 'mood' && note.payload.mood && (
          <div className="flex flex-col h-full justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium text-slate-700/75 mb-1.5">Current Mood</div>
              <div className="flex flex-wrap gap-1">
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      updatePayload({
                        mood: { ...note.payload.mood!, selected: m },
                      })
                    }
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      note.payload.mood?.selected === m
                        ? 'bg-slate-900 text-white'
                        : 'bg-white/55 text-slate-800 hover:bg-white/80'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between bg-black/[0.05] rounded-md px-2.5 py-1.5 text-xs">
              <span className="font-medium">Water Cups</span>
              <div className="flex items-center gap-2 tabular-nums">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    updatePayload({
                      mood: {
                        ...note.payload.mood!,
                        waterCups: Math.max(0, (note.payload.mood?.waterCups || 0) - 1),
                      },
                    })
                  }
                  className="w-5 h-5 rounded bg-white/70 hover:bg-white font-semibold"
                >
                  -
                </button>
                <span className="font-semibold w-5 text-center">
                  {note.payload.mood.waterCups}
                </span>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    updatePayload({
                      mood: {
                        ...note.payload.mood!,
                        waterCups: Math.min(20, (note.payload.mood?.waterCups || 0) + 1),
                      },
                    })
                  }
                  className="w-5 h-5 rounded bg-white/70 hover:bg-white font-semibold"
                >
                  +
                </button>
              </div>
            </div>

            <input
              type="text"
              disabled={!canEdit}
              value={note.payload.mood.note}
              onChange={(e) =>
                updatePayload({
                  mood: { ...note.payload.mood!, note: e.target.value },
                })
              }
              placeholder="One-line reflection..."
              className="w-full bg-transparent border-b border-black/15 pb-1 text-xs placeholder:text-slate-700/50 focus:outline-none focus:border-slate-900"
            />
          </div>
        )}

        {note.type === 'clock' && (
          <div className="flex flex-col h-full justify-between">
            <div>
              <div className="font-mono-note text-3xl font-semibold tracking-tight tabular-nums">
                {nowTime.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
              <div className="text-xs text-slate-700/80 mt-0.5">
                {nowTime.toLocaleDateString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-black/10 text-xs">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  disabled={!canEdit}
                  value={clockData.label}
                  onChange={(e) =>
                    updatePayload({
                      clock: { ...clockData, label: e.target.value },
                    })
                  }
                  placeholder="Countdown label"
                  className="w-full bg-transparent font-medium focus:outline-none"
                />
                {daysRemaining !== null && (
                  <span className="font-mono-note font-semibold tabular-nums whitespace-nowrap">
                    {daysRemaining > 0
                      ? `${daysRemaining}d left`
                      : daysRemaining === 0
                      ? 'Today'
                      : `${Math.abs(daysRemaining)}d ago`}
                  </span>
                )}
              </div>
              <input
                type="date"
                disabled={!canEdit}
                value={clockData.targetDate}
                onChange={(e) =>
                  updatePayload({
                    clock: { ...clockData, targetDate: e.target.value },
                  })
                }
                className="w-full bg-white/50 rounded px-2 py-1 text-[11px] font-mono-note focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom-Right Resize Grip */}
      {canEdit && (
        <div
          onPointerDown={handleResizeStart}
          title="Drag to resize"
          className="absolute right-0.5 bottom-0.5 w-4 h-4 cursor-nwse-resize opacity-35 hover:opacity-80 flex items-end justify-end p-0.5"
        >
          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-slate-800">
            <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
};
