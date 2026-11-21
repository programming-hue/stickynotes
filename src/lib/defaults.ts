import type { NoteColor, NoteFont, NoteItem, NoteType } from '../types';

export const NOTE_COLORS: Record<
  NoteColor,
  { label: string; bg: string; header: string; swatch: string; border: string }
> = {
  butter: {
    label: 'Butter',
    bg: 'bg-[#FEF08A]',
    header: 'bg-[#FDE047]/65',
    swatch: '#FDE047',
    border: 'border-[#EAB308]/35',
  },
  blush: {
    label: 'Blush',
    bg: 'bg-[#FECDD3]',
    header: 'bg-[#FDA4AF]/55',
    swatch: '#FB7185',
    border: 'border-[#F43F5E]/25',
  },
  mint: {
    label: 'Mint',
    bg: 'bg-[#BBF7D0]',
    header: 'bg-[#86EFAC]/55',
    swatch: '#4ADE80',
    border: 'border-[#22C55E]/25',
  },
  sky: {
    label: 'Sky',
    bg: 'bg-[#BAE6FD]',
    header: 'bg-[#7DD3FC]/55',
    swatch: '#38BDF8',
    border: 'border-[#0EA5E9]/25',
  },
  lavender: {
    label: 'Lavender',
    bg: 'bg-[#E9D5FF]',
    header: 'bg-[#D8B4FE]/55',
    swatch: '#C084FC',
    border: 'border-[#A855F7]/25',
  },
  peach: {
    label: 'Peach',
    bg: 'bg-[#FED7AA]',
    header: 'bg-[#FDBA74]/55',
    swatch: '#FB923C',
    border: 'border-[#F97316]/25',
  },
};

export const NOTE_FONTS: Record<NoteFont, { label: string; className: string }> = {
  sans: { label: 'Sans', className: 'font-sans-note' },
  serif: { label: 'Serif', className: 'font-serif-note' },
  mono: { label: 'Mono', className: 'font-mono-note' },
  hand: { label: 'Hand', className: 'font-hand-note text-[1.16em]' },
  display: { label: 'Display', className: 'font-display-note' },
};

export function createStarterNotes(ownerUid = 'local'): NoteItem[] {
  const now = Date.now();
  return [
    {
      id: 'starter_welcome',
      type: 'sticky',
      color: 'butter',
      font: 'sans',
      fontSize: 'md',
      x: 48,
      y: 44,
      width: 288,
      height: 256,
      tilt: -1.5,
      zIndex: 1,
      archived: false,
      createdBy: ownerUid,
      updatedBy: ownerUid,
      updatedAtMs: now,
      payload: {
        title: 'Quick Start',
        body: `# Welcome to StickyBoard\nDouble-click any note to edit **live Markdown**.\n\n- Press \`N\` anywhere to drop a new note\n- Drag headers to arrange your canvas\n- Sign in with Google for **AES-256 encrypted** sync & real-time collaboration`,
      },
    },
    {
      id: 'starter_checklist',
      type: 'checklist',
      color: 'mint',
      font: 'sans',
      fontSize: 'md',
      x: 368,
      y: 52,
      width: 276,
      height: 264,
      tilt: 1.2,
      zIndex: 2,
      archived: false,
      createdBy: ownerUid,
      updatedBy: ownerUid,
      updatedAtMs: now,
      payload: {
        title: 'Today’s Focus',
        body: '',
        items: [
          { id: 'c1', text: 'Review product roadmap notes', done: true },
          { id: 'c2', text: 'Sign in with Google to sync devices', done: false },
          { id: 'c3', text: 'Invite teammate with Edit permission', done: false },
        ],
      },
    },
    {
      id: 'starter_pomodoro',
      type: 'pomodoro',
      color: 'blush',
      font: 'mono',
      fontSize: 'md',
      x: 676,
      y: 48,
      width: 252,
      height: 244,
      tilt: -0.8,
      zIndex: 3,
      archived: false,
      createdBy: ownerUid,
      updatedBy: ownerUid,
      updatedAtMs: now,
      payload: {
        title: 'Focus Timer',
        body: '',
        pomodoro: {
          workMinutes: 25,
          breakMinutes: 5,
          mode: 'work',
          secondsLeft: 25 * 60,
          running: false,
        },
      },
    },
    {
      id: 'starter_habit',
      type: 'habit',
      color: 'sky',
      font: 'sans',
      fontSize: 'sm',
      x: 56,
      y: 336,
      width: 310,
      height: 224,
      tilt: 0.9,
      zIndex: 4,
      archived: false,
      createdBy: ownerUid,
      updatedBy: ownerUid,
      updatedAtMs: now,
      payload: {
        title: '7-Day Habits',
        body: '',
        habits: [
          { id: 'h1', name: 'Deep Work', days: [true, true, true, false, false, false, false] },
          { id: 'h2', name: 'Hydrate 2L', days: [true, true, false, false, false, false, false] },
          { id: 'h3', name: 'Read 20m', days: [true, false, true, false, false, false, false] },
        ],
      },
    },
    {
      id: 'starter_mood',
      type: 'mood',
      color: 'lavender',
      font: 'hand',
      fontSize: 'md',
      x: 396,
      y: 344,
      width: 256,
      height: 220,
      tilt: -1.1,
      zIndex: 5,
      archived: false,
      createdBy: ownerUid,
      updatedBy: ownerUid,
      updatedAtMs: now,
      payload: {
        title: 'Daily Check-In',
        body: '',
        mood: {
          selected: 'Focused',
          waterCups: 4,
          note: 'Clear mind, steady progress.',
        },
      },
    },
  ];
}

