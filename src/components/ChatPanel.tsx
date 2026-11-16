import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  Copy,
  ExternalLink,
  Mic,
  MicOff,
  Radio,
  Send,
  Volume2,
  Square,
  AlertTriangle,
  Terminal,
  Globe,
  Bell,
  RefreshCw,
} from 'lucide-react';
import type {
  ChatMessage,
  IrisLanguage,
  PendingDesktopAction,
} from '../types/iris';

interface ChatPanelProps {
  messages: ChatMessage[];
  isThinking: boolean;
  isListening: boolean;
  isStandby: boolean;
  interimTranscript: string;
  speakingMessageId: string | null;
  language: IrisLanguage;
  continuousVoice: boolean;
  companionConnected: boolean;
  onChangeLanguage: (lang: IrisLanguage) => void;
  onToggleContinuousVoice: () => void;
  onToggleMic: () => void;
  onSendMessage: (text: string) => void;
  onSpeakMessage: (text: string, messageId: string) => void;
  onStopSpeaking: () => void;
  onApproveAction: (messageId: string, action: PendingDesktopAction) => void;
  onRejectAction: (messageId: string, actionId: string) => void;
  onRetryMessage: (errorMessageId: string, prompt: string) => void;
}

const STARTER_PROMPTS = [
  {
    title: 'Web Research',
    prompt: 'Search the web for the latest advancements in AI laptops and summarize in 4 bullet points.',
  },
  {
    title: 'Coding & Math',
    prompt: 'Explain binary search with time complexity and write a clean Python example.',
  },
  {
    title: 'Hinglish & Urdu',
    prompt: 'IRIS, mujhe Hinglish mein batao aaj main apna study schedule kaise organize karun?',
  },
  {
    title: 'Desktop Action',
    prompt: 'Set a reminder for 6:00 PM today to review project notes, and prepare to open Notepad.',
  },
];

