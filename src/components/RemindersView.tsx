import { useState } from 'react';
import { Bell, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import type { ReminderItem } from '../types/iris';

interface RemindersViewProps {
  reminders: ReminderItem[];
  onAddReminder: (title: string, dueAt: string, notes?: string) => void;
  onToggleReminder: (id: string) => void;
  onDeleteReminder: (id: string) => void;
  onClearCompleted: () => void;
}

export function RemindersView({
  reminders,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
  onClearCompleted,
}: RemindersViewProps) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const handleRequestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    } catch {
      // ignore
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const dueValue = dueAt.trim() || new Date(Date.now() + 3600000).toISOString().slice(0, 16);
    onAddReminder(title.trim(), dueValue, notes.trim() || undefined);
    setTitle('');
    setDueAt('');
    setNotes('');
  };

  const filtered = reminders.filter((r) => {
    if (filter === 'active') return !r.completed;
    if (filter === 'completed') return r.completed;
    return true;
  });

  const completedCount = reminders.filter((r) => r.completed).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Reminders &amp; Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Create reminders manually or ask IRIS in conversation. Due reminders announce aloud when active.
          </p>
        </div>

        {notifPermission !== 'unsupported' && (
          <button
            type="button"
            onClick={handleRequestNotifications}
            disabled={notifPermission === 'granted'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1320] px-4 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/60 disabled:opacity-70 transition-colors whitespace-nowrap shrink-0"
          >
            <Bell className="h-3.5 w-3.5 text-cyan-400" />
            <span>
              {notifPermission === 'granted'
                ? 'Desktop Notifications Enabled'
                : notifPermission === 'denied'
                  ? 'Notifications Blocked in Browser'
                  : 'Enable Desktop Notifications'}
            </span>
          </button>
        )}
      </div>

      {/* Add Reminder Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-800/80 bg-[#090D16] p-5 space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rem-title" className="block text-xs font-medium text-slate-300 mb-1.5">
              Reminder Title
            </label>
            <input
              id="rem-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Submit DSA assignment"
              className="w-full rounded-lg border border-slate-800 bg-[#0D1320] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="rem-due" className="block text-xs font-medium text-slate-300 mb-1.5">
              Due Date &amp; Time
            </label>
            <input
              id="rem-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-[#0D1320] px-3.5 py-2 font-mono text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="rem-notes" className="block text-xs font-medium text-slate-300 mb-1.5">
              Notes (Optional)
            </label>
            <input
              id="rem-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context or link"
              className="w-full rounded-lg border border-slate-800 bg-[#0D1320] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Reminder</span>
          </button>
        </div>
      </form>

      {/* Filter & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-lg bg-[#0D1320] p-1 border border-slate-800">
          {(['all', 'active', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                filter === tab
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {completedCount > 0 && (
          <button
            type="button"
            onClick={onClearCompleted}
            className="text-xs font-medium text-slate-400 hover:text-red-400 transition-colors"
          >
            Clear completed ({completedCount})
          </button>
        )}
      </div>

      {/* Reminders List */}
      <div className="rounded-xl border border-slate-800/80 bg-[#090D16] divide-y divide-slate-800/70">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-400">
              No reminders in this view yet. Add one above or ask IRIS to remind you.
            </p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[#0D1320]/60 transition-colors"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onToggleReminder(item.id)}
                  aria-label={item.completed ? 'Mark as active' : 'Mark as completed'}
                  className="mt-0.5 text-cyan-400 hover:text-cyan-300 shrink-0"
                >
                  {item.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-500 hover:text-cyan-400" />
                  )}
                </button>

                <div className="min-w-0">
                  <div
                    className={`text-sm font-medium ${
                      item.completed ? 'line-through text-slate-500' : 'text-slate-100'
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono tabular-nums">{item.dueAt.replace('T', ' ')}</span>
                    {item.notes && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-md">{item.notes}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDeleteReminder(item.id)}
                aria-label="Delete reminder"
                className="rounded-md p-2 text-slate-500 hover:bg-slate-800 hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