export function createBlankNote(
  type: NoteType,
  x: number,
  y: number,
  zIndex: number,
  ownerUid: string
): NoteItem {
  const colors: NoteColor[] = ['butter', 'blush', 'mint', 'sky', 'lavender', 'peach'];
  const colorByType: Record<NoteType, NoteColor> = {
    sticky: colors[Math.floor(Math.random() * colors.length)],
    checklist: 'mint',
    pomodoro: 'blush',
    habit: 'sky',
    mood: 'lavender',
    clock: 'peach',
  };

  const id = `note_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const tilt = Number(((Math.random() - 0.5) * 3.2).toFixed(1));

  const base: NoteItem = {
    id,
    type,
    color: colorByType[type],
    font: type === 'pomodoro' || type === 'clock' ? 'mono' : 'sans',
    fontSize: 'md',
    x,
    y,
    width: type === 'habit' ? 310 : type === 'sticky' ? 268 : 256,
    height: type === 'sticky' ? 236 : 240,
    tilt,
    zIndex,
    archived: false,
    createdBy: ownerUid,
    updatedBy: ownerUid,
    updatedAtMs: Date.now(),
    payload: {
      title:
        type === 'sticky'
          ? 'New Note'
          : type === 'checklist'
          ? 'Task Checklist'
          : type === 'pomodoro'
          ? 'Focus Timer'
          : type === 'habit'
          ? 'Weekly Habits'
          : type === 'mood'
          ? 'Mood & Water'
          : 'Clock & Countdown',
      body: type === 'sticky' ? '' : '',
    },
  };

  if (type === 'checklist') {
    base.payload.items = [
      { id: 'i1', text: 'First task', done: false },
      { id: 'i2', text: 'Second task', done: false },
    ];
  } else if (type === 'pomodoro') {
    base.payload.pomodoro = {
      workMinutes: 25,
      breakMinutes: 5,
      mode: 'work',
      secondsLeft: 25 * 60,
      running: false,
    };
  } else if (type === 'habit') {
    base.payload.habits = [
      { id: 'h1', name: 'Morning Focus', days: [false, false, false, false, false, false, false] },
      { id: 'h2', name: 'Exercise', days: [false, false, false, false, false, false, false] },
    ];
  } else if (type === 'mood') {
    base.payload.mood = {
      selected: 'Calm',
      waterCups: 2,
      note: '',
    };
  } else if (type === 'clock') {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    base.payload.clock = {
      label: 'Launch Milestone',
      targetDate: nextWeek,
    };
  }

  return base;
}

export function playGentleChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const freqs = [587.33, 880];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.55);
    });
  } catch {
    // Ignore audio context errors when autoplay blocked
  }
}
