import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Square,
  Volume2,
  VolumeX,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { TopBar } from './components/TopBar';
import { IrisCore } from './components/IrisCore';
import { ChatPanel } from './components/ChatPanel';
import { RemindersView } from './components/RemindersView';
import { CompanionView } from './components/CompanionView';
import { SettingsView } from './components/SettingsView';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import {
  checkCompanionHealth,
  generateCompanionToken,
  launchWindowsAppViaCompanion,
} from './utils/companion';
import { ApiClientError, parseJsonResponse } from './utils/api';
import type {
  ApiHealthStatus,
  ChatMessage,
  CompanionHealthStatus,
  CoreState,
  IrisSettings,
  IrisView,
  PendingDesktopAction,
  ReminderItem,
} from './types/iris';

const STORAGE_KEYS = {
  messages: 'iris_ai_messages_v1',
  reminders: 'iris_ai_reminders_v1',
  settings: 'iris_ai_settings_v1',
};

function createDefaultSettings(): IrisSettings {
  return {
    language: 'auto',
    voiceURI: '',
    volume: 0.9,
    muted: false,
    speechRate: 1.0,
    speechPitch: 1.05,
    autoSpeak: true,
    continuousVoice: false,
    wakeWordEnabled: false,
    companionUrl: 'http://127.0.0.1:47821',
    companionToken: generateCompanionToken(),
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function App() {
  const [activeView, setActiveView] = useState<IrisView>('workspace');
  const [now, setNow] = useState<Date>(() => new Date());

  const [settings, setSettings] = useState<IrisSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.settings);
      if (saved) {
        return { ...createDefaultSettings(), ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return createDefaultSettings();
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.messages);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const [reminders, setReminders] = useState<ReminderItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.reminders);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const [isThinking, setIsThinking] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealthStatus | null>(null);
  const [companionStatus, setCompanionStatus] = useState<CompanionHealthStatus>({
    connected: false,
    checking: false,
  });

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Persist local state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages.slice(-60)));
    } catch {
      // ignore
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(reminders));
    } catch {
      // ignore
    }
  }, [reminders]);

  const refreshApiHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = await parseJsonResponse<ApiHealthStatus>(res, '/api/health');
      setApiHealth(data);
    } catch (err) {
      setApiHealth({
        ok: false,
        geminiConfigured: false,
        model: 'gemini-3.1-flash-lite',
        checkedAt: new Date().toISOString(),
        error:
          err instanceof Error ? err.message : 'Backend server is unreachable.',
      });
    }
  }, []);

  const refreshCompanionStatus = useCallback(async () => {
    setCompanionStatus((prev) => ({ ...prev, checking: true }));
    const status = await checkCompanionHealth(settings.companionUrl);
    setCompanionStatus(status);
  }, [settings.companionUrl]);

  useEffect(() => {
    refreshApiHealth();
    refreshCompanionStatus();
  }, [refreshApiHealth, refreshCompanionStatus]);

  const {
    supported: speechSupported,
    voices,
    isSpeaking,
    speakingMessageId,
    speak,
    stopSpeaking,
  } = useSpeechSynthesis(settings);

  const sendMessageRef = useRef<(text: string, opts?: { isRetry?: boolean; replaceErrorId?: string }) => Promise<void>>(async () => {});
  const inFlightRequestRef = useRef(false);
  const lastSubmittedRef = useRef<{ text: string; at: number } | null>(null);

  const {
    supported: recognitionSupported,
    isListening,
    isStandby,
    interimTranscript,
    audioLevel,
    error: micError,
    clearError: clearMicError,
    startListening,
    stopListening,
    startWakeStandby,
  } = useSpeechRecognition({
    language: settings.language,
    wakeWordEnabled: settings.wakeWordEnabled,
    onFinalTranscript: (transcript) => {
      sendMessageRef.current(transcript);
    },
    onWakeWordDetected: () => {
      stopSpeaking();
    },
  });

  // Keep wake standby active if enabled and idle
  useEffect(() => {
    if (
      settings.wakeWordEnabled &&
      recognitionSupported &&
      !isListening &&
      !isStandby &&
      !isThinking &&
      !isSpeaking
    ) {
      startWakeStandby();
    }
  }, [
    settings.wakeWordEnabled,
    recognitionSupported,
    isListening,
    isStandby,
    isThinking,
    isSpeaking,
    startWakeStandby,
  ]);

  // Check due reminders periodically
  useEffect(() => {
    const checkDue = () => {
      const currentMs = Date.now();
      let changed = false;
      const updated = reminders.map((item) => {
        if (item.completed || item.notified) return item;
        const dueMs = Date.parse(item.dueAt);
        if (!Number.isNaN(dueMs) && dueMs <= currentMs) {
          changed = true;
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('IRIS AI Reminder', { body: item.title });
          }
          if (settings.autoSpeak && !settings.muted) {
            speak(`Reminder: ${item.title}`);
          }
          return { ...item, notified: true };
        }
        return item;
      });
      if (changed) {
        setReminders(updated);
      }
    };

    const id = setInterval(checkDue, 15000);
    return () => clearInterval(id);
  }, [reminders, settings.autoSpeak, settings.muted, speak]);

  const handleSendMessage = useCallback(
    async (
      rawText: string,
      options?: { isRetry?: boolean; replaceErrorId?: string }
    ) => {
      const text = rawText.trim();
      if (!text || isThinking || inFlightRequestRef.current) return;

      const nowMs = Date.now();
      if (
        !options?.isRetry &&
        lastSubmittedRef.current &&
        lastSubmittedRef.current.text === text &&
        nowMs - lastSubmittedRef.current.at < 2000
      ) {
        return;
      }

      inFlightRequestRef.current = true;
      lastSubmittedRef.current = { text, at: nowMs };

      stopSpeaking();
      if (isListening) {
        stopListening();
      }

      // Limit conversation history sent to Gemini: last 6 valid non-error turns
      const boundedHistory = messages
        .filter((m) => !m.isError && m.text.trim().length > 0)
        .slice(-6)
        .map((m) => ({
          role: m.role,
          text: m.text.trim().slice(0, 1000),
        }));

      if (options?.replaceErrorId) {
        setMessages((prev) => prev.filter((m) => m.id !== options.replaceErrorId));
      } else {
        const userMsg: ChatMessage = {
          id: `msg_${Date.now()}_u`,
          role: 'user',
          text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, userMsg]);
      }

      setIsThinking(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            message: text,
            history: boundedHistory,
            language: settings.language,
            reminders,
            companionConnected: companionStatus.connected,
            clientTimeContext: {
              iso: new Date().toISOString(),
              formatted: new Date().toLocaleString(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
          }),
        });

        const data = await parseJsonResponse<{
          text: string;
          sources?: ChatMessage['sources'];
          pendingActions?: ChatMessage['pendingActions'];
          createdReminders?: Array<{ title: string; dueAt: string; notes?: string }>;
          model?: string;
        }>(res, '/api/chat');

        if (Array.isArray(data.createdReminders) && data.createdReminders.length > 0) {
          const newReminders: ReminderItem[] = data.createdReminders.map(
            (r) => ({
              id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              title: r.title,
              dueAt: r.dueAt,
              notes: r.notes,
              completed: false,
              createdAt: new Date().toISOString(),
            })
          );
          setReminders((prev) => [...newReminders, ...prev]);
        }

        const assistantMsg: ChatMessage = {
          id: `msg_${Date.now()}_a`,
          role: 'assistant',
          text: data.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sources: Array.isArray(data.sources) ? data.sources : [],
          pendingActions: Array.isArray(data.pendingActions) ? data.pendingActions : [],
        };

        setMessages((prev) => [...prev, assistantMsg]);

        if (settings.autoSpeak && !settings.muted && speechSupported) {
          speak(assistantMsg.text, assistantMsg.id, () => {
            if (settings.continuousVoice && recognitionSupported) {
              startListening();
            } else if (settings.wakeWordEnabled && recognitionSupported) {
              startWakeStandby();
            }
          });
        } else if (settings.continuousVoice && recognitionSupported) {
          startListening();
        }
      } catch (err) {
        const errorText =
          err instanceof Error
            ? err.message
            : 'Unable to reach IRIS backend. Please check your connection and try again.';
        const errorCode =
          err instanceof ApiClientError
            ? err.errorCode
            : typeof err === 'object' && err !== null && 'errorCode' in err
              ? (err as { errorCode?: ChatMessage['errorCode'] }).errorCode
              : undefined;
        const errMsg: ChatMessage = {
          id: `msg_${Date.now()}_err`,
          role: 'assistant',
          text: errorText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true,
          retryPrompt: text,
          errorCode: errorCode || 'NETWORK_ERROR',
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        inFlightRequestRef.current = false;
        setIsThinking(false);
      }
    },
    [
      companionStatus.connected,
      isListening,
      isThinking,
      messages,
      recognitionSupported,
      reminders,
      settings.autoSpeak,
      settings.continuousVoice,
      settings.language,
      settings.muted,
      settings.wakeWordEnabled,
      speak,
      speechSupported,
      startListening,
      startWakeStandby,
      stopListening,
      stopSpeaking,
    ]
  );

  sendMessageRef.current = handleSendMessage;

  const handleRetryMessage = useCallback(
    (errorMessageId: string, prompt: string) => {
      handleSendMessage(prompt, {
        isRetry: true,
        replaceErrorId: errorMessageId,
      });
    },
    [handleSendMessage]
  );

  const handleToggleMic = useCallback(() => {
    clearMicError();
    if (isListening) {
      stopListening();
    } else {
      stopSpeaking();
      startListening();
    }
  }, [clearMicError, isListening, startListening, stopListening, stopSpeaking]);

  const updatePendingActionStatus = (
    messageId: string,
    actionId: string,
    status: PendingDesktopAction['status'],
    resultMessage?: string
  ) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.pendingActions) return m;
        return {
          ...m,
          pendingActions: m.pendingActions.map((a) =>
            a.id === actionId ? { ...a, status, resultMessage } : a
          ),
        };
      })
    );
  };

  const handleApproveAction = async (messageId: string, action: PendingDesktopAction) => {
    if (action.type === 'open_website') {
      updatePendingActionStatus(
        messageId,
        action.id,
        'executed',
        'Approved and opened in a new browser tab.'
      );
      return;
    }

    if (action.type === 'read_aloud' && action.textToRead) {
      speak(action.textToRead, messageId);
      updatePendingActionStatus(
        messageId,
        action.id,
        'executed',
        'Reading approved passage aloud.'
      );
      return;
    }

    if (action.type === 'open_windows_app' && action.appId) {
      try {
        const res = await launchWindowsAppViaCompanion(
          settings.companionUrl,
          settings.companionToken,
          action.appId
        );
        updatePendingActionStatus(messageId, action.id, 'executed', res.message);
      } catch (err) {
        updatePendingActionStatus(
          messageId,
          action.id,
          'error',
          err instanceof Error ? err.message : 'Companion launch failed.'
        );
      }
    }
  };

  const handleRejectAction = (messageId: string, actionId: string) => {
    updatePendingActionStatus(messageId, actionId, 'rejected', 'Cancelled by user.');
  };

  const coreState: CoreState = useMemo(() => {
    if (isListening) return 'listening';
    if (isThinking) return 'thinking';
    if (isSpeaking) return 'speaking';
    if (isStandby) return 'standby';
    return 'idle';
  }, [isListening, isThinking, isSpeaking, isStandby]);

  const activeReminderCount = reminders.filter((r) => !r.completed).length;

  return (
    <div className="min-h-screen bg-[#05070B] text-slate-200 flex flex-col">
      <TopBar
        activeView={activeView}
        onSelectView={(view) => {
          setActiveView(view);
          if (view === 'companion') {
            refreshCompanionStatus();
          }
        }}
        onNewSession={() => {
          stopSpeaking();
          setMessages([]);
          setActiveView('workspace');
        }}
        activeReminderCount={activeReminderCount}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-6">
        {activeView === 'workspace' && (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
            {/* Left Focal Column: IRIS Core, Clock & Voice Controls */}
            <aside className="flex w-full shrink-0 flex-col justify-between rounded-xl border border-slate-800/80 bg-[#090D16]/90 p-6 backdrop-blur-md lg:w-[370px]">
              <div className="space-y-6">
                {/* Identity Heading */}
                <div className="text-center">
                  <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100 text-balance">
                    HELLO, I AM IRIS
                  </h1>
                  <p className="mt-1 text-xs text-cyan-300/90">
                    Your Intelligence. Your Assistant.
                  </p>
                </div>

                {/* Animated Circular IRIS AI Core */}
                <IrisCore
                  state={coreState}
                  audioLevel={audioLevel}
                  onCoreClick={handleToggleMic}
                />

                {/* Primary Voice Controls */}
                <div className="space-y-3 border-t border-slate-800/80 pt-5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleMic}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors duration-150 whitespace-nowrap ${
                        isListening
                          ? 'bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/30'
                          : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                      }`}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="h-4 w-4" />
                          <span>Stop Listening</span>
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4" />
                          <span>Start Listening</span>
                        </>
                      )}
                    </button>

                    {isSpeaking && (
                      <button
                        type="button"
                        onClick={stopSpeaking}
                        aria-label="Stop IRIS speaking"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1320] px-3 py-2.5 text-xs font-medium text-cyan-300 hover:border-cyan-500/60 whitespace-nowrap shrink-0"
                      >
                        <Square className="h-3.5 w-3.5 fill-cyan-400 text-cyan-400" />
                        <span>Stop Voice</span>
                      </button>
                    )}
                  </div>

                  {/* Mute & Volume Control */}
                  <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-[#0D1320] px-3.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const nextMuted = !settings.muted;
                        if (nextMuted) stopSpeaking();
                        setSettings((prev) => ({ ...prev, muted: nextMuted }));
                      }}
                      aria-label={settings.muted ? 'Unmute IRIS voice' : 'Mute IRIS voice'}
                      className="text-slate-300 hover:text-cyan-300 transition-colors shrink-0"
                    >
                      {settings.muted || settings.volume === 0 ? (
                        <VolumeX className="h-4 w-4 text-red-400" />
                      ) : (
                        <Volume2 className="h-4 w-4 text-cyan-400" />
                      )}
                    </button>

                    <input
                      type="range"
                      aria-label="Voice volume"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.muted ? 0 : settings.volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSettings((prev) => ({
                          ...prev,
                          volume: val,
                          muted: val === 0,
                        }));
                      }}
                      className="flex-1 accent-cyan-500"
                    />

                    <span className="w-9 text-right font-mono text-xs tabular-nums text-slate-400">
                      {settings.muted ? '0%' : `${Math.round(settings.volume * 100)}%`}
                    </span>
                  </div>

                  {/* Wake Phrase Quick Toggle */}
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#0D1320] px-3.5 py-2.5 cursor-pointer">
                    <span className="text-xs text-slate-300">
                      Wake phrase: <strong className="text-slate-100">&ldquo;Hello IRIS&rdquo;</strong>
                    </span>
                    <input
                      type="checkbox"
                      disabled={!recognitionSupported}
                      checked={settings.wakeWordEnabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setSettings((prev) => ({ ...prev, wakeWordEnabled: enabled }));
                        if (!enabled) stopListening();
                      }}
                      className="h-4 w-4 accent-cyan-500"
                    />
                  </label>

                  {micError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-300">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{micError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Time, Connection Status & Owner Attribution */}
              <div className="mt-6 space-y-4 border-t border-slate-800/80 pt-5">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-mono text-xl font-semibold tabular-nums text-slate-100">
                    {formatTime(now)}
                  </div>
                  <div className="text-xs text-slate-400 text-right">{formatDate(now)}</div>
                </div>

                {/* Unboxed honest connection status */}
                <div className="space-y-1 text-xs text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Gemini Core</span>
                    <span
                      className={
                        apiHealth?.geminiConfigured ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {apiHealth === null
                        ? 'Checking...'
                        : apiHealth.geminiConfigured
                          ? 'Connected'
                          : 'API Key Missing'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Windows Companion</span>
                    <button
                      type="button"
                      onClick={() => setActiveView('companion')}
                      className={`hover:underline ${
                        companionStatus.connected ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {companionStatus.connected ? 'Connected' : 'Not Connected'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/70 pt-3 text-[11px] text-slate-500">
                  <span>Created by Saqib Anwar</span>
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        stopSpeaking();
                        setMessages([]);
                      }}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear Chat</span>
                    </button>
                  )}
                </div>
              </div>
            </aside>

            {/* Right Main Conversation Column */}
            <div className="flex-1 min-w-0">
              <ChatPanel
                messages={messages}
                isThinking={isThinking}
                isListening={isListening}
                isStandby={isStandby}
                interimTranscript={interimTranscript}
                speakingMessageId={speakingMessageId}
                language={settings.language}
                continuousVoice={settings.continuousVoice}
                companionConnected={companionStatus.connected}
                onChangeLanguage={(lang) =>
                  setSettings((prev) => ({ ...prev, language: lang }))
                }
                onToggleContinuousVoice={() =>
                  setSettings((prev) => ({ ...prev, continuousVoice: !prev.continuousVoice }))
                }
                onToggleMic={handleToggleMic}
                onSendMessage={handleSendMessage}
                onSpeakMessage={(txt, id) => speak(txt, id)}
                onStopSpeaking={stopSpeaking}
                onApproveAction={handleApproveAction}
                onRejectAction={handleRejectAction}
                onRetryMessage={handleRetryMessage}
              />
            </div>
          </div>
        )}

        {activeView === 'reminders' && (
          <RemindersView
            reminders={reminders}
            onAddReminder={(title, dueAt, notes) => {
              const newItem: ReminderItem = {
                id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                title,
                dueAt,
                notes,
                completed: false,
                createdAt: new Date().toISOString(),
              };
              setReminders((prev) => [newItem, ...prev]);
            }}
            onToggleReminder={(id) =>
              setReminders((prev) =>
                prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
              )
            }
            onDeleteReminder={(id) =>
              setReminders((prev) => prev.filter((r) => r.id !== id))
            }
            onClearCompleted={() =>
              setReminders((prev) => prev.filter((r) => !r.completed))
            }
          />
        )}

        {activeView === 'companion' && (
          <CompanionView
            companionUrl={settings.companionUrl}
            companionToken={settings.companionToken}
            companionStatus={companionStatus}
            onRefreshStatus={refreshCompanionStatus}
            onRegenerateToken={() =>
              setSettings((prev) => ({
                ...prev,
                companionToken: generateCompanionToken(),
              }))
            }
            onUpdateUrl={(url) =>
              setSettings((prev) => ({ ...prev, companionUrl: url }))
            }
          />
        )}

        {activeView === 'settings' && (
          <SettingsView
            settings={settings}
            voices={voices}
            speechSupported={speechSupported}
            recognitionSupported={recognitionSupported}
            onUpdateSettings={(patch) =>
              setSettings((prev) => ({ ...prev, ...patch }))
            }
            onTestVoice={() =>
              speak(
                'Hello! I am IRIS, your personal desktop assistant created by Saqib Anwar. How may I assist you today?'
              )
            }
            onClearChat={() => {
              stopSpeaking();
              setMessages([]);
            }}
            onClearAllReminders={() => setReminders([])}
            onResetDefaults={() => {
              stopSpeaking();
              stopListening();
              setSettings(createDefaultSettings());
            }}
          />
        )}
      </main>
    </div>
  );
}
