import { describeTokenFailure } from './liveErrors';

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || '/api'
).replace(/\/$/, '');
 
export type LiveApiVersion = 'v1beta';
export const LIVE_API_VERSION: LiveApiVersion = 'v1beta';

export const buildLiveSocketUrl = (
  token: string,
  _apiVersion: LiveApiVersion = LIVE_API_VERSION
): string =>
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${LIVE_API_VERSION}.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;

const CHAT_RETRIES = 1;
const RETRY_DELAY_MS = 450;

const MAX_SINGLE_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024; 
const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024;


const ASSISTANT_NAME_KEY = 'twinkle_assistant_name';
const ASSISTANT_NAME_RESET = /\b(?:reset|forget|remove|clear)\s+(?:your|the)\s+(?:custom\s+)?(?:name|nickname)\b|\b(?:call|name)\s+(?:yourself|you)\s+(?:twinkle(?:\s+ai)?)\s+again\b/i;
const ASSISTANT_NAME_PATTERN = /(?:\byour\s+name\s+(?:is|will\s+be|shall\s+be)|\bcall\s+yourself|\bchange\s+your\s+name\s+to|\brename\s+yourself\s+(?:to|as)|\bfrom\s+now\s+on,?\s+you(?:'re|\u2019re|\s+are)\s+(?:called|named)?|\b(?:i(?:'ll|\u2019ll|\s+will|\s+want\s+to|\s+wanna|'d\s+like\s+to|\s+would\s+like\s+to)?|let\s+me|(?:can|could|may)\s+i)\s+call\s+you|\bi\s+want\s+you\s+to\s+be\s+called|\byou(?:'re|\u2019re|\s+are)\s+now\s+(?:called|named)|\byou\s+will\s+be\s+called|\bgo\s+by)\s+["\u201c']?([A-Za-z][A-Za-z0-9'\u2019\- ]{0,29}?)["\u201d']?(?=\s*[.!,;]|\s*\?|\s+(?:from|and|ok|okay|please|now|instead|always|forever|ok)\b|\s*$)/i;
const ASSISTANT_NAME_STOPWORDS = /^(?:a|an|the|it|that|this|what|who|not|called|named|ai|assistant|bot|chatbot|me|you|your|my|something|anything|different|another|else)$/i;
// A "name" that starts like a phrase ("with my desired name", "by another name") is not a name.
const ASSISTANT_NAME_PHRASE_START = /^(?:with|by|to|as|in|for|on|at|my|your|our|any|some|another|different|other|whatever|whichever|a|an|the)\b/i;

export const getAssistantName = (): string => {
  try { return (localStorage.getItem(ASSISTANT_NAME_KEY) || '').trim(); } catch { return ''; }
};
const clearAssistantName = () => {
  try { localStorage.removeItem(ASSISTANT_NAME_KEY); } catch { /* storage blocked */ }
};

export const learnAssistantName = (message: string) => {
  const text = (message || '').trim();
  if (!text || text.length > 300) return;
  if (ASSISTANT_NAME_RESET.test(text)) { clearAssistantName(); return; }
  const match = ASSISTANT_NAME_PATTERN.exec(text);
  if (!match) return;
  // A plain question ("is your name Nova?") is not a request to rename.
  if (/\?\s*$/.test(text) && !/\b(?:can|could|may)\s+i\s+call\s+you\b/i.test(text)) return;
  const name = match[1].trim().replace(/\s+/g, ' ');
  if (!name || name.length > 30 || ASSISTANT_NAME_STOPWORDS.test(name) || ASSISTANT_NAME_PHRASE_START.test(name)) return;
  if (/^twinkle(?:\s+ai)?$/i.test(name)) { clearAssistantName(); return; }
  try { localStorage.setItem(ASSISTANT_NAME_KEY, name); } catch { /* storage blocked */ }
};

/**
 * Voice fallback. Speech transcripts are noisy, so the user's own sentence may
 * not match the naming patterns even though the assistant understood and
 * accepted the new name ("Got it, you can call me Lisa."). When the user was
 * clearly talking about the assistant's name, learn the name from the reply.
 */
export const learnAssistantNameFromReply = (userText: string, assistantText: string) => {
  const user = (userText || '').trim();
  const reply = (assistantText || '').trim();
  if (!user || !reply) return;
  if (!/\bcall\s+(?:you|yourself)\b|\byour\s+name\b|\bname\s+you\b|\bbe\s+called\b/i.test(user)) return;
  const accepted = /\b(?:you\s+can\s+call\s+me|call\s+me|i(?:'|’)ll\s+(?:go|answer)\s+(?:by|to)|i(?:'|’)m\s+now|my\s+name\s+is\s+now)\s+["“']?([A-Za-z][A-Za-z0-9'’\-]{1,29})/i.exec(reply);
  if (!accepted) return;
  const name = accepted[1].trim();
  if (!name || ASSISTANT_NAME_STOPWORDS.test(name) || ASSISTANT_NAME_PHRASE_START.test(name)) return;
  if (/^twinkle$/i.test(name)) return;
  try { localStorage.setItem(ASSISTANT_NAME_KEY, name); } catch { /* storage blocked */ }
};

/** Rules that make the assistant accept a user-chosen name in any conversation. */
export const ASSISTANT_NAME_RULES =
  'NAMING: The user is allowed to give you a new name or nickname at any time ' +
  '(for example "can I call you Lisa?", "your name is Nova", "I will call you Max"). ' +
  'Always accept it warmly and immediately, answer to it from then on, and never refuse, ' +
  'deflect, or say you prefer a different name. If the user asks to rename you but does not say the ' +
  'name yet, ask what name they would like. If they ask you to go back to your original name, ' +
  'you are Twinkle AI again.';

export const assistantNameContext = (): string => {
  const name = getAssistantName();
  if (!name) return '';
  return `ASSISTANT NAME SET BY THE USER: The user has chosen to call you "${name}". Use "${name}" as your own name from now on: when you introduce yourself or are asked your name, say you are ${name}. If the user has just asked you to take this name, accept it briefly and warmly (for example: "Got it, you can call me ${name}."). Do not call yourself Twinkle AI unless the user asks about the product.`;
};

const getAppLanguageCode = (): string => {
  try { return localStorage.getItem('twinkle_app_language') || 'auto'; } catch { return 'auto'; }
};

/* The latest live-weather lookup, so the chat can show a weather card. */
export interface WeatherSnapshot {
  label: string;
  at: number;
  current: Record<string, number>;
  daily: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
}
let pendingWeatherSnapshot: WeatherSnapshot | null = null;
export const takeWeatherSnapshot = (): WeatherSnapshot | null => {
  const snapshot = pendingWeatherSnapshot;
  pendingWeatherSnapshot = null;
  return snapshot;
};

const getLiveContext = async (message: string): Promise<string | undefined> => {
  learnAssistantName(message);
  const persona = assistantNameContext();
  const live = await getVerifiedLiveContext(message);
  return [persona, live].filter(Boolean).join('\n\n') || undefined;
};

const getVerifiedLiveContext = async (message: string): Promise<string | undefined> => {
  const query = (message || '').toLowerCase();
  const asksTime = /\b(time|date|today|current day|what day|timezone|time zone|right now)\b/.test(query);
  const asksWeather = /\b(weather|temperature|forecast|rain|raining|rainy|umbrella|wind speed|windy|humidity|humid|sunny|cloudy|storm|snowing|sunrise|sunset|how (?:hot|cold|warm)|(?:hot|cold|warm|cool) (?:outside|today|now))\b/.test(query);
  const asksLocation = /\b(my location|current location|where am i|where do i live|near me|nearby|nearest|closest|my coordinates|location here|which village|which mandal|which district)\b/.test(query);
  if (!asksTime && !asksWeather && !asksLocation) return undefined;

  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const lines = [
    'CLIENT-VERIFIED LIVE CONTEXT (use only for this answer; do not claim data not present below):',
    `Current local date/time: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(now)}`,
    `User's browser-local timezone (authoritative for this answer): ${timezone}`,
    `Current UTC timestamp (reference only): ${now.toISOString()}`,
    'Answer date/time questions using the browser-local date and time above, not the server timezone. Give the date and time naturally; do not mention a timezone unless useful or asked.'
  ];
  if (asksWeather || asksLocation) {
    let coordinates: { latitude: number; longitude: number; label: string } | null = null;
    // Prefer an explicitly named place (for example, "weather in Chennai") over the browser's location.
    if (asksWeather) {
      const placeMatch = (message || '').match(/\b(?:weather|forecast|temperature|rain|raining|rainy|umbrella|humidity|hot|cold|warm)\b.*?\b(?:in|for|at)\s+([A-Za-z][A-Za-z .'-]{1,45}?)(?=\s+(?:today|tomorrow|now|this week|currently)\b|[?!.,]|$)/i);
      const place = placeMatch?.[1]?.trim();
      if (place && !/^(here|my location|near me|the area)$/i.test(place)) {
        try {
          const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(8000) });
          if (geoResponse.ok) {
            const geo = await geoResponse.json();
            const result = geo?.results?.[0];
            if (result && Number.isFinite(result.latitude) && Number.isFinite(result.longitude)) {
              coordinates = { latitude: result.latitude, longitude: result.longitude, label: [result.name, result.admin1, result.country].filter(Boolean).join(', ') };
            }
          }
        } catch { /* Fall back to permission-based current location below. */ }
      }
    }
    if (!coordinates) {
      if (!navigator.geolocation) {
        lines.push('Location: browser geolocation is not supported; do not guess the user location.');
      } else {
        const position = await new Promise<GeolocationPosition | null>((resolve) => {
          try {
            navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
          } catch { resolve(null); }
        });
        if (position) {
          coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude, label: 'permission-approved current browser location' };
          // Reverse-geocode the user's approved coordinates into a useful locality hierarchy.
          try {
            const reverseResponse = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(position.coords.latitude)}&lon=${encodeURIComponent(position.coords.longitude)}&zoom=18&addressdetails=1`,
              { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) }
            );
            if (reverseResponse.ok) {
              const reverse = await reverseResponse.json();
              const address = reverse?.address || {};
              const localityParts = [
                address.village || address.hamlet || address.suburb || address.neighbourhood || address.town || address.city,
                address.municipality || address.county || address.city_district,
                address.state_district || address.district,
                address.state || address.region,
                address.country
              ].filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
              if (localityParts.length) coordinates.label = localityParts.join(', ');
              const mandal = address.mandal || address.tehsil || address.subdistrict || address.county;
              if (mandal && !localityParts.includes(mandal)) coordinates.label = [localityParts[0], mandal, ...localityParts.slice(1)].filter(Boolean).join(', ');
            }
          } catch { /* Keep coordinates private from the answer unless the reverse lookup succeeds. */ }
        } else {
          lines.push('Location: unavailable because permission was denied or location could not be determined. Do not guess the user location.');
        }
      }
    }
    if (coordinates) {
      lines.push(`Readable current location (from browser-permitted geolocation and reverse geocoding): ${coordinates.label}.`);
      lines.push('For location answers, state the available locality hierarchy in ordinary words (village/locality, mandal or subdistrict if available, district, state, country). Do not display latitude/longitude unless the user explicitly asks for coordinates. Reverse-geocoding providers may not expose every administrative level; never invent a missing village or mandal.');
      if (asksWeather) {
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(coordinates.latitude)}&longitude=${encodeURIComponent(coordinates.longitude)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=${encodeURIComponent(timezone)}&forecast_days=3`;
          const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!response.ok) throw new Error(`weather provider returned ${response.status}`);
          const weather = await response.json();
          lines.push('Live weather data from Open-Meteo (metric units): ' + JSON.stringify({ current: weather.current, daily: weather.daily, timezone: weather.timezone }));
          lines.push('Weather code reference: https://open-meteo.com/en/docs');
          if (weather?.current) {
            pendingWeatherSnapshot = {
              label: /permission-approved/.test(coordinates.label) ? 'Your location' : coordinates.label,
              at: Date.now(),
              current: weather.current,
              daily: weather.daily || {},
            };
          }
        } catch {
          lines.push('Live weather: retrieval failed. Clearly say live weather could not be retrieved; do not invent current conditions.');
        }
      }
    }
  }
  return lines.join('\n');
};

const WAKE_ATTEMPTS = 1;
const WAKE_DELAY_MS = 1_000;

type ApiError = Error & {
  data?: unknown;
  email?: string;
  status?: number;
};

export interface ProcessedFile {
  id: string;
  name: string;
  type: 'image' | 'text';
  content: string;
  mimeType: string;
  size: number;
  preview?: string;
}

/* =========================================================
   FILE MIME HELPERS
   ========================================================= */

const getMimeTypeFromFilename = (
  filename: string
): string => {
  const name = filename.toLowerCase();

  const map: Record<string, string> = {
    '.pdf': 'application/pdf',

    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.rtf': 'application/rtf',

    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    '.odt':
      'application/vnd.oasis.opendocument.text',
    '.ods':
      'application/vnd.oasis.opendocument.spreadsheet',
    '.odp':
      'application/vnd.oasis.opendocument.presentation',

    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
  };

  for (const [extension, mime] of Object.entries(map)) {
    if (name.endsWith(extension)) {
      return mime;
    }
  }

  return 'application/octet-stream';
};

const normalizeFile = (file: File): File => {
  const detectedMime =
    file.type &&
    file.type !== 'application/octet-stream'
      ? file.type
      : getMimeTypeFromFilename(file.name);

  if (file.type !== detectedMime) {
    return new File(
      [file],
      file.name,
      {
        type: detectedMime,
        lastModified: file.lastModified,
      }
    );
  }

  return file;
};

/* =========================================================
   ABORTABLE DELAY
   ========================================================= */

const signalAwareDelay = (
  ms: number,
  signal?: AbortSignal | null
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new DOMException(
          'Aborted',
          'AbortError'
        )
      );
      return;
    }

    const timer = setTimeout(
      resolve,
      ms
    );

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);

        reject(
          new DOMException(
            'Aborted',
            'AbortError'
          )
        );
      },
      { once: true }
    );
  });

