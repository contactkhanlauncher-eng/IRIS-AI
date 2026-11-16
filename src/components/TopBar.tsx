import type { IrisView } from '../types/iris';

interface TopBarProps {
  activeView: IrisView;
  onSelectView: (view: IrisView) => void;
  onNewSession: () => void;
  activeReminderCount: number;
}

const NAV_ITEMS: Array<{ id: IrisView; label: string }> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'companion', label: 'Companion' },
  { id: 'settings', label: 'Settings' },
];

export function TopBar({
  activeView,
  onSelectView,
  onNewSession,
  activeReminderCount,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#05070B]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-6">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onSelectView('workspace')}
          className="font-display text-lg font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-sm"
        >
          IRIS AI
        </button>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            const labelText =
              item.id === 'reminders' && activeReminderCount > 0
                ? `${item.label} (${activeReminderCount})`
                : item.label;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-sm ${
                  isActive
                    ? 'text-cyan-300'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {labelText}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[17px] h-[2px] bg-cyan-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onNewSession}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 whitespace-nowrap shrink-0"
          >
            New Session
          </button>
        </div>
      </div>
    </header>
  );
}
