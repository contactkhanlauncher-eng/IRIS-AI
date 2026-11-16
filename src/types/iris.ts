export type IrisLanguage = 'auto' | 'en' | 'hi' | 'ur';

export type IrisView = 'workspace' | 'reminders' | 'companion' | 'settings';

export type CoreState = 'idle' | 'standby' | 'listening' | 'thinking' | 'speaking';

export interface GroundingSource {
  title: string;
  url: string;
}

export type DesktopActionType =
  | 'open_windows_app'
  | 'open_website'
  | 'read_aloud'
  | 'create_reminder';

export interface PendingDesktopAction {
  id: string;
  type: DesktopActionType;
  title: string;
  description: string;
  appId?: string;
  appLabel?: string;
  url?: string;
  textToRead?: string;
  reminderTitle?: string;
  reminderDueAt?: string;
  reminderNotes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'error';
  resultMessage?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  sources?: GroundingSource[];
  pendingActions?: PendingDesktopAction[];
  isError?: boolean;
  retryPrompt?: string;
  errorCode?:
    | 'QUOTA_EXHAUSTED'
    | 'RATE_LIMITED'
    | 'AUTH_ERROR'
    | 'NOT_FOUND'
    | 'SERVER_ERROR'
    | 'NETWORK_ERROR';
}

export interface ReminderItem {
  id: string;
  title: string;
  dueAt: string; // ISO string or readable time
  notes?: string;
  completed: boolean;
  notified?: boolean;
  createdAt: string;
}

export interface IrisSettings {
  language: IrisLanguage;
  voiceURI: string;
  volume: number; // 0 to 1
  muted: boolean;
  speechRate: number; // 0.7 to 1.4
  speechPitch: number; // 0.8 to 1.3
  autoSpeak: boolean;
  continuousVoice: boolean;
  wakeWordEnabled: boolean;
  companionUrl: string;
  companionToken: string;
}

export interface ApiHealthStatus {
  ok: boolean;
  geminiConfigured: boolean;
  model: string;
  checkedAt: string;
  error?: string;
}

export interface CompanionHealthStatus {
  connected: boolean;
  checking: boolean;
  version?: string;
  platform?: string;
  approvedApps?: string[];
  error?: string;
  checkedAt?: string;
}