/* =========================================================
   RENDER SERVER WAKE-UP
   ========================================================= */

export async function wakeUpServer(): Promise<void> {
  for (
    let attempt = 1;
    attempt <= WAKE_ATTEMPTS;
    attempt++
  ) {
    try {
      const response = await fetch(
        `${API_BASE}/chat/status`,
        {
          method: 'GET',

          /*
           * IMPORTANT:
           * Always include the session cookie.
           */
          credentials: 'include',

          signal: AbortSignal.timeout(
            8_000
          ),

          cache: 'no-store',
        }
      );

      /*
       * Any response other than Render's typical
       * temporary unavailable states means the
       * server is reachable.
       */
      if (
        response.status !== 503 &&
        response.status !== 502
      ) {
        return;
      }
    } catch {
      // Render may still be starting.
    }

    if (attempt < WAKE_ATTEMPTS) {
      await signalAwareDelay(
        WAKE_DELAY_MS
      );
    }
  }
}

/* =========================================================
   HEADER NORMALIZATION
   ========================================================= */

function normalizeHeaders(
  init?: HeadersInit
): Record<string, string> {
  const result: Record<
    string,
    string
  > = {};

  if (!init) {
    return result;
  }

  if (init instanceof Headers) {
    init.forEach(
      (value, key) => {
        result[key] = value;
      }
    );

    return result;
  }

  if (Array.isArray(init)) {
    for (const [key, value] of init) {
      result[key] = value;
    }

    return result;
  }

  Object.assign(result, init);

  return result;
}

