const API_BASE =
'https://twinkle-ai-w2gg.onrender.com/api';

const CHAT_RETRIES = 6;
const RETRY_DELAY_MS = 5_000;

const WAKE_ATTEMPTS = 8;
const WAKE_DELAY_MS = 4_000;

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
        3_000,
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
  retries = 3
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
   * CRITICAL CORS FIX
   * =======================================================
   *
   * DO NOT add application/json to GET requests.
   *
   * A GET request such as:
   *
   *   /api/auth/status
   *
   * does not need Content-Type.
   *
   * Adding it can unnecessarily trigger
   * a browser preflight request.
   */

  if (isFormData) {

    /*
     * NEVER manually set multipart Content-Type.
     *
     * Browser automatically generates:
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
      400: 'The request could not be processed. Please check your input and try again.',
      401: 'Your session has expired. Please log in again.',
      403: 'You do not have permission to perform this action.',
      404: 'The requested resource could not be found.',
      408: 'The request timed out. Please try again.',
      413: 'The uploaded file or request is too large.',
      415: 'This file type is not supported.',
      422: 'The submitted information could not be processed.',
      429: 'The AI service is currently busy. Please wait a few seconds and try again.',
      500: 'Something went wrong on the server. Please try again shortly.',
      502: 'The service is temporarily unavailable. Please try again shortly.',
      503: 'The server is temporarily unavailable. Please try again shortly.',
      504: 'The server took too long to respond. Please try again.',
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

  logout: () =>
    fetchWithAuth(
      `${API_BASE}/auth/logout`,
      {
        method: 'POST',
      }
    ),

  /*
   * GET request:
   * no Content-Type header is added.
   */
  getStatus: () =>
    fetchWithAuth(
      `${API_BASE}/auth/status`
    ),

  /*
   * GET request:
   * no Content-Type header is added.
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

  getSessions: () =>
    fetchWithAuth(
      `${API_BASE}/chat/sessions`
    ),

  getMessages: (
    sessionId: number
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/history/${sessionId}`
    ),

  createSession: () =>
    fetchWithAuth(
      `${API_BASE}/chat/new-session`,
      {
        method: 'POST',
      }
    ),

  deleteSession: (
    sessionId: number
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/session/${sessionId}`,
      {
        method: 'DELETE',
      }
    ),

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

    /*
     * =====================================================
     * TEXT FIELDS
     * =====================================================
     */

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

    /*
     * =====================================================
     * FILES
     * =====================================================
     */

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
       * Normalize generic or
       * missing browser MIME types.
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

    /*
     * =====================================================
     * NEVER SET Content-Type MANUALLY
     * =====================================================
     *
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
     SEARCH
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
     SHARE
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