function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-300 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export function ChatPanel({
  messages,
  isThinking,
  isListening,
  isStandby,
  interimTranscript,
  speakingMessageId,
  language,
  continuousVoice,
  companionConnected,
  onChangeLanguage,
  onToggleContinuousVoice,
  onToggleMic,
  onSendMessage,
  onSpeakMessage,
  onStopSpeaking,
  onApproveAction,
  onRejectAction,
  onRetryMessage,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking, interimTranscript]);

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;
    onSendMessage(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section
      aria-label="Conversation Workspace"
      className="flex h-[calc(100vh-7.5rem)] min-h-[540px] flex-col rounded-xl border border-slate-800/80 bg-[#090D16]/85 backdrop-blur-md"
    >
      {/* Conversation Scroll Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center max-w-2xl mx-auto py-8">
            <h2 className="font-display text-2xl font-semibold text-slate-100 text-balance">
              Good day. How can I assist you today?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Ask me anything in English, Hindi, Urdu, or Hinglish. I can research live web topics,
              explain science and mathematics, write code, manage reminders, or prepare confirmed
              Windows desktop actions.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STARTER_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => onSendMessage(item.prompt)}
                  className="group rounded-lg border border-slate-800 bg-[#0D1320] p-4 text-left transition-colors duration-150 hover:border-cyan-500/50 hover:bg-[#11192A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <div className="text-sm font-semibold text-cyan-300 group-hover:text-cyan-200">
                    {item.title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400 line-clamp-2">
                    {item.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isThisSpeaking = speakingMessageId === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-5 py-4 ${
                    isUser
                      ? 'border border-cyan-500/30 bg-cyan-950/35 text-slate-100'
                      : msg.isError
                        ? 'border border-red-500/40 bg-red-950/25 text-red-100'
                        : 'border border-slate-800/90 bg-[#0D1320] text-slate-200'
                  }`}
                >
                  {/* Unboxed Metadata Header */}
                  <div className="mb-2 flex items-center justify-between gap-4 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className={isUser ? 'font-medium text-cyan-300' : 'font-medium text-slate-200'}>
                        {isUser ? 'You' : 'IRIS'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{msg.timestamp}</span>
                    </div>

                    {!isUser && !msg.isError && (
                      <button
                        type="button"
                        onClick={() =>
                          isThisSpeaking
                            ? onStopSpeaking()
                            : onSpeakMessage(msg.text, msg.id)
                        }
                        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                        aria-label={isThisSpeaking ? 'Stop speaking response' : 'Read response aloud'}
                      >
                        {isThisSpeaking ? (
                          <>
                            <Square className="h-3 w-3 fill-cyan-400 text-cyan-400" />
                            <span className="text-cyan-300">Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5" />
                            <span>Listen</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Message Prose */}
                  {isUser ? (
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none text-[15px] leading-relaxed prose-headings:font-display prose-headings:text-slate-100 prose-a:text-cyan-300 prose-strong:text-slate-100 prose-code:text-cyan-200 prose-pre:bg-[#06090F] prose-pre:border prose-pre:border-slate-800">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          pre({ children }) {
                            return (
                              <pre className="relative overflow-x-auto rounded-lg border border-slate-800 bg-[#06090F] p-4 my-3">
                                {children}
                              </pre>
                            );
                          },
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const codeStr = String(children).replace(/\n$/, '');
                            const isBlock = Boolean(match) || codeStr.includes('\n');
                            if (isBlock) {
                              return (
                                <div>
                                  <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2 text-xs text-slate-400">
                                    <span className="font-mono">{match ? match[1] : 'code'}</span>
                                    <CodeCopyButton code={codeStr} />
                                  </div>
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </div>
                              );
                            }
                            return (
                              <code
                                className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-xs text-cyan-200"
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  )}

                  {msg.isError && msg.retryPrompt && (
                    <div className="mt-3 pt-2.5 border-t border-red-500/25 flex items-center justify-between gap-3">
                      <span className="text-xs text-red-200/80">
                        {msg.errorCode === 'QUOTA_EXHAUSTED' || msg.errorCode === 'RATE_LIMITED'
                          ? 'Free quota limit reached — retry once available.'
                          : 'Request failed.'}
                      </span>
                      <button
                        type="button"
                        disabled={isThinking}
                        onClick={() => onRetryMessage(msg.id, msg.retryPrompt!)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/15 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-500/25 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}

                  {/* Grounding Web Research Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 border-t border-slate-800/80 pt-3">
                      <div className="text-xs font-medium text-slate-400 mb-2">
                        Web Research Sources
                      </div>
                      <ul className="space-y-1.5">
                        {msg.sources.map((src, idx) => (
                          <li key={`${src.url}_${idx}`} className="text-xs">
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[460px]">{src.title}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* User Confirmation Desktop Action Cards */}
                  {msg.pendingActions && msg.pendingActions.length > 0 && (
                    <div className="mt-4 space-y-3 border-t border-slate-800/80 pt-3">
                      {msg.pendingActions.map((action) => (
                        <div
                          key={action.id}
                          className="rounded-lg border border-slate-700/80 bg-[#080C14] p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 text-cyan-400">
                                {action.type === 'open_windows_app' && <Terminal className="h-4 w-4" />}
                                {action.type === 'open_website' && <Globe className="h-4 w-4" />}
                                {action.type === 'read_aloud' && <Volume2 className="h-4 w-4" />}
                                {action.type === 'create_reminder' && <Bell className="h-4 w-4" />}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-slate-100">
                                  {action.title}
                                </div>
                                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                                  {action.description}
                                </p>
                                {action.type === 'open_windows_app' && !companionConnected && action.status === 'pending' && (
                                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-amber-400">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                    <span>Windows Companion not connected. Open the Companion tab to install and start it.</span>
                                  </p>
                                )}
                                {action.resultMessage && (
                                  <p
                                    className={`mt-1.5 text-xs ${
                                      action.status === 'error' ? 'text-red-400' : 'text-emerald-400'
                                    }`}
                                  >
                                    {action.resultMessage}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {action.status === 'pending' && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {action.type === 'open_website' && action.url ? (
                                <a
                                  href={action.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => onApproveAction(msg.id, action)}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  <span>Approve &amp; Open Website</span>
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  disabled={action.type === 'open_windows_app' && !companionConnected}
                                  onClick={() => onApproveAction(msg.id, action)}
                                  className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 transition-colors whitespace-nowrap shrink-0"
                                >
                                  {action.type === 'read_aloud'
                                    ? 'Approve & Speak'
                                    : 'Approve & Launch'}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => onRejectAction(msg.id, action.id)}
                                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isThinking && (
          <div className="flex items-start">
            <div className="rounded-xl border border-slate-800/90 bg-[#0D1320] px-5 py-4 text-sm text-slate-300">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-ping" aria-hidden="true" />
                <span>IRIS is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Live Interim Speech Transcript Strip */}
      {interimTranscript && (
        <div className="border-t border-slate-800/70 bg-[#0B111C] px-6 py-2 text-xs text-cyan-300">
          Hearing: <span className="text-slate-200">{interimTranscript}</span>
        </div>
      )}

      {/* Command Input Bar */}
      <div className="border-t border-slate-800/80 bg-[#070B12] p-4 rounded-b-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <label htmlFor="quick-lang" className="text-xs text-slate-400">
              Language:
            </label>
            <select
              id="quick-lang"
              value={language}
              onChange={(e) => onChangeLanguage(e.target.value as IrisLanguage)}
              className="rounded-md border border-slate-800 bg-[#0D1320] px-2.5 py-1 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="auto">Auto (Hinglish / Multi)</option>
              <option value="en">English</option>
              <option value="hi">Hindi (हिन्दी)</option>
              <option value="ur">Urdu (اردو)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onToggleContinuousVoice}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              continuousVoice
                ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300'
                : 'border-slate-800 bg-[#0D1320] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>{continuousVoice ? 'Voice Loop On' : 'Voice Loop Off'}</span>
          </button>
        </div>

        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={onToggleMic}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
            title={
              isListening
                ? 'Stop listening'
                : isStandby
                  ? 'Wake standby active — click to speak immediately'
                  : 'Start voice input'
            }
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              isListening
                ? 'border-red-500/60 bg-red-500/20 text-red-300 hover:bg-red-500/30'
                : 'border-slate-700 bg-[#0D1320] text-cyan-300 hover:border-cyan-500/60 hover:bg-[#11192A]'
            }`}
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask IRIS anything in English, Hindi, Urdu, or Hinglish..."
            className="min-h-[44px] max-h-[140px] flex-1 resize-none rounded-lg border border-slate-800 bg-[#0D1320] px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />

          <button
            type="button"
            onClick={submit}
            disabled={!input.trim() || isThinking}
            aria-label="Send message"
            className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 whitespace-nowrap"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>
    </section>
  );
}
