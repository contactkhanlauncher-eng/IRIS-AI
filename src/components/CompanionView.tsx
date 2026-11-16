import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  RefreshCw,
  ShieldCheck,
  Terminal,
  AlertCircle,
  Play,
} from 'lucide-react';
import type { CompanionHealthStatus } from '../types/iris';
import {
  APPROVED_WINDOWS_APPS,
  buildBatchLauncherScript,
  buildPowerShellCompanionScript,
  launchWindowsAppViaCompanion,
} from '../utils/companion';

interface CompanionViewProps {
  companionUrl: string;
  companionToken: string;
  companionStatus: CompanionHealthStatus;
  onRefreshStatus: () => void;
  onRegenerateToken: () => void;
  onUpdateUrl: (url: string) => void;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CompanionView({
  companionUrl,
  companionToken,
  companionStatus,
  onRefreshStatus,
  onRegenerateToken,
  onUpdateUrl,
}: CompanionViewProps) {
  const [copiedToken, setCopiedToken] = useState(false);
  const [launchFeedback, setLaunchFeedback] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(companionToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleTestLaunch = async (appId: string, label: string) => {
    setLaunchFeedback(null);
    setLaunchError(null);
    try {
      const res = await launchWindowsAppViaCompanion(companionUrl, companionToken, appId);
      setLaunchFeedback(`${label}: ${res.message}`);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Failed to launch application.');
    }
  };

  const psScript = buildPowerShellCompanionScript(companionToken);
  const batScript = buildBatchLauncherScript();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Windows 10 / 11 Desktop Companion
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Optional local bridge running on your Dell laptop for launching approved Windows apps with explicit confirmation.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefreshStatus}
          disabled={companionStatus.checking}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1320] px-4 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/60 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${companionStatus.checking ? 'animate-spin' : ''}`} />
          <span>{companionStatus.checking ? 'Checking...' : 'Check Connection'}</span>
        </button>
      </div>

      {/* Live Status & Security Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800/80 bg-[#090D16] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Connection Status
            </h2>
            <span
              className={`text-xs font-medium ${
                companionStatus.connected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {companionStatus.connected ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          <p className="text-xs leading-relaxed text-slate-400">
            {companionStatus.connected
              ? `Companion is active (${companionStatus.platform || 'Windows'}). Approved app launches are enabled.`
              : companionStatus.error ||
                'Web mode works directly in your browser. Start the local companion script on Windows 10/11 to enable launching desktop apps.'}
          </p>

          <div className="space-y-3 pt-2">
            <div>
              <label htmlFor="comp-url" className="block text-xs font-medium text-slate-300 mb-1.5">
                Local Companion Endpoint
              </label>
              <input
                id="comp-url"
                type="text"
                value={companionUrl}
                onChange={(e) => onUpdateUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-[#0D1320] px-3.5 py-2 font-mono text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="comp-token" className="text-xs font-medium text-slate-300">
                  Bearer Security Token
                </label>
                <button
                  type="button"
                  onClick={onRegenerateToken}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Regenerate Token
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="comp-token"
                  type="text"
                  readOnly
                  value={companionToken}
                  className="flex-1 rounded-lg border border-slate-800 bg-[#0D1320] px-3.5 py-2 font-mono text-xs text-slate-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyToken}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1320] px-3 py-2 text-xs text-slate-200 hover:border-cyan-500/60"
                >
                  {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Download & Setup Guide */}
        <div className="rounded-xl border border-slate-800/80 bg-[#090D16] p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-100">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <h2 className="font-display text-base font-semibold">
              Install on Windows 10 / 11
            </h2>
          </div>

          <ol className="list-decimal list-inside space-y-2 text-xs leading-relaxed text-slate-300">
            <li>
              Download both <code className="font-mono text-cyan-300">iris-companion.ps1</code> (pre-configured with your Bearer token) and{' '}
              <code className="font-mono text-cyan-300">start-iris-companion.bat</code> into the same folder on your Dell laptop.
            </li>
            <li>
              Double-click <code className="font-mono text-cyan-300">start-iris-companion.bat</code> to launch the local HTTP listener on{' '}
              <code className="font-mono text-slate-200">127.0.0.1:47821</code>.
            </li>
            <li>
              Return here and click <strong>Check Connection</strong>. The companion only accepts requests with your exact Bearer token and strict app allowlist.
            </li>
          </ol>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => downloadTextFile('iris-companion.ps1', psScript)}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download iris-companion.ps1</span>
            </button>

            <button
              type="button"
              onClick={() => downloadTextFile('start-iris-companion.bat', batScript)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1320] px-4 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/60 transition-colors whitespace-nowrap shrink-0"
            >
              <Terminal className="h-3.5 w-3.5 text-cyan-400" />
              <span>Download start-iris-companion.bat</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Security note: If accessing IRIS over HTTPS in a cloud preview, browsers like Chrome or Edge allow localhost HTTP requests (<code className="font-mono">127.0.0.1</code>) as a secure context, or run IRIS locally at <code className="font-mono">http://localhost:3000</code>.
          </p>
        </div>
      </div>

      {/* Approved Windows Applications Allowlist */}
      <div className="rounded-xl border border-slate-800/80 bg-[#090D16] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Approved Windows Applications Allowlist
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Only these applications can be launched via IRIS after your explicit approval. Arbitrary shell execution is blocked.
            </p>
          </div>
          {!companionStatus.connected && (
            <span className="text-xs text-amber-400">
              Requires local companion running to test launch
            </span>
          )}
        </div>

        {launchFeedback && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/25 px-4 py-2.5 text-xs text-emerald-300">
            {launchFeedback}
          </div>
        )}
        {launchError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/25 px-4 py-2.5 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{launchError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {APPROVED_WINDOWS_APPS.map((app) => (
            <div
              key={app.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#0D1320] px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-100 truncate">{app.label}</div>
                <div className="text-xs text-slate-400 truncate">
                  <span className="font-mono text-cyan-300/90">{app.id}</span> · {app.description}
                </div>
              </div>

              <button
                type="button"
                disabled={!companionStatus.connected}
                onClick={() => handleTestLaunch(app.id, app.label)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 transition-colors shrink-0"
              >
                <Play className="h-3 w-3" />
                <span>Launch</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
