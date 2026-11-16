import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Content, FunctionDeclaration, GenerateContentResponse, Part } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-3.1-flash-lite';
const SEARCH_MODEL_NAME = 'gemini-4-hydrogen';

const APPROVED_WINDOWS_APPS: Record<string, { label: string; description: string }> = {
  notepad: { label: 'Notepad', description: 'Windows text editor' },
  calc: { label: 'Calculator', description: 'Windows Calculator' },
  code: { label: 'VS Code', description: 'Visual Studio Code' },
  chrome: { label: 'Google Chrome', description: 'Google Chrome browser' },
  msedge: { label: 'Microsoft Edge', description: 'Microsoft Edge browser' },
  explorer: { label: 'File Explorer', description: 'Windows File Explorer' },
  wt: { label: 'Windows Terminal', description: 'Windows Terminal' },
  mspaint: { label: 'Paint', description: 'Windows Paint' },
  winword: { label: 'Microsoft Word', description: 'Microsoft Word' },
  excel: { label: 'Microsoft Excel', description: 'Microsoft Excel' },
  spotify: { label: 'Spotify', description: 'Spotify Desktop' },
  settings: { label: 'Windows Settings', description: 'Windows System Settings' },
};

const irisToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_current_datetime',
    description: 'Get the user local date, time, weekday, and timezone.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: 'Optional brief reason for checking date/time.',
        },
      },
    },
  },
  {
    name: 'list_reminders',
    description: 'List the user current reminders and tasks.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        includeCompleted: {
          type: Type.BOOLEAN,
          description: 'Whether to include completed reminders.',
        },
      },
    },
  },
  {
    name: 'create_reminder',
    description: 'Create a reminder for the user with a title, due date/time ISO string, and optional notes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Short clear title of the reminder.',
        },
        dueAt: {
          type: Type.STRING,
          description: 'ISO 8601 date-time string or clear time description for when the reminder is due.',
        },
        notes: {
          type: Type.STRING,
          description: 'Optional additional notes for the reminder.',
        },
      },
      required: ['title', 'dueAt'],
    },
  },
  {
    name: 'open_website',
    description: 'Propose opening an HTTPS website in the user default browser. Requires explicit user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: 'Full https:// URL to open.',
        },
        siteName: {
          type: Type.STRING,
          description: 'Human-readable name of the website.',
        },
      },
      required: ['url', 'siteName'],
    },
  },
  {
    name: 'open_windows_app',
    description:
      'Propose launching an approved Windows 10/11 application via the local IRIS Windows Companion. Only approved app IDs are allowed: notepad, calc, code, chrome, msedge, explorer, wt, mspaint, winword, excel, spotify, settings.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appId: {
          type: Type.STRING,
          description:
            'Approved Windows app ID: notepad, calc, code, chrome, msedge, explorer, wt, mspaint, winword, excel, spotify, or settings.',
        },
      },
      required: ['appId'],
    },
  },
  {
    name: 'read_aloud',
    description: 'Propose reading a specific passage or text aloud using IRIS female voice synthesis.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Short label for the passage to read aloud.',
        },
        textToRead: {
          type: Type.STRING,
          description: 'Exact text to read aloud.',
        },
      },
      required: ['title', 'textToRead'],
    },
  },
];

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getHttpStatus(err: unknown): number {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    return Number((err as { status?: number }).status) || 0;
  }
  return 0;
}

function isQuotaOrRateLimitError(err: unknown): boolean {
  if (getHttpStatus(err) === 429) return true;
  const msg = err instanceof Error ? err.message : String(err || '');
  return /429|RESOURCE_EXHAUSTED|quota|rate[-_\s]?limit/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const status = getHttpStatus(err);
      const isRetryable = isQuotaOrRateLimitError(err) || status === 503 || status === 500;
      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }
      const baseDelayMs = 800 * Math.pow(2, attempt - 1);
      const jitterMs = Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitterMs));
    }
  }
  throw lastErr;
}

