// Keeps what the user sees clean: no stack traces, raw provider errors, broken
// Markdown or half-finished code blocks, whatever the model or network returns.

export const FRIENDLY_FALLBACK =
  'Sorry, I could not put together a proper answer just now. Please try again in a moment.';

const TRACE_LINE = /^\s*(?:at\s+[\w$.<>]+\(.*\)|Caused by:|Traceback \(most recent call last\)|File ".*", line \d+|(?:java|javax|org|com|io)\.[\w.]+(?:Exception|Error)\b.*)\s*$/;
const RAW_ERROR_JSON = /^\s*[\[{][\s\S]*"(?:error|errors|status|statusCode|code|stackTrace|trace)"\s*:[\s\S]*[\]}]\s*$/i;
const RAW_ERROR_TEXT = /^\s*(?:error:?\s*)?(?:\[object Object\]|undefined|null|NaN|TypeError:.*|ReferenceError:.*|SyntaxError:.*|Failed to fetch|NetworkError.*|Unexpected token.*|HTTP\/?\d?\.?\d?\s*\d{3}.*|\d{3}\s+(?:Bad Gateway|Service Unavailable|Gateway Timeout|Internal Server Error).*)\s*$/i;

/** Closes an unfinished ``` code block so it never swallows the rest of the page. */
const closeOpenFence = (text: string): string => {
  const fences = text.match(/^[ \t]*```/gm);
  if (fences && fences.length % 2 === 1) return `${text.replace(/\s+$/, '')}\n\`\`\``;
  return text;
};

/** Removes hidden reasoning tags and leaked internal markers. */
const stripInternals = (text: string): string =>
  text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/\[object Object\]/g, '')
    .replace(/\u0000/g, '');

/**
 * @param streaming true while the answer is still arriving (do not replace a
 *                  short partial answer with the fallback message).
 */
export const sanitizeAssistantText = (input: unknown, streaming = false): string => {
  if (typeof input !== 'string') return '';
  let text = stripInternals(input);
  const trimmed = text.trim();
  if (!trimmed) return '';

  // The whole message is a raw error / payload: never show it as an answer.
  if (!streaming && (RAW_ERROR_JSON.test(trimmed) || RAW_ERROR_TEXT.test(trimmed))) {
    return FRIENDLY_FALLBACK;
  }

  // Drop stack-trace lines that are outside code blocks.
  let inFence = false;
  text = text
    .split('\n')
    .filter(line => {
      if (/^[ \t]*```/.test(line)) inFence = !inFence;
      return inFence || !TRACE_LINE.test(line);
    })
    .join('\n');

  return closeOpenFence(text).replace(/\n{3,}/g, '\n\n').trimEnd();
};

/** Friendly wording for any failed request. Never includes codes or internals. */
export const friendlyErrorMessage = (error: any, online = true): string => {
  const status = Number(error?.status);
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (!online || error instanceof TypeError || message.includes('failed to fetch') || message.includes('network')) {
    return 'Connection problem. Please check your internet connection and try again.';
  }
  if (status === 400) return 'I could not process that request. Please check your message or attachment and try again.';
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'I could not find what you asked for.';
  if (status === 413) return 'That file is too large. Please choose a smaller one.';
  if (status === 415) return 'That file type is not supported.';
  if (status === 422) return 'I could not read the content you sent. Please try another file.';
  if (status === 429) return 'Twinkle is busy right now. Please wait a few seconds and try again.';
  if (status >= 500 || message.includes('starting up')) return 'Twinkle is temporarily unavailable. Please try again in a moment.';
  return 'Something went wrong. Please try again.';
};