/* =========================================================
   FORM DATA CLONING
   ========================================================= */

const cloneFormData = (
  source: FormData
): FormData => {
  const copy = new FormData();

  source.forEach(
    (value, key) => {
      if (typeof value === 'string') {
        copy.append(
          key,
          value
        );
      } else {
        copy.append(
          key,
          value,
          value.name ||
            'uploaded-file'
        );
      }
    }
  );

  return copy;
};

/* =========================================================
   FETCH RETRY ENGINE
   ========================================================= */

const attemptFetch = async (
  url: string,
  options: RequestInit,
  headers: Record<string, string>,
  retries: number
): Promise<Response> => {
  const signal =
    options.signal as
      | AbortSignal
      | null
      | undefined;

  /*
   * IMPORTANT:
   *
   * For every FormData retry we create
   * a completely new FormData body.
   */
  const requestBody =
    options.body instanceof FormData
      ? cloneFormData(
          options.body
        )
      : options.body;

  try {
    const response =
      await fetch(
        url,
        {
          ...options,

          body: requestBody,

          /*
           * CRITICAL FOR LOGIN/OAUTH SESSION:
           *
           * The browser must send the Spring Boot
           * session cookie with API requests.
           */
          credentials:
            'include',

          headers,

          cache:
            'no-store',
        }
      );

    /*
     * Retry Render cold-start errors.
     */
    if (
      (
        response.status === 503 ||
        response.status === 502
      ) &&
      retries > 0
    ) {
      await signalAwareDelay(
        RETRY_DELAY_MS,
        signal
      );

      return attemptFetch(
        url,
        options,
        headers,
        retries - 1
      );
    }

    return response;

  } catch (error: any) {

    if (
      error?.name === 'AbortError' ||
      error?.name === 'TimeoutError'
    ) {
      throw error;
    }

    if (retries > 0) {
      await signalAwareDelay(
        RETRY_DELAY_MS,
        signal
      );

      return attemptFetch(
        url,
        options,
        headers,
        retries - 1
      );
    }

    throw error;
  }
};

/* =========================================================
   AUTHENTICATED FETCH
   ========================================================= */

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retries = 1
): Promise<unknown> {

  const isFormData =
    options.body instanceof FormData;

  const method = (
    options.method ||
    'GET'
  ).toUpperCase();

  const headers =
    normalizeHeaders(
      options.headers
    );

  /*
   * =======================================================
   * CORS / PREFLIGHT FIX
   * =======================================================
   *
   * DO NOT add application/json to GET requests.
   *
   * GET requests such as:
   *
   *   /api/auth/status
   *   /api/auth/me
   *
   * do not need Content-Type.
   *
   * Adding Content-Type to GET can unnecessarily
   * trigger a browser preflight request.
   */

  if (isFormData) {

    /*
     * NEVER manually set multipart Content-Type.
     *
     * The browser automatically generates:
     *
     * multipart/form-data;
     * boundary=-------------------------
     */

    delete headers[
      'Content-Type'
    ];

    delete headers[
      'content-type'
    ];

  } else {

    const hasBody =
      options.body !==
        undefined &&
      options.body !==
        null;

    if (
      hasBody &&
      method !== 'GET' &&
      method !== 'HEAD'
    ) {
      if (
        !headers[
          'Content-Type'
        ] &&
        !headers[
          'content-type'
        ]
      ) {
        headers[
          'Content-Type'
        ] =
          'application/json';
      }
    }
  }

  let response: Response;

  try {

    response =
      await attemptFetch(
        url,
        options,
        headers,
        retries
      );

  } catch (error: any) {

    if (
      error?.name === 'AbortError' ||
      error?.name === 'TimeoutError'
    ) {
      throw error;
    }

    throw new Error(
      'Server is starting up, please wait a moment and try again.'
    );
  }

  /* =======================================================
     RESPONSE PARSING
     ======================================================= */

  let data:
    Record<
      string,
      unknown
    > = {};

  const contentType =
    response.headers.get(
      'content-type'
    ) || '';

  if (
    contentType.includes(
      'application/json'
    )
  ) {

    data =
      await response
        .json()
        .catch(
          () => ({})
        );

  } else {

    const text =
      await response
        .text()
        .catch(
          () => ''
        );

    data = {
      message:
        text ||
        'Invalid server response',
    };
  }

  /* =======================================================
     ERROR HANDLING
     ======================================================= */

  if (!response.ok) {

    const serverMessage =
      typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : '';

    const status = response.status;

    const friendlyMessages: Record<number, string> = {
      400:
        'The request could not be processed. Please check your input and try again.',

      401:
        'Your session has expired. Please log in again.',

      403:
        'You do not have permission to perform this action.',

      404:
        'The requested resource could not be found.',

      408:
        'The request timed out. Please try again.',

      413:
        'The uploaded file or request is too large.',

      415:
        'This file type is not supported.',

      409:
        'That username is already taken. Please choose another username.',

      422:
        'The submitted information could not be processed.',

      429:
        'The AI service is currently busy. Please wait a few seconds and try again.',

      500:
        'Something went wrong on the server. Please try again shortly.',

      502:
        'The service is temporarily unavailable. Please try again shortly.',

      503:
        'The server is temporarily unavailable. Please try again shortly.',

      504:
        'The server took too long to respond. Please try again.',
    };

    const error = new Error(
      serverMessage ||
        friendlyMessages[status] ||
        `Request failed with status ${status}`
    ) as ApiError;

    error.data = data;

    error.email =
      typeof data.email === 'string'
        ? data.email
        : undefined;

    error.status = status;

    throw error;
  }

  return data;
}