function shouldEnableWebSearch(text: string): boolean {
  return /\b(search|web|latest|news|today|weather|price|stock|score|current|live|update|who won|release|2025|2026|internet|find online|google)\b/i.test(
    text
  );
}

async function generateIrisTurn(
  ai: GoogleGenAI,
  contents: Content[],
  systemInstruction: string,
  enableSearch: boolean
): Promise<{ response: GenerateContentResponse; modelUsed: string }> {
  if (enableSearch) {
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: SEARCH_MODEL_NAME,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            tools: [{ googleSearch: {} }, { functionDeclarations: irisToolDeclarations }],
            toolConfig: { includeServerSideToolInvocations: true },
          },
        })
      );
      return { response, modelUsed: SEARCH_MODEL_NAME };
    } catch (err: unknown) {
      if (getHttpStatus(err) !== 429) {
        throw err;
      }
      // Fall back to free-tier Flash Lite without search grounding if 429
    }
  }

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: MODEL_NAME,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: irisToolDeclarations }],
        },
      })
    );
    return { response, modelUsed: MODEL_NAME };
  } catch (err: unknown) {
    if (getHttpStatus(err) === 429 && !enableSearch) {
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: SEARCH_MODEL_NAME,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            tools: [{ functionDeclarations: irisToolDeclarations }],
          },
        })
      );
      return { response, modelUsed: SEARCH_MODEL_NAME };
    }
    throw err;
  }
}

function tryOfflineDesktopFallback(
  message: string,
  reminders: ReminderInput[],
  companionConnected: boolean,
  clientTimeContext?: { iso?: string; formatted?: string; timeZone?: string }
): {
  text: string;
  pendingActions: PendingActionOut[];
} | null {
  const lower = message.toLowerCase().trim();

  if (/\b(time|date|day|tarikh|waqt|kitne baje)\b/i.test(lower)) {
    const formatted = clientTimeContext?.formatted || new Date().toLocaleString();
    const tz = clientTimeContext?.timeZone || 'local time';
    return {
      text: `It is currently **${formatted}** (${tz}).`,
      pendingActions: [],
    };
  }

  if (/\b(list|show|my)\s+reminders?\b/i.test(lower)) {
    const active = reminders.filter((r) => !r.completed);
    if (active.length === 0) {
      return {
        text: 'You have no active reminders right now.',
        pendingActions: [],
      };
    }
    const listText = active
      .map((r, i) => `${i + 1}. **${r.title}** (${r.dueAt})`)
      .join('\n');
    return {
      text: `Here are your active reminders:\n\n${listText}`,
      pendingActions: [],
    };
  }

  const appAliasMap: Array<[RegExp, string]> = [
    [/\bnotepad\b/i, 'notepad'],
    [/\bcalc(?:ulator)?\b/i, 'calc'],
    [/\b(?:vs\s*code|vscode|visual studio code)\b/i, 'code'],
    [/\bchrome\b/i, 'chrome'],
    [/\bedge\b/i, 'msedge'],
    [/\b(?:file\s*)?explorer\b/i, 'explorer'],
    [/\b(?:windows\s*)?terminal\b/i, 'wt'],
    [/\bpaint\b/i, 'mspaint'],
    [/\b(?:ms\s*)?word\b/i, 'winword'],
    [/\b(?:ms\s*)?excel\b/i, 'excel'],
    [/\bspotify\b/i, 'spotify'],
    [/\b(?:windows\s*)?settings\b/i, 'settings'],
  ];

  if (/\b(open|launch|start|run|kholo)\b/i.test(lower)) {
    for (const [pattern, appId] of appAliasMap) {
      if (pattern.test(lower)) {
        const meta = APPROVED_WINDOWS_APPS[appId];
        return {
          text: `I have prepared the confirmation card below to launch **${meta.label}**.`,
          pendingActions: [
            {
              id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              type: 'open_windows_app',
              title: `Launch ${meta.label}`,
              description: companionConnected
                ? 'Explicit confirmation required before sending launch request to your Windows Desktop Companion.'
                : 'Requires the IRIS Windows Desktop Companion running locally on Windows 10/11.',
              appId,
              appLabel: meta.label,
              status: 'pending',
            },
          ],
        };
      }
    }

    const urlMatch = message.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      return {
        text: `I have prepared a confirmation link below to open that website in your browser.`,
        pendingActions: [
          {
            id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: 'open_website',
            title: 'Open Website',
            description: `Requires your click confirmation to open ${urlMatch[0]} in a new browser tab.`,
            url: urlMatch[0],
            status: 'pending',
          },
        ],
      };
    }
  }

  return null;
}

