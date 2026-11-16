import type { CompanionHealthStatus } from '../types/iris';
import { parseJsonResponse } from './api';

export interface ApprovedAppInfo {
  id: string;
  label: string;
  description: string;
  windowsTarget: string;
}

export const APPROVED_WINDOWS_APPS: ApprovedAppInfo[] = [
  { id: 'notepad', label: 'Notepad', description: 'Built-in Windows text editor', windowsTarget: 'notepad.exe' },
  { id: 'calc', label: 'Calculator', description: 'Windows Calculator app', windowsTarget: 'calc.exe' },
  { id: 'code', label: 'VS Code', description: 'Visual Studio Code IDE', windowsTarget: 'code' },
  { id: 'chrome', label: 'Google Chrome', description: 'Google Chrome browser', windowsTarget: 'chrome' },
  { id: 'msedge', label: 'Microsoft Edge', description: 'Microsoft Edge browser', windowsTarget: 'msedge' },
  { id: 'explorer', label: 'File Explorer', description: 'Windows File Explorer', windowsTarget: 'explorer.exe' },
  { id: 'wt', label: 'Windows Terminal', description: 'Modern Windows Terminal', windowsTarget: 'wt.exe' },
  { id: 'mspaint', label: 'Paint', description: 'Windows Paint', windowsTarget: 'mspaint.exe' },
  { id: 'winword', label: 'Microsoft Word', description: 'Microsoft Word desktop app', windowsTarget: 'winword' },
  { id: 'excel', label: 'Microsoft Excel', description: 'Microsoft Excel desktop app', windowsTarget: 'excel' },
  { id: 'spotify', label: 'Spotify', description: 'Spotify music player', windowsTarget: 'spotify' },
  { id: 'settings', label: 'Windows Settings', description: 'Windows 10/11 Settings panel', windowsTarget: 'ms-settings:' },
];

export function generateCompanionToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkCompanionHealth(
  companionUrl: string
): Promise<CompanionHealthStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const cleanUrl = companionUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const data = await parseJsonResponse<{
      ok?: boolean;
      version?: string;
      platform?: string;
      approvedApps?: string[];
    }>(res, `${cleanUrl}/health`);
    return {
      connected: Boolean(data.ok),
      checking: false,
      version: data.version,
      platform: data.platform,
      approvedApps: Array.isArray(data.approvedApps) ? data.approvedApps : undefined,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      connected: false,
      checking: false,
      error:
        err instanceof Error && err.name !== 'AbortError'
          ? err.message
          : 'Local companion is not reachable on this machine.',
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function launchWindowsAppViaCompanion(
  companionUrl: string,
  token: string,
  appId: string
): Promise<{ ok: boolean; message: string }> {
  const cleanUrl = companionUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/launch-app`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appId, confirmedByUser: true }),
  });
  const data = await parseJsonResponse<{ ok?: boolean; message?: string }>(
    res,
    `${cleanUrl}/launch-app`
  );
  return {
    ok: true,
    message: data.message || `Launched ${appId} on Windows.`,
  };
}

export function buildPowerShellCompanionScript(token: string, port = 47821): string {
  return `# IRIS AI — Secure Windows 10/11 Desktop Companion
# Created by Saqib Anwar
# Runs strictly on localhost (127.0.0.1:${port}) with Bearer token verification
# and a fixed application allowlist. Never executes arbitrary shell commands.

param(
    [int]$Port = ${port},
    [string]$Token = "${token}"
)

$ErrorActionPreference = "Stop"

# Strict allowlist of approved Windows applications
$ApprovedApps = @{
    "notepad"  = "notepad.exe"
    "calc"     = "calc.exe"
    "code"     = "code"
    "chrome"   = "chrome"
    "msedge"   = "msedge"
    "explorer" = "explorer.exe"
    "wt"       = "wt.exe"
    "mspaint"  = "mspaint.exe"
    "winword"  = "winword"
    "excel"    = "excel"
    "spotify"  = "spotify"
    "settings" = "ms-settings:"
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  IRIS AI Windows Desktop Companion Active" -ForegroundColor Cyan
Write-Host "  Listening on: $prefix" -ForegroundColor Gray
Write-Host "  Security: Bearer Token + Strict App Allowlist" -ForegroundColor Gray
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host "=================================================" -ForegroundColor Cyan

function Send-JsonResponse($response, [int]$statusCode, $payload) {
    $response.StatusCode = $statusCode
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $response.ContentType = "application/json; charset=utf-8"
    $json = ($payload | ConvertTo-Json -Compress)
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.Close()
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        if ($request.HttpMethod -eq "OPTIONS") {
            Send-JsonResponse $response 200 @{ ok = $true }
            continue
        }

        $path = $request.Url.AbsolutePath.TrimEnd("/")
        if ($path -eq "/health" -and $request.HttpMethod -eq "GET") {
            Send-JsonResponse $response 200 @{
                ok = $true
                version = "1.0.0"
                platform = [System.Environment]::OSVersion.VersionString
                approvedApps = @($ApprovedApps.Keys)
            }
            continue
        }

        $authHeader = $request.Headers["Authorization"]
        if ($authHeader -ne "Bearer $Token") {
            Send-JsonResponse $response 401 @{ error = "Unauthorized: Invalid companion token." }
            continue
        }

        if ($path -eq "/launch-app" -and $request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
            $bodyText = $reader.ReadToEnd()
            $reader.Close()
            $body = $bodyText | ConvertFrom-Json

            if (-not $body.confirmedByUser) {
                Send-JsonResponse $response 403 @{ error = "Explicit user confirmation required." }
                continue
            }

            $appId = [string]$body.appId
            if (-not $ApprovedApps.ContainsKey($appId)) {
                Send-JsonResponse $response 400 @{ error = "Application '$appId' is not in the approved allowlist." }
                continue
            }

            $target = $ApprovedApps[$appId]
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Launching approved app: $appId ($target)" -ForegroundColor Green
            Start-Process -FilePath $target
            Send-JsonResponse $response 200 @{ ok = $true; message = "Launched $appId on Windows." }
            continue
        }

        Send-JsonResponse $response 404 @{ error = "Endpoint not found." }
    }
}
finally {
    $listener.Stop()
}
`;
}

export function buildBatchLauncherScript(): string {
  return `@echo off
title IRIS AI Windows Desktop Companion
echo Starting IRIS AI Windows Desktop Companion...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iris-companion.ps1"
pause
`;
}
