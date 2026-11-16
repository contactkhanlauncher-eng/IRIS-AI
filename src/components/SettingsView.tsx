import { Volume2, ShieldAlert, RotateCcw } from 'lucide-react';
import type { IrisLanguage, IrisSettings } from '../types/iris';

interface SettingsViewProps {
  settings: IrisSettings;
  voices: SpeechSynthesisVoice[];
  speechSupported: boolean;
  recognitionSupported: boolean;
  onUpdateSettings: (patch: Partial<IrisSettings>) => void;
  onTestVoice: () => void;
  onClearChat: () => void;
  onClearAllReminders: () => void;
  onResetDefaults: () => void;
}

export function SettingsView({
  settings,
  voices,
  speechSupported,
  recognitionSupported,
  onUpdateSettings,
  onTestVoice,
  onClearChat,
  onClearAllReminders,
  onResetDefaults,
}: SettingsViewProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="border-b border-slate-800/80 pb-5">
        <h1 className="font-display text-2xl font-semibold text-slate-100">
          Assistant &amp; Privacy Settings
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Customize IRIS voice synthesis, language behavior, wake phrase, and local privacy controls.
        </p>
      </div>

      {/* Language & Intelligence */}
      <div className="rounded-xl border border-slate-800/80 bg-[#090D16] p-6 space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-100">
          Language &amp; Conversation
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="settings-lang" className="block text-xs font-medium text-slate-300 mb-1.5">
              Preferred Language
            </label>
            <select
              id="settings-lang"
              value={settings.language}
              onChange={(e) => onUpdateSettings({ language: e.target.value as IrisLanguage })}
              className="w-full rounded-lg border border-slate-800 bg-[#0D1320] px-3.5 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
            >
              <option value="auto">Auto (English / Hindi / Urdu / Hinglish)</option>
              <option value="en">English</option>
              <option value="hi">Hindi (हिन्दी)</option>
              <option value="ur">Urdu (اردو)</option>
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-[#0D1320] px-4 py-2.5 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-slate-200">Auto-Speak Responses</div>
                <div className="text-xs text-slate-400">Automatically read IRIS replies aloud</div>
              </div>
              <input
                type="checkbox"
                checked={settings.autoSpeak}
                onChange={(e) => onUpdateSettings({ autoSpeak: e.target.checked })}
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Female Voice Synthesis & Speech Recognition */}
      <div className="rounded-xl border border-slate-800/80 bg-[#090D16] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Voice Synthesis &amp; Microphone
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Speech Synthesis: {speechSupported ? 'Supported' : 'Not Supported'} · Speech Recognition:{' '}
              {recognitionSupported ? 'Supported' : 'Use Chrome or Edge on Windows'}
            </p>
          </div>

          <button
            type="button"
            disabled={!speechSupported}
            onClick={onTestVoice}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1320] px-3.5 py-2 text-xs font-medium text-cyan-300 hover:border-cyan-500/60 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Volume2 className="h-3.5 w-3.5" />
            <span>Test IRIS Voice</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="voice-select" className="block text-xs font-medium text-slate-300 mb-1.5">
              Voice Profile (Female voices prioritized)
            </label>
            <select
              id="voice-select"
              value={settings.voiceURI}
              onChange={(e) => onUpdateSettings({ voiceURI: e.target.value })}
              className="w-full rounded-lg border border-slate-800 bg-[#0D1320] px-3.5 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
            >
              <option value="">Auto-Select Best Female Voice</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
              <label htmlFor="speech-rate">Speech Speed</label>
              <span className="font-mono tabular-nums text-cyan-300">{settings.speechRate.toFixed(2)}x</span>
            </div>
            <input
              id="speech-rate"
              type="range"
              min="0.75"
              max="1.35"
              step="0.05"
              value={settings.speechRate}
              onChange={(e) => onUpdateSettings({ speechRate: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
              <label htmlFor="speech-pitch">Voice Pitch</label>
              <span className="font-mono tabular-nums text-cyan-300">{settings.speechPitch.toFixed(2)}</span>
            </div>
            <input
              id="speech-pitch"
              type="range"
              min="0.85"
              max="1.25"
              step="0.05"
              value={settings.speechPitch}
              onChange={(e) => onUpdateSettings({ speechPitch: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-[#0D1320] px-4 py-3 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-slate-200">Hands-Free Voice Loop</div>
              <div className="text-xs text-slate-400">
                Resume listening automatically after IRIS finishes speaking
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.continuousVoice}
              onChange={(e) => onUpdateSettings({ continuousVoice: e.target.checked })}
              className="h-4 w-4 accent-cyan-500"
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-[#0D1320] px-4 py-3 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-slate-200">Wake Phrase: &ldquo;Hello IRIS&rdquo;</div>
              <div className="text-xs text-slate-400">
                Keeps browser mic in visible standby mode when turned on
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!recognitionSupported}
              checked={settings.wakeWordEnabled}
              onChange={(e) => onUpdateSettings({ wakeWordEnabled: e.target.checked })}
              className="h-4 w-4 accent-cyan-500"
            />
          </label>
        </div>
      </div>

      {/* Privacy Controls */}
      <div className="rounded-xl border border-slate-800/80 bg-[#090D16] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100">
          <ShieldAlert className="h-5 w-5 text-cyan-400" />
          <h2 className="font-display text-base font-semibold">
            Privacy &amp; Local Data Controls
          </h2>
        </div>

        <p className="text-xs leading-relaxed text-slate-400">
          Your chat history, reminders, and settings are stored strictly in your browser&apos;s local storage.
          IRIS never records audio in the background without a visible microphone active indicator, and API keys
          are stored securely on the backend server only.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClearChat}
            className="rounded-lg border border-slate-700 bg-[#0D1320] px-4 py-2 text-xs font-medium text-slate-200 hover:border-red-500/60 hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
          >
            Clear Conversation History
          </button>

          <button
            type="button"
            onClick={onClearAllReminders}
            className="rounded-lg border border-slate-700 bg-[#0D1320] px-4 py-2 text-xs font-medium text-slate-200 hover:border-red-500/60 hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
          >
            Clear All Reminders
          </button>

          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1320] px-4 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/60 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Voice &amp; App Defaults</span>
          </button>
        </div>
      </div>
    </div>
  );
}