/* =========================================================
   AUTH API
   ========================================================= */

export const authApi = {

  /* =======================================================
     REQUEST OTP — UNIFIED LOGIN / SIGNUP
     ======================================================= */

  requestOtp: (
    email: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/auth/request-otp`,
      {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      }
    ),

  /* =======================================================
     NORMAL LOGIN
     ======================================================= */

  login: (
    data: unknown
  ) =>
    fetchWithAuth(
      `${API_BASE}/auth/login`,
      {
        method: 'POST',

        body:
          JSON.stringify(
            data
          ),
      }
    ),

  /* =======================================================
     SIGNUP
     ======================================================= */

  signup: (
    data: unknown
  ) =>
    fetchWithAuth(
      `${API_BASE}/auth/signup`,
      {
        method: 'POST',

        body:
          JSON.stringify(
            data
          ),
      }
    ),

  /* =======================================================
     OTP VERIFICATION
     ======================================================= */

  verifyOtp: (
    email: string,
    otpCode: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/auth/verify-otp`,
      {
        method: 'POST',

        body:
          JSON.stringify({
            email,
            otpCode,
          }),
      }
    ),

  /* =======================================================
     RESEND OTP
     ======================================================= */

  resendOtp: (
    email: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/auth/resend-otp`,
      {
        method: 'POST',

        body:
          JSON.stringify({
            email:
              email.trim(),
          }),
      }
    ),

  /* =======================================================
     FORGOT PASSWORD
     ======================================================= */

  forgotPassword: (
    email: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/auth/forgot-password`,
      {
        method: 'POST',

        body:
          JSON.stringify({
            email,
          }),
      }
    ),

  /* =======================================================
     RESET PASSWORD
     ======================================================= */

  resetPassword: (
    email: string,
    otpCode: string,
    newPassword: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/auth/reset-password`,
      {
        method: 'POST',

        body:
          JSON.stringify({
            email,
            otpCode,
            newPassword,
          }),
      }
    ),

  /* =======================================================
     LOGOUT
     ======================================================= */

  logout: () => {
    clearAssistantName();
    return fetchWithAuth(
      `${API_BASE}/auth/logout`,
      {
        method: 'POST',
      }
    );
  },

  /* =======================================================
     LOG OUT OF ALL DEVICES
     ======================================================= */

  logoutAll: () => {
    clearAssistantName();
    return fetchWithAuth(
      `${API_BASE}/auth/logout-all`,
      {
        method: 'POST',
      }
    );
  },

  /* =======================================================
     DELETE ACCOUNT (permanent)
     ======================================================= */

  deleteAccount: () =>
    fetchWithAuth(
      `${API_BASE}/auth/account`,
      {
        method: 'DELETE',
      }
    ),

  /* =======================================================
     UPDATE PROFILE
     ======================================================= */

  updateProfile: (
    data: {
      username?: string;
      name?: string;
    }
  ) =>
    fetchWithAuth(
      `${API_BASE}/auth/profile`,
      {
        method: 'PATCH',

        body:
          JSON.stringify(
            data
          ),
      }
    ),

  /* =======================================================
     PROFILE STATS
     ======================================================= */

  getProfileStats: () =>
    fetchWithAuth(
      `${API_BASE}/auth/profile/stats`
    ),

  /* =======================================================
     GOOGLE OAUTH
     ======================================================= */

  /*
   * Google is the ONLY OAuth provider.
   *
   * The browser is intentionally redirected directly
   * to the Spring Boot OAuth endpoint.
   *
   * Flow:
   *
   * React
   *   ↓
   * /api/auth/oauth/google
   *   ↓
   * Google
   *   ↓
   * /api/auth/oauth/google/callback
   *   ↓
   * Spring session created
   *   ↓
   * Frontend
   */

  startGoogleOAuth: () => {
    window.location.assign(
      `${API_BASE}/auth/oauth/google`
    );
  },

  /* =======================================================
     AUTH STATUS
     ======================================================= */

  /*
   * GET request:
   * no Content-Type header is added.
   *
   * credentials: include is handled by
   * fetchWithAuth().
   */

  getStatus: () =>
    fetchWithAuth(
      `${API_BASE}/auth/status`
    ),

  /* =======================================================
     CURRENT USER
     ======================================================= */

  /*
   * This endpoint is especially important after
   * Google OAuth.
   *
   * The frontend should call this after returning
   * from Google's authentication flow so that the
   * React auth state is populated from the Spring
   * session.
   */

  getProfile: () =>
    fetchWithAuth(
      `${API_BASE}/auth/me`
    ),
};

/* =========================================================
   CHAT API
   ========================================================= */

export const chatApi = {

  /* =======================================================
     CHAT SESSIONS
     ======================================================= */

  getSessions: () =>
    fetchWithAuth(
      `${API_BASE}/chat/sessions`
    ),

  /**
   * Resolve a conversation from its persistent public UUID.
   * The backend must enforce authentication and conversation ownership.
   */
  getSessionByPublicId: (publicId: string) => {
    const normalizedPublicId = publicId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedPublicId)) {
      return Promise.reject(new Error('Invalid chat ID.'));
    }
    return fetchWithAuth(
      `${API_BASE}/chat/by-public-id/${encodeURIComponent(normalizedPublicId)}`
    );
  },

  /* =======================================================
     CHAT HISTORY
     ======================================================= */

  getMessages: (
    sessionId: number,
    options: { includeAttachments?: boolean } = {}
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/history/${sessionId}${
        options.includeAttachments === false ? '?includeAttachments=false' : ''
      }`
    ),

  /** Original, un-re-encoded attachments of a chat, keyed by message id. */
  getMessageAttachments: (
    sessionId: number
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/history/${sessionId}/attachments`
    ),

  /* =======================================================
     CREATE SESSION
     ======================================================= */

  createSession: () =>
    fetchWithAuth(
      `${API_BASE}/chat/new-session`,
      {
        method: 'POST',
      }
    ),

  /* =======================================================
     LIVE TALK TURN PERSISTENCE
     ======================================================= */
  saveLiveTurn: (
    sessionId: number | null,
    userTranscript: string,
    assistantTranscript: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/live/turn`,
      {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          userTranscript,
          assistantTranscript,
        }),
      }
    ),

  /* =======================================================
     DELETE SESSION
     ======================================================= */

  deleteSession: (
    sessionId: number
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/session/${sessionId}`,
      {
        method: 'DELETE',
      }
    ),

  /* =======================================================
     RENAME SESSION
     ======================================================= */

  renameSession: (
    sessionId: number,
    name: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/rename`,
      {
        method: 'PATCH',

        body:
          JSON.stringify({
            sessionId,
            name,
          }),
      }
    ),

  /* =======================================================
     GENERATE CHAT TITLE
     ======================================================= */

  generateTitle: (
    firstMessage: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/generate-title`,
      {
        method: 'POST',

        body:
          JSON.stringify({
            firstMessage,
          }),
      }
    ),

  /* =======================================================
     CLEAR ALL SESSIONS
     ======================================================= */

  clearSessions: () =>
    fetchWithAuth(
      `${API_BASE}/chat/sessions`,
      {
        method: 'DELETE',
      }
    ),

  /* =======================================================
     NORMAL TEXT CHAT
     ======================================================= */

  sendMessage: async (
    message: string,
    sessionId: number | null,
    signal?: AbortSignal,
    model?: string
  ) => {
    const liveContext = await getLiveContext(message);
    return fetchWithAuth(
      `${API_BASE}/chat/send`,
      { method: 'POST', signal, body: JSON.stringify({ message, sessionId, model, liveContext, language: getAppLanguageCode() }) },
      CHAT_RETRIES
    );
  },

  /* =======================================================
     STREAMING TEXT CHAT
     ======================================================= */

  streamMessage: async (
    message: string,
    sessionId: number | null,
    signal: AbortSignal | undefined,
    model: string | undefined,
    handlers: {
      onStatus?: (status: string, metadata?: Record<string, any>) => void;
      onSession?: (sessionInfo: { sessionId?: number | string; publicId?: string }) => void;
      onDelta?: (text: string) => void;
    } = {}
  ): Promise<any> => {
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    };

    // Gather live context once so a retry never asks for location again.
    const requestBody = JSON.stringify({
      message,
      sessionId,
      model,
      language: getAppLanguageCode(),
      liveContext: await getLiveContext(message),
    });

    const wait = (ms: number) => new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });

    // One quiet automatic retry for connection drops and busy-server replies
    // (502/503/504), before any text has been streamed.
    let response!: Response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(`${API_BASE}/chat/send/stream`, {
          method: 'POST',
          credentials: 'include',
          headers,
          signal,
          body: requestBody,
        });
      } catch (error) {
        if (
          (error as any)?.name === 'AbortError' ||
          (error as any)?.name === 'TimeoutError'
        ) throw error;
        if (attempt === 0) {
          await wait(1200);
          continue;
        }
        throw new Error('Server is starting up, please wait a moment and try again.');
      }
      if (attempt === 0 && [502, 503, 504].includes(response.status)) {
        try { await response.body?.cancel(); } catch { /* ignore */ }
        await wait(1500);
        continue;
      }
      break;
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await response.json().catch(() => ({}));
      } else {
        const text = await response.text().catch(() => '');
        data = { error: text };
      }
      const error = new Error(
        typeof data?.error === 'string' && data.error.trim()
          ? data.error
          : `Request failed with status ${response.status}`
      ) as ApiError;
      error.status = response.status;
      error.data = data;
      throw error;
    }

    if (!response.body) {
      throw new Error('The server did not provide a streaming response.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData: any = {};
    let streamedResponse = '';
    let doneEventSeen = false;

    const handleEvent = (rawEvent: string) => {
      const lines = rawEvent.split(/\r?\n/);
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }

      if (!dataLines.length) return;
      const rawData = dataLines.join('\n');
      let data: any;
      try {
        data = JSON.parse(rawData);
      } catch {
        // Never surface unparseable payloads as chat text: only plain-text
        // deltas are accepted; anything that looks like serialized data or
        // a partial JSON/object payload is dropped.
        if (eventName === 'delta' && !/^\s*[\[{]|^\[object /.test(rawData)) {
          data = { text: rawData };
        } else {
          return;
        }
      }
      if (data === null || typeof data !== 'object') {
        data = eventName === 'delta' && typeof data === 'string' ? { text: data } : {};
      }

      // Backends/proxies can omit the SSE event name and send a completion
      // marker in the JSON payload instead. Treat every supported completion
      // shape as terminal so the composer never remains in a loading state.
      const payloadDone =
        data === '[DONE]' ||
        data?.done === true ||
        data?.complete === true ||
        data?.finished === true ||
        data?.status === 'done' ||
        data?.status === 'completed' ||
        (eventName === 'message' && typeof data?.response === 'string');

      if (eventName === 'status' && payloadDone) {
        finalData = data || {};
        if (typeof finalData.response !== 'string' && streamedResponse) {
          finalData = { ...finalData, response: streamedResponse };
        }
        doneEventSeen = true;
      } else if (eventName === 'status') {
        handlers.onStatus?.(typeof data?.status === 'string' ? data.status : 'thinking', data);
        if (data?.sessionId || data?.publicId) {
          handlers.onSession?.({ sessionId: data.sessionId, publicId: data.publicId });
        }
      } else if (eventName === 'delta') {
        if (payloadDone) {
          finalData = data || {};
          if (typeof finalData.response !== 'string' && streamedResponse) {
            finalData = { ...finalData, response: streamedResponse };
          }
          doneEventSeen = true;
          return;
        }
        const text = typeof data?.text === 'string' ? data.text : '';
        if (text) {
          streamedResponse += text;
          handlers.onDelta?.(text);
        }
      } else if (eventName === 'done' || payloadDone) {
        // `done` is authoritative. Do not wait for the HTTP connection to
        // close after the server has declared generation complete.
        finalData = data || {};
        if (typeof finalData.response !== 'string' && streamedResponse) {
          finalData = { ...finalData, response: streamedResponse };
        }
        doneEventSeen = true;
      } else if (eventName === 'error') {
        const error = new Error(
          typeof data?.error === 'string' && data.error.trim()
            ? data.error
            : 'Unable to generate a response.'
        ) as ApiError;
        throw error;
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        // SSE allows LF or CRLF line endings. Match either blank-line
        // separator so streams from different servers/proxies are parsed.
        let boundaryMatch = /\r?\n\r?\n/.exec(buffer);
        while (boundaryMatch) {
          const boundaryIndex = boundaryMatch.index;
          const event = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + boundaryMatch[0].length);
          handleEvent(event);
          boundaryMatch = /\r?\n\r?\n/.exec(buffer);
          if (doneEventSeen) break;
        }

        if (doneEventSeen || done) break;
      }

      if (!doneEventSeen && buffer.trim()) handleEvent(buffer);
    } finally {
      if (doneEventSeen) {
        try { await reader.cancel(); } catch {}
      }
      reader.releaseLock();
    }

    // Some proxies close a valid SSE stream without delivering the final
    // `done` event. The deltas are still a complete response, so return them
    // as the final response instead of leaving the composer in a loading state.
    if (typeof finalData.response !== 'string' && streamedResponse) {
      finalData = { ...finalData, response: streamedResponse };
    }

    return finalData;
  },

  /* =======================================================
     MULTIPART FILE CHAT
     ======================================================= */

  sendMessageWithFiles: async (
    message: string,
    sessionId: number | null,
    signal: AbortSignal,
    model: string,
    files: File[]
  ): Promise<unknown> => {

    const validFiles = Array.isArray(files)
      ? files.filter((file): file is File => file instanceof File && file.size > 0)
      : [];

    if (validFiles.length === 0) {
      throw new Error('Please select at least one non-empty file.');
    }

    let totalBytes = 0;
    let totalImageBytes = 0;
    let imageCount = 0;

    for (const file of validFiles) {
      if (file.size > MAX_SINGLE_FILE_BYTES) {
        const error = new Error(
          `Maximum individual file size is 15 MB: ${file.name}`
        ) as ApiError;
        error.status = 413;
        throw error;
      }

      totalBytes += file.size;

      if (file.type.startsWith('image/')) {
        imageCount += 1;
        totalImageBytes += file.size;
      }
    }

    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      const error = new Error(
        'The total uploaded file size cannot exceed 25 MB per message.'
      ) as ApiError;
      error.status = 413;
      throw error;
    }

    if (imageCount > MAX_IMAGES_PER_MESSAGE) {
      const error = new Error(
        `You can attach a maximum of ${MAX_IMAGES_PER_MESSAGE} images per message.`
      ) as ApiError;
      error.status = 400;
      throw error;
    }

    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
      const error = new Error(
        'The total image size cannot exceed 15 MB per message.'
      ) as ApiError;
      error.status = 413;
      throw error;
    }

    const formData =
      new FormData();

    /* =====================================================
       TEXT FIELDS
       ===================================================== */

    formData.append(
      'message',
      message ?? ''
    );

    if (
      sessionId !== null &&
      sessionId !== undefined
    ) {
      formData.append(
        'sessionId',
        String(sessionId)
      );
    }

    formData.append(
      'model',
      model
    );

    const liveContext = await getLiveContext(message);
    if (liveContext) formData.append('liveContext', liveContext);
    formData.append('language', getAppLanguageCode());

    /* =====================================================
       FILES
       ===================================================== */

    for (
      const originalFile
      of validFiles
    ) {

      if (
        !(
          originalFile
          instanceof File
        )
      ) {
        continue;
      }

      if (
        originalFile.size <= 0
      ) {
        continue;
      }

      /*
       * Normalize generic or missing
       * browser MIME types.
       */

      const file =
        normalizeFile(
          originalFile
        );

      formData.append(
        'files',
        file,
        file.name
      );
    }

    /* =====================================================
       NEVER SET CONTENT-TYPE MANUALLY
       ===================================================== */

    /*
     * Browser will generate:
     *
     * multipart/form-data;
     * boundary=---------------------------
     */

    return fetchWithAuth(
      `${API_BASE}/chat/send`,
      {
        method: 'POST',

        signal,

        body:
          formData,
      },
      0
    );
  },

  /* =======================================================
     LIVE CONVERSATION SAVE
     ======================================================= */

  saveLiveConversation: (
    userTranscript: string,
    assistantTranscript: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/live-save`,
      {
        method: 'POST',

        body:
          JSON.stringify({
            userTranscript,
            assistantTranscript,
          }),
      }
    ),

  /* =======================================================
     SEARCH CHAT SESSIONS
     ======================================================= */

  searchSessions: (
    query: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/search?q=${encodeURIComponent(
        query
      )}`
    ),

  /* =======================================================
     SHARE SESSION
     ======================================================= */

  shareSession: (
    sessionId: number,
    expiresInDays?: number
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/session/${sessionId}/share${expiresInDays ? `?expiresInDays=${expiresInDays}` : ''}`,
      {
        method: 'POST',
      }
    ),

  importChat: (payload: { title: string; messages: Array<{ role: string; content: string; timestamp?: string }> }) =>
    fetchWithAuth(`${API_BASE}/chat/import`, { method: 'POST', body: JSON.stringify(payload) }),

  listShares: (sessionId: number) =>
    fetchWithAuth(`${API_BASE}/chat/session/${sessionId}/shares`, { method: 'GET' }),

  revokeShare: (sessionId: number, shareId: number) =>
    fetchWithAuth(`${API_BASE}/chat/session/${sessionId}/share/${shareId}`, { method: 'DELETE' }),

  /* =======================================================
     PUBLIC SHARED SESSION
     ======================================================= */

  getSharedSession: (shareToken: string) =>
    fetch(`${API_BASE}/chat/shared/${encodeURIComponent(shareToken)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    }).then(async response => {
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'This shared chat is no longer available.');
      }

      return data;
    }),
};

/* =========================================================
   GEMINI LIVE TOKEN
   ========================================================= */

/**
 * Creates a short-lived Gemini Live API token
 * through the authenticated backend.
 *
 * The Spring Boot session cookie is included.
 */



const decodeLiveWebSocketMessage = async (data: unknown): Promise<any> => {
  if (typeof data === 'string') return JSON.parse(data);

  if (data instanceof Blob) {
    return JSON.parse(await data.text());
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(data)));
  }

  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  throw new Error('Gemini Live API returned an unsupported WebSocket message type.');
};

const previewBase64ToInt16 = (base64: string): Int16Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
};

/**
 * Plays a real Gemini Live native-audio voice sample in the browser.
 * This deliberately does not use window.speechSynthesis, so each Gemini
 * voice preview actually uses the selected Gemini voice.
 */
type CachedLiveToken = {
  token: string;
  model: string;
  apiVersion: LiveApiVersion;
  expiresAt: string;
  newSessionExpiresAt: string;
  usesRemaining: number;
  /** Local clock time the token was received. All lifetimes are measured from it. */
  mintedAtMs: number;
  /** Local clock time after which a NEW Live session may no longer be started with it. */
  usableUntilMs: number;
};

let cachedLiveToken: CachedLiveToken | null = null;
let liveTokenPromise: Promise<CachedLiveToken> | null = null;
let activeVoicePreviewStop: (() => void) | null = null;
let voicePreviewGeneration = 0;

// A cached token must still be valid for at least this long to be handed out.
const LIVE_TOKEN_REUSE_BUFFER_MS = 10_000;
// The keep-warm loop mints a replacement once the cached one is this close to expiry.
const LIVE_TOKEN_WARM_MIN_VALIDITY_MS = 45_000;
const LIVE_TOKEN_REQUEST_TIMEOUT_MS = 10_000;

// Older builds stored the "last working" Live API version in localStorage and
// flipped between v1alpha and v1beta after every failed handshake, which made
// every other attempt fail. The version is fixed now; drop the stale key.
try { localStorage.removeItem('twinkle_live_api_version'); } catch { /* storage unavailable */ }

class LiveTokenError extends Error {
  /** True when retrying cannot help (not signed in, key missing, ...). */
  fatal: boolean;
  constructor(message: string, fatal: boolean) {
    super(message);
    this.name = 'LiveTokenError';
    this.fatal = fatal;
  }
}

const invalidateCachedLiveToken = (token?: string) => {
  if (!cachedLiveToken) return;
  if (!token || cachedLiveToken.token === token) cachedLiveToken = null;
};

/**
 * Call when a Live WebSocket closed before it ever opened (a handshake
 * failure, which browsers report only as code 1006). Drops the cached token
 * (and any token request still in flight) so the retry mints a fresh one.
 * The API version never changes: ephemeral tokens only work on v1beta.
 */
export function reportLiveSocketFailure(_apiVersion?: LiveApiVersion, token?: string): void {
  invalidateCachedLiveToken(token);
  cachedLiveToken = null;
  liveTokenPromise = null;
}

/** Kept for API compatibility; the Live API version is fixed to v1beta. */
export function reportLiveSocketSuccess(_apiVersion?: LiveApiVersion): void {
  /* nothing to remember */
}

const requestLiveToken = async (): Promise<CachedLiveToken> => {
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), LIVE_TOKEN_REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(`${API_BASE}/live/token`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      // Voice and language are deliberately NOT sent here. The ephemeral
      // token leaves speechConfig unlocked so the client can choose any voice.
      body: JSON.stringify({ apiVersion: LIVE_API_VERSION }),
    });
  } catch (error) {
    console.error('Live token network error:', error);
    throw new LiveTokenError(
      controller.signal.aborted
        ? 'The Twinkle AI backend took too long to create a Live Talk session. Please try again.'
        : 'Could not reach the Twinkle AI backend. Check that it is running and reachable.',
      false
    );
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const serverMessage = typeof data?.error === 'string' ? data.error : '';
    const failure = describeTokenFailure(response.status, serverMessage);
    throw new LiveTokenError(failure.message, !failure.retryable);
  }

  if (!data?.token) {
    throw new LiveTokenError('The backend responded successfully but did not return a Gemini Live token.', false);
  }

  // Measure lifetimes on THIS device's clock. Comparing the backend's absolute
  // timestamps with Date.now() breaks whenever the two clocks differ by even
  // a minute, which then hands out already-expired tokens.
  const now = Date.now();
  const toMs = (seconds: unknown, absolute: unknown, fallbackMs: number) => {
    const rel = Number(seconds);
    if (Number.isFinite(rel) && rel > 0) return rel * 1000;
    const abs = Date.parse(String(absolute || ''));
    return Number.isFinite(abs) ? Math.max(0, abs - now) : fallbackMs;
  };
  const lifetimeMs = toMs(data.expiresInSeconds, data.expiresAt, 25 * 60_000);
  const newSessionMs = toMs(data.newSessionExpiresInSeconds, data.newSessionExpiresAt, 50_000);

  return {
    token: String(data.token),
    model: String(data.model || 'gemini-3.8-live'),
    apiVersion: LIVE_API_VERSION,
    expiresAt: String(data.expiresAt || ''),
    newSessionExpiresAt: String(data.newSessionExpiresAt || ''),
    usesRemaining: Math.max(1, Number(data.uses || 10)),
    mintedAtMs: now,
    usableUntilMs: now + Math.min(lifetimeMs, newSessionMs),
  };
};

const isLiveTokenUsable = (token: CachedLiveToken, minValidityMs: number, now = Date.now()) =>
  token.usesRemaining > 0 && token.usableUntilMs - now > minValidityMs;

/** Shares ONE in-flight token request between every caller. */
const fetchFreshLiveToken = (): Promise<CachedLiveToken> => {
  if (!liveTokenPromise) {
    const request: Promise<CachedLiveToken> = requestLiveToken()
      .then(token => {
        // reportLiveSocketFailure() may have dropped this request meanwhile.
        if (liveTokenPromise === request) cachedLiveToken = token;
        return token;
      })
      .finally(() => {
        if (liveTokenPromise === request) liveTokenPromise = null;
      });
    liveTokenPromise = request;
  }
  return liveTokenPromise;
};

/**
 * Makes sure a fresh Live token is already cached, without using one of its
 * uses. Read Aloud, the Mic and Live Talk can then start immediately instead
 * of first waiting for a round trip to the backend (and Google) for a token.
 */
export function warmLiveToken(): void {
  if (cachedLiveToken && isLiveTokenUsable(cachedLiveToken, LIVE_TOKEN_WARM_MIN_VALIDITY_MS)) return;
  if (liveTokenPromise) return;
  fetchFreshLiveToken().catch(() => undefined);
}

/** Keeps a Live token warm while the tab is visible. Returns a cleanup function. */
export function startLiveTokenKeepWarm(): () => void {
  const tick = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    warmLiveToken();
  };
  tick();
  const interval = window.setInterval(tick, 20_000);
  document.addEventListener('visibilitychange', tick);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', tick);
  };
}

export async function createLiveToken(
  _voiceName = 'Charon',
  _language = 'auto',
  forceRefresh = false
): Promise<{
  token: string;
  model: string;
  apiVersion: LiveApiVersion;
  expiresAt: string;
  newSessionExpiresAt?: string;
}> {
  if (forceRefresh) {
    cachedLiveToken = null;
  }

  // At most two passes: use the cache if it is good, otherwise fetch one fresh
  // token (shared with any other caller) and use that.
  for (let pass = 0; pass < 2; pass += 1) {
    const cached = cachedLiveToken;
    if (cached && isLiveTokenUsable(cached, LIVE_TOKEN_REUSE_BUFFER_MS)) {
      // Every Live session gets its own token. Reusing a token that already
      // served (or failed) a session can be refused by Google, which showed up
      // as a failed first connection followed by "Reconnecting".
      cachedLiveToken = null;
      return { ...cached };
    }
    cachedLiveToken = null;
    await fetchFreshLiveToken();
  }

  throw new LiveTokenError('Could not obtain a Live Talk token. Please try again.', false);
}

// Voice samples that already played once are kept in memory, so replaying or
// re-selecting a voice starts instantly without a token, WebSocket or model
// round trip.
const voicePreviewCache = new Map<string, Int16Array[]>();

function playCachedVoicePreview(context: AudioContext, chunks: Int16Array[]): Promise<void> {
  return new Promise<void>(resolve => {
    const sources = new Set<AudioBufferSourceNode>();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sources.forEach(source => { try { source.stop(); } catch {} });
      sources.clear();
      if (activeVoicePreviewStop === finish) activeVoicePreviewStop = null;
      void context.close();
      resolve();
    };
    activeVoicePreviewStop = finish;

    let startAt = context.currentTime + 0.005;
    chunks.forEach((pcm, index) => {
      const buffer = context.createBuffer(1, pcm.length, 24000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 1.12;
      source.connect(context.destination);
      sources.add(source);
      if (index === chunks.length - 1) source.onended = finish;
      source.start(startAt);
      startAt += buffer.duration / 1.12;
    });
  });
}

/** Cancels any voice preview that is currently playing or loading. */
export function stopGeminiVoicePreview(): void {
  voicePreviewGeneration += 1;
  const stop = activeVoicePreviewStop;
  activeVoicePreviewStop = null;
  try {
    stop?.();
  } catch {
    /* already stopped */
  }
}

/** Warms the Live token so the first voice preview starts quickly. */
export async function prefetchGeminiVoice(
  voiceName: string,
  _text?: string,
  language = 'auto'
): Promise<void> {
  // Only warm the cache; do not consume the token that the preview will use.
  warmLiveToken();
}

/**
 * Plays a short Gemini 3.8 Live greeting using the selected model voice.
 * The Live token is reused for multiple previews and the previous preview
 * is cancelled when the user changes voices quickly.
 */
export async function previewGeminiVoice(
  voiceName: string,
  text = `Hello. This is ${voiceName}.`,
  language = 'auto'
): Promise<void> {
  const generation = ++voicePreviewGeneration;
  activeVoicePreviewStop?.();

  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser.');

  const context = new AudioContextCtor();
  await context.resume();

  const cacheKey = `${voiceName}|${language}|${text}`;
  const cachedChunks = voicePreviewCache.get(cacheKey);
  if (cachedChunks?.length) {
    return playCachedVoicePreview(context, cachedChunks);
  }

  const { token, model, apiVersion } = await createLiveToken(voiceName, language);

  // A newer voice selection may have happened while the token request was
  // in flight. Do not open an obsolete Gemini session in that case.
  if (generation !== voicePreviewGeneration) {
    void context.close();
    return;
  }

  const languageNames: Record<string, string> = {
    en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam',
    bn: 'Bengali', mr: 'Marathi', gu: 'Gujarati', pa: 'Punjabi', ur: 'Urdu', ar: 'Arabic',
    es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
    ja: 'Japanese', ko: 'Korean', zh: 'Chinese', tr: 'Turkish', vi: 'Vietnamese', id: 'Indonesian',
    th: 'Thai', fil: 'Filipino',
  };

  const selectedLanguage = language || 'auto';
  const languageInstruction =
    selectedLanguage !== 'auto' && languageNames[selectedLanguage]
      ? ` Respond entirely in ${languageNames[selectedLanguage]}.`
      : '';

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let nextPlayTime = context.currentTime + 0.01;
    let receivedAudio = false;
    let completedTurn = false;
    const collected: Int16Array[] = [];
    const sources = new Set<AudioBufferSourceNode>();
    const socket = new WebSocket(buildLiveSocketUrl(token, apiVersion));
    let opened = false;
    let timeoutId = 0;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      sources.forEach(source => { try { source.stop(); } catch {} });
      sources.clear();
      if (activeVoicePreviewStop === stop) activeVoicePreviewStop = null;
      if (!error && completedTurn && receivedAudio && collected.length) {
        if (voicePreviewCache.size >= 40) {
          const oldest = voicePreviewCache.keys().next().value;
          if (oldest !== undefined) voicePreviewCache.delete(oldest);
        }
        voicePreviewCache.set(cacheKey, collected);
      }
      try { socket.close(1000, 'Voice preview complete'); } catch {}
      void context.close();
      if (error) reject(error); else resolve();
    };

    const stop = () => finish();
    activeVoicePreviewStop = stop;

    timeoutId = window.setTimeout(() => {
      invalidateCachedLiveToken(token);
      finish(new Error(`Voice preview for ${voiceName} timed out while connecting to Gemini Live.`));
    }, 12_000);

    socket.onopen = () => {
      opened = true;
      reportLiveSocketSuccess(apiVersion);
      socket.send(JSON.stringify({
        setup: {
          model: `models/${model || 'gemini-3.8-live'}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            // Voice stays client-side so every one of Gemini's supported
            // TTS voices can be selected independently.
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
          systemInstruction: {
            parts: [{
              text:
                `You are Twinkle AI. Say the user's message aloud word for word, in your own voice and style. ` +
                `Do not change, add or remove any words, do not add an introduction, and stop immediately after saying it.` +
                languageInstruction,
            }],
          },
        },
      }));
    };

    socket.onerror = () => {
      // Never opened = handshake rejected: try the other Live API version next time.
      if (!opened) reportLiveSocketFailure(apiVersion, token);
      else invalidateCachedLiveToken(token);
      finish(new Error(`Gemini could not preview ${voiceName}. Check the Live token and browser audio permission.`));
    };

    socket.onclose = event => {
      if (!settled && event.code !== 1000) {
        if (!opened) reportLiveSocketFailure(apiVersion, token);
        else invalidateCachedLiveToken(token);
        const reason = event.reason ? `: ${event.reason}` : '';
        finish(new Error(`Gemini voice preview disconnected (${event.code})${reason}.`));
      }
    };

    socket.onmessage = async event => {
      try {
        const message = await decodeLiveWebSocketMessage(event.data);

        if (message.error) {
          invalidateCachedLiveToken(token);
          finish(new Error(message.error.message || `Gemini rejected the ${voiceName} voice preview.`));
          return;
        }

        if (message.setupComplete) {
          socket.send(JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text }] }],
              turnComplete: true,
            },
          }));
          return;
        }

        if (message.serverContent?.turnComplete) completedTurn = true;
        const parts = message.serverContent?.modelTurn?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            const data = part?.inlineData?.data;
            const mimeType = String(part?.inlineData?.mimeType || '');
            if (!data || !mimeType.startsWith('audio/pcm')) continue;

            receivedAudio = true;
            const pcm = previewBase64ToInt16(data);
            if (!pcm.length) continue;
            collected.push(pcm);

            const buffer = context.createBuffer(1, pcm.length, 24000);
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < pcm.length; i += 1) {
              channel[i] = pcm[i] / 32768;
            }

            const source = context.createBufferSource();
            source.buffer = buffer;
            // 1.12x makes the short greeting finish faster without changing
            // the pitch. The first PCM chunk is still played immediately.
            source.playbackRate.value = 1.12;
            source.connect(context.destination);
            sources.add(source);

            source.onended = () => {
              sources.delete(source);
              if (message.serverContent?.turnComplete && sources.size === 0) {
                finish(receivedAudio ? undefined : new Error(`Gemini returned no audio for ${voiceName}.`));
              }
            };

            const startAt = Math.max(context.currentTime + 0.005, nextPlayTime);
            nextPlayTime = startAt + buffer.duration / 1.12;
            source.start(startAt);
          }
        }

        if (message.serverContent?.turnComplete && sources.size === 0) {
          finish(receivedAudio ? undefined : new Error(`Gemini returned no audio for ${voiceName}.`));
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid Gemini voice preview response.'));
      }
    };
  });
}


/* =======================================================
   MEMORY
======================================================= */

export type MemoryItem = {
  id: number;
  content: string;
  createdAt: string | null;
};

export type MemorySnapshot = {
  enabled: boolean;
  memories: MemoryItem[];
};

export const memoryApi = {
  get: () =>
    fetchWithAuth(`${API_BASE}/memory`, { method: 'GET' }) as Promise<MemorySnapshot>,

  setEnabled: (enabled: boolean) =>
    fetchWithAuth(`${API_BASE}/memory/settings`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }) as Promise<MemorySnapshot>,

  add: (content: string) =>
    fetchWithAuth(`${API_BASE}/memory`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }) as Promise<MemorySnapshot>,

  remove: (id: number) =>
    fetchWithAuth(`${API_BASE}/memory/${id}`, { method: 'DELETE' }) as Promise<MemorySnapshot>,

  clear: () =>
    fetchWithAuth(`${API_BASE}/memory`, { method: 'DELETE' }) as Promise<MemorySnapshot>,
};
