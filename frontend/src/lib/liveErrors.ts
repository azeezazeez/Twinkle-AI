export type LiveFailureKind =
  | 'quota'
  | 'auth'
  | 'unavailable'
  | 'network'
  | 'timeout'
  | 'unsupported'
  | 'unknown';

export interface LiveFailure {
  kind: LiveFailureKind;
  /** Plain-language text that is safe to show to the user. */
  message: string;
  /** False when trying again immediately cannot succeed. */
  retryable: boolean;
}

const QUOTA_MESSAGE =
  'Live Talk has reached its usage limit for now, so voice conversations are paused. ' +
  'This is a limit on our side, not a problem with your device or microphone. ' +
  'Please try again a little later, or keep chatting by typing in the meantime.';

const AUTH_MESSAGE =
  'Live Talk is not available right now because of a service configuration problem on our side. ' +
  'Please try again later. If it keeps happening, contact support.';

const UNAVAILABLE_MESSAGE =
  'The voice service is busy or temporarily unavailable. Please wait a moment and try again.';

const NETWORK_MESSAGE =
  'Live Talk could not connect. Check your internet connection and try again.';

const TIMEOUT_MESSAGE =
  'Live Talk took too long to start. Check your connection and try again.';

const UNSUPPORTED_MESSAGE =
  'Live Talk does not support this request right now. Please try again, or pick a different voice or language in settings.';

const UNKNOWN_MESSAGE =
  'Something went wrong with Live Talk. Please try again.';

const make = (kind: LiveFailureKind, message: string, retryable: boolean): LiveFailure => ({
  kind,
  message,
  retryable,
});

/** Classifies free text from Gemini or from our backend. */
export function classifyLiveText(raw: string | null | undefined): LiveFailure | null {
  const text = String(raw ?? '').toLowerCase();
  if (!text.trim()) return null;

  if (
    /quota|billing|resource[_ ]?exhausted|exceeded your|rate[ -]?limit|too many requests|usage limit|\b429\b/.test(text)
  ) {
    return make('quota', QUOTA_MESSAGE, false);
  }
  if (
    /api key|api_key|permission[_ ]?denied|unauthori[sz]ed|forbidden|not configured|invalid authentication|credential|\b40[13]\b|ephemeral|auth_token|token (has )?expired|expired token/.test(text)
  ) {
    return make('auth', AUTH_MESSAGE, false);
  }
  if (
    /unavailable|overloaded|try again later|internal error|deadline|temporar|\b50[0-4]\b|high demand/.test(text)
  ) {
    return make('unavailable', UNAVAILABLE_MESSAGE, true);
  }
  if (/timed out|timeout|took too long/.test(text)) {
    return make('timeout', TIMEOUT_MESSAGE, true);
  }
  if (
    /language|not supported|unsupported|invalid argument|invalid json|unknown name|model .*not found|not found/.test(text)
  ) {
    return make('unsupported', UNSUPPORTED_MESSAGE, true);
  }
  return null;
}

/** Classifies a WebSocket close event (code + optional reason). */
export function describeLiveClose(
  code: number,
  reason: string | null | undefined,
  opened: boolean,
): LiveFailure {
  // The text is the most reliable signal: Gemini uses 1011 for both real
  // internal errors AND quota errors, so the code alone is not enough.
  const byText = classifyLiveText(reason);
  if (byText) return byText;

  switch (code) {
    case 1008: // policy violation: invalid/expired token, permission, region
      return make('auth', AUTH_MESSAGE, false);
    case 1007: // invalid payload / unsupported setup option
      return make('unsupported', UNSUPPORTED_MESSAGE, true);
    case 1013: // try again later
      return make('unavailable', UNAVAILABLE_MESSAGE, true);
    case 1011: // server error (could be quota if the reason was cut off)
      return make('unavailable', UNAVAILABLE_MESSAGE, true);
    case 4000: // our own setup timeout
      return make('timeout', TIMEOUT_MESSAGE, true);
    case 1006: // abnormal closure, no close frame
    case 1001:
    case 1005:
      return make('network', NETWORK_MESSAGE, true);
    default:
      return opened
        ? make('unknown', UNKNOWN_MESSAGE, true)
        : make('network', NETWORK_MESSAGE, true);
  }
}

/** Makes any thrown error / server message readable. */
export function friendlyLiveError(raw: unknown, fallback = UNKNOWN_MESSAGE): string {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : '';
  return classifyLiveText(text)?.message ?? (isReadable(text) ? text : fallback);
}

// Keep our own short, already-friendly messages; drop anything that looks
// like a stack trace, JSON, a status dump or a truncated URL.
function isReadable(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 220) return false;
  if (/[{}[\]]|https?:\/\/|\bat\s+\S+:\d+|exception|undefined|null/i.test(value)) return false;
  return true;
}

/** Message for a failed /api/live/token request. */
export function describeTokenFailure(status: number, serverMessage: string): LiveFailure {
  if (status === 401) {
    return make('auth', 'Your session has expired. Please sign in again to use Live Talk.', false);
  }
  if (status === 429) return make('quota', QUOTA_MESSAGE, false);
  const byText = classifyLiveText(serverMessage);
  if (byText) return byText;
  if (status === 403 || status === 503) return make('auth', AUTH_MESSAGE, false);
  if (status >= 500) return make('unavailable', UNAVAILABLE_MESSAGE, true);
  return make('unknown', isReadable(serverMessage) ? serverMessage : UNKNOWN_MESSAGE, true);
}
