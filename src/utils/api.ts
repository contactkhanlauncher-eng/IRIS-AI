import type { ChatMessage } from '../types/iris';

export type ApiErrorCode = NonNullable<ChatMessage['errorCode']>;

export class ApiClientError extends Error {
  status: number;
  errorCode: ApiErrorCode;

  constructor(message: string, status: number, errorCode: ApiErrorCode) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

function mapStatusToErrorCode(status: number, serverCode?: string): ApiErrorCode {
  if (
    serverCode === 'QUOTA_EXHAUSTED' ||
    serverCode === 'RATE_LIMITED' ||
    serverCode === 'AUTH_ERROR' ||
    serverCode === 'NOT_FOUND' ||
    serverCode === 'SERVER_ERROR' ||
    serverCode === 'NETWORK_ERROR'
  ) {
    return serverCode;
  }
  if (status === 429) return 'QUOTA_EXHAUSTED';
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER_ERROR';
  return 'NETWORK_ERROR';
}

function formatStatusFallbackMessage(status: number, endpoint: string): string {
  switch (status) {
    case 401:
      return `Authentication failed (401) for ${endpoint}. Please verify your API credentials.`;
    case 403:
      return `Access denied (403) for ${endpoint}. Please verify GEMINI_API_KEY permissions in Settings > Secrets.`;
    case 404:
      return `API endpoint or model not found (404) at ${endpoint}. Ensure the IRIS Express backend is running.`;
    case 429:
      return 'Free Gemini API rate or quota limit reached (429). Please wait a moment and click Retry.';
    default:
      return status >= 500
        ? `Server error (${status}) from ${endpoint}. Please try again shortly.`
        : `Request to ${endpoint} failed with HTTP ${status}.`;
  }
}

/**
 * Safely parses a fetch Response after validating Content-Type and HTTP status.
 * Never attempts to parse HTML (e.g., "<!doctype html>...") as JSON.
 */
export async function parseJsonResponse<T>(
  res: Response,
  endpoint: string
): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trimStart();

  const looksLikeHtml =
    contentType.includes('text/html') ||
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML');

  if (looksLikeHtml) {
    const code = mapStatusToErrorCode(res.status || 502);
    const statusLabel = res.status ? `HTTP ${res.status}` : 'HTML response';
    throw new ApiClientError(
      `Received an HTML page (${statusLabel}) instead of JSON from ${endpoint}. Make sure the IRIS backend server is running and serving /api routes.`,
      res.status || 502,
      code
    );
  }

  let parsed: unknown = null;
  if (trimmed.length > 0) {
    if (!contentType.includes('application/json') && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      throw new ApiClientError(
        `Unexpected non-JSON response (${contentType || 'unknown type'}) from ${endpoint}.`,
        res.status || 500,
        mapStatusToErrorCode(res.status || 500)
      );
    }
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new ApiClientError(
        `Invalid JSON payload received from ${endpoint} (HTTP ${res.status}).`,
        res.status || 500,
        mapStatusToErrorCode(res.status || 500)
      );
    }
  }

  if (!res.ok) {
    const errObj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const serverMsg =
      typeof errObj.error === 'string' && errObj.error.trim().length > 0
        ? errObj.error
        : formatStatusFallbackMessage(res.status, endpoint);
    const serverCode = typeof errObj.errorCode === 'string' ? errObj.errorCode : undefined;
    throw new ApiClientError(
      serverMsg,
      res.status,
      mapStatusToErrorCode(res.status, serverCode)
    );
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new ApiClientError(
      `Empty JSON response received from ${endpoint}.`,
      res.status || 500,
      'SERVER_ERROR'
    );
  }

  return parsed as T;
}
