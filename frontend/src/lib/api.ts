const getTwinkleLanguage = (): string => {
  try {
    return localStorage.getItem('twinkle_app_language') || 'auto';
  } catch {
    return 'auto';
  }
};

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
).replace(/\/$/, '');

const GEMINI_LIVE_WS_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

const CHAT_RETRIES = 1;
const RETRY_DELAY_MS = 450;

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
      error?.name ===
      'AbortError'
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
      error?.name ===
      'AbortError'
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

  logout: () =>
    fetchWithAuth(
      `${API_BASE}/auth/logout`,
      {
        method: 'POST',
      }
    ),

  /* =======================================================
     UPDATE PROFILE
     ======================================================= */

  updateProfile: (
    data: {
      username: string;
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

  /* =======================================================
     CHAT HISTORY
     ======================================================= */

  getMessages: (
    sessionId: number
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/history/${sessionId}`
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

  sendMessage: (
    message: string,
    sessionId: number | null,
    signal?: AbortSignal,
    model?: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/send`,
      {
        method: 'POST',

        signal,

        body:
          JSON.stringify({
            message,
            sessionId,
            model,
            language: getTwinkleLanguage(),
          }),
      },
      CHAT_RETRIES
    ),

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

    formData.append(
      'language',
      getTwinkleLanguage()
    );

    /* =====================================================
       FILES
       ===================================================== */

    for (
      const originalFile
      of files
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
      CHAT_RETRIES
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
    sessionId: number
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/session/${sessionId}/share`,
      {
        method: 'POST',
      }
    ),
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
  expiresAt: string;
  newSessionExpiresAt: string;
  usesRemaining: number;
};

let cachedLiveToken: CachedLiveToken | null = null;
let liveTokenPromise: Promise<CachedLiveToken> | null = null;
let activeVoicePreviewStop: (() => void) | null = null;
let voicePreviewGeneration = 0;

const LIVE_TOKEN_REUSE_BUFFER_MS = 15_000;

const invalidateCachedLiveToken = (token?: string) => {
  if (!cachedLiveToken) return;
  if (!token || cachedLiveToken.token === token) cachedLiveToken = null;
};

const requestLiveToken = async (): Promise<CachedLiveToken> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/live/token`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      // Voice and language are deliberately NOT sent here. The ephemeral
      // token leaves speechConfig unlocked so the client can choose any voice.
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.error('Live token network error:', error);
    throw new Error(
      'Could not reach the Twinkle AI backend. Check that Spring Boot is running on port 8080.'
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const serverMessage = typeof data?.error === 'string' ? data.error : '';
    throw new Error(
      serverMessage ||
      `Live Talk token request failed (${response.status} ${response.statusText}).`
    );
  }

  if (!data?.token) {
    throw new Error('The backend responded successfully but did not return a Gemini Live token.');
  }

  return {
    token: String(data.token),
    model: String(data.model || 'gemini-3.8-live'),
    expiresAt: String(data.expiresAt || ''),
    newSessionExpiresAt: String(data.newSessionExpiresAt || ''),
    usesRemaining: Math.max(1, Number(data.uses || 10)),
  };
};

export async function createLiveToken(
  _voiceName = 'Charon',
  _language = 'auto',
  forceRefresh = false
): Promise<{
  token: string;
  model: string;
  expiresAt: string;
  newSessionExpiresAt?: string;
}> {
  const now = Date.now();

  if (!forceRefresh && cachedLiveToken) {
    const expiresAt = Date.parse(cachedLiveToken.expiresAt);
    const newSessionExpiresAt = Date.parse(cachedLiveToken.newSessionExpiresAt);
    const usableUntil = Math.min(
      Number.isFinite(expiresAt) ? expiresAt : now + 60_000,
      Number.isFinite(newSessionExpiresAt) ? newSessionExpiresAt : now + 60_000
    );

    if (
      cachedLiveToken.usesRemaining > 0 &&
      usableUntil - now > LIVE_TOKEN_REUSE_BUFFER_MS
    ) {
      cachedLiveToken.usesRemaining -= 1;
      return { ...cachedLiveToken };
    }

    cachedLiveToken = null;
  }

  if (!liveTokenPromise) {
    liveTokenPromise = requestLiveToken().finally(() => {
      liveTokenPromise = null;
    });
  }

  const fresh = await liveTokenPromise;
  // Reserve one use for this session.
  fresh.usesRemaining = Math.max(0, fresh.usesRemaining - 1);
  cachedLiveToken = { ...fresh };

  return { ...fresh };
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

  const { token, model } = await createLiveToken(voiceName, language);

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
    const sources = new Set<AudioBufferSourceNode>();
    const socket = new WebSocket(
      `${GEMINI_LIVE_WS_ENDPOINT}?access_token=${encodeURIComponent(token)}`
    );
    let timeoutId = 0;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      sources.forEach(source => { try { source.stop(); } catch {} });
      sources.clear();
      if (activeVoicePreviewStop === stop) activeVoicePreviewStop = null;
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
                `You are Twinkle AI. Speak exactly one short greeting using the user's provided text. ` +
                `Do not change the username, do not add an introduction, and stop immediately after the greeting.` +
                languageInstruction,
            }],
          },
        },
      }));
    };

    socket.onerror = () => {
      invalidateCachedLiveToken(token);
      finish(new Error(`Gemini could not preview ${voiceName}. Check the Live token and browser audio permission.`));
    };

    socket.onclose = event => {
      if (!settled && event.code !== 1000) {
        invalidateCachedLiveToken(token);
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

        const parts = message.serverContent?.modelTurn?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            const data = part?.inlineData?.data;
            const mimeType = String(part?.inlineData?.mimeType || '');
            if (!data || !mimeType.startsWith('audio/pcm')) continue;

            receivedAudio = true;
            const pcm = previewBase64ToInt16(data);
            if (!pcm.length) continue;

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
