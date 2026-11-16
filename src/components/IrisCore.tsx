import type { CoreState } from '../types/iris';

interface IrisCoreProps {
  state: CoreState;
  audioLevel: number;
  onCoreClick: () => void;
}

const STATE_LABELS: Record<CoreState, string> = {
  idle: 'Ready · Click core or mic to speak',
  standby: 'Wake Standby · Say "Hello IRIS"',
  listening: 'Listening · Microphone Active',
  thinking: 'Processing · Thinking',
  speaking: 'Speaking · Voice Active',
};

export function IrisCore({ state, audioLevel, onCoreClick }: IrisCoreProps) {
  const isListening = state === 'listening';
  const isThinking = state === 'thinking';
  const isSpeaking = state === 'speaking';
  const isStandby = state === 'standby';

  const dynamicScale = isListening
    ? 1 + Math.min(0.18, audioLevel * 0.24)
    : isSpeaking
      ? 1.06
      : isThinking
        ? 1.03
        : 1;

  const coreColor = isListening
    ? '#22D3EE'
    : isThinking
      ? '#60A5FA'
      : isSpeaking
        ? '#38BDF8'
        : isStandby
          ? '#0EA5E9'
          : '#0284C7';

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onCoreClick}
        aria-label={isListening ? 'Stop listening' : 'Start voice listening'}
        className="group relative flex h-56 w-56 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        {/* Ambient radial glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 rounded-full blur-2xl transition-transform duration-150"
          style={{
            background: `radial-gradient(circle, ${coreColor}44 0%, rgba(37,99,235,0.12) 55%, transparent 75%)`,
            transform: `scale(${dynamicScale})`,
          }}
        />

        {/* Animated harmonic SVG rings */}
        <svg
          viewBox="0 0 240 240"
          className="h-56 w-56 transition-transform duration-150"
          style={{ transform: `scale(${dynamicScale})` }}
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="irisCoreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#67E8F9" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#0EA5E9" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.05" />
            </radialGradient>
            <linearGradient id="irisRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {/* Outer segmented orbital ring */}
          <g className="origin-center animate-iris-spin">
            <circle
              cx="120"
              cy="120"
              r="104"
              fill="none"
              stroke="url(#irisRingGrad)"
              strokeWidth="1.5"
              strokeDasharray="34 14 8 14"
              opacity={isListening || isThinking ? 0.95 : 0.6}
            />
            <circle
              cx="120"
              cy="120"
              r="95"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="0.75"
              strokeDasharray="4 10"
              opacity="0.45"
            />
          </g>

          {/* Counter-rotating precision arc */}
          <g
            className="origin-center animate-iris-spin-reverse"
            style={{ animationDuration: isThinking ? '6s' : '18s' }}
          >
            <circle
              cx="120"
              cy="120"
              r="82"
              fill="none"
              stroke="#22D3EE"
              strokeWidth="2"
              strokeDasharray="65 40 22 40"
              opacity={isListening || isSpeaking ? 0.9 : 0.55}
            />
            <circle
              cx="120"
              cy="120"
              r="68"
              fill="none"
              stroke="#60A5FA"
              strokeWidth="1.2"
              strokeDasharray="18 16"
              opacity="0.55"
            />
          </g>

          {/* Inner energy orb */}
          <g className="origin-center animate-iris-breathe">
            <circle
              cx="120"
              cy="120"
              r="48"
              fill="url(#irisCoreGlow)"
              stroke="#67E8F9"
              strokeWidth="1.25"
              strokeOpacity="0.7"
            />
            <circle
              cx="120"
              cy="120"
              r="26"
              fill="none"
              stroke="#E0F2FE"
              strokeWidth="1.5"
              strokeOpacity={isSpeaking || isListening ? 0.9 : 0.45}
            />
            <circle
              cx="120"
              cy="120"
              r="10"
              fill="#E0F2FE"
              opacity={isListening || isSpeaking ? 0.95 : 0.7}
            />
          </g>
        </svg>
      </button>

      {/* Honest live state readout */}
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
        {isListening && (
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-cyan-400 animate-pulse"
          />
        )}
        <span>{STATE_LABELS[state]}</span>
      </div>
    </div>
  );
}
