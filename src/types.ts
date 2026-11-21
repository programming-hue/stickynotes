export type BoardTheme = 'light' | 'candy' | 'dark';

export type NoteType = 'sticky' | 'checklist' | 'pomodoro' | 'habit' | 'mood' | 'clock';

export type NoteColor = 'butter' | 'blush' | 'mint' | 'sky' | 'lavender' | 'peach';

export type NoteFont = 'sans' | 'serif' | 'mono' | 'hand' | 'display';

export type NoteFontSize = 'sm' | 'md' | 'lg';

export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface HabitRow {
  id: string;
  name: string;
  days: boolean[]; // 7 booleans: Mon..Sun
}

export interface NotePayload {
  title: string;
  body: string;
  items?: ChecklistItem[];
  pomodoro?: {
    workMinutes: number;
    breakMinutes: number;
    mode: 'work' | 'break';
    secondsLeft: number;
    running: boolean;
    lastTickAt?: number;
  };
  habits?: HabitRow[];
  mood?: {
    selected: string;
    waterCups: number;
    note: string;
  };
  clock?: {
    label: string;
    targetDate: string;
  };
}

export interface NoteItem {
  id: string;
  type: NoteType;
  color: NoteColor;
  font: NoteFont;
  fontSize: NoteFontSize;
  x: number;
  y: number;
  width: number;
  height: number;
  tilt: number;
  zIndex: number;
  archived: boolean;
  payload: NotePayload;
  createdBy: string;
  updatedBy: string;
  updatedAtMs: number;
}

export interface BoardSummary {
  id: string;
  title: string;
  ownerId: string;
  theme: BoardTheme;
  windEnabled: boolean;
  role: CollaboratorRole;
}

export interface BoardMember {
  uid: string;
  boardOwnerId: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'editor' | 'viewer';
  inviteId: string;
}

export interface BoardInvite {
  id: string;
  boardId: string;
  boardTitle: string;
  ownerId: string;
  ownerName: string;
  inviteeEmail: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'revoked';
}

export interface BoardSecretMeta {
  wrappedKey: string;
  keyVersion: number;
  isPassphraseProtected: boolean;
  salt: string;
  keyCheck: string;
}