function buildSystemInstruction(language: string, companionConnected: boolean, clientTimeContext?: {
  iso?: string;
  formatted?: string;
  timeZone?: string;
}) {
  const langGuide =
    language === 'hi'
      ? 'Respond primarily in natural, polite Hindi (Devanagari or clean Hinglish when technical terms help).'
      : language === 'ur'
        ? 'Respond primarily in natural, polite Urdu (Nastaliq/Urdu script) with clear technical terms.'
        : language === 'en'
          ? 'Respond in clear, polite, confident English.'
          : 'Match the user language automatically across English, Hindi, Urdu, and Hinglish naturally.';

  return [
    'You are IRIS, a friendly, intelligent, polite, and confident female personal desktop assistant created by Saqib Anwar.',
    'Always refer to yourself as IRIS when addressing the user.',
    langGuide,
    'Capabilities: general conversation, live web research (use Google Search grounding for current news, weather, prices, scores, or facts), study tutoring, coding help, math and science explanations, writing and translation (English, Hindi, Urdu, Hinglish), summarization, creative ideation, and daily productivity.',
    `Current user local time context: ${clientTimeContext?.formatted || 'Unknown'} (Timezone: ${clientTimeContext?.timeZone || 'Local'}, ISO: ${clientTimeContext?.iso || ''}).`,
    `Windows Desktop Companion status: ${companionConnected ? 'CONNECTED on this Windows 10/11 PC' : 'NOT CONNECTED (browser-only mode)'}.`,
    'Security & Honesty Rules:',
    '1. Never claim you executed a Windows application launch or opened a website yourself. When you call open_windows_app, open_website, or read_aloud, tell the user clearly that you have prepared a confirmation card for their approval.',
    '2. If Windows Companion is NOT CONNECTED and the user asks to launch a Windows app, still prepare the confirmation card if it is in the approved list, and politely note that the IRIS Windows Companion must be running locally on Windows to launch desktop apps.',
    '3. Never suggest or attempt arbitrary shell commands or unapproved system modifications.',
    '4. Format responses cleanly with Markdown where helpful (headings, bullet points, fenced code blocks).',
  ].join('\n');
}

interface IncomingMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface ReminderInput {
  id: string;
  title: string;
  dueAt: string;
  notes?: string;
  completed: boolean;
}

interface PendingActionOut {
  id: string;
  type: 'open_windows_app' | 'open_website' | 'read_aloud' | 'create_reminder';
  title: string;
  description: string;
  appId?: string;
  appLabel?: string;
  url?: string;
  textToRead?: string;
  reminderTitle?: string;
  reminderDueAt?: string;
  reminderNotes?: string;
  status: 'pending' | 'executed' | 'error';
  resultMessage?: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const geminiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
    res.json({
      ok: true,
      geminiConfigured,
      model: MODEL_NAME,
      checkedAt: new Date().toISOString(),
      error: geminiConfigured
        ? undefined
        : 'GEMINI_API_KEY is not configured in environment secrets.',
    });
  });

  const inFlightChatRequests = new Map<string, Promise<Record<string, unknown>>>();
  const recentResponseCache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();

  app.post('/api/chat', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        errorCode: 'AUTH_ERROR',
        error:
          'GEMINI_API_KEY is missing. Please add your free Gemini API key in Settings > Secrets (or .env for local runs) and try again.',
      });
      return;
    }

    try {
      const {
        message,
        history = [],
        language = 'auto',
        reminders = [],
        companionConnected = false,
        clientTimeContext,
      } = req.body as {
        message?: string;
        history?: IncomingMessage[];
        language?: string;
        reminders?: ReminderInput[];
        companionConnected?: boolean;
        clientTimeContext?: { iso?: string; formatted?: string; timeZone?: string };
      };

      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const trimmedMessage = message.trim();

      // Reduce unnecessary Gemini API calls for simple local time/date or reminder queries
      const isSimpleLocalQuery =
        /^(what('?s| is)? (the )?(current )?(time|date|day)|what (time|date|day) is it|aaj kya (date|tarikh|waqt|time) hai|kitne baje hain|(list|show) my reminders?)[?.! ]*$/i.test(
          trimmedMessage
        );
      if (isSimpleLocalQuery) {
        const localReply = tryOfflineDesktopFallback(
          trimmedMessage,
          reminders,
          companionConnected,
          clientTimeContext
        );
        if (localReply) {
          res.json({
            text: localReply.text,
            sources: [],
            pendingActions: localReply.pendingActions,
            createdReminders: [],
            model: 'iris-local',
          });
          return;
        }
      }

      // Limit conversation history sent to Gemini (max last 6 turns, 1000 chars each)
      const cappedHistory = history
        .filter((item) => item.text && item.text.trim().length > 0)
        .slice(-6)
        .map((item) => ({
          role: item.role,
          text: item.text.trim().slice(0, 1000),
        }));

      const requestKey = JSON.stringify({
        m: trimmedMessage.toLowerCase(),
        l: language,
        c: companionConnected,
        h: cappedHistory.slice(-2).map((h) => h.text),
      });

      const cached = recentResponseCache.get(requestKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.payload);
        return;
      }

      const existingPromise = inFlightChatRequests.get(requestKey);
      if (existingPromise) {
        const payload = await existingPromise;
        res.json(payload);
        return;
      }

      const executeGeminiFlow = async (): Promise<Record<string, unknown>> => {
        const recentHistory: Content[] = cappedHistory.map((item) => ({
          role: item.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: item.text }],
        }));

        const contents: Content[] = [
          ...recentHistory,
          { role: 'user', parts: [{ text: trimmedMessage }] },
        ];

        const systemInstruction = buildSystemInstruction(
          language,
          companionConnected,
          clientTimeContext
        );
        const enableSearch = shouldEnableWebSearch(trimmedMessage);

        let { response, modelUsed } = await generateIrisTurn(
          ai,
          contents,
          systemInstruction,
          enableSearch
        );

      const pendingActions: PendingActionOut[] = [];
      const createdReminders: Array<{ title: string; dueAt: string; notes?: string }> = [];

      // Up to 2 tool resolution turns
      let turnContents = [...contents];
      for (let step = 0; step < 2; step++) {
        const previousContent = response.candidates?.[0]?.content;
        const functionCalls = response.functionCalls;
        if (!previousContent || !functionCalls || functionCalls.length === 0) {
          break;
        }

        const responseParts: Part[] = [];

        for (const call of functionCalls) {
          const args = (call.args || {}) as Record<string, unknown>;
          let toolResult: Record<string, unknown> = {};

          if (call.name === 'get_current_datetime') {
            toolResult = {
              formatted: clientTimeContext?.formatted || new Date().toLocaleString(),
              iso: clientTimeContext?.iso || new Date().toISOString(),
              timeZone: clientTimeContext?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            };
          } else if (call.name === 'list_reminders') {
            const includeCompleted = Boolean(args.includeCompleted);
            const filtered = includeCompleted
              ? reminders
              : reminders.filter((r) => !r.completed);
            toolResult = {
              count: filtered.length,
              reminders: filtered,
            };
          } else if (call.name === 'create_reminder') {
            const title = String(args.title || 'Untitled Reminder').trim();
            const dueAt = String(args.dueAt || new Date(Date.now() + 3600000).toISOString()).trim();
            const notes = args.notes ? String(args.notes).trim() : undefined;
            createdReminders.push({ title, dueAt, notes });
            pendingActions.push({
              id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              type: 'create_reminder',
              title: `Reminder saved: ${title}`,
              description: `Scheduled for ${dueAt}${notes ? ` · ${notes}` : ''}`,
              reminderTitle: title,
              reminderDueAt: dueAt,
              reminderNotes: notes,
              status: 'executed',
              resultMessage: 'Added to your IRIS Reminders list.',
            });
            toolResult = { status: 'created', title, dueAt, notes };
          } else if (call.name === 'open_website') {
            const rawUrl = String(args.url || '').trim();
            const siteName = String(args.siteName || 'Website').trim();
            let validUrl = '';
            try {
              const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
              if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                validUrl = parsed.toString();
              }
            } catch {
              validUrl = '';
            }

            if (validUrl) {
              pendingActions.push({
                id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                type: 'open_website',
                title: `Open ${siteName}`,
                description: `Requires your click confirmation to open ${validUrl} in a new browser tab.`,
                url: validUrl,
                status: 'pending',
              });
              toolResult = {
                status: 'awaiting_user_confirmation',
                url: validUrl,
                siteName,
              };
            } else {
              toolResult = { status: 'rejected', reason: 'Invalid or unsupported URL protocol.' };
            }
          } else if (call.name === 'open_windows_app') {
            const appId = String(args.appId || '').toLowerCase().trim();
            const appMeta = APPROVED_WINDOWS_APPS[appId];
            if (appMeta) {
              pendingActions.push({
                id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                type: 'open_windows_app',
                title: `Launch ${appMeta.label}`,
                description: companionConnected
                  ? `Explicit confirmation required before sending launch request to your Windows Desktop Companion.`
                  : `Requires the IRIS Windows Desktop Companion running locally on Windows 10/11.`,
                appId,
                appLabel: appMeta.label,
                status: 'pending',
              });
              toolResult = {
                status: 'awaiting_user_confirmation',
                appId,
                appLabel: appMeta.label,
                companionConnected,
              };
            } else {
              toolResult = {
                status: 'rejected',
                reason: `Application '${appId}' is not on the approved Windows security allowlist.`,
                approvedApps: Object.keys(APPROVED_WINDOWS_APPS),
              };
            }
          } else if (call.name === 'read_aloud') {
            const title = String(args.title || 'Read Aloud').trim();
            const textToRead = String(args.textToRead || '').trim();
            if (textToRead) {
              pendingActions.push({
                id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                type: 'read_aloud',
                title: `Read Aloud: ${title}`,
                description: 'Click Approve & Speak to play this passage using IRIS voice synthesis.',
                textToRead,
                status: 'pending',
              });
              toolResult = { status: 'awaiting_user_confirmation', title };
            } else {
              toolResult = { status: 'error', reason: 'No text provided.' };
            }
          } else {
            toolResult = { status: 'unsupported_tool' };
          }

          responseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: toolResult,
            },
          });
        }

        turnContents = [
          ...turnContents,
          previousContent,
          { role: 'user', parts: responseParts },
        ];

        const nextTurn = await generateIrisTurn(
          ai,
          turnContents,
          systemInstruction,
          enableSearch
        );
        response = nextTurn.response;
        modelUsed = nextTurn.modelUsed;
      }

        const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const seenUrls = new Set<string>();
        const sources: Array<{ title: string; url: string }> = [];
        for (const chunk of rawChunks) {
          const web = (chunk as { web?: { uri?: string; title?: string } }).web;
          if (web?.uri && !seenUrls.has(web.uri)) {
            seenUrls.add(web.uri);
            sources.push({
              title: web.title || web.uri,
              url: web.uri,
            });
          }
        }

        const text =
          response.text?.trim() ||
          (pendingActions.length > 0
            ? 'I have prepared that action below for your confirmation.'
            : 'I could not generate a response right now. Please try again.');

        return {
          text,
          sources,
          pendingActions,
          createdReminders,
          model: modelUsed,
        };
      };

      const flowPromise = executeGeminiFlow();
      inFlightChatRequests.set(requestKey, flowPromise);

      try {
        const payload = await flowPromise;
        // Cache identical query briefly (15s) to prevent duplicate accidental re-calls
        recentResponseCache.set(requestKey, {
          expiresAt: Date.now() + 15000,
          payload,
        });
        if (recentResponseCache.size > 30) {
          const firstKey = recentResponseCache.keys().next().value;
          if (firstKey) recentResponseCache.delete(firstKey);
        }
        res.json(payload);
      } finally {
        inFlightChatRequests.delete(requestKey);
      }
    } catch (err: unknown) {
      let rawMessage =
        err instanceof Error ? err.message : 'Unexpected error communicating with Gemini API.';
      try {
        const parsed = JSON.parse(rawMessage);
        if (parsed?.error?.message) {
          rawMessage = parsed.error.message;
        }
      } catch {
        // rawMessage is already plain text
      }

      const isQuotaErr = isQuotaOrRateLimitError(err);
      const status = isQuotaErr ? 429 : getHttpStatus(err) || 500;

      if (isQuotaErr) {
        const offline = tryOfflineDesktopFallback(
          String(req.body?.message || ''),
          Array.isArray(req.body?.reminders) ? req.body.reminders : [],
          Boolean(req.body?.companionConnected),
          req.body?.clientTimeContext
        );
        if (offline) {
          res.json({
            text: offline.text,
            sources: [],
            pendingActions: offline.pendingActions,
            createdReminders: [],
            model: 'iris-local-fallback',
          });
          return;
        }
      }

      if (status === 429 || status === 400 || status === 401 || status === 403 || status === 404) {
        console.warn(`IRIS /api/chat notice (${status}): ${rawMessage}`);
      } else {
        console.error('IRIS /api/chat error:', err);
      }

      const errorCode =
        status === 429
          ? 'QUOTA_EXHAUSTED'
          : status === 401 || status === 403
            ? 'AUTH_ERROR'
            : status === 404
              ? 'NOT_FOUND'
              : 'SERVER_ERROR';

      const friendlyMessage =
        status === 429
          ? 'IRIS has temporarily reached the free Gemini API rate or quota limit. Please wait a moment and click Retry below once quota becomes available.'
          : status === 401
            ? 'Gemini API authentication failed (401). Please verify GEMINI_API_KEY in Settings > Secrets.'
            : status === 403
              ? 'Gemini API access denied (403). Please verify your GEMINI_API_KEY permissions in Settings > Secrets.'
              : status === 404
                ? `Gemini model or endpoint not found (404): ${rawMessage}`
                : status === 400
                  ? `Invalid request (400): ${rawMessage}`
                  : `Server error (${status}): ${rawMessage}`;

      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: friendlyMessage,
        errorCode,
        retryable: status === 429 || status >= 500,
      });
    }
  });

  // Catch-all for unknown /api/* routes so they NEVER fall through to SPA HTML
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.originalUrl}`,
      errorCode: 'NOT_FOUND',
      retryable: false,
    });
  });

  // JSON error middleware for malformed request bodies or middleware exceptions
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (!req.path.startsWith('/api')) {
        next(err);
        return;
      }
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: number }).status) || 500
          : 500;
      const message =
        err instanceof SyntaxError
          ? 'Malformed JSON request body.'
          : err instanceof Error
            ? err.message
            : 'Internal API error.';
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: message,
        errorCode: status === 404 ? 'NOT_FOUND' : status === 401 || status === 403 ? 'AUTH_ERROR' : 'SERVER_ERROR',
        retryable: status >= 500,
      });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IRIS AI server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start IRIS AI server:', err);
  process.exit(1);
});
