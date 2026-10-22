import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom'; 
import { createPortal, flushSync } from 'react-dom';   
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';  
import { takeWeatherSnapshot, type WeatherSnapshot, chatApi, authApi, createLiveToken, startLiveTokenKeepWarm, warmLiveToken, buildLiveSocketUrl, reportLiveSocketFailure, reportLiveSocketSuccess } from '../lib/api'; 
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'; 
import StormLogo from '../components/StormLogo';
import { toast } from '../lib/toast';
import ConfirmationModal from '../components/ConfirmationModal'; 
import ShareChatModal from '../components/ShareChatModal';
import UploadFilesModal from '../components/UploadFilesModal';
import UploadedFilesModal from '../components/UploadedFilesModal';
import LiveTalkModal, { type LiveWeatherEntry } from '../components/LiveTalkModal';
import { onShortcut, takePendingShortcut, type ShortcutAction } from '../lib/shortcuts';
import { getSavedLiveTalkColor } from '../lib/liveTalkColors';
import { parseServerDate } from '../lib/time';
import { loadPrefs } from '../lib/preferences';
import { setChatUnread } from '../lib/unread';
import { haptic } from '../lib/mobileUi';
import { COMPOSER_FILES_EVENT, takeComposerFiles } from '../lib/libraryAttach';
import { sanitizeAssistantText, friendlyErrorMessage } from '../lib/safeResponse';
import pcmCaptureWorkletSource from '../audio/pcm-capture-worklet.ts?raw'; 

import {
  Copy, Check, Pencil, Volume2, VolumeX, Share2,
  X, RotateCw, Download, CircleArrowDown, ChevronDown, Eye, Zap, Brain, Gem, Palette, Plus, Mic,
  ThumbsUp, ThumbsDown, Paperclip, Camera, Search as SearchIcon, ChevronUp,
} from 'lucide-react';

import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import AttachmentTile from '../components/AttachmentTile';
import FileDocIcon from '../components/FileDocIcon';
import ChatFilesPanel, { detectFileKind, type ChatFileItem, type ChatOutputItem } from '../components/ChatFilesPanel';
import WeatherCard from '../components/WeatherCard';
import PdfCompactPreview from '../components/PdfCompactPreview';
import ChatsListPage from '../components/ChatsListPage';
import ChatTitleMenu from '../components/ChatTitleMenu';
import type { Components } from 'react-markdown'; 
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';



// Small notice shown while the device has no internet connection.
function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (online) return null;
  return createPortal(
    <div role="status" aria-live="polite" className="fixed left-1/2 top-3 z-[2147483647] -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
      You are offline. Messages will send once you are back online.
    </div>,
    document.body
  );
}

// "9 minutes ago" label that keeps itself fresh without re-rendering the chat.
const formatRelativeAgo = (value: string | number | Date | undefined | null): string => {
  if (!value) return 'Just now';
  const parsed = parseServerDate(value);
  if (!parsed) return 'Just now';
  const seconds = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 1000));
  if (seconds < 45) return 'Just now';
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['week', 604800],
    ['month', 2592000],
    ['year', 31536000],
  ];
  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let size = 60;
  for (const [name, secs] of units) {
    if (seconds >= secs) {
      unit = name;
      size = secs;
    }
  }
  return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(-Math.max(1, Math.floor(seconds / size)), unit);
};

function RelativeTime({ value, className }: { value?: string | number | Date | null; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick(n => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const date = parseServerDate(value);
  return (
    <span
      className={className ?? "ml-1.5 whitespace-nowrap text-[13px] font-normal text-zinc-500 dark:text-zinc-400"}
      title={date ? date.toLocaleString() : undefined}
    >
      {formatRelativeAgo(value)}
    </span>
  );
}

const decodeGeminiLiveMessage = async (data: unknown): Promise<any> => {
  if (typeof data === 'string') return JSON.parse(data);
  if (data instanceof Blob) return JSON.parse(await data.text());
  if (data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(data)));
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return JSON.parse(new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)));
  }
  throw new Error('Unsupported Gemini Live message.');
};

const pcm16ToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
};

/**
 * Streaming 16 kHz PCM downsampler for the ScriptProcessor fallback. Each
 * output sample is the average of (inputRate / 16000) input samples, which low-
 * passes the signal before decimation. The old linear interpolation skipped
 * samples without filtering (aliasing), which blurred soft consonants and made
 * the transcriber confuse words like "who" and "how".
 */
const createPcm16Downsampler = (inputRate: number) => {
  const ratio = inputRate / 16000;
  let cellFill = 0;
  let cellSum = 0;

  return (input: Float32Array): Int16Array => {
    const out: number[] = [];
    for (let n = 0; n < input.length; n += 1) {
      const sample = input[n] || 0;
      if (ratio <= 1.0001) {
        out.push(Math.max(-1, Math.min(1, sample)));
        continue;
      }
      let remaining = 1;
      while (remaining > 1e-9) {
        const room = ratio - cellFill;
        const take = remaining < room ? remaining : room;
        cellSum += sample * take;
        cellFill += take;
        remaining -= take;
        if (cellFill >= ratio - 1e-9) {
          out.push(Math.max(-1, Math.min(1, cellSum / ratio)));
          cellSum = 0;
          cellFill = 0;
        }
      }
    }
    const pcm = new Int16Array(out.length);
    for (let i = 0; i < out.length; i += 1) {
      pcm[i] = out[i] < 0 ? out[i] * 0x8000 : out[i] * 0x7fff;
    }
    return pcm;
  };
};

/**
 * Normalize the LaTeX delimiters commonly emitted by chat models into the
 * $ / $$ delimiters understood by remark-math. Fenced code blocks are left
 * untouched so source code containing backslashes is never interpreted as math.
 */
const normalizeMathDelimiters = (value: string): string => {
  const renderExpression = (expression: string): string => {
    let result = expression.trim();

    const replacements: Array<[RegExp, string]> = [
      [/\\hbar/g, 'ℏ'], [/\\hslash/g, 'ℏ'], [/\\partial/g, '∂'], [/\\nabla/g, '∇'],
      [/\\infty/g, '∞'], [/\\alpha/g, 'α'], [/\\beta/g, 'β'], [/\\gamma/g, 'γ'],
      [/\\Gamma/g, 'Γ'], [/\\delta/g, 'δ'], [/\\Delta/g, 'Δ'], [/\\epsilon/g, 'ε'],
      [/\\varepsilon/g, 'ϵ'], [/\\zeta/g, 'ζ'], [/\\eta/g, 'η'], [/\\theta/g, 'θ'],
      [/\\Theta/g, 'Θ'], [/\\iota/g, 'ι'], [/\\kappa/g, 'κ'], [/\\lambda/g, 'λ'],
      [/\\Lambda/g, 'Λ'], [/\\mu/g, 'μ'], [/\\nu/g, 'ν'], [/\\xi/g, 'ξ'], [/\\Xi/g, 'Ξ'],
      [/\\pi/g, 'π'], [/\\Pi/g, 'Π'], [/\\rho/g, 'ρ'], [/\\sigma/g, 'σ'], [/\\Sigma/g, 'Σ'],
      [/\\tau/g, 'τ'], [/\\upsilon/g, 'υ'], [/\\phi/g, 'φ'], [/\\varphi/g, 'ϕ'],
      [/\\Phi/g, 'Φ'], [/\\chi/g, 'χ'], [/\\psi/g, 'ψ'], [/\\Psi/g, 'Ψ'],
      [/\\omega/g, 'ω'], [/\\Omega/g, 'Ω'],
      [/\\pm/g, '±'], [/\\mp/g, '∓'], [/\\times/g, '×'], [/\\cdot/g, '·'],
      [/\\leq/g, '≤'], [/\\geq/g, '≥'], [/\\neq/g, '≠'], [/\\approx/g, '≈'],
      [/\\equiv/g, '≡'], [/\\propto/g, '∝'], [/\\sim/g, '∼'], [/\\to/g, '→'],
      [/\\rightarrow/g, '→'], [/\\leftarrow/g, '←'], [/\\Rightarrow/g, '⇒'],
      [/\\Leftrightarrow/g, '⇔'], [/\\in/g, '∈'], [/\\notin/g, '∉'], [/\\subset/g, '⊂'],
      [/\\subseteq/g, '⊆'], [/\\cup/g, '∪'], [/\\cap/g, '∩'], [/\\forall/g, '∀'],
      [/\\exists/g, '∃'], [/\\nexists/g, '∄'], [/\\emptyset/g, '∅'],
      [/\\sum/g, 'Σ'], [/\\prod/g, 'Π'], [/\\int/g, '∫'], [/\\oint/g, '∮'],
      [/\\sqrt\{([^{}]+)\}/g, '√($1)'],
      [/\\mathbf\{([^{}]+)\}/g, '$1'], [/\\mathrm\{([^{}]+)\}/g, '$1'],
      [/\\mathbb\{([^{}]+)\}/g, '$1'], [/\\mathcal\{([^{}]+)\}/g, '$1'],
      [/\\mathsf\{([^{}]+)\}/g, '$1'], [/\\operatorname\{([^{}]+)\}/g, '$1'],
      [/\\text\{([^{}]+)\}/g, '$1'], [/\\hat\{([^{}]+)\}/g, 'ˆ$1'],
      [/\\bar\{([^{}]+)\}/g, '¯$1'], [/\\vec\{([^{}]+)\}/g, '⃗$1'],
      [/\\langle/g, '⟨'], [/\\rangle/g, '⟩'], [/\\ket\{([^{}]+)\}/g, '|$1⟩'],
      [/\\bra\{([^{}]+)\}/g, '⟨$1|'],
    ];

    replacements.forEach(([pattern, replacement]) => {
      result = result.replace(pattern, replacement);
    });

    // Handle fractions from both delimited and raw model output.
    for (let i = 0; i < 3; i += 1) {
      result = result.replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, '($1)⁄($2)');
    }

    // Improve common powers/subscripts instead of leaving TeX braces on screen.
    const superscripts: Record<string, string> = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ' };
    const subscripts: Record<string, string> = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','n':'ₙ','i':'ᵢ' };
    const toSup = (v: string) => [...v].map(ch => superscripts[ch] ?? ch).join('');
    const toSub = (v: string) => [...v].map(ch => subscripts[ch] ?? ch).join('');

    result = result
      .replace(/\^\{([^{}]+)\}/g, (_, v) => toSup(v))
      .replace(/_\{([^{}]+)\}/g, (_, v) => toSub(v))
      .replace(/\^([0-9n+-])/g, (_, v) => toSup(v))
      .replace(/_([0-9n+-])/g, (_, v) => toSub(v))
      .replace(/\\left/g, '')
      .replace(/\\right/g, '')
      .replace(/\\,/g, ' ')
      .replace(/\\;/g, ' ')
      .replace(/\\!/g, '')
      .replace(/\\quad/g, '  ')
      .replace(/\\qquad/g, '    ')
      .replace(/\\\\/g, '\\n')
      .replace(/\\([{}])/g, '$1')
      .replace(/[{}]/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();

    return result;
  };

  // Protect fenced code blocks so source code is never interpreted as math.
  const parts = value.split(/(```[\s\S]*?```)/g);
  return parts.map((part, index) => {
    if (index % 2 === 1) return part;

    // Delimited equations first, then raw TeX commands. The latter matters
    // because many models emit equations without $...$ delimiters.
    return part
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression) => renderExpression(expression))
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, expression) => renderExpression(expression))
      .replace(/\$\$([\s\S]*?)\$\$/g, (_, expression) => renderExpression(expression))
      .replace(/\$([^$\n]+)\$/g, (_, expression) => renderExpression(expression))
      .replace(/\\(?:frac|dfrac|tfrac|sqrt|mathbf|mathrm|mathbb|mathcal|operatorname|text|hat|bar|vec|ket|bra|left|right|partial|nabla|hbar|hslash|infty|alpha|beta|gamma|delta|Delta|lambda|mu|pi|sigma|phi|psi|omega|theta|sum|prod|int|oint|times|cdot|pm|leq|geq|neq|approx|propto|equiv|to|rightarrow|leftarrow|Rightarrow|Leftrightarrow|langle|rangle)\b[^\n]*/g, match => renderExpression(match));
  }).join('');
};

const PDFJS_MODULE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const PdfPreview = ({
  src,
  fileName,
}: {
  src: string;
  fileName: string;
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let pdfDocument: any = null;

    const renderPdf = async () => {
      setStatus('loading');
      try {
        const pdfjs: any = await import(/* @vite-ignore */ PDFJS_MODULE_URL);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

        const loadingTask = pdfjs.getDocument({
          url: src,
          useWorkerFetch: true,
          isEvalSupported: true,
          disableAutoFetch: true,
          disableStream: true,
        });
        pdfDocument = await loadingTask.promise;
        if (cancelled || !hostRef.current) {
          await pdfDocument?.destroy?.();
          return;
        }

        const host = hostRef.current;
        host.replaceChildren();
        const isMobile = window.matchMedia('(max-width: 767px)').matches;
        const pageCount = Math.min(Number(pdfDocument.numPages) || 1, isMobile ? 12 : 30);

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          if (cancelled || !hostRef.current) break;
          const page = await pdfDocument.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(host.getBoundingClientRect().width - (isMobile ? 12 : 24), 280);
          // Fit the PDF page to the actual modal content width. The preview host
          // must remain measurable while loading; hiding it makes clientWidth zero.
          const scale = Math.max(0.1, availableWidth / baseViewport.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d', { alpha: false });
          if (!context) continue;

          const outputScale = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
          canvas.width = Math.ceil(viewport.width * outputScale);
          canvas.height = Math.ceil(viewport.height * outputScale);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.className = 'mx-auto mb-4 block h-auto max-w-full rounded-lg bg-white shadow-sm';

          const label = document.createElement('div');
          label.textContent = `Page ${pageNumber}`;
          label.className = 'mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400';
          host.appendChild(label);
          host.appendChild(canvas);

          context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
          await page.render({ canvasContext: context, viewport }).promise;
        }

        if (!cancelled) setStatus('ready');
      } catch (error) {
        console.error('PDF preview rendering failed:', error);
        if (!cancelled) setStatus('error');
      }
    };

    void renderPdf();
    return () => {
      cancelled = true;
      try { void pdfDocument?.destroy?.(); } catch {}
    };
  }, [src]);

  return (
    <div className="relative min-h-full w-full">
      {status === 'loading' && (
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="rounded-2xl bg-white px-5 py-4 text-center shadow-sm dark:bg-zinc-900">
            <FileDocIcon className="mx-auto mb-2 h-8 w-8 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Loading PDF preview…</p>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-zinc-900">
            <FileDocIcon className="mx-auto mb-3 h-10 w-10 text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">PDF preview is unavailable</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">The file is still attached and ready for AI analysis.</p>
          </div>
        </div>
      )}
      <div ref={hostRef} className="block w-full min-w-0" aria-label={`PDF preview for ${fileName}`} />
    </div>
  );
};

// First-login welcome chat. Shown once to a newly created account (until the
// user starts chatting), instead of the usual random greeting.
const WELCOME_SEEN_PREFIX = 'twinkle_welcome_seen:';
const WELCOME_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
// Local placeholder row shown in the sidebar for the welcome chat (never sent to the backend).
const WELCOME_SESSION_ID = -1;
const WELCOME_SESSION_TITLE = 'Your first chat with Twinkle';

const hasSeenWelcome = (userId: string): boolean => {
  try { return localStorage.getItem(WELCOME_SEEN_PREFIX + userId) === '1'; } catch { return false; }
};
const markWelcomeSeen = (userId: string) => {
  try { localStorage.setItem(WELCOME_SEEN_PREFIX + userId, '1'); } catch { /* storage unavailable */ }
};
const isRecentlyCreated = (createdAt?: string): boolean => {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  // Generous window: the backend sends a timezone-less timestamp.
  return Number.isFinite(created) && Math.abs(Date.now() - created) < WELCOME_WINDOW_MS;
};

interface Props {
  user: User;
  onLogout: () => void;
  onSettings?: () => void;
}

const CodeBlock = ({ language, value }: { language: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="group/code relative my-6 overflow-hidden rounded-xl border border-white/20 dark:border-white/10 shadow-2xl backdrop-blur-xl bg-white/5 dark:bg-black/20 transition-all">
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/10 dark:bg-black/20 border-b border-white/10">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-1000" />
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-black text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-600 dark:text-zinc-300 transition-all hover:scale-105 active:scale-95"
        >
          {copied ? <Check className="w-3 h-3 text-zinc-500" /> : <Copy className="w-3 h-3" />}
          <span className="uppercase tracking-widest">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-0 bg-[#282c34]">
        <SyntaxHighlighter
          style={oneDark}
          language={language || 'text'}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '1.25rem',
            fontSize: '0.85rem',
            background: 'transparent',
            lineHeight: '1.6',
          }}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

const SESSION_KEY = 'scout_current_session_id';
const persistSessionId = (id: number | null) => {
  if (id === null) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, String(id));
};
const readPersistedSessionId = (): number | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
};

const getInitialTheme = (): boolean => {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('theme');
  if (stored) return stored === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// Message sanitizers are function declarations so they are available to history/loading callbacks
// regardless of module evaluation order.
function normalizeTwinkleIdentity(content: string): string {
  const normalized = content.trim();

  // Replace the old default identity response with a clearer Twinkle
  // introduction. Keep this narrowly scoped so documents mentioning Twinkle
  // are not rewritten accidentally.
  if (
    /^I['’]m\s+Twinkle\s+AI,\s+a\s+helpful\s+assistant\s+designed\s+to\s+help\s+you\s+with\s+information,\s+analysis,\s+and\s+more\.?$/i.test(normalized)
  ) {
    return `Hi! I’m Twinkle, a professional AI assistant designed to help you understand information, solve problems, work with files, write and analyze content, develop software, and accomplish tasks efficiently.

I adapt my responses to what you’re actually asking. I aim to provide clear, accurate, practical, and meaningful answers rather than following a rigid response template.

You can ask me questions, give me a file or image to analyze, ask for help with coding or technical problems, request writing or explanations, or simply tell me what you’re trying to accomplish — I’ll help you figure out the best way forward.`;
  }

  return content;
}

const IMAGE_MODEL_ID = '@cf/black-forest-labs/flux-1-schnell';
const IMAGE_CHAT_PATTERN = /^\s*(hi+|hello+|hey+|hii+|yo|hola|namaste|sup|howdy|good\s+(morning|afternoon|evening|night)|how\s+are\s+you|who\s+are\s+you|what\s+can\s+you\s+do|what.?s\s+up|thanks?|thank\s+you|ok(ay)?|bye|help|test|testing)\b[\s\p{P}]*(there|twinkle|buddy|friend|bro)?[\s\p{P}]*$/iu;
const IMAGE_GENERATION_INTENT = /^\s*(?:(?:please|can you|could you|would you|i (?:want|need)(?: you to)?|let'?s|just)\s+)*(?:(?:generate|create|make|draw|paint|design|render|produce|illustrate|sketch)\b[^.?!\n]{0,40}?\b(?:image|images|picture|pictures|photo|photos|illustration|logo|wallpaper|portrait|poster|artwork|avatar|drawing|painting)\b|(?:draw|paint|sketch|illustrate)\s+(?:me\s+|a\s+|an\s+|the\s+)\w+)/i;
// Bare "Generate a coffee" / "Draw me a cat" style prompts (no image noun), minus text/code tasks.
const IMAGE_BARE_GENERATE = /^\s*(?:(?:please|can you|could you|would you)\s+)*(?:generate|create|make|draw|paint|sketch|illustrate|imagine|visuali[sz]e)\s+(?:me\s+)?(?:a|an|the|some)\s+(?!.*\b(?:function|code|script|report|summary|list|email|story|essay|recipe|text|names?|ideas?|sql|quer(?:y|ies)|regex|program|class|component|api|tests?|document|outline|plan|table|poem|song|joke|post|caption|prompt|schedule|quiz|resume|letter|message|article|question|example|password|number|word|sentence|paragraph|title|slogan|summary)\b)[^.?!\n]{1,60}$/i;
const IMAGE_WORDS_PATTERN = /\b(image|picture|photo|draw|paint|sketch|illustration|logo|wallpaper|render|portrait|poster|generate|create|make)\b/i;

/** Mirrors the backend: greetings/small talk get a text reply, everything else an image. */
type ThinkingFile = { name: string; type: string };
type ThinkingContext = { question: string; files: ThinkingFile[] };

const shortFileName = (name: string): string => {
  const clean = name.trim();
  if (clean.length <= 28) return clean;
  const dot = clean.lastIndexOf('.');
  const ext = dot > 0 && clean.length - dot <= 6 ? clean.slice(dot) : '';
  return `${clean.slice(0, 24).trimEnd()}…${ext}`;
};

function fileKind(file: ThinkingFile): 'image' | 'pdf' | 'word' | 'sheet' | 'slides' | 'code' | 'text' | 'other' {
  const n = file.name.toLowerCase();
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/.test(n)) return 'image';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (t.includes('wordprocessingml') || t === 'application/msword' || /\.(docx?|odt|rtf)$/.test(n)) return 'word';
  if (t.includes('spreadsheetml') || t.includes('excel') || t === 'text/csv' || /\.(xlsx?|csv|tsv|ods)$/.test(n)) return 'sheet';
  if (t.includes('presentationml') || t.includes('powerpoint') || /\.(pptx?|odp)$/.test(n)) return 'slides';
  if (/\.(js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|rb|php|html|css|json|xml|ya?ml|sql|sh|kt|swift)$/.test(n)) return 'code';
  if (t.startsWith('text/') || /\.(txt|md)$/.test(n)) return 'text';
  return 'other';
}

/**
 * Builds status messages that match what the person actually asked or
 * uploaded, so the wait never shows an unrelated message.
 */
function buildThinkingMessages(ctx: ThinkingContext, phase: 'connecting' | 'thinking'): string[] {
  const q = ctx.question.trim().toLowerCase();
  const files = ctx.files;

  // ── Uploaded file(s) ───────────────────────────────────────────────────
  if (files.length > 0) {
    const kinds = files.map(fileKind);
    const allSame = kinds.every(k => k === kinds[0]);
    const kind = allSame ? kinds[0] : 'other';
    const label = files.length === 1 ? shortFileName(files[0].name) : `${files.length} files`;
    const noun: Record<string, string> = {
      image: files.length === 1 ? 'image' : 'images',
      pdf: files.length === 1 ? 'PDF' : 'PDFs',
      word: files.length === 1 ? 'document' : 'documents',
      sheet: files.length === 1 ? 'spreadsheet' : 'spreadsheets',
      slides: files.length === 1 ? 'presentation' : 'presentations',
      code: files.length === 1 ? 'code file' : 'code files',
      text: files.length === 1 ? 'text file' : 'text files',
      other: files.length === 1 ? 'file' : 'files',
    };
    const n = noun[kind];

    if (phase === 'connecting') {
      return [files.length === 1 ? `Uploading ${label}` : `Uploading your ${n}`];
    }

    const asks = {
      summarize: /\b(summari[sz]e|summary|tl;?dr|gist|overview|brief)\b/.test(q),
      extract: /\b(extract|ocr|transcribe|text from|read (?:out|the text))\b/.test(q),
      translate: /\b(translate|translation)\b/.test(q),
      explain: /\b(explain|describe|what is|what'?s in|what does|tell me about)\b/.test(q),
      fix: /\b(fix|debug|error|bug|refactor|review|optimi[sz]e|improve)\b/.test(q),
      proofread: /\b(proofread|grammar|rewrite|edit|correct)\b/.test(q),
      data: /\b(analy[sz]e|chart|trend|total|sum|average|calculate|compare|insight|column|row)\b/.test(q),
      question: /\?|\b(who|what|when|where|why|how|which|find|list|show)\b/.test(q),
    };

    if (kind === 'image') {
      if (asks.extract) return [`Reading the text in your ${n}`, 'Extracting the text'];
      if (asks.translate) return [`Reading the text in your ${n}`, 'Translating what I find'];
      return [`Looking at your ${n}`, 'Studying the details', asks.question && !asks.explain ? 'Finding the answer in your image' : 'Putting together a description'];
    }
    if (kind === 'sheet') {
      if (asks.summarize) return [`Reading your ${n}`, 'Summarizing the data'];
      return [`Reading your ${n}`, 'Analyzing the data', asks.data ? 'Working out the numbers' : 'Finding what matters'];
    }
    if (kind === 'code') {
      if (asks.fix) return [`Reading your ${n}`, 'Reviewing the code', 'Looking for issues and improvements'];
      return [`Reading your ${n}`, 'Following the code logic', 'Preparing an explanation'];
    }
    if (asks.summarize) return [`Reading your ${n}`, 'Picking out the key points', 'Writing the summary'];
    if (asks.translate) return [`Reading your ${n}`, 'Translating the content'];
    if (asks.extract) return [`Reading your ${n}`, 'Extracting the text'];
    if (asks.proofread) return [`Reading your ${n}`, 'Checking the writing', 'Preparing the edits'];
    if (asks.question && !asks.explain) return [`Reading your ${n}`, 'Looking for the answer in it'];
    return [`Reading your ${n}`, 'Understanding the content', 'Preparing the analysis'];
  }

  // ── Plain questions ────────────────────────────────────────────────────
  if (phase === 'connecting') return ['Reading your question'];
  if (!q) return ['Thinking'];

  if (q.length <= 40 && IMAGE_CHAT_PATTERN.test(q)) return ['Thinking'];
  if (/```|\b(code|function|script|program|algorithm|regex|sql|query|api|component|class|bug|debug|compile|stack ?trace|exception|java|python|javascript|typescript|react|html|css|node|golang|rust)\b/.test(q)) {
    if (/\b(fix|debug|error|bug|exception|not working|stack ?trace|fails?)\b/.test(q)) return ['Reading through the problem', 'Tracing what is going wrong', 'Working out the fix'];
    if (/\b(explain|what does|how does|why does)\b/.test(q)) return ['Reading the code', 'Preparing an explanation'];
    return ['Understanding what you need', 'Writing the code'];
  }
  if (/\b(translate|translation|how (?:do you|to) say|in (?:hindi|telugu|tamil|kannada|spanish|french|german|english))\b/.test(q)) return ['Working out the translation', 'Checking the wording'];
  if (/\b(summari[sz]e|summary|tl;?dr)\b/.test(q)) return ['Reading the text', 'Picking out the key points'];
  if (/\b(email|e-mail|letter|cover letter|essay|article|blog|post|caption|speech|poem|story|song|message|write|draft|compose)\b/.test(q)) {
    if (/\b(email|e-mail|letter)\b/.test(q)) return ['Drafting your message', 'Polishing the tone'];
    if (/\b(poem|story|song)\b/.test(q)) return ['Getting creative', 'Writing it out'];
    return ['Planning the structure', 'Writing it out'];
  }
  if (/\b(solve|calculate|equation|integral|derivative|probability|percentage|percent|sum of|math|formula)\b|\d+\s*[+\-*/^x×÷%]\s*\d+/.test(q)) return ['Working through the math', 'Double-checking the result'];
  if (/\b(recipe|cook|bake|ingredient|dish)\b/.test(q)) return ['Thinking through the recipe', 'Putting the steps together'];
  if (/\b(trip|travel|itinerary|visit|tour|flight|hotel)\b/.test(q)) return ['Thinking through your trip', 'Putting the plan together'];
  if (/\b(compare|difference between|vs\.?|versus|better than|pros and cons)\b/.test(q)) return ['Weighing both sides', 'Comparing the key points'];
  if (/\b(resume|cv|interview|job|career|salary)\b/.test(q)) return ['Thinking about your situation', 'Preparing practical advice'];
  if (/\b(health|symptom|diet|workout|exercise|medicine|doctor|fever|pain)\b/.test(q)) return ['Looking at your question carefully', 'Preparing a clear answer'];
  if (/\b(idea|ideas|suggest|suggestions|brainstorm|name for|names for|recommend)\b/.test(q)) return ['Coming up with ideas', 'Picking the best ones'];
  if (/\b(how (?:do|to|can|does)|steps|guide|tutorial|way to)\b/.test(q)) return ['Working out the steps', 'Putting them in order'];
  if (/\b(explain|why|what is|what are|what'?s|define|meaning of|who is|who was|tell me about)\b/.test(q)) return ['Thinking about your question', 'Preparing a clear explanation'];
  return ['Thinking about your question', 'Putting the answer together'];
}

/** Status text shown while the AI is preparing its reply, tailored to the question or uploaded file. */
function ThinkingStatus({
  phase,
  context,
}: {
  phase: 'idle' | 'connecting' | 'thinking' | 'streaming';
  context: ThinkingContext;
}) {
  const stage: 'connecting' | 'thinking' = phase === 'connecting' ? 'connecting' : 'thinking';
  const messages = useMemo(
    () => buildThinkingMessages(context, stage),
    [context.question, context.files, stage]
  );
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (messages.length < 2) return;
    // Walk through the relevant steps once and stay on the last one.
    const id = window.setInterval(() => setIndex((i) => Math.min(i + 1, messages.length - 1)), 2600);
    return () => window.clearInterval(id);
  }, [messages]);
  const label = messages[Math.min(index, messages.length - 1)];
  return (
    <div className="twinkle-thinking-status" role="status" aria-live="polite">
      <StormLogo className="twinkle-thinking-status-logo h-5 w-5" />
      <span key={label} className="twinkle-thinking-shimmer">{label}…</span>
    </div>
  );
}

function shouldShowImageProgress(
  messages: Array<{ role: string; content?: string }>,
  selectedModel: string,
  isTyping: boolean
): boolean {
  if (!isTyping || selectedModel !== IMAGE_MODEL_ID) return false;
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant' && String(last.content || '').length > 0) return false;
  const lastUser = [...messages].reverse().find(message => message.role === 'user');
  const text = String(lastUser?.content || '').trim();
  if (!text) return false;
  if (IMAGE_WORDS_PATTERN.test(text)) return true;
  return !(text.length <= 60 && IMAGE_CHAT_PATTERN.test(text));
}

/**
 * "Creating your image" card. The image service returns the finished picture in
 * one piece and reports no real progress, so no percentage is shown: an
 * indeterminate progress bar and the real elapsed time are used instead.
 */
function ImageGenerationProgress({ prompt }: { prompt: string }) {
  const [percent, setPercent] = useState(0);
  const reduceMotion = useReducedMotion();

  // The image service reports no real progress, so this is an eased estimate:
  // it slows down near the end and never reaches 100% until the image arrives.
  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000;
      setPercent(Math.min(95, Math.round(95 * (1 - Math.exp(-seconds / 4)))));
    }, 150);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <motion.div
      key="twinkle-image-generation"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      role="status"
      aria-live="polite"
      aria-label={`Creating your image, ${percent}%`}
      className="my-2 w-[min(100%,360px)] overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-zinc-700/70 dark:bg-zinc-900"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        <motion.div
          className="absolute -inset-[30%] blur-3xl"
          style={{
            backgroundImage:
              'radial-gradient(40% 40% at 30% 35%, rgba(217,119,87,0.55), transparent 70%), radial-gradient(40% 40% at 70% 60%, rgba(139,124,246,0.50), transparent 70%), radial-gradient(35% 35% at 45% 80%, rgba(96,165,250,0.45), transparent 70%)',
          }}
          animate={reduceMotion ? undefined : { rotate: [0, 12, -8, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        {!reduceMotion && (
          <motion.div
            className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent dark:via-white/10"
            initial={{ x: '-120%' }}
            animate={{ x: '260%' }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.4 }}
          />
        )}
      </div>

      <div className="px-4 pb-4 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Creating your image</span>
          <span className="shrink-0 text-[13px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">{percent}%</span>
        </div>
        <div className="relative mt-2.5 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div
            className="h-full rounded-full bg-[#D97757] transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        {prompt && (
          <p className="mt-3 line-clamp-2 text-[12px] leading-[1.35] text-zinc-500 dark:text-zinc-400">{prompt}</p>
        )}
      </div>
    </motion.div>
  );
}

/** Hides an image whose Markdown is still streaming in (partial base64), so raw data is never shown. */
function maskIncompleteImages(text: string): string {
  if (!text || text.indexOf('![') < 0) return text;
  return text.replace(/!\[[^\]]*(?:\]\([^)]*)?$/, '\n\n*Generating image*');
}

/** "Generate a Person Image." -> "person-image"; falls back to the full text, then "twinkle-image". */
function slugFromPrompt(text: string): string {
  const clean = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '');
  const trimmed = (text || '').trim();
  const stripped = trimmed.replace(
    /^(?:(?:please|can you|could you|would you)\s+)*(?:generate|create|make|draw|paint|sketch|illustrate|design|render|produce|imagine|visuali[sz]e)\s+(?:me\s+)?(?:(?:a|an|the|some)\s+)?(?:(?:image|picture|photo|illustration)\s+(?:of|for)\s+(?:(?:a|an|the|some)\s+)?)?/i,
    ''
  );
  return clean(stripped) || clean(trimmed) || 'twinkle-image';
}

function imageDownloadName(src: string, label = ''): string {
  const mime = /^data:image\/([a-z0-9.+-]+)/i.exec(src)?.[1]?.toLowerCase();
  const ext = mime ? (mime === 'jpeg' ? 'jpg' : mime.replace(/\+.*$/, '')) : 'png';
  return `${slugFromPrompt(label)}.${ext}`;
}

async function downloadGeneratedImage(src: string, label = '') {
  const name = imageDownloadName(src, label);
  try {
    let href = src;
    let revoke: string | null = null;
    if (!src.startsWith('data:')) {
      const blob = await (await fetch(src)).blob();
      href = URL.createObjectURL(blob);
      revoke = href;
    }
    const link = document.createElement('a');
    link.href = href;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (revoke) window.setTimeout(() => URL.revokeObjectURL(revoke as string), 2000);
  } catch {
    window.open(src, '_blank', 'noopener,noreferrer');
  }
}

const SEEN_GENERATED_IMAGES = new Set<string>();

/** Generated/response image with click-to-preview (full screen) and download. */
function GeneratedImage({ src, alt, prompt }: { src?: string; alt?: string; prompt?: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  // Fade in only the first time this image is shown. When the message
  // re-mounts (scrolling, id swap after saving) it must appear instantly,
  // otherwise it flashes blurred/transparent again.
  const [loaded, setLoaded] = useState(() => !!src && SEEN_GENERATED_IMAGES.has(src));
  const [animateIn] = useState(() => !(src && SEEN_GENERATED_IMAGES.has(src)));
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      if (src) SEEN_GENERATED_IMAGES.add(src);
      setLoaded(true);
    }
  }, [src]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen]);

  if (!src) return null;
  const label = alt || 'Response image';
  const downloadLabel = prompt?.trim() || (alt && !/^(image|response image|generated image)$/i.test(alt.trim()) ? alt : '');

  return (
    <>
      <figure className="twinkle-response-image">
        <img
          ref={imgRef}
          src={src}
          alt={label}
          decoding="async"
          onLoad={() => { SEEN_GENERATED_IMAGES.add(src); setLoaded(true); }}
          onClick={() => setPreviewOpen(true)}
          style={{
            cursor: 'zoom-in',
            opacity: loaded ? 1 : 0,
            transition: animateIn ? 'opacity .45s ease' : 'none',
          }}
        />
      </figure>

      {previewOpen && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          style={{ zIndex: 2147483000, paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          className="fixed inset-0 flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="relative inline-block max-w-[94vw]" onClick={(event) => event.stopPropagation()}>
            <img
              src={src}
              alt={label}
              className="block max-h-[calc(100dvh-7rem)] max-w-[94vw] rounded-xl object-contain shadow-2xl"
            />
            <div className="absolute right-3 top-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadGeneratedImage(src, downloadLabel)}
                aria-label="Download image"
                title="Download"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur transition-colors hover:bg-black/75"
              >
                <Download className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                title="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur transition-colors hover:bg-black/75"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function cleanMessageContent(content: unknown): string {
    if (typeof content !== 'string') return '';

    let cleaned = normalizeTwinkleIdentity(content)
      // NEVER strip Markdown links here. Keeping the original [label](url)
      // structure lets ReactMarkdown preserve clickability while the
      // renderer below displays the complete URL as the visible text.
      //
      // Contact/project links are normalized onto separate lines so each
      // link is easy to read in the document-style output.
      .replace(/^([ \t]*(?:\[[^\]]+\]\((?:https?|mailto|tel):[^)]+\)[ \t]*\|[ \t]*)+\[[^\]]+\]\((?:https?|mailto|tel):[^)]+\)[ \t]*)$/gim, (line) =>
        line.split(/\s*\|\s*/).join('\n')
      )
      .replace(/\s*\|\s*(?=(?:Email|Phone|Github|GitHub|LinkedIn|Portfolio)\s*:)/gi, '\n')
      // Make document labels use the same heavy weight as **Technologies**.
      .replace(/(^|\n)(\s*[-*]?\s*)(Github|GitHub|Live Link|Live link|Email|Phone|Technologies)\s*:/gim, '$1$2**$3:**')
      // Keep project GitHub and Live Link entries on their own lines.
      .replace(/\s+(\*\*(?:Github|GitHub):\*\*)\s*(https?:\/\/[^\s]+)/g, '\n$1 $2\n')
      .replace(/\s+(\*\*(?:Live Link|Live link):\*\*)\s*(https?:\/\/[^\s]+)/g, '\n$1 $2')
      // The resume subtitle should have the same heavy visual weight as
      // labels such as Email/Technologies.
      .replace(/^(Java Developer\s*[—-]\s*Java Backend Developer)\s*$/gim, '**$1**')
      // Remove the internal attachment marker from persisted/live messages.
      .replace(/\n?\n?\[Attached Files:.*?\]/g, '')
      // Remove the internal reply-layout hints added to file/image prompts.
      .replace(/\n*Reply layout for this (?:file|image):[\s\S]*?Do not mention these layout instructions\.\n*/g, '\n\n')
      .trim();

    // The upload flow can persist the internal "no question/instruction"
    // formatting prompt as the user's message. It is an implementation
    // detail and must never be rendered as chat content, including after
    // the conversation is refreshed and messages are loaded from the API.
    if (
      /^The user uploaded (?:document\(s\) but did not provide a question or instruction|one or more documents)\./i.test(cleaned)
      || /^Analyze the uploaded media carefully\./i.test(cleaned)
    ) {
      return '';
    }

    // Older chats saved the extracted document text inside the user's message.
    // Show only what the person typed; the document itself is the attachment.
    cleaned = cleaned
      .replace(/\n*(?:Attached|Uploaded) document content:\n[\s\S]*$/i, '')
      .trim();

    // Remove generated helper sections that are not part of the document
    // itself. This is intentionally done on the client too so old persisted
    // messages are cleaned when they are loaded after refresh.
    cleaned = cleaned
      .replace(/\n?\s*#{1,6}\s*Additional Links\s*(?:\(Repeated in Source\))?\s*\n[\s\S]*?(?=\n\s*#{1,6}\s+|$)/gi, '\n')
      .replace(/\n?\s*#{1,6}\s*Document Structure\s*(?:\(as extracted\))?\s*\n[\s\S]*?(?=\n\s*#{1,6}\s+|$)/gi, '\n')
      // Remove only the extracted "Additional Section" and "Links & Contact"
      // sections. Keep hyperlinks that belong to the actual document content.
      .replace(/\n?\s*#{1,6}\s*Additional Section\s*(?:\(as in original document\))?\s*\n[\s\S]*?(?=\n\s*#{1,6}\s*Links\s*&\s*Contact\b|$)/gi, '\n')
      .replace(/\n?\s*#{1,6}\s*Links\s*&\s*Contact\s*\n[\s\S]*$/gi, '\n')
      .trim();

    // Remove the dedicated Architecture section/bullet requested by the UI
    // formatting rules, without removing legitimate architecture mentions
    // inside normal project/experience descriptions.
    cleaned = cleaned
      .replace(/\n?\s*#{1,6}\s*Architecture\s*\n[\s\S]*?(?=\n\s*#{1,6}\s+|$)/gi, '\n')
      .replace(/^\s*[-*]\s*\*\*Architecture:\*\*.*(?:\n|$)/gim, '')
      // Remove only the generated Document Navigation section.
      .replace(/\n?\s*#{1,6}\s*Document\s+Navigation\s*\n[\s\S]*?(?=\n\s*#{1,6}\s+|$)/gi, '\n')
      .trim();

    // Extracted PDF text can contain the same standalone URLs twice (often a
    // duplicate block at the end). Keep the first occurrence so links near
    // the top of the document remain intact, and drop later duplicates.
    const seenStandaloneLinks = new Set<string>();
    cleaned = cleaned
      .split('\n')
      .filter(line => {
        const value = line.trim();
        if (!/^(?:https?:\/\/|mailto:|tel:)/i.test(value)) return true;

        const normalized = value.replace(/[)>.,]+$/, '').replace(/\/$/, '').toLowerCase();
        if (seenStandaloneLinks.has(normalized)) return false;
        seenStandaloneLinks.add(normalized);
        return true;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return cleaned;
  }


const normalizeReply = (content: string): string =>
  cleanMessageContent(content).replace(/\s+/g, ' ').trim().toLowerCase();

// Two replies count as the same answer when they are identical, or when they
// open the same way and are almost the same length (a streamed copy and the
// saved copy of one answer).
const isSameReply = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  const shortest = Math.min(a.length, b.length);
  return shortest >= 60
    && a.slice(0, 60) === b.slice(0, 60)
    && Math.abs(a.length - b.length) <= Math.max(12, shortest * 0.08);
};

// Only replies inside the same turn (between two user messages) are compared.
// Answering the same question twice in different turns is legitimate and must
// keep both replies.
const dedupeMessages = (items: Message[]): Message[] => {
  const seenUser = new Set<string>();
  const result: Message[] = [];
  let repliesInTurn: string[] = [];

  for (const message of items) {
    if (message.role === 'user') {
      repliesInTurn = [];
      if (!cleanMessageContent(message.content).trim()) {
        const key = `${message.id}`;
        if (seenUser.has(key)) continue;
        seenUser.add(key);
      }
      result.push(message);
      continue;
    }

    const normalized = normalizeReply(message.content);
    if (normalized) {
      if (repliesInTurn.some(previous => isSameReply(previous, normalized))) continue;
      repliesInTurn.push(normalized);
    }
    result.push(message);
  }

  return result;
};

// Weather cards are remembered per assistant message so they survive
// re-sending the same question, switching chats and refreshing the page.
const WEATHER_CARD_STORE_KEY = 'twinkle_weather_cards_v1';
const readWeatherCardStore = (): Record<string, WeatherSnapshot> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEATHER_CARD_STORE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};
const rememberWeatherCard = (messageIds: string[], snapshot: WeatherSnapshot) => {
  try {
    const store = readWeatherCardStore();
    messageIds.forEach(id => { store[id] = snapshot; });
    const newest = Object.entries(store)
      .sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0))
      .slice(0, 80);
    localStorage.setItem(WEATHER_CARD_STORE_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch { /* storage blocked: the card still shows for this visit */ }
};

/**
 * Deterministic, rule-based chat title generator.
 * No AI model is used for naming conversations.
 */
const generateProfessionalChatTitle = (message: string, hasFiles = false): string => {
  const original = (message || '').trim();
  if (!original) return hasFiles ? 'File Analysis' : 'New Chat';

  const subject = original
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^\s*(can|could|would|will)\s+you\s+(please\s+)?/i, '')
    .replace(/^\s*please\s+/i, '')
    .replace(/^\s*i\s+(want|need|would like)\s+(to\s+)?/i, '')
    .replace(/^\s*help\s+me\s+(to\s+)?/i, '')
    .replace(/^\s*(kindly|let's)\s+/i, '')
    .trim();

  const actions: Array<[RegExp, string]> = [
    [/\b(simplify|make\s+(it|this|that)\s+(simple|simpler|easier)|make\s+.*\b(simple|simpler|easier)\b)\b/i, 'Simplify'],
    [/\b(debug|fix|solve|resolve|repair)\b/i, 'Fix'],
    [/\b(design|redesign|layout|style|stylize)\b/i, 'Design'],
    [/\b(create|make|build|develop|generate|produce|prepare)\b/i, 'Create'],
    [/\b(explain|describe|clarify|what\s+is|how\s+does|how\s+do)\b/i, 'Explain'],
    [/\b(write|draft|compose)\b/i, 'Write'],
    [/\b(convert|transform|turn)\b/i, 'Convert'],
    [/\b(summarize|summarise|summary)\b/i, 'Summarize'],
    [/\b(analyze|analyse|review|evaluate)\b/i, 'Analyze'],
    [/\b(compare|comparison|difference|differences)\b/i, 'Compare'],
    [/\b(remove|delete|erase)\b/i, 'Remove'],
    [/\b(add|insert)\b/i, 'Add'],
  ];

  const artifacts: Array<[RegExp, string]> = [
    [/\b(16\s*:\s*9|widescreen)\b/i, '16:9'],
    [/\b(ppt|pptx|powerpoint)\b/i, 'PPT Presentation'],
    [/\b(presentation|presentations|slides|slide\s+deck)\b/i, 'Presentation'],
    [/\b(handwritten|hand\s*written).*\bposter\b|\bposter\b.*\b(handwritten|hand\s*written)\b/i, 'Handwritten Poster'],
    [/\bposter\b/i, 'Poster'],
    [/\bdrone\b.*\bchart\b|\bchart\b.*\bdrone\b/i, 'Drone Chart'],
    [/\bchart\b|\bgraph\b|\bdiagram\b/i, 'Chart'],
    [/\b(login|sign[- ]?in)\s+(page|screen|form)\b/i, 'Login Page'],
    [/\b(image|picture|photo|illustration|visual)\b/i, 'Image'],
    [/\bpdf\b/i, 'PDF'],
    [/\b(code|program|script|function)\b/i, 'Code'],
    [/\breact\b/i, 'React'],
    [/\b(javascript|typescript)\b/i, 'JavaScript'],
    [/\bjava\b/i, 'Java'],
    [/\bpython\b/i, 'Python'],
    [/\b(sql|database|db)\b/i, 'Database'],
    [/\bapi\b/i, 'API'],
  ];

  const topics: Array<[RegExp, string]> = [
    [/\btwinkle\s+(ai\s+)?project\b/i, 'Twinkle'],
    [/\btwinkle\b/i, 'Twinkle'],
    [/\bai\s+project\b/i, 'AI Project'],
    [/\bmachine\s+learning\b/i, 'Machine Learning'],
    [/\bartificial\s+intelligence\b/i, 'Artificial Intelligence'],
    [/\bchatbot\b/i, 'Chatbot'],
    [/\bauthentication\b/i, 'Authentication'],
    [/\bportfolio\b/i, 'Portfolio'],
    [/\bwebsite\b/i, 'Website'],
    [/\bapp(?:lication)?\b/i, 'Application'],
  ];

  const findRule = (rules: Array<[RegExp, string]>) => {
    for (const [pattern, value] of rules) {
      if (pattern.test(subject)) return value;
    }
    return '';
  };

  const action = findRule(actions);
  const artifact = findRule(artifacts);
  const topic = findRule(topics);

  if (artifact === '16:9') return /\bppt|powerpoint|presentation|slides?\b/i.test(subject) ? 'Set Presentation 16:9' : 'Set 16:9 Format';
  if (topic === 'Twinkle' && artifact === 'Drone Chart') return 'Twinkle Drone Chart';
  if (topic === 'Twinkle' && artifact === 'Chart') return 'Twinkle Chart Design';
  if (topic === 'Twinkle' && artifact === 'Handwritten Poster') return action === 'Simplify' ? 'Simplify Twinkle Poster' : 'Twinkle Handwritten Poster';
  if (topic === 'AI Project' && artifact === 'PPT Presentation') return 'Create AI Project Presentation';
  if (action === 'Simplify' && artifact === 'Handwritten Poster') return 'Simplify Handwritten Poster';

  if (action && topic && artifact) {
    if (artifact === 'PPT Presentation' || artifact === 'Presentation') return `${action} ${topic} Presentation`;
    if (artifact === 'Chart') return `${topic} Chart Design`;
    return `${action} ${topic} ${artifact}`;
  }
  if (action && artifact) return `${action} ${artifact}`;
  if (action && topic) return `${action} ${topic}`;
  if (topic && artifact) return `${topic} ${artifact}`;
  if (artifact) return `${action || 'View'} ${artifact}`;

  const stopWords = new Set(['can','could','would','please','help','me','i','want','need','to','a','an','the','my','this','that','for','with','and','is','are','be','it','of','on','in','from','you','give']);
  const words = subject.replace(/[^\p{L}\p{N}:#/+.-]+/gu, ' ').split(/\s+/).filter(word => word && !stopWords.has(word.toLowerCase()));
  const fallback = words.slice(0, action ? 5 : 6).map(word => /^[A-Z0-9]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  if (!fallback) return hasFiles ? 'File Analysis' : 'New Chat';
  return action ? `${action} ${fallback}`.split(/\s+/).slice(0, 6).join(' ') : fallback.split(/\s+/).slice(0, 6).join(' ');
};

/**
 * Normalizes any chat title (AI generated, Live Talk, legacy rows) into a clean,
 * professional sidebar title: no markdown, quotes, "Title:" prefixes, trailing
 * punctuation/ellipsis, or mid-word cuts. Safe to run repeatedly (idempotent).
 */
const polishChatTitle = (raw: unknown, fallback = ''): string => {
  let t = String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_#>~]+/g, '')
    .replace(/^\s*(?:chat\s+title|conversation\s+title|title)\s*[:\-–—]\s*/i, '')
    .replace(/^\s*live\s*talk\s*[:\-–—]\s*/i, '')
    .replace(/^["'“”‘’«»\s]+|["'“”‘’«»\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(?:\.{2,}|…)+\s*$/, '')
    .replace(/[\s.,;:!?\-–—]+$/, '')
    .trim();
  if (!t) return fallback;

  const MAX = 50;
  if (t.length > MAX) {
    const cut = t.slice(0, MAX);
    const lastSpace = cut.lastIndexOf(' ');
    t = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut)
      .replace(/\s+(?:a|an|the|and|or|of|to|for|in|on|with|about|from|by|is|are)$/i, '')
      .replace(/[\s.,;:!?\-–—]+$/, '')
      .trim();
  }

  // Capitalize titles that came back entirely lowercase (Latin script only).
  if (/^[a-z0-9\s'’:&/+.-]+$/.test(t)) {
    const small = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'vs']);
    t = t.split(' ').map((w, i) => (i > 0 && small.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return t || fallback;
};

const isGenericOrRawTitle = (name: unknown): boolean => {
  const n = String(name ?? '').trim();
  if (!n) return true;
  if (/^(new chat|chat|live talk|file analysis|untitled)$/i.test(n)) return true;
  if (/(?:\.{2,}|…)\s*$/.test(n)) return true;          // truncated raw message
  if (n.length > 55) return true;                        // pasted sentence
  if (/[?]$/.test(n) && n.split(/\s+/).length > 6) return true;
  return false;
};

/**
 * Mic listening meter - a scrolling voice waveform, like Claude's dictation bar.
 *
 * Every ~50 ms the current loudness of the microphone is pushed in on the right
 * and older bars scroll to the left, so each bar has its OWN height: a record of
 * how loud the last couple of seconds were. Silence is a row of still dots; speech
 * produces tall and short bars that follow the rhythm of the voice.
 *
 * (The previous version mapped frequency bins to bars with a 3x gain and a
 * saturating scale, so every bar hit the same maximum height at once.)
 *
 * It opens its own analyser and writes heights straight to the DOM, so there is
 * no React re-render per frame.
 */
const VOICE_BAR_WIDTH = 2;
const VOICE_BAR_GAP = 4;
const VOICE_BAR_MIN_HEIGHT = 2;
const VOICE_BAR_MAX_HEIGHT = 22;
const VOICE_BAR_INTERVAL_MS = 50;
const VOICE_BAR_MAX_COUNT = 72;

const VoiceLevelBars = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const countRef = useRef(32);
  const historyRef = useRef(new Float32Array(VOICE_BAR_MAX_COUNT));
  const [count, setCount] = useState(32);

  const paint = useCallback(() => {
    const history = historyRef.current;
    const visible = countRef.current;
    for (let i = 0; i < visible; i += 1) {
      const el = barRefs.current[i];
      if (!el) continue;
      const level = history[history.length - visible + i] || 0;
      el.style.height = `${VOICE_BAR_MIN_HEIGHT + level * (VOICE_BAR_MAX_HEIGHT - VOICE_BAR_MIN_HEIGHT)}px`;
      el.style.opacity = String(0.45 + level * 0.55);
    }
  }, []);

  // Fit as many bars as the free space allows (works from 320 px phones up).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const width = root.clientWidth;
      const fit = Math.floor((width + VOICE_BAR_GAP) / (VOICE_BAR_WIDTH + VOICE_BAR_GAP));
      const next = Math.max(10, Math.min(VOICE_BAR_MAX_COUNT, fit || 32));
      countRef.current = next;
      setCount(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { paint(); }, [count, paint]);

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    const history = historyRef.current;
    history.fill(0);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        // AGC is off on purpose: with it on, background noise is boosted and the
        // bars would never settle to dots in silence.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        });
        if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }

        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return;
        context = new Ctor();
        await context.resume().catch(() => undefined);
        if (stopped) return;

        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0;
        const mute = context.createGain();
        mute.gain.value = 0; // keeps the graph running without playing the mic back
        source.connect(analyser);
        analyser.connect(mute);
        mute.connect(context.destination);

        const wave = new Float32Array(analyser.fftSize);
        let noiseFloor = 0.002;
        let envelope = 0;
        let intervalPeak = 0;
        let lastPush = performance.now();

        const tick = (now: number) => {
          if (stopped) return;
          analyser.getFloatTimeDomainData(wave);

          let sum = 0;
          for (let i = 0; i < wave.length; i += 1) sum += wave[i] * wave[i];
          const rms = Math.sqrt(sum / wave.length);

          // Adaptive noise floor: follows quiet moments quickly and rises very
          // slowly, so steady room noise is gated out but speech is not.
          if (rms < noiseFloor) noiseFloor += (rms - noiseFloor) * 0.12;
          else noiseFloor += (rms - noiseFloor) * 0.0025;
          noiseFloor = Math.min(0.03, Math.max(0.0004, noiseFloor));

          let target = 0;
          if (rms > noiseFloor * 2 + 0.003) {
            // Perceptual (dB) scale: about -50 dB (whisper) .. -16 dB (loud).
            const db = 20 * Math.log10(rms);
            target = Math.min(1, Math.max(0, (db + 50) / 34));
          }

          // Fast attack, slower release: bars jump with a syllable and fall away.
          envelope += (target - envelope) * (target > envelope ? 0.6 : 0.2);
          if (envelope > intervalPeak) intervalPeak = envelope;

          if (now - lastPush >= VOICE_BAR_INTERVAL_MS) {
            lastPush = now;
            history.copyWithin(0, 1);
            history[history.length - 1] = intervalPeak < 0.02 ? 0 : intervalPeak;
            intervalPeak = envelope;
            paint();
          }

          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        history.fill(0);
        paint();
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(track => track.stop());
      try { void context?.close(); } catch { /* already closed */ }
    };
  }, [paint]);

  return (
    <div
      ref={rootRef}
      className="flex h-8 w-full min-w-0 items-center justify-end overflow-hidden"
      aria-hidden="true"
    >
      <div className="flex h-8 items-center" style={{ gap: VOICE_BAR_GAP }}>
        {Array.from({ length: count }).map((_, index) => (
          <span
            key={index}
            ref={el => { barRefs.current[index] = el; }}
            className="block shrink-0 rounded-full bg-zinc-700 dark:bg-zinc-200"
            style={{
              width: VOICE_BAR_WIDTH,
              height: VOICE_BAR_MIN_HEIGHT,
              opacity: 0.45,
              transition: 'height 90ms ease-out, opacity 90ms ease-out',
            }}
          />
        ))}
      </div>
    </div>
  );
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
};

const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024; // matches the backend's per-file limit
const MAX_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024;

// Files are NEVER re-encoded, resized or recompressed. The exact bytes the
// user picked are what is uploaded, stored, previewed and downloaded.

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) {
        reject(new Error(`Failed to read ${file.name}`));
        return;
      }
      // Keep the exact browser-generated data URL. Do not add filename
      // parameters: PDF/image viewers can reject non-standard data URLs.
      resolve(result);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

const attachmentNameStorageKey = 'Twinkle-ai-attachment-names';

const getAttachmentStorageId = (value: string): string => {
  // Small deterministic hash so localStorage keys never contain the entire
  // (potentially huge) base64 data URL.
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const getStoredAttachmentName = (dataUrl: string): string | null => {
  if (!dataUrl) return null;
  try {
    const raw = localStorage.getItem(attachmentNameStorageKey);
    if (!raw) return null;
    const map = JSON.parse(raw);
    const value = map?.[getAttachmentStorageId(dataUrl)];
    return typeof value === 'string' && value.trim() ? value : null;
  } catch {
    return null;
  }
};

const rememberAttachmentNames = (files: File[], dataUrls: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(attachmentNameStorageKey);
    const map = raw ? JSON.parse(raw) : {};
    files.forEach((file, index) => {
      const dataUrl = dataUrls[index];
      if (dataUrl) {
        map[getAttachmentStorageId(dataUrl)] = file.name;
      }
    });

    // Prevent the small metadata store from growing forever.
    const entries = Object.entries(map);
    const limited = Object.fromEntries(entries.slice(-100));
    localStorage.setItem(attachmentNameStorageKey, JSON.stringify(limited));
  } catch {
    // Filename persistence is best-effort and must never block sending.
  }
};

const getAttachmentNameFromDataUrl = (
  dataUrl: string,
  index: number
): string => {
  // Read legacy filename parameters only for backwards compatibility.
  const nameMatch = dataUrl.match(/(?:^|;)name=([^;,]+)/i);

  if (nameMatch?.[1]) {
    try {
      return decodeURIComponent(nameMatch[1]);
    } catch {
      return nameMatch[1];
    }
  }

  const mimeMatch = dataUrl.match(/^data:([^;,]+)/i);
  const mime = mimeMatch?.[1]?.toLowerCase() || '';
  const extensionMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/json': 'json',
    'application/xml': 'xml',
    'text/xml': 'xml',
    'text/markdown': 'md',
  };

  const extension =
    extensionMap[mime] ||
    mime.split('/')[1]?.split('+')[0] ||
    'bin';

  return getStoredAttachmentName(dataUrl) || `attachment-${index + 1}.${extension}`;
};

// Rebuild any persisted data URL as a File. This is used for
// previewing and retrying attachments after the chat has been reloaded.
const isValidAttachmentDataUrl = (dataUrl: unknown): dataUrl is string => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return false;
  return /^data:[^;,]+(?:;[^,]*)?;base64,[A-Za-z0-9+/=\s]+$/i.test(dataUrl);
};

const dataUrlToFile = async (
  dataUrl: string,
  index: number,
  fallbackName?: string
): Promise<File> => {
  if (!isValidAttachmentDataUrl(dataUrl)) {
    throw new Error('The saved attachment is invalid.');
  }

  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
  if (!match) {
    throw new Error('The saved attachment is invalid.');
  }

  const mimeType = match[1] || 'application/octet-stream';
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extensionMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/json': 'json',
    'application/xml': 'xml',
    'text/xml': 'xml',
    'text/markdown': 'md',
  };

  const extension =
    extensionMap[mimeType] ||
    mimeType.split('/')[1]?.split('+')[0] ||
    'bin';

  const safeName =
    fallbackName?.trim() ||
    getAttachmentNameFromDataUrl(dataUrl, index) ||
    `attachment-${index + 1}.${extension}`;

  return new File([bytes], safeName, {
    type: mimeType,
    lastModified: Date.now(),
  });
};

interface ModelOption {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  vision?: boolean;
  documents?: boolean;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: '@cf/openai/gpt-oss-20b',
    name: 'Aurora 2.0',
    description: 'Brilliant everyday intelligence. Fast, sharp and dependable for any task',
    icon: Gem,
  },
  {
    id: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    name: 'Lumen 1.5',
    description: 'Near-instant answers at lightning speed when every second counts',
    icon: Zap,
  },
  {
    id: '@cf/openai/gpt-oss-120b',
    name: 'Zenith 3.0',
    description: 'Our flagship. Frontier-level reasoning, expert coding and deep analysis',
    icon: Brain,
  },
  {
    id: '@cf/black-forest-labs/flux-1-schnell',
    name: 'Atelier 1.0',
    description: 'Studio-quality images and artwork from a single sentence',
    icon: Palette,
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Oracle 2.0',
    description: 'Sees, reads and listens. Understands images, documents and audio in depth',
    icon: Eye,
    vision: true,
    documents: true,
  },
];

const MODEL_STORAGE_KEY = 'Twinkle_selected_model';

const EMPTY_CHAT_PROMPTS = [
  "What's on your mind today? 💡",
  "What would you like to explore? 🔍",
  "What can I help you with today? 😊",
  "What are you working on? 🛠️",
  "What would you like to create today? 🎨",
  "What should we figure out together? 🤝",
];

const getNextEmptyChatPrompt = (current: string): string => {
  if (EMPTY_CHAT_PROMPTS.length <= 1) return EMPTY_CHAT_PROMPTS[0];
  const available = EMPTY_CHAT_PROMPTS.filter(prompt => prompt !== current);
  return available[Math.floor(Math.random() * available.length)];
};

const EMPTY_CHAT_GREETINGS = [
  'Hello, {name}',
  'Welcome back, {name}',
  'Hi, {name}',
  'Hello there',
  'Ready when you are',
  'What’s on your mind?',
  'How can I help?',
  'Where should we start?',
];

const TIME_BASED_CHAT_GREETINGS = {
  morning: ['Good morning, {name}', 'Good morning'],
  afternoon: ['Good afternoon, {name}', 'Good afternoon'],
  evening: ['Good evening, {name}', 'Good evening'],
};

const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' => {
  const hour = new Date().getHours();

  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
};

// Each model greets in its own short voice.
const MODEL_GREETINGS: Record<string, string[]> = {
  '@cf/openai/gpt-oss-20b': ['Hi, {name}', 'What’s on your mind?', 'Ask me anything'],
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': ['Ready when you are', 'Hi, {name}', 'Go ahead'],
  '@cf/openai/gpt-oss-120b': ['Welcome, {name}', 'What shall we solve?', 'Where shall we begin?'],
  '@cf/black-forest-labs/flux-1-schnell': ['What shall we create?', 'Describe an image', 'Hello, {name}'],
  'gemini-3.8-flash': ['Show me something', 'Share a file or image', 'Hi, {name}'],
};

const getRandomChatGreeting = (userName = '', previousGreeting = '', modelId = ''): string => {
  const rawName = userName.trim().split(/\s+/)[0] || '';
  // Never greet someone with an email address or a username full of digits.
  const name = rawName.includes('@') ? rawName.split('@')[0] : rawName;
  const displayName = name ? name.charAt(0).toUpperCase() + name.slice(1) : '';

  // Fill {name}. Templates that need a name are dropped when there is none, so
  // the placeholder text can never reach the screen.
  const fill = (template: string): string | null => {
    if (!template.includes('{name}')) return template;
    return displayName ? template.replace(/\{name\}/g, displayName) : null;
  };

  const pool = (MODEL_GREETINGS[modelId] ?? [
    ...TIME_BASED_CHAT_GREETINGS[getTimeOfDay()],
    ...EMPTY_CHAT_GREETINGS,
  ])
    .map(fill)
    .filter((greeting): greeting is string => Boolean(greeting));

  const choices = [...new Set(pool)].filter(greeting => greeting !== previousGreeting);
  const available = choices.length ? choices : [...new Set(pool)];
  return available[Math.floor(Math.random() * available.length)] || 'What’s on your mind?';
};

const LongTailArrowDown = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14" />
    <path d="M19 12l-7 7-7-7" />
  </svg>
);






const getSpeechLanguage = (): string => {
  try {
    const code = localStorage.getItem('twinkle_app_language') || 'auto';
    const map: Record<string, string> = {
      en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', kn: 'Kannada',
      ml: 'Malayalam', bn: 'Bengali', mr: 'Marathi', gu: 'Gujarati', pa: 'Punjabi',
      ur: 'Urdu', ar: 'Arabic', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
      pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
      tr: 'Turkish', vi: 'Vietnamese', id: 'Indonesian', th: 'Thai', fil: 'Filipino',
    };
    return code === 'auto' ? 'the language spoken by the user' : (map[code] || code);
  } catch {
    return 'the language spoken by the user';
  }
};

export default function Chat({ user, onLogout, onSettings }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { chatUuid } = useParams<{ chatUuid?: string }>();
  // "/chats" shows the full "Chats and tasks" page over the chat area.
  const chatsView = location.pathname === '/chats';
  const creatingNewSessionRef = useRef(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [typingSessionTitle, setTypingSessionTitle] = useState<{ id: number; title: string } | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(() => readPersistedSessionId());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  // Shared prompt links use an opaque, unique share ID and keep the prompt out of
  // the readable query string. This is URL-safe encoding, not encryption.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encodedPrompt = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('p');
    if (params.has('share') && encodedPrompt) {
      try {
        const normalized = encodedPrompt.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
        const sharedPrompt = new TextDecoder().decode(bytes);
        setInput(sharedPrompt);
        window.history.replaceState({}, document.title, window.location.pathname);
        requestAnimationFrame(() => inputRef.current?.focus());
      } catch (error) {
        console.error('Could not decode shared prompt link:', error);
      }
    }
  }, []);
  const [isTyping, setIsTyping] = useState(false);
  const [responsePhase, setResponsePhase] = useState<'idle' | 'connecting' | 'thinking' | 'streaming'>('idle');
  const [thinkingContext, setThinkingContext] = useState<ThinkingContext>({ question: '', files: [] });
  const [loading, setLoading] = useState(true);
  const [justFinished, setJustFinished] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | string | null>(null);

  // Keep a Live token ready in the background so Read Aloud, the Mic and Live
  // Talk start instantly instead of waiting for a token round trip each time.
  useEffect(() => startLiveTokenKeepWarm(), []);
  const speechSocketRef = useRef<WebSocket | null>(null);
  const speechAudioContextRef = useRef<AudioContext | null>(null);
  const speechNextStartRef = useRef(0);
  const speechRequestRef = useRef(0);

  const stopReadAloud = useCallback(() => {
    speechRequestRef.current += 1;
    try { speechSocketRef.current?.close(1000, 'Read aloud stopped'); } catch {}
    speechSocketRef.current = null;
    if (speechAudioContextRef.current) {
      try { void speechAudioContextRef.current.close(); } catch {}
    }
    speechAudioContextRef.current = null;
    speechNextStartRef.current = 0;
    setSpeakingMessageId(null);
  }, []);

  // Read aloud uses Gemini Live audio output (not browser SpeechSynthesis).
  // The temporary token is requested from the existing server-side token route.
  const handleReadAloud = useCallback(async (message: Message) => {
    if (speakingMessageId === message.id) {
      stopReadAloud();
      return;
    }
    stopReadAloud();
    const requestId = ++speechRequestRef.current;
    const textToRead = cleanMessageContent(message.content).trim();
    if (!textToRead) return;

    try {
      // Prepare the audio pipeline while the Live token is being issued, so
      // browser audio initialization overlaps network latency just like Live Talk.
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser.');
      const audioContext: AudioContext = new AudioContextCtor();
      speechAudioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') await audioContext.resume();
      speechNextStartRef.current = audioContext.currentTime;

      const { token, model, apiVersion } = await createLiveToken('Charon', getSpeechLanguage());
      if (requestId !== speechRequestRef.current) return;

      const socket = new WebSocket(buildLiveSocketUrl(token, apiVersion));
      let speechSocketOpened = false;
      speechSocketRef.current = socket;
      setSpeakingMessageId(message.id);

      socket.onopen = () => {
        if (requestId !== speechRequestRef.current) { socket.close(); return; }
        speechSocketOpened = true;
        reportLiveSocketSuccess(apiVersion);
        // Gemini Live requires setupComplete before clientContent is sent.
        // Sending both frames immediately can race setup and leave Read Aloud silent.
        socket.send(JSON.stringify({
          setup: {
            model: `models/${model || 'gemini-3.8-live'}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
            },
            systemInstruction: { parts: [{ text: `Read the supplied text aloud exactly as written in ${getSpeechLanguage()}. Do not answer, summarize, or add any words.` }] },
          },
        }));
      };

      socket.onmessage = async event => {
        if (requestId !== speechRequestRef.current) return;
        try {
          const payload = await decodeGeminiLiveMessage(event.data);
          if (payload?.error) throw new Error(payload.error.message || 'Gemini audio generation failed.');
          if (payload?.setupComplete || payload?.setup_complete) {
            socket.send(JSON.stringify({
              clientContent: { turns: [{ role: 'user', parts: [{ text: `Read this text aloud exactly as written. Do not add commentary:

${textToRead}` }] }], turnComplete: true },
            }));
            return;
          }
          const parts = payload?.serverContent?.modelTurn?.parts || payload?.server_content?.model_turn?.parts || [];
          for (const part of parts) {
            const inline = part?.inlineData || part?.inline_data;
            const data = inline?.data;
            if (!data) continue;
            const binary = atob(data);
            const pcm = new Int16Array(Math.floor(binary.length / 2));
            for (let i = 0; i < pcm.length; i++) pcm[i] = (binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16;
            if (!pcm.length) continue;
            const context = speechAudioContextRef.current;
            if (!context) return;
            const buffer = context.createBuffer(1, pcm.length, 24000);
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
            const source = context.createBufferSource();
            source.buffer = buffer;
            // Read-aloud speed from Settings (1 = normal).
            const speed = loadPrefs().readAloudSpeed || 1;
            source.playbackRate.value = speed;
            source.connect(context.destination);
            const startAt = Math.max(context.currentTime + 0.008, speechNextStartRef.current);
            source.start(startAt);
            speechNextStartRef.current = startAt + buffer.duration / speed;
          }
          if (payload?.serverContent?.turnComplete || payload?.server_content?.turn_complete) {
            window.setTimeout(() => {
              if (requestId === speechRequestRef.current) stopReadAloud();
            }, Math.max(0, (speechNextStartRef.current - (speechAudioContextRef.current?.currentTime || 0)) * 1000));
          }
        } catch (error) {
          console.error('Gemini read aloud failed:', error);
          if (requestId === speechRequestRef.current) {
            stopReadAloud();
            toast.error(error instanceof Error ? error.message : 'Read aloud could not generate audio. Please try again.');
          }
        }
      };
      socket.onerror = () => {
        // Never opened = handshake rejected: use the other Live API version next time.
        if (!speechSocketOpened) reportLiveSocketFailure(apiVersion, token);
        if (requestId === speechRequestRef.current) {
          console.error('Gemini Live audio connection failed.');
          stopReadAloud();
          toast.error('Gemini read aloud could not connect. Please try again.');
        }
      };
      socket.onclose = () => {
        if (requestId === speechRequestRef.current && speechSocketRef.current === socket) {
          speechSocketRef.current = null;
        }
      };
    } catch (error) {
      console.error('Gemini read aloud failed:', error);
      if (requestId === speechRequestRef.current) {
        stopReadAloud();
        toast.error(error instanceof Error ? error.message : 'Gemini read aloud failed.');
      }
    }
  }, [speakingMessageId, stopReadAloud]);

  useEffect(() => () => {
    try { speechSocketRef.current?.close(); } catch {}
    if (speechAudioContextRef.current) void speechAudioContextRef.current.close().catch(() => undefined);
  }, []);
  const [editingMessage, setEditingMessage] = useState<{ id: string | number; content: string } | null>(null);
  const [editInput, setEditInput] = useState('');
  const [modalType, setModalType] = useState<'none' | 'delete-single'>('none');
  const [sessionIdToDelete, setSessionIdToDelete] = useState<number | null>(null);
  const [messageAttachments, setMessageAttachments] = useState<Record<string | number, string[]>>({});
  // Share popup: null = closed, -1 = open for a chat that is not saved yet, otherwise the session id.
  const [shareSessionId, setShareSessionId] = useState<number | null>(null);
  // Long chats: show only the latest messages until the user asks for more.
  const [showAllMessages, setShowAllMessages] = useState(false);
  useEffect(() => { setShowAllMessages(false); }, [currentSessionId]);
  const hiddenMessageCount = !showAllMessages && messages.length > 150 ? messages.length - 100 : 0;

  // Weather cards, keyed by the assistant message they belong to.
  const [weatherCards, setWeatherCards] = useState<Record<string, WeatherSnapshot>>(() => readWeatherCardStore());
  // Weather looked up while talking in Live Talk, per chat. It is shown as the same weather card
  // as in normal chat once the conversation has ended (and re-applied when the saved copy replaces the preview).
  const liveWeatherRef = useRef<Map<number, LiveWeatherEntry[]>>(new Map());
  const [liveWeatherVersion, setLiveWeatherVersion] = useState(0);
  useEffect(() => {
    if (currentSessionId === null) return;
    const entries = liveWeatherRef.current.get(currentSessionId);
    if (!entries || entries.length === 0) return;
    const assistants = messages.filter(message => message.role === 'assistant');
    const byIndex = new Map<number, WeatherSnapshot>();
    entries.forEach(entry => byIndex.set(entry.assistantIndex, entry.snapshot));

    const additions: Array<{ id: string; snapshot: WeatherSnapshot }> = [];
    byIndex.forEach((snapshot, index) => {
      const target = assistants[index];
      if (target && !weatherCards[String(target.id)]) additions.push({ id: String(target.id), snapshot });
    });
    if (additions.length === 0) return;

    additions.forEach(item => rememberWeatherCard([item.id], item.snapshot));
    setWeatherCards(prev => {
      const next = { ...prev };
      additions.forEach(item => { next[item.id] = item.snapshot; });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, currentSessionId, liveWeatherVersion]);

  // Search inside the current chat.
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchIndex, setChatSearchIndex] = useState(0);
  const chatSearchInputRef = useRef<HTMLInputElement>(null);

  // "Files in this chat" panel: every image / document attached in the open conversation.
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [uploadsModalOpen, setUploadsModalOpen] = useState(false);
  useEffect(() => { setFilesPanelOpen(false); setUploadsModalOpen(false); }, [currentSessionId]);
  // Files the assistant produced (generated images), listed under "Outputs".
  const chatOutputs = useMemo<ChatOutputItem[]>(() => {
    const items: ChatOutputItem[] = [];
    messages.forEach(message => {
      if (message.role !== 'assistant' || typeof message.content !== 'string' || message.content.indexOf('![') < 0) return;
      const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
      let match: RegExpExecArray | null;
      let index = 0;
      while ((match = pattern.exec(message.content)) !== null) {
        const src = match[2];
        if (!/^(data:image\/|https?:\/\/)/i.test(src)) continue;
        const name = imageDownloadName(src, match[1]);
        items.push({
          key: `out-${message.id}-${index}`,
          name,
          src,
          badge: name.split('.').pop()!.toUpperCase().slice(0, 5),
          messageId: message.id,
        });
        index += 1;
      }
    });
    return items;
  }, [messages]);
  const chatFiles = useMemo<ChatFileItem[]>(() => {
    const items: ChatFileItem[] = [];
    messages.forEach(message => {
      const urls = messageAttachments[message.id] || [];
      urls.filter(isValidAttachmentDataUrl).forEach((url, index) => {
        const mime = url.match(/^data:([^;,]+)/i)?.[1]?.toLowerCase() || '';
        const name = getStoredAttachmentName(url) || getAttachmentNameFromDataUrl(url, index);
        const extension = name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 5) : '';
        items.push({
          key: `${message.id}-${index}`,
          name,
          mime,
          url,
          messageId: message.id,
          index,
          badge: extension || mime.split('/')[1]?.toUpperCase().slice(0, 5) || 'FILE',
          kind: detectFileKind(name, mime),
        });
      });
    });
    return items;
  }, [messages, messageAttachments]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileOpenRef = useRef(false);
  mobileOpenRef.current = mobileOpen;

  // Swipe right from the left edge of the screen to open the sidebar (phones/tablets).
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = window.innerWidth < 1024 && event.touches.length === 1 && touch && touch.clientX <= 24
        ? { x: touch.clientX, y: touch.clientY }
        : null;
    };
    const onEnd = (event: TouchEvent) => {
      const origin = start;
      start = null;
      const touch = event.changedTouches[0];
      if (!origin || !touch || mobileOpenRef.current) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const dx = touch.clientX - origin.x;
      const dy = Math.abs(touch.clientY - origin.y);
      if (dx > 70 && dy < dx * 0.6) { haptic(10); setMobileOpen(true); }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(false);
  const [desktopSidebarWidth, setDesktopSidebarWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('Twinkle_sidebar_width');
      const stored = raw === null ? NaN : Number(raw);
      return Number.isFinite(stored) ? Math.min(440, Math.max(260, stored)) : 288;
    } catch {
      return 288;
    }
  });
  const [liveTalkOpen, setLiveTalkOpen] = useState(false);
  const [, setLiveTalkColor] = useState(() => getSavedLiveTalkColor());
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [voiceInputActive, setVoiceInputActive] = useState(false);
  const [voiceCaptureStopped, setVoiceCaptureStopped] = useState(false);


  useEffect(() => {
    const handleLiveTalkColorChange = () => {
      setLiveTalkColor(getSavedLiveTalkColor());
    };

    window.addEventListener('twinkle-live-talk-color-change', handleLiveTalkColorChange);
    window.addEventListener('storage', handleLiveTalkColorChange);

    return () => {
      window.removeEventListener('twinkle-live-talk-color-change', handleLiveTalkColorChange);
      window.removeEventListener('storage', handleLiveTalkColorChange);
    };
  }, []);

  // The Sidebar types the new name in. This is only a safety net so the
  // "typing" flag can never stay set if the Sidebar is collapsed/unmounted.
  useEffect(() => {
    if (!typingSessionTitle) return;
    const timer = window.setTimeout(() => setTypingSessionTitle(null), 3500);
    return () => window.clearTimeout(timer);
  }, [typingSessionTitle]);

  const sidebarSessions = sessions.map(session => ({
    ...session,
    sessionName: polishChatTitle(session.sessionName, session.sessionName || 'New Chat'),
  }));
  const sessionToDelete = sessions.find(session => session.id === sessionIdToDelete);
  // Keep the chat interface clean on login; the sidebar opens only when requested.

  // =============================================================
  // CHAT-STYLE VOICE DICTATION
  //
  // This is intentionally separate from Live Talk. Dictation uses the
  // browser's native SpeechRecognition engine so the microphone is opened
  // only once and words can appear in the composer immediately.
  // Live Talk keeps its own Gemini Live microphone/session implementation.
  // =============================================================
  const voiceBaseInputRef = useRef('');
  const voiceDraftRef = useRef('');
  const voiceFinalTranscriptRef = useRef('');
  const voiceInterimTranscriptRef = useRef('');
  const voiceStartRef = useRef(0);
  const voiceBrowserRecognitionRef = useRef<any>(null);
  const voiceBrowserRecognitionActiveRef = useRef(false);
  const voiceBrowserStopRequestedRef = useRef(false);
  const voiceStartInProgressRef = useRef(false);
  // Starting on pointer-down can leave a trailing click on the controls that
  // replace the mic button; ignore Cancel/Done for a moment after starting.
  const voiceUiStartedAtRef = useRef(0);
  const voiceDictationWantedRef = useRef(false);
  const voiceCommitInProgressRef = useRef(false);
  const voiceSpeechTimerRef = useRef<number | null>(null);
  // Fallback for browsers (notably Brave) where native SpeechRecognition
  // starts but returns the Google speech service `network` error. This uses
  // the same Gemini Live input-transcription path as Live Talk, without
  // changing the normal Mic flow when browser recognition works.
  const voiceGeminiSocketRef = useRef<WebSocket | null>(null);
  const voiceGeminiStreamRef = useRef<MediaStream | null>(null);
  const voiceGeminiAudioContextRef = useRef<AudioContext | null>(null);
  const voiceGeminiSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const voiceGeminiProcessorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const voiceGeminiSilentGainRef = useRef<GainNode | null>(null);
  const voiceGeminiFallbackActiveRef = useRef(false);
  // Identifies the current dictation run. A retry (or a stop) bumps it, so a
  // run that is still waiting on the microphone / worklet can tell that its
  // AudioContext was closed underneath it and quietly bail out.
  const voiceGeminiRunRef = useRef(0);
  const voiceGeminiPendingPcmRef = useRef<string[]>([]);
  // Audio may only be sent after the server's setupComplete frame.
  const voiceGeminiSetupDoneRef = useRef(false);
  const voiceGeminiRetryRef = useRef(0);
  const voiceGeminiBasicSetupRef = useRef(false);
  const startGeminiDictationFallbackRef = useRef<((attempt: number) => Promise<void>) | null>(null);
  const [, setVoiceDraftVersion] = useState(0);
  const [, setVoiceLiveTranscript] = useState('');
  const [voiceSpeechDetected, setVoiceSpeechDetected] = useState(false);

  const getSpeechRecognitionLanguage = useCallback((): string => {
    try {
      const code = localStorage.getItem('twinkle_app_language') || 'auto';
      const map: Record<string, string> = {
        en: 'en-US', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN',
        ml: 'ml-IN', bn: 'bn-IN', mr: 'mr-IN', gu: 'gu-IN', pa: 'pa-IN',
        ur: 'ur-PK', ar: 'ar-SA', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
        it: 'it-IT', pt: 'pt-PT', ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR',
        zh: 'zh-CN', tr: 'tr-TR', vi: 'vi-VN', id: 'id-ID', th: 'th-TH',
        fil: 'fil-PH',
      };
      return code === 'auto' ? (navigator.language || 'en-US') : (map[code] || code);
    } catch {
      return navigator.language || 'en-US';
    }
  }, []);

  const stopGeminiDictationFallback = useCallback(() => {
    voiceGeminiRunRef.current += 1;
    voiceGeminiFallbackActiveRef.current = false;
    voiceGeminiSetupDoneRef.current = false;
    voiceGeminiPendingPcmRef.current = [];

    try { voiceGeminiProcessorRef.current?.disconnect(); } catch {}
    try { voiceGeminiSourceRef.current?.disconnect(); } catch {}
    try { voiceGeminiSilentGainRef.current?.disconnect(); } catch {}
    voiceGeminiProcessorRef.current = null;
    voiceGeminiSourceRef.current = null;
    voiceGeminiSilentGainRef.current = null;

    voiceGeminiStreamRef.current?.getTracks().forEach(track => track.stop());
    voiceGeminiStreamRef.current = null;

    try { voiceGeminiSocketRef.current?.close(1000, 'Dictation stopped'); } catch {}
    voiceGeminiSocketRef.current = null;

    const dictationContext = voiceGeminiAudioContextRef.current;
    voiceGeminiAudioContextRef.current = null;
    if (dictationContext && dictationContext.state !== 'closed') {
      dictationContext.close().catch(() => undefined);
    }
  }, []);

  const startGeminiDictationFallback = useCallback(async (attempt: number) => {
    if (voiceGeminiFallbackActiveRef.current || !voiceDictationWantedRef.current) return;
    voiceGeminiFallbackActiveRef.current = true;
    voiceBrowserStopRequestedRef.current = true;
    const run = ++voiceGeminiRunRef.current;
    const isStale = () =>
      run !== voiceGeminiRunRef.current ||
      attempt !== voiceStartRef.current ||
      !voiceDictationWantedRef.current;

    const nativeRecognition = voiceBrowserRecognitionRef.current;
    try { nativeRecognition?.stop?.(); } catch {}
    voiceBrowserRecognitionRef.current = null;
    voiceBrowserRecognitionActiveRef.current = false;
    voiceStartInProgressRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      const tokenPromise = createLiveToken('Charon', getSpeechRecognitionLanguage());
      const streamPromise = navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamPromise.catch(() => undefined); // surfaced later; avoids an unhandled rejection

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser.');
      const context = new AudioContextCtor();
      voiceGeminiAudioContextRef.current = context;
      // Resume in parallel with everything else instead of blocking on it.
      const resumePromise: Promise<unknown> = context.state === 'suspended'
        ? context.resume().catch(() => undefined)
        : Promise.resolve();

      // Brave can expose AudioWorklet but still fail to construct the node after
      // loading a blob module. Do not make dictation depend on AudioWorklet:
      // keep it as a low-latency option and fall back to ScriptProcessorNode
      // when the worklet cannot be created. This keeps the microphone flow alive.
      let workletReadyPromise: Promise<void> = Promise.resolve();
      let workletLoaded = false;
      if (context.audioWorklet?.addModule) {
        try {
          const workletBlob = new Blob([pcmCaptureWorkletSource], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(workletBlob);
          workletReadyPromise = context.audioWorklet.addModule(workletUrl)
            .then(() => { workletLoaded = true; })
            .catch(() => undefined)
            .finally(() => URL.revokeObjectURL(workletUrl));
        } catch {
          workletReadyPromise = Promise.resolve();
        }
      }

      // Open the Gemini socket the moment the (pre-warmed) token is ready. The
      // microphone, AudioContext and worklet keep initializing in parallel, so
      // the network handshake no longer waits for them. Mic audio is buffered
      // until the socket is open.
      const { token, model, apiVersion } = await tokenPromise.catch(error => {
        streamPromise.then(s => s.getTracks().forEach(track => track.stop())).catch(() => undefined);
        throw error;
      });
      if (isStale()) {
        streamPromise.then(s => s.getTracks().forEach(track => track.stop())).catch(() => undefined);
        return;
      }

      // The ephemeral token is only valid on the API version that issued it.
      const socket = new WebSocket(buildLiveSocketUrl(token, apiVersion));
      let socketOpened = false;
      let setupDone = false;
      voiceGeminiSocketRef.current = socket;
      voiceGeminiSetupDoneRef.current = false;

      const flushPending = () => {
        if (socket.readyState !== WebSocket.OPEN || !voiceGeminiSetupDoneRef.current) return;
        const queued = voiceGeminiPendingPcmRef.current.splice(0);
        for (const data of queued) {
          try {
            socket.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } }));
          } catch {
            break;
          }
        }
      };

      socket.onopen = () => {
        if (isStale()) {
          try { socket.close(1000, 'Dictation stopped'); } catch {}
          return;
        }
        socketOpened = true;
        reportLiveSocketSuccess(apiVersion);

        // Tell the recogniser the language when the user picked one. If the
        // server rejects the hint (close 1007 before setupComplete) dictation
        // retries automatically with the plain setup.
        let explicitLanguage = false;
        try { explicitLanguage = (localStorage.getItem('twinkle_app_language') || 'auto') !== 'auto'; } catch {}
        const inputTranscription: Record<string, unknown> =
          explicitLanguage && !voiceGeminiBasicSetupRef.current
            ? { languageCodes: [getSpeechRecognitionLanguage()] }
            : {};

        socket.send(JSON.stringify({
          setup: {
            model: `models/${model || 'gemini-3.8-live'}`,
            generationConfig: { responseModalities: ['AUDIO'] },
            systemInstruction: {
              parts: [{
                text: `Twinkle speech-to-text mode. Transcribe the user's speech accurately. Preserve the user's wording and language. The selected language is ${getSpeechRecognitionLanguage()}. Do not translate the user's speech. Do not answer the user.`,
              }],
            },
            inputAudioTranscription: inputTranscription,
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                // 20 ms of lead-in clipped the first sound of every phrase
                // ("who" -> "how"). Keep ~250 ms so the whole word is sent.
                prefixPaddingMs: 250,
                silenceDurationMs: 500,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
              },
            },
          },
        }));
      };

      socket.onmessage = async event => {
        if (isStale()) return;
        try {
          const message = await decodeGeminiLiveMessage(event.data);
          if (message?.error) throw new Error(message.error.message || 'Gemini transcription failed.');
          if (message?.setupComplete) {
            setupDone = true;
            voiceGeminiSetupDoneRef.current = true;
            voiceGeminiRetryRef.current = 0;
            flushPending();
            return;
          }
          const finalText = String(message?.serverContent?.inputTranscription?.text || '')
            .replace(/\s+/g, ' ')
            .trim();
          const interimText = String(message?.serverContent?.interimInputTranscription?.text || '')
            .replace(/\s+/g, ' ')
            .trim();

          if (finalText) {
            voiceFinalTranscriptRef.current = `${voiceFinalTranscriptRef.current}${finalText}`
              .replace(/\s+/g, ' ')
              .trim();
            voiceInterimTranscriptRef.current = '';
          } else if (interimText) {
            voiceInterimTranscriptRef.current = interimText;
          } else {
            return;
          }

          const liveText = `${voiceFinalTranscriptRef.current}${voiceFinalTranscriptRef.current && voiceInterimTranscriptRef.current ? ' ' : ''}${voiceInterimTranscriptRef.current}`
            .replace(/\s+/g, ' ')
            .trim();
          voiceDraftRef.current = liveText;
          const composedText = `${voiceBaseInputRef.current}${voiceBaseInputRef.current && liveText ? ' ' : ''}${liveText}`.trim();
          setInput(composedText);
          setVoiceLiveTranscript(liveText);
          setVoiceDraftVersion(version => version + 1);
          setVoiceSpeechDetected(true);

          if (voiceSpeechTimerRef.current !== null) window.clearTimeout(voiceSpeechTimerRef.current);
          voiceSpeechTimerRef.current = window.setTimeout(() => {
            voiceSpeechTimerRef.current = null;
            if (attempt === voiceStartRef.current && voiceDictationWantedRef.current) {
              setVoiceSpeechDetected(false);
            }
          }, 450);
        } catch (error) {
          console.warn('Twinkle Gemini dictation message error:', error);
        }
      };

      socket.onerror = () => {
        // The close event that follows reports the details (and retries).
      };

      socket.onclose = (event) => {
        // A socket from an older run must not reset the current run's state.
        if (isStale()) return;
        if (voiceGeminiSocketRef.current === socket) voiceGeminiSocketRef.current = null;
        voiceGeminiSetupDoneRef.current = false;
        if (event.code !== 1000) {
          console.warn(`Twinkle Gemini dictation socket closed (code ${event.code}${event.reason ? `, ${event.reason}` : ''}, Live API ${apiVersion}).`);

          // Self-healing, at most twice per start. Text already received stays
          // in the composer.
          //  - never opened (a rejected handshake shows up as 1006): drop the
          //    token and retry on the other Live API version;
          //  - rejected setup (1007): retry without the optional hints.
          if (!setupDone && voiceGeminiRetryRef.current < 2) {
            let retry = true;
            if (!socketOpened) {
              reportLiveSocketFailure(apiVersion, token);
            } else if (event.code === 1007 && !voiceGeminiBasicSetupRef.current) {
              voiceGeminiBasicSetupRef.current = true;
            } else {
              retry = false;
            }
            if (retry) {
              voiceGeminiRetryRef.current += 1;
              stopGeminiDictationFallback();
              void startGeminiDictationFallbackRef.current?.(attempt);
            }
          }
        }
      };

      const [stream] = await Promise.all([streamPromise, workletReadyPromise, resumePromise]);
      // A retry or stop while the microphone was starting closes this run's
      // AudioContext. Building nodes on it would only log "context is closed"
      // warnings and fail to create the AudioWorkletNode, so release the
      // microphone and let the newer run take over.
      if (isStale() || context.state === 'closed') {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      voiceGeminiStreamRef.current = stream;

      const source = context.createMediaStreamSource(stream);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;

      const sendPcm = (buffer: ArrayBuffer) => {
        if (!voiceGeminiFallbackActiveRef.current || isStale()) return;
        const data = pcm16ToBase64(buffer);
        const liveSocket = voiceGeminiSocketRef.current;
        if (liveSocket?.readyState === WebSocket.OPEN && voiceGeminiSetupDoneRef.current) {
          try {
            liveSocket.send(JSON.stringify({
              realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } },
            }));
          } catch {
            // The socket close handler will clean up without interrupting capture.
          }
        } else {
          // About one second (~10 ms per chunk) is kept so the first word the
          // user says while the connection is still being set up is not lost.
          const queue = voiceGeminiPendingPcmRef.current;
          queue.push(data);
          if (queue.length > 100) queue.splice(0, queue.length - 100);
        }
      };

      // Prefer the AudioWorklet, but only when its module really loaded. The
      // ScriptProcessorNode path is a quiet compatibility fallback (it is
      // deprecated, so it is used only where the worklet is unavailable).
      const createCompatibilityProcessor = (): ScriptProcessorNode => {
        const scriptProcessor = context.createScriptProcessor(1024, 1, 1);
        const downsample = createPcm16Downsampler(context.sampleRate);
        scriptProcessor.onaudioprocess = event => {
          const pcm = downsample(event.inputBuffer.getChannelData(0));
          if (pcm.length) sendPcm(pcm.buffer as ArrayBuffer);
        };
        return scriptProcessor;
      };

      let processor: AudioWorkletNode | ScriptProcessorNode;
      if (workletLoaded) {
        try {
          const workletNode = new AudioWorkletNode(context, 'twinkle-pcm-capture');
          workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => sendPcm(event.data);
          processor = workletNode;
        } catch {
          processor = createCompatibilityProcessor();
        }
      } else {
        processor = createCompatibilityProcessor();
      }

      // Clean, unity-gain capture. The browser already applies echo
      // cancellation, noise suppression and AGC; an extra 2.6x gain plus a
      // -50 dB / 6:1 compressor on top pumped the noise floor and distorted
      // soft consonants, which is what turned "who are you" into "how are you".
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);

      voiceGeminiSourceRef.current = source;
      voiceGeminiProcessorRef.current = processor;
      voiceGeminiSilentGainRef.current = silentGain;

      // If setup already finished while the microphone was starting, send the
      // audio that was captured in the meantime.
      flushPending();
    } catch (error) {
      // An older run that was superseded (retry / stop) must not tear down the
      // run that replaced it.
      if (isStale()) return;
      console.warn('Twinkle Gemini dictation fallback failed:', error);
      stopGeminiDictationFallback();
      voiceDictationWantedRef.current = false;
      voiceStartRef.current += 1;
      setVoiceInputActive(false);
      toast.error('Voice input could not start. Check that microphone access is allowed for this site and try again.');
    }
  }, [stopGeminiDictationFallback, getSpeechRecognitionLanguage]);

  startGeminiDictationFallbackRef.current = startGeminiDictationFallback;

  const cleanupVoiceAudio = useCallback(() => {
    if (voiceSpeechTimerRef.current !== null) {
      window.clearTimeout(voiceSpeechTimerRef.current);
      voiceSpeechTimerRef.current = null;
    }

    stopGeminiDictationFallback();

    const recognition = voiceBrowserRecognitionRef.current;
    voiceBrowserStopRequestedRef.current = true;
    try { recognition?.stop?.(); } catch {}

    voiceBrowserRecognitionRef.current = null;
    voiceBrowserRecognitionActiveRef.current = false;
    setVoiceSpeechDetected(false);
  }, []);

  const cancelVoiceInput = useCallback(() => {
    voiceStartInProgressRef.current = false;
    voiceDictationWantedRef.current = false;
    voiceStartRef.current += 1;
    voiceBrowserStopRequestedRef.current = true;
    cleanupVoiceAudio();

    const restoreComposerValue = voiceBaseInputRef.current.trim();

    voiceDraftRef.current = '';
    voiceFinalTranscriptRef.current = '';
    voiceInterimTranscriptRef.current = '';
    voiceBaseInputRef.current = '';
    voiceCommitInProgressRef.current = false;

    setInput(restoreComposerValue);
    setVoiceLiveTranscript('');
    setVoiceDraftVersion(version => version + 1);
    setVoiceInputActive(false);
    setVoiceCaptureStopped(false);

    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [cleanupVoiceAudio]);

  const commitVoiceInput = useCallback(async (): Promise<string> => {
    if (!voiceInputActive || voiceCommitInProgressRef.current) return input.trim();

    voiceCommitInProgressRef.current = true;
    voiceDictationWantedRef.current = false;

    // Snapshot the transcript BEFORE stopping recognition. This is the key
    // difference from the previous implementation: Stop never waits for
    // onend, a WebSocket, a token, or a network round trip.
    const base = voiceBaseInputRef.current.trim();
    const spoken = `${voiceFinalTranscriptRef.current}${voiceFinalTranscriptRef.current && voiceInterimTranscriptRef.current ? ' ' : ''}${voiceInterimTranscriptRef.current}`
      .replace(/\s+/g, ' ')
      .trim();

    // The real composer value is authoritative while Gemini is streaming.
    // This prevents Stop/Send from clearing the transcript that is already
    // visible in the existing search bar.
    const currentComposerValue = input.trim();
    const combined = currentComposerValue !== base
      ? currentComposerValue
      : `${base}${base && spoken ? ' ' : ''}${spoken}`.trim();

    // Put the text into the real textarea immediately.
    flushSync(() => {
      setInput(combined);
      setVoiceLiveTranscript('');
      setVoiceDraftVersion(version => version + 1);
      setVoiceInputActive(false);
      setVoiceCaptureStopped(false);
    });

    // Stop recognition after the text has been committed. A late browser
    // callback cannot overwrite the normal composer because the attempt id is
    // invalidated first.
    voiceStartRef.current += 1;
    voiceBrowserStopRequestedRef.current = true;
    stopGeminiDictationFallback();
    const recognition = voiceBrowserRecognitionRef.current;
    try { recognition?.stop?.(); } catch {}
    voiceBrowserRecognitionRef.current = null;
    voiceBrowserRecognitionActiveRef.current = false;

    if (voiceSpeechTimerRef.current !== null) {
      window.clearTimeout(voiceSpeechTimerRef.current);
      voiceSpeechTimerRef.current = null;
    }

    voiceDraftRef.current = '';
    voiceFinalTranscriptRef.current = '';
    voiceInterimTranscriptRef.current = '';
    voiceBaseInputRef.current = '';
    voiceCommitInProgressRef.current = false;
    setVoiceSpeechDetected(false);

    window.setTimeout(() => {
      const textarea = inputRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(combined.length, combined.length);
    }, 0);

    return combined;
  }, [input, voiceInputActive, stopGeminiDictationFallback]);

  const stopVoiceCapture = useCallback(async () => {
    if (!voiceInputActive || voiceCaptureStopped || voiceCommitInProgressRef.current) return;
    // Disable the button immediately so double-clicks cannot create duplicate
    // commits.
    setVoiceCaptureStopped(true);
    await commitVoiceInput();
  }, [commitVoiceInput, voiceCaptureStopped, voiceInputActive]);

  const startVoiceInput = useCallback(() => {
    if (
      voiceStartInProgressRef.current ||
      voiceInputActive ||
      isTyping ||
      isProcessingFiles ||
      voiceCommitInProgressRef.current
    ) return;
    voiceUiStartedAtRef.current = Date.now();
    voiceStartInProgressRef.current = true;
    voiceDictationWantedRef.current = true;
    voiceGeminiRetryRef.current = 0;
    voiceGeminiBasicSetupRef.current = false;

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    // Brave can expose the Web Speech API but route recognition through a
    // browser speech service that frequently returns `network`. For Brave,
    // use the already-implemented Gemini realtime transcription path directly
    // so listening starts immediately and does not wait for that failure.
    const isBraveBrowser = Boolean((navigator as any).brave?.isBrave);
    if (isBraveBrowser || !SpeechRecognitionCtor) {
      const attempt = ++voiceStartRef.current;
      voiceBrowserStopRequestedRef.current = false;
      voiceCommitInProgressRef.current = false;
      voiceBaseInputRef.current = input.trim();
      voiceDraftRef.current = '';
      voiceFinalTranscriptRef.current = '';
      voiceInterimTranscriptRef.current = '';
      setVoiceLiveTranscript('');
      setVoiceCaptureStopped(false);
      setVoiceSpeechDetected(false);

      // Enter listening state before the realtime handshake so the Mic feels
      // immediate. The transcript itself continues to arrive asynchronously.
      flushSync(() => {
        setVoiceDraftVersion(version => version + 1);
        setVoiceInputActive(true);
      });

      void startGeminiDictationFallback(attempt);
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    const attempt = ++voiceStartRef.current;
    voiceBrowserStopRequestedRef.current = false;
    voiceCommitInProgressRef.current = false;
    voiceBaseInputRef.current = input.trim();
    voiceDraftRef.current = '';
    voiceFinalTranscriptRef.current = '';
    voiceInterimTranscriptRef.current = '';
    setVoiceLiveTranscript('');
    setVoiceCaptureStopped(false);
    setVoiceSpeechDetected(false);

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = getSpeechRecognitionLanguage();

    recognition.onstart = () => {
      if (attempt !== voiceStartRef.current) return;
      voiceStartInProgressRef.current = false;
      voiceBrowserRecognitionActiveRef.current = true;
      voiceBrowserRecognitionRef.current = recognition;
      flushSync(() => {
        setVoiceDraftVersion(version => version + 1);
        setVoiceInputActive(true);
      });
    };

    recognition.onresult = (event: any) => {
      if (attempt !== voiceStartRef.current || voiceBrowserStopRequestedRef.current) return;

      let finalText = voiceFinalTranscriptRef.current;
      let interimText = '';

      for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = String(result?.[0]?.transcript || '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!text) continue;

        if (result?.isFinal) {
          // Chrome can emit a final result immediately after an interim result.
          // Only append genuinely new final text.
          const normalized = text.toLowerCase();
          if (!finalText.toLowerCase().endsWith(normalized)) {
            finalText = `${finalText}${finalText ? ' ' : ''}${text}`
              .replace(/\s+/g, ' ')
              .trim();
          }
        } else {
          interimText = `${interimText}${interimText ? ' ' : ''}${text}`
            .replace(/\s+/g, ' ')
            .trim();
        }
      }

      voiceFinalTranscriptRef.current = finalText;
      voiceInterimTranscriptRef.current = interimText;

      const liveText = `${finalText}${finalText && interimText ? ' ' : ''}${interimText}`
        .replace(/\s+/g, ' ')
        .trim();
      voiceDraftRef.current = liveText;

      // Keep the real search/composer value synchronized while listening.
      // This is important in Brave: the transcript must be the actual textarea
      // value, not only a separate listening preview.
      const composedText = `${voiceBaseInputRef.current}${voiceBaseInputRef.current && liveText ? ' ' : ''}${liveText}`.trim();
      setInput(composedText);
      setVoiceLiveTranscript(liveText);
      setVoiceDraftVersion(version => version + 1);
      setVoiceSpeechDetected(true);

      if (voiceSpeechTimerRef.current !== null) {
        window.clearTimeout(voiceSpeechTimerRef.current);
      }
      voiceSpeechTimerRef.current = window.setTimeout(() => {
        voiceSpeechTimerRef.current = null;
        if (attempt === voiceStartRef.current && !voiceBrowserStopRequestedRef.current) {
          setVoiceSpeechDetected(false);
        }
      }, 450);
    };

    recognition.onerror = (event: any) => {
      if (attempt !== voiceStartRef.current) return;
      const error = String(event?.error || '');

      if (error === 'not-allowed' || error === 'service-not-allowed') {
        voiceBrowserRecognitionActiveRef.current = false;
        voiceBrowserRecognitionRef.current = null;
        voiceStartInProgressRef.current = false;
        voiceStartRef.current += 1;
        setVoiceInputActive(false);
        setVoiceCaptureStopped(false);
        setVoiceLiveTranscript('');
        toast.error('Microphone permission was denied. Allow microphone access for this site and try again.');
        return;
      }

      if (error === 'audio-capture') {
        voiceBrowserRecognitionActiveRef.current = false;
        voiceBrowserRecognitionRef.current = null;
        voiceStartInProgressRef.current = false;
        voiceDictationWantedRef.current = false;
        voiceStartRef.current += 1;
        setVoiceInputActive(false);
        setVoiceCaptureStopped(false);
        setVoiceLiveTranscript('');
        toast.error('No microphone was found. Connect a microphone and try again.');
        return;
      }

      // Any other error must not leave the start guard stuck, otherwise the
      // Mic button stops responding.
      voiceStartInProgressRef.current = false;

      // Brave and some Chromium builds can return `network` even though the
      // microphone itself is working. Fall back to Gemini Live transcription
      // so spoken words still become text instead of leaving the composer blank.
      if (error === 'network') {
        void startGeminiDictationFallback(attempt);
        return;
      }

      // `no-speech` and `aborted` are handled by onend while the user is still
      // in dictation mode.
      console.warn('Twinkle voice recognition:', error || 'unknown error');
    };

    recognition.onend = () => {
      if (attempt !== voiceStartRef.current) return;

      voiceBrowserRecognitionActiveRef.current = false;

      if (voiceBrowserStopRequestedRef.current || voiceGeminiFallbackActiveRef.current || !voiceDictationWantedRef.current) {
        voiceBrowserRecognitionRef.current = null;
        return;
      }

      // Chrome ends SpeechRecognition after periods of silence even when
      // continuous=true. Restart it without clearing the accumulated text.
      window.setTimeout(() => {
        if (
          attempt !== voiceStartRef.current ||
          voiceBrowserStopRequestedRef.current ||
          !voiceDictationWantedRef.current
        ) return;

        try {
          recognition.start();
        } catch {
          // A start while Chrome is still closing is harmless; onend will retry.
        }
      }, 120);
    };

    voiceBrowserRecognitionRef.current = recognition;
    // Make the listening state immediate; native SpeechRecognition can fire
    // onstart slightly later even though the user has already pressed Mic.
    flushSync(() => {
      setVoiceDraftVersion(version => version + 1);
      setVoiceInputActive(true);
    });
    try {
      recognition.start();
    } catch (error) {
      voiceStartInProgressRef.current = false;
      voiceBrowserRecognitionRef.current = null;
      voiceBrowserRecognitionActiveRef.current = false;
      setVoiceInputActive(false);
      const message = error instanceof Error ? error.message : 'Unable to start voice dictation.';
      toast.error(message);
    }
  }, [getSpeechRecognitionLanguage, input, isProcessingFiles, isTyping, voiceInputActive, startGeminiDictationFallback]);

  useEffect(() => () => {
    voiceStartInProgressRef.current = false;
    voiceDictationWantedRef.current = false;
    voiceStartRef.current += 1;
    voiceBrowserStopRequestedRef.current = true;
    stopGeminiDictationFallback();
    try { voiceBrowserRecognitionRef.current?.stop?.(); } catch {}
    voiceBrowserRecognitionRef.current = null;
    if (voiceSpeechTimerRef.current !== null) {
      window.clearTimeout(voiceSpeechTimerRef.current);
      voiceSpeechTimerRef.current = null;
    }
  }, [stopGeminiDictationFallback]);


  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(MODEL_STORAGE_KEY);
      return stored && MODEL_OPTIONS.some(option => option.id === stored)
        ? stored
        : MODEL_OPTIONS[0].id;
    } catch {
      return MODEL_OPTIONS[0].id;
    }
  });
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelMoreOpen, setModelMoreOpen] = useState(false);
  // Desktop: "More models" opens a flyout (portal, so the popup's scroll area can't clip it).
  const [modelFlyout, setModelFlyout] = useState<{ left: number; bottom: number } | null>(null);
  const moreRowRef = useRef<HTMLButtonElement>(null);
  const flyoutCloseTimer = useRef<number | null>(null);
  const flyoutPinned = useRef(false);
  useEffect(() => { if (!modelPickerOpen) { flyoutPinned.current = false; setModelMoreOpen(false); setModelFlyout(null); } }, [modelPickerOpen]);

  const cancelFlyoutClose = () => {
    if (flyoutCloseTimer.current !== null) { window.clearTimeout(flyoutCloseTimer.current); flyoutCloseTimer.current = null; }
  };
  const scheduleFlyoutClose = () => {
    cancelFlyoutClose();
    if (flyoutPinned.current) return; // clicked open: stay until toggled or a model is chosen
    flyoutCloseTimer.current = window.setTimeout(() => setModelFlyout(null), 160);
  };
  const openModelFlyout = (): boolean => {
    const row = moreRowRef.current;
    if (!row || window.innerWidth < 768) return false;
    cancelFlyoutClose();
    const rect = row.getBoundingClientRect();
    const width = 300;
    let left = rect.right + 8;
    if (left + width > window.innerWidth - 8) left = rect.left - 8 - width;
    if (left < 8) return false;
    setModelFlyout({ left, bottom: Math.max(8, window.innerHeight - rect.bottom - 8) });
    return true;
  };
  const [, setEmptyChatPrompt] = useState(() =>
    EMPTY_CHAT_PROMPTS[Math.floor(Math.random() * EMPTY_CHAT_PROMPTS.length)]
  );
  const [chatGreeting, setChatGreeting] = useState(() => getRandomChatGreeting(user?.name || user?.username || '', '', selectedModel));
  const chatGreetingRef = useRef(chatGreeting);
  useEffect(() => { chatGreetingRef.current = chatGreeting; }, [chatGreeting]);

  // Composer placeholder: "Ask Anything" on phones, the longer prompt on laptop/PC.
  const [isPhoneViewport, setIsPhoneViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const sync = () => setIsPhoneViewport(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const [showFirstWelcome, setShowFirstWelcome] = useState(false);
  const welcomeSession = useMemo<Session>(() => {
    const now = new Date().toISOString();
    return {
      id: WELCOME_SESSION_ID,
      userId: String(user?.id ?? ''),
      sessionName: WELCOME_SESSION_TITLE,
      createdAt: now,
      updatedAt: now,
    };
  }, [user?.id, showFirstWelcome]);
  const welcomeName = (user?.name || user?.username || '').trim().split(/\s+/)[0] || 'there';

  // Pick a fresh greeting every time an empty draft chat is shown (New Chat
  // button, shortcut, logo click, browser back to "/"), like ChatGPT/Claude.
  useEffect(() => {
    if (currentSessionId !== null) return;
    const nextGreeting = getRandomChatGreeting(user?.name || user?.username || '', chatGreetingRef.current, selectedModel);
    chatGreetingRef.current = nextGreeting;
    setChatGreeting(nextGreeting);
    setEmptyChatPrompt(current => getNextEmptyChatPrompt(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId, selectedModel]);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // File upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ id: string; file: File; preview?: string }[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  // "+" menu: Upload or add files / Take a screenshot.
  const [plusMenu, setPlusMenu] = useState<{ left: number; bottom: number } | null>(null);
  const plusMenuRef = useRef<HTMLDivElement | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, 'up' | 'down'>>(() => {
    try {
      return JSON.parse(localStorage.getItem('twinkle_message_feedback_v1') || '{}') || {};
    } catch {
      return {};
    }
  });
  const setFeedback = (id: string | number, value: 'up' | 'down') => {
    setMessageFeedback(prev => {
      const next = { ...prev };
      if (next[String(id)] === value) delete next[String(id)];
      else next[String(id)] = value;
      window.setTimeout(() => toast.success(next[String(id)] ? 'Thanks for your feedback' : 'Feedback removed', { id: 'message-feedback' }), 0);
      try {
        localStorage.setItem('twinkle_message_feedback_v1', JSON.stringify(next));
      } catch { /* storage may be blocked */ }
      return next;
    });
  };


  // Theme
  // Apply the saved theme before the first paint.
  useState<boolean>(() => {
    const dark = getInitialTheme();
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', dark);
    }
    return dark;
  });

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if ((target as Element).closest?.('[data-model-flyout]')) return;
      if (modelPickerRef.current && !modelPickerRef.current.contains(target)) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  
const chooseModel = useCallback((modelId: string) => {
  const option = MODEL_OPTIONS.find(item => item.id === modelId);
  if (!option) return;

  setSelectedModel(modelId);

  try {
    localStorage.setItem(MODEL_STORAGE_KEY, modelId);
    window.dispatchEvent(new CustomEvent('twinkle:model-changed', { detail: { modelId } }));
  } catch {
    
  }

  setModelPickerOpen(false);
}, []);

  // Keep the composer selector in sync if another tab/component changes the model.
  useEffect(() => {
    const syncModel = (value?: string) => {
      const candidate = value || localStorage.getItem(MODEL_STORAGE_KEY) || '';
      const option = MODEL_OPTIONS.find(item => item.id === candidate);
      if (option) setSelectedModel(candidate);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODEL_STORAGE_KEY) syncModel(event.newValue || undefined);
    };
    const onModelChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ modelId?: string }>).detail;
      syncModel(detail?.modelId);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('twinkle:model-changed', onModelChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('twinkle:model-changed', onModelChanged);
    };
  }, []);

  const activeModel = MODEL_OPTIONS.find(m => m.id === selectedModel) || MODEL_OPTIONS[0];
  const selectedModelName = activeModel.name;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const emptyGreetingRef = useRef<HTMLDivElement>(null);
  const [emptyComposerTop, setEmptyComposerTop] = useState<number | null>(null);
  useEffect(() => {
    const isEmptyChat = messages.length === 0 && !isTyping;
    if (!isEmptyChat) {
      setEmptyComposerTop(null);
      return;
    }

    const updateEmptyComposerPosition = () => {
      const greeting = emptyGreetingRef.current;
      if (!greeting) return;
      const rect = greeting.getBoundingClientRect();
      const composerHeight = window.innerWidth <= 640 ? 120 : 112;
      const gap = showFirstWelcome ? 40 : 32;
      const maxTop = Math.max(16, window.innerHeight - composerHeight - 12);
      setEmptyComposerTop(Math.round(Math.min(rect.bottom + gap, maxTop)));
    };

    updateEmptyComposerPosition();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateEmptyComposerPosition)
      : null;
    if (emptyGreetingRef.current) observer?.observe(emptyGreetingRef.current);
    window.addEventListener('resize', updateEmptyComposerPosition);
    window.addEventListener('orientationchange', updateEmptyComposerPosition);
    // The welcome text fades in with a small slide; measure again once it settles.
    const settleTimer = showFirstWelcome ? window.setTimeout(updateEmptyComposerPosition, 450) : null;
    return () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      observer?.disconnect();
      window.removeEventListener('resize', updateEmptyComposerPosition);
      window.removeEventListener('orientationchange', updateEmptyComposerPosition);
    };
  }, [messages.length, isTyping, showFirstWelcome]);

  // The composer is a fixed overlay, so its height is measured and the message
  // viewport is shortened by exactly that much. Messages therefore stop (are
  // hidden) at the top edge of the composer instead of scrolling behind it, and
  // the message column and composer share the same centre line.
  const composerWrapRef = useRef<HTMLDivElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  useEffect(() => {
    const el = composerWrapRef.current;
    if (!el) return;
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().height);
      const container = messagesContainerRef.current;
      const wasNearBottom = container
        ? container.scrollHeight - container.scrollTop - container.clientHeight < 80
        : false;
      setComposerHeight(prev => (prev === next ? prev : next));
      if (container && wasNearBottom) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const firstMessageScrollPendingRef = useRef(false);
  const autoFollowScrollRef = useRef(true);
  const isSendingRef = useRef(false);
  // Locks the short async preparation phase before sendMessage() acquires
  // isSendingRef. This prevents rapid double-clicks / duplicate key events
  // from creating two backend requests for the same user message.
  const sendPreparationLockRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingAssistantIdRef = useRef<string | null>(null);
  const streamReceivedTextRef = useRef('');
  // Prevent a background history refresh from replacing the local response
  // while that response is still being generated.
  const activeResponseSessionRef = useRef<number | null>(null);

  // The backend already provides real SSE deltas. Do not simulate a
  // typewriter effect. We only coalesce deltas that arrive during the same
  // browser frame, so React paints the real stream smoothly without inventing
  // a slower character-by-character cadence.
  const streamRenderQueueRef = useRef('');
  const streamRenderTimerRef = useRef<number | null>(null);
  const streamDrainResolverRef = useRef<(() => void) | null>(null);

  const flushStreamRenderQueue = useCallback(() => {
    streamRenderTimerRef.current = null;
    const streamId = streamingAssistantIdRef.current;
    if (!streamId) return;

    const queue = streamRenderQueueRef.current;
    if (!queue) {
      const resolve = streamDrainResolverRef.current;
      streamDrainResolverRef.current = null;
      resolve?.();
      return;
    }

    // Release the queue gradually instead of in one burst. When the network or
    // a proxy delivers several deltas at once, this spreads them over a few
    // frames so the answer flows smoothly instead of appearing in jumps.
    // Inline image data must arrive in one piece: dripping 100s of KB of base64
    // through the Markdown renderer frame by frame is slow and flashes raw data.
    let take = queue.length <= 12 || queue.includes('](data:image/') ? queue.length : Math.ceil(queue.length / 6);
    const lastUnit = queue.charCodeAt(take - 1);
    if (take < queue.length && lastUnit >= 0xd800 && lastUnit <= 0xdbff) take += 1; // keep emoji pairs intact
    const chunkToRender = queue.slice(0, take);
    streamRenderQueueRef.current = queue.slice(take);
    setResponsePhase('streaming');
    setMessages(prev => {
      const index = prev.findIndex(message => message.id === streamId);
      if (index < 0) return prev;
      return prev.map(message =>
        message.id === streamId
          ? { ...message, content: message.content + chunkToRender }
          : message
      );
    });

    // More text is still queued: keep rendering on the next frame. Only
    // resolve a pending drain once the queue is completely empty.
    if (streamRenderQueueRef.current) {
      startStreamRenderer();
    } else {
      const resolve = streamDrainResolverRef.current;
      if (resolve) {
        streamDrainResolverRef.current = null;
        resolve();
      }
    }

    if (autoFollowScrollRef.current) {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
    }
  }, []);

  const startStreamRenderer = useCallback(() => {
    if (streamRenderTimerRef.current !== null) return;
    streamRenderTimerRef.current = window.requestAnimationFrame(flushStreamRenderQueue);
  }, [flushStreamRenderQueue]);

  const drainStreamRenderer = useCallback(() => {
    if (!streamRenderQueueRef.current) return Promise.resolve();
    return new Promise<void>(resolve => {
      streamDrainResolverRef.current = resolve;
      startStreamRenderer();
    });
  }, [startStreamRenderer]);

  const cancelStreamRenderer = useCallback(() => {
    streamRenderQueueRef.current = '';
    if (streamRenderTimerRef.current !== null) {
      window.cancelAnimationFrame(streamRenderTimerRef.current);
      streamRenderTimerRef.current = null;
    }
    const resolve = streamDrainResolverRef.current;
    streamDrainResolverRef.current = null;
    resolve?.();
  }, []);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Stores the specific session ID that should skip one message load
  // (the newly created session after first send), so switching to any
  // OTHER existing session always loads its messages correctly.
  const skipMessageLoadRef = useRef<number | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    return () => cancelStreamRenderer();
  }, [cancelStreamRenderer]);

  // Clean up object URLs
  const filePreviewsRef = useRef(filePreviews);
  useEffect(() => { filePreviewsRef.current = filePreviews; }, [filePreviews]);
  useEffect(() => {
    return () => {
      filePreviewsRef.current.forEach(fp => {
        if (fp.preview) URL.revokeObjectURL(fp.preview);
      });
    };
  }, []);

  // Decide once the session list has loaded whether this is a brand-new
  // account that has not chatted yet, and dismiss the welcome as soon as the
  // user starts or opens a chat.
  useEffect(() => {
    if (loading || !user?.id) return;
    if (
      isRecentlyCreated(user.createdAt) &&
      !hasSeenWelcome(String(user.id)) &&
      sessions.length === 0 &&
      messages.length === 0 &&
      currentSessionId === null
    ) {
      setShowFirstWelcome(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id]);

  useEffect(() => {
    if (!showFirstWelcome || !user?.id) return;
    if (messages.length > 0 || isTyping || currentSessionId !== null) {
      markWelcomeSeen(String(user.id));
      setShowFirstWelcome(false);
    }
  }, [showFirstWelcome, messages.length, isTyping, currentSessionId, user?.id]);

  // Load sessions & messages
  const loadSessions = useCallback(async () => {
    try {
      const response = await chatApi.getSessions() as any;
      setSessions(response.sessions || []);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      if (err.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  // Live Talk persists turns in the background. Update the same sidebar state
  // immediately instead of forcing another GET /chat/sessions request.
  useEffect(() => {
    const handleLiveSessionUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ id: number; sessionName?: string; publicId?: string }>).detail;
      if (!detail?.id) return;

      const now = new Date().toISOString();
      setSessions(prev => {
        const existing = prev.find(session => session.id === detail.id);
        if (existing) {
          const updated = {
            ...existing,
            publicId: existing.publicId || detail.publicId,
            sessionName: detail.sessionName || existing.sessionName,
            updatedAt: now,
          };
          return [updated, ...prev.filter(session => session.id !== detail.id)];
        }

        return [
          {
            id: detail.id,
            publicId: detail.publicId,
            userId: user.id,
            sessionName: detail.sessionName || 'Live Talk',
            createdAt: now,
            updatedAt: now,
          },
          ...prev,
        ];
      });
    };

    window.addEventListener('twinkle-live-session-updated', handleLiveSessionUpdate);
    return () => window.removeEventListener('twinkle-live-session-updated', handleLiveSessionUpdate);
  }, [user.id]);

  const handledChatUuidRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<number | null>(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

  // Opening a chat reads it: the unread dot goes away.
  useEffect(() => {
    if (currentSessionId !== null) setChatUnread(currentSessionId, false);
  }, [currentSessionId]);
  const sessionsRef = useRef<Session[]>(sessions);
  sessionsRef.current = sessions;

  // Chats this tab knows are gone (deleted, cleared, or reported missing by the
  // server). They are never requested again, so a stale id or URL cannot cause
  // a burst of 404 requests and "Failed to load messages" console errors.
  const goneChatsRef = useRef<{ ids: Set<number>; publicIds: Set<string> }>({
    ids: new Set(),
    publicIds: new Set(),
  });
  const markChatsGone = useCallback((items: Array<{ id?: number; publicId?: string }>) => {
    for (const item of items) {
      if (typeof item.id === 'number' && Number.isFinite(item.id)) goneChatsRef.current.ids.add(item.id);
      if (item.publicId) goneChatsRef.current.publicIds.add(item.publicId.toLowerCase());
    }
  }, []);

  // The chat id restored from localStorage is only a hint: the chat may have
  // been deleted since. It is verified against the loaded chat list before its
  // history is requested.
  const restoredSessionIdRef = useRef<number | null>(currentSessionId);

  // ── Instant chat switching ────────────────────────────────────────────────
  // Recently opened chats are kept in memory and painted immediately, then
  // refreshed from the existing history endpoint in the background. Hovering /
  // pressing a chat in the sidebar loads it before the click completes.
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const messageAttachmentsRef = useRef<Record<string | number, string[]>>(messageAttachments);
  messageAttachmentsRef.current = messageAttachments;
  const messageCacheRef = useRef<Map<number, { messages: Message[]; attachments: Record<string | number, string[]> }>>(new Map());
  const prefetchingRef = useRef<Set<number>>(new Set());
  const prevCachedSessionRef = useRef<number | null>(null);

  const rememberSession = useCallback((sid: number, entry: { messages: Message[]; attachments: Record<string | number, string[]> }) => {
    const cache = messageCacheRef.current;
    cache.delete(sid);
    cache.set(sid, entry);
    while (cache.size > 15) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }, []);

  const normalizeHistory = (sid: number, rawMessages: any[]) => {
    const normalized: Message[] = rawMessages.map((msg: any, index: number) => ({
      id: msg?.id ?? `history-${sid}-${index}`,
      sessionId: Number(msg?.sessionId ?? sid),
      role: msg?.role === 'user' ? 'user' : 'assistant',
      content: cleanMessageContent(msg?.content),
      timestamp: msg?.timestamp || new Date().toISOString(),
    }));
    const attachments: Record<string | number, string[]> = {};
    rawMessages.forEach((msg: any, index: number) => {
      const id = msg?.id ?? `history-${sid}-${index}`;
      if (Array.isArray(msg?.attachments) && msg.attachments.length > 0) {
        attachments[id] = msg.attachments.filter((url: unknown): url is string => isValidAttachmentDataUrl(url));
      }
    });
    return { messages: dedupeMessages(normalized), attachments };
  };

  const loadMessages = useCallback(async (sid: number): Promise<Message[] | null> => {
    // The streaming request owns the local message state while it is active.
    // Do not hydrate the same session from history during that window; doing
    // so can insert the persisted first answer and then the final SSE answer.
    if (isSendingRef.current && activeResponseSessionRef.current === sid) {
      return null;
    }
    if (goneChatsRef.current.ids.has(sid)) return null;

    try {
      const response = await chatApi.getMessages(sid) as any;
      // The user may have opened another chat while this request was in flight.
      if (currentSessionIdRef.current !== null && currentSessionIdRef.current !== sid) return null;
      const rawMessages = Array.isArray(response?.messages) ? response.messages : [];
      const { messages: finalMessages, attachments } = normalizeHistory(sid, rawMessages);

      setMessages(finalMessages);
      setMessageAttachments(attachments);
      rememberSession(sid, { messages: finalMessages, attachments });
      return finalMessages;
    } catch (err: any) {
      if (err?.status === 404) {
        // The chat no longer exists (deleted elsewhere, or a stale id). This is
        // an expected state, not an error: forget it and return to a fresh chat.
        const missing = sessionsRef.current.find(session => session.id === sid);
        markChatsGone([{ id: sid, publicId: missing?.publicId }]);
        messageCacheRef.current.delete(sid);
        setSessions(prev => prev.filter(session => session.id !== sid));
        if (currentSessionIdRef.current === sid) {
          setCurrentSessionId(null);
          persistSessionId(null);
          setMessages([]);
          setMessageAttachments({});
          if (window.location.pathname.startsWith('/chat/')) navigate('/', { replace: true });
        }
        return null;
      }
      console.error('Failed to load messages:', err);
      if (err?.status === 401) onLogout();
      return null;
    }
  }, [onLogout, rememberSession, markChatsGone, navigate]);

  // Warm the cache when the pointer reaches a chat in the sidebar.
  useEffect(() => {
    const onPrefetch = (event: Event) => {
      const sid = Number((event as CustomEvent<number>).detail);
      if (!Number.isFinite(sid) || sid <= 0) return;
      if (sid === currentSessionIdRef.current) return;
      if (messageCacheRef.current.has(sid) || prefetchingRef.current.has(sid)) return;
      prefetchingRef.current.add(sid);
      void (async () => {
        try {
          const response = await chatApi.getMessages(sid) as any;
          const rawMessages = Array.isArray(response?.messages) ? response.messages : [];
          const { messages: prefetched, attachments } = normalizeHistory(sid, rawMessages);
          if (!messageCacheRef.current.has(sid)) {
            rememberSession(sid, { messages: prefetched, attachments });
          }
        } catch {
          /* prefetch is best-effort */
        } finally {
          prefetchingRef.current.delete(sid);
        }
      })();
    };
    window.addEventListener('twinkle-prefetch-session', onPrefetch);
    return () => window.removeEventListener('twinkle-prefetch-session', onPrefetch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rememberSession]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Resolve /chat/{uuid} from the backend, not only from the currently loaded
  // sidebar list. A missing local session is not proof that the chat is invalid.
  useEffect(() => {
    if (creatingNewSessionRef.current || loading || !chatUuid) return;

    let cancelled = false;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(chatUuid)) {
      setMessages([]);
      setCurrentSessionId(null);
      persistSessionId(null);
      toast.error('That chat could not be found.', { id: 'chat-not-found' });
      navigate('/', { replace: true });
      return;
    }

    // A chat deleted in this tab: do not ask the server about it again.
    if (goneChatsRef.current.publicIds.has(chatUuid.toLowerCase())) {
      setMessages([]);
      setCurrentSessionId(null);
      persistSessionId(null);
      navigate('/', { replace: true });
      return;
    }

    const localTarget = sessions.find(session => session.publicId === chatUuid);
    if (localTarget) {
      // Apply the URL -> chat mapping only when the URL itself changed. Running
      // it whenever currentSessionId changed made a sidebar click snap straight
      // back to the chat still shown in the address bar.
      if (handledChatUuidRef.current !== chatUuid) {
        handledChatUuidRef.current = chatUuid;
        if (localTarget.id !== currentSessionId) {
          setCurrentSessionId(localTarget.id);
          persistSessionId(localTarget.id);
        }
      }
      return;
    }

    void (async () => {
      try {
        const result: any = await chatApi.getSessionByPublicId(chatUuid);
        if (cancelled) return;
        const rawSession = result?.session ?? result?.data?.session ?? result?.data ?? result;
        const id = Number(rawSession?.id ?? rawSession?.sessionId ?? rawSession?.session_id);
        const publicId = String(rawSession?.publicId ?? rawSession?.public_id ?? chatUuid);
        if (!Number.isFinite(id) || id <= 0 || publicId !== chatUuid) {
          throw Object.assign(new Error('The conversation response was invalid.'), { status: 502 });
        }

        const now = new Date().toISOString();
        const session: Session = {
          ...rawSession,
          id,
          publicId,
          userId: Number(rawSession?.userId ?? rawSession?.user_id ?? user.id),
          sessionName: String(rawSession?.sessionName ?? rawSession?.name ?? rawSession?.title ?? 'New Chat'),
          createdAt: rawSession?.createdAt ?? rawSession?.created_at ?? now,
          updatedAt: rawSession?.updatedAt ?? rawSession?.updated_at ?? now,
        };
        setSessions(prev => [session, ...prev.filter(item => item.id !== id)]);
        setCurrentSessionId(id);
        persistSessionId(id);
      } catch (error: any) {
        if (cancelled) return;
        // Only redirect when the server explicitly says the chat is missing or
        // inaccessible. Network/server errors should not destroy a valid URL.
        if (error?.status === 404) {
          // Expected for a deleted or foreign chat link: not a console error.
          markChatsGone([{ publicId: chatUuid }]);
          setCurrentSessionId(null);
          persistSessionId(null);
          setMessages([]);
          toast.error('That chat could not be opened.', { id: 'chat-not-found' });
          navigate('/', { replace: true });
          return;
        }
        console.error('Failed to resolve chat URL:', error);
      }
    })();

    return () => { cancelled = true; };
  }, [loading, chatUuid, sessions, currentSessionId, navigate, user.id, markChatsGone]);

  // Keep the address bar in sync with the selected persistent conversation.
  // While a deep link is being resolved, do not redirect away from it.
  useEffect(() => {
    if (creatingNewSessionRef.current || loading) return;
    // The "Chats and tasks" page keeps its own address; do not bounce away from it.
    if (chatsView) return;
    if (currentSessionId === null) {
      if (!chatUuid && window.location.pathname.startsWith('/chat/')) navigate('/', { replace: true });
      return;
    }
    const active = sessions.find(session => session.id === currentSessionId);
    if (active?.publicId) {
      const expected = `/chat/${active.publicId}`;
      if (window.location.pathname !== expected) navigate(expected);
    }
  }, [loading, chatUuid, chatsView, currentSessionId, sessions, navigate]);


  // Restore the last conversation after a browser refresh. If it was deleted
  // elsewhere, clear the stale ID instead of silently creating a new chat.
  useEffect(() => {
    if (loading || currentSessionId === null || sessions.length === 0) return;
    if (!sessions.some(session => session.id === currentSessionId)) {
      setCurrentSessionId(null);
      persistSessionId(null);
      setMessages([]);
    }
  }, [loading, currentSessionId, sessions]);

  useEffect(() => {
    if (loading) return;
    if (currentSessionId !== null) {
      const stillExists = sessions.some(s => s.id === currentSessionId);
      if (!stillExists) {
        setCurrentSessionId(null);
        persistSessionId(null);
        setMessages([]);
      }
    }
  }, [sessions, loading]);

  // Only skip loading messages if the currentSessionId exactly matches the
  // ID we marked to skip (the newly created session). Any other session --
  // including ones selected on mobile -- always loads.
  useEffect(() => {
    // Remember the chat we are leaving so coming back to it is instant.
    const leaving = prevCachedSessionRef.current;
    if (
      leaving !== null
      && leaving !== currentSessionId
      && messagesRef.current.length > 0
      && !(isSendingRef.current && activeResponseSessionRef.current === leaving)
      && messagesRef.current.every(message => Number(message.sessionId) === leaving || message.sessionId === undefined)
    ) {
      rememberSession(leaving, {
        messages: messagesRef.current,
        attachments: messageAttachmentsRef.current,
      });
    }
    prevCachedSessionRef.current = currentSessionId;

    if (currentSessionId) {
      if (skipMessageLoadRef.current === currentSessionId) {
        // This is the new session we just created inline — messages are
        // already in state from the sendMessage flow, so skip the fetch.
        skipMessageLoadRef.current = null;
        return;
      }
      // A chat id restored from localStorage is only trusted once the chat list
      // has loaded and still contains it. Requesting history for a chat that was
      // deleted meanwhile produced the 404 /api/chat/history/<id> errors.
      if (restoredSessionIdRef.current === currentSessionId) {
        if (loading) return;
        restoredSessionIdRef.current = null;
        if (!sessionsRef.current.some(session => session.id === currentSessionId)) return;
      }
      if (goneChatsRef.current.ids.has(currentSessionId)) return;
      // Show the cached copy immediately (stale-while-revalidate); otherwise
      // drop the previous chat's messages so the clicked chat never appears to
      // "stay" on the old one while history loads. The chat that is currently
      // streaming owns the message state and is left alone.
      if (!(isSendingRef.current && activeResponseSessionRef.current === currentSessionId)) {
        const cached = messageCacheRef.current.get(currentSessionId);
        if (cached) {
          setMessages(cached.messages);
          setMessageAttachments(cached.attachments);
        } else {
          setMessages([]);
          setMessageAttachments({});
        }
      }
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, loadMessages, rememberSession, loading]);

  // Preserve the user's scroll position while messages stream. Only the
  // explicit first-message placement for a brand-new chat may scroll the panel.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (!firstMessageScrollPendingRef.current) return;

    const frame = requestAnimationFrame(() => {
      const firstMessage = container.querySelector<HTMLElement>('[data-twinkle-message]');
      if (!firstMessage) return;

      if (window.matchMedia('(max-width: 767px)').matches) {
        const mobileHeaderOffset = 48; // just the sidebar toggle, no navbar
        const targetTop = Math.max(0, firstMessage.offsetTop - mobileHeaderOffset);
        container.scrollTo({ top: targetTop, behavior: 'auto' });
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
      }

      firstMessageScrollPendingRef.current = false;
      setShowScrollBottom(false);
      setIsAtBottom(true);
      autoFollowScrollRef.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

  const syncScrollState = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    const distanceFromBottom = Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight);
    const atBottom = distanceFromBottom <= 40;
    const awayFromBottom = distanceFromBottom > 100;
    autoFollowScrollRef.current = atBottom;
    setShowScrollBottom(messages.length > 0 && awayFromBottom);
    setIsAtBottom(atBottom);
  }, [messages.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    syncScrollState(e.currentTarget);
  };

  // Re-measure after message/stream layout changes. This prevents the
  // floating control from becoming stale while the stream grows underneath
  // the user, especially when they return to the bottom.
  useEffect(() => {
    const frame = requestAnimationFrame(() => syncScrollState(messagesContainerRef.current));
    const container = messagesContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(frame);
    }

    const observer = new ResizeObserver(() => syncScrollState(container));
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [messages.length, isTyping, syncScrollState]);

  const extractZipEntry = async (file: File, entryName: string): Promise<string | null> => {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const minEocd = 22;
    const maxComment = 0xffff;
    const start = Math.max(0, view.byteLength - minEocd - maxComment);
    let eocd = -1;

    for (let i = view.byteLength - minEocd; i >= start; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }

    if (eocd < 0) return null;

    const directorySize = view.getUint32(eocd + 12, true);
    const directoryOffset = view.getUint32(eocd + 16, true);
    let cursor = directoryOffset;
    const end = directoryOffset + directorySize;
    const decoder = new TextDecoder();

    while (cursor < end && cursor + 46 <= view.byteLength) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;

      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = decoder.decode(new Uint8Array(buffer, cursor + 46, nameLength));

      if (name === entryName) {
        if (localOffset + 30 > view.byteLength || view.getUint32(localOffset, true) !== 0x04034b50) return null;

        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = new Uint8Array(buffer, dataStart, compressedSize);

        if (method === 0) return decoder.decode(compressed);
        if (method === 8 && typeof DecompressionStream !== 'undefined') {
          const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          const decompressed = await new Response(stream).arrayBuffer();
          return decoder.decode(new Uint8Array(decompressed));
        }
        return null;
      }

      cursor += 46 + nameLength + extraLength + commentLength;
    }

    return null;
  };

  const extractDocxText = async (file: File): Promise<string | null> => {
    const xml = await extractZipEntry(file, 'word/document.xml');
    if (!xml) return null;

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const paragraphs = Array.from(doc.getElementsByTagNameNS('*', 'p'));
    if (paragraphs.length === 0) return doc.documentElement.textContent?.trim() || null;

    return paragraphs
      .map(paragraph => paragraph.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean)
      .join('\n\n');
  };

  const openFilePreview = async (file: File, objectUrl?: string) => {
    setPreviewFile(file);
    setPreviewText(null);
    setPreviewUrl(objectUrl || URL.createObjectURL(file));

    const isDocx = /\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isTextLike = file.type.startsWith('text/') || /\.(txt|csv|tsv|json|xml|html?|md|markdown|rtf|js|jsx|ts|tsx|css|java|py|sql|yml|yaml)$/i.test(file.name);

    if (isDocx) {
      try {
        setPreviewText(await extractDocxText(file) || 'No readable text was found in this DOCX file.');
      } catch {
        setPreviewText('Unable to render this DOCX file in the browser.');
      }
    } else if (isTextLike) {
      try {
        setPreviewText(await file.text());
      } catch {
        setPreviewText('Unable to read this document in the browser.');
      }
    }
  };

  const openPersistedAttachmentPreview = async (
    dataUrl: string,
    index: number
  ) => {
    if (!isValidAttachmentDataUrl(dataUrl)) {
      console.error('Invalid persisted attachment preview data.');
      return;
    }

    try {
      const file = await dataUrlToFile(
        dataUrl,
        index,
        getStoredAttachmentName(dataUrl) || undefined
      );

      // Use a Blob URL for persisted attachments. This is more reliable for
      // PDF/browser previewing than loading a large base64 data URL directly.
      const objectUrl = URL.createObjectURL(file);
      await openFilePreview(file, objectUrl);
    } catch (error) {
      console.error('Failed to open attachment preview:', error);
    }
  };

  const closeFilePreview = () => {
    if (previewUrl && previewFile) {
      const isSelectedPreview = filePreviews.some(fp => fp.file === previewFile && fp.preview === previewUrl);
      if (!isSelectedPreview) URL.revokeObjectURL(previewUrl);
    }
    setPreviewFile(null);
    setPreviewUrl(null);
    setPreviewText(null);
  };

  useEffect(() => {
    if (!previewFile) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFilePreview();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFile, previewUrl]);

  // File handlers (kept but no UI to trigger them)
  const canTakeScreenshot =
    typeof navigator !== 'undefined' && !!(navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia);

  const openPlusMenu = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPlusMenu(current =>
      current
        ? null
        : {
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)),
            bottom: window.innerHeight - rect.top + 8,
          }
    );
  };

  useEffect(() => {
    if (!plusMenu) return;
    const onPointer = (event: MouseEvent) => {
      if (!plusMenuRef.current?.contains(event.target as Node)) setPlusMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlusMenu(null);
    };
    const onResize = () => setPlusMenu(null);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [plusMenu]);

  // Captures one frame of the screen / window / tab the user picks and attaches
  // it like any other image.
  const takeScreenshot = async () => {
    setPlusMenu(null);
    if (!canTakeScreenshot) return;
    let stream: MediaStream | null = null;
    try {
      // Give the menu a moment to disappear so it is not captured.
      await new Promise(resolve => window.setTimeout(resolve, 120));
      stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: false,
        preferCurrentTab: true,
      });
      if (!stream) return;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      await new Promise(resolve => window.setTimeout(resolve, 250));

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) throw new Error('No frame captured');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode screenshot');

      const stamp = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `Screenshot ${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}.${pad(stamp.getMinutes())}.${pad(stamp.getSeconds())}.png`;
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], name, { type: 'image/png', lastModified: Date.now() }));
      await handleFileSelection(transfer.files);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error: any) {
      // Cancelling the browser's share picker is not an error worth showing.
      if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') {
        console.error('Screenshot failed:', error);
        toast.error('The screenshot could not be captured. Please try again.');
      }
    } finally {
      stream?.getTracks().forEach(track => track.stop());
    }
  };

  const handleFileSelection = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    setIsProcessingFiles(true);

    try {
      const incomingFiles = Array.from(files).filter(
        file => file instanceof File && file.size > 0
      );

      if (incomingFiles.length === 0) return;

      const existingImageCount = selectedFiles.filter(file => file.type.startsWith('image/')).length;
      const incomingImageFiles = incomingFiles.filter(file => file.type.startsWith('image/'));
      const remainingImageSlots = MAX_IMAGES_PER_MESSAGE - existingImageCount;

      if (incomingImageFiles.length > remainingImageSlots) {
        throw new Error(
          `You can attach a maximum of ${MAX_IMAGES_PER_MESSAGE} images per message.`
        );
      }

      const oversized = incomingFiles.find(file => file.size > MAX_SINGLE_FILE_BYTES);
      if (oversized) {
        throw new Error(
          `${oversized.name} is too large. Keep each file under ${formatFileSize(MAX_SINGLE_FILE_BYTES)}.`
        );
      }

      // Original files, untouched: no canvas, no JPEG re-encode, no resizing.
      const processedFiles: File[] = incomingFiles;

      const existingImageBytes = selectedFiles
        .filter(file => file.type.startsWith('image/'))
        .reduce((total, file) => total + file.size, 0);
      const incomingImageBytes = processedFiles
        .filter(file => file.type.startsWith('image/'))
        .reduce((total, file) => total + file.size, 0);

      if (existingImageBytes + incomingImageBytes > MAX_TOTAL_IMAGE_BYTES) {
        throw new Error(
          `Images are too large. Keep the total image size under ${formatFileSize(MAX_TOTAL_IMAGE_BYTES)} per message.`
        );
      }

      const newPreviews = processedFiles.map(file => ({
        id: `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`,
        file,
        preview: file.type.startsWith('image/') || file.type === 'application/pdf'
          ? URL.createObjectURL(file)
          : undefined,
      }));

      setFilePreviews(prev => [...prev, ...newPreviews]);
      setSelectedFiles(prev => [...prev, ...processedFiles]);
    } catch (error: any) {
      console.error('File selection failed:', error);
      toast.error(
        typeof error?.message === 'string' && /too large|unsupported|not supported|under \d+/i.test(error.message)
          ? error.message
          : 'The selected file could not be prepared. Please check the file and try again.'
      );
    } finally {
      setIsProcessingFiles(false);
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  // Files picked from the Library (Ctrl/⌘+K -> Library) arrive here and are put in the composer.
  const handleFileSelectionRef = useRef(handleFileSelection);
  handleFileSelectionRef.current = handleFileSelection;
  useEffect(() => {
    const takeLibraryFiles = () => {
      const files = takeComposerFiles();
      if (files.length) void handleFileSelectionRef.current(files);
    };
    takeLibraryFiles();
    window.addEventListener(COMPOSER_FILES_EVENT, takeLibraryFiles);
    return () => window.removeEventListener(COMPOSER_FILES_EVENT, takeLibraryFiles);
  }, []);

  const removeFile = (id: string) => {
    const removed = filePreviews.find(fp => fp.id === id);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    setFilePreviews(prev => prev.filter(fp => fp.id !== id));
    setSelectedFiles(prev => prev.filter((_, idx) => {
      const removedFile = removed?.file;
      return removedFile ? prev[idx] !== removedFile : true;
    }));
  };

  const sendMessage = async (
    messageText: string,
    messagesSnapshot?: Message[],
    filesToSend?: File[],
    previewUrls?: string[],
    regenerateTitle = false,
    onAssistantResponse?: (text: string) => void
  ) => {
    if ((!messageText.trim() && (!filesToSend || filesToSend.length === 0))) return;

    // Image understanding is only supported by Oracle 2.0. Stop before
    // creating a user turn or calling the backend with an incompatible model.
    const includesImage = Array.isArray(filesToSend)
      && filesToSend.some(file => file instanceof File && file.type.startsWith('image/'));
    if (includesImage && !activeModel.vision) {
      setMessages(prev => [...prev, {
        id: `image-model-notice-${Date.now()}`,
        sessionId: currentSessionId || 0,
        role: 'assistant',
        content: `I can’t read images with ${activeModel.name}. Please switch to Oracle 2.0 and send the image again.`,
        timestamp: new Date().toISOString(),
      }]);
      return;
    }

    // Text/vision models cannot generate images: point to the exact image model.
    if (!includesImage && selectedModel !== IMAGE_MODEL_ID && (IMAGE_GENERATION_INTENT.test(messageText) || IMAGE_BARE_GENERATE.test(messageText))) {
      const imageModel = MODEL_OPTIONS.find(option => option.id === IMAGE_MODEL_ID);
      const now = Date.now();
      setMessages(prev => [...prev,
        { id: `image-request-${now}`, sessionId: currentSessionId || 0, role: 'user', content: messageText, timestamp: new Date().toISOString() },
        {
          id: `image-model-hint-${now}`,
          sessionId: currentSessionId || 0,
          role: 'assistant',
          content: `${activeModel.name} can’t generate images. **${imageModel?.name ?? 'Atelier 1.0'}** can — it turns your words into images. Switch to ${imageModel?.name ?? 'Atelier 1.0'} from the model menu in the message box, then send your prompt again.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      return;
    }

    // sendMessage() is also used by retry/edit flows, so keep this guard at
    // the actual request boundary as a second line of defense.
    if (isSendingRef.current) return;

    isSendingRef.current = true;
    const requestGeneration = ++requestGenerationRef.current;
    activeResponseSessionRef.current = currentSessionId;
    setThinkingContext({
      question: messageText,
      files: (filesToSend || []).map(file => ({ name: file.name || '', type: file.type || '' })),
    });
    setIsTyping(true);
    setResponsePhase('connecting');
    streamingAssistantIdRef.current = null;
    streamReceivedTextRef.current = '';
    setJustFinished(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempId = `temp-${Date.now()}`;
    let requestSessionId: number | null = currentSessionId;
    const isNewSession = requestSessionId == null;

    // Remember that this is the first message in a new chat so mobile can
    // move the sent message into view near the top of the conversation.
    const existingMessageCount = messagesSnapshot?.length ?? messages.length;
    if (existingMessageCount === 0) {
      firstMessageScrollPendingRef.current = true;
    }

    const tempUserMsg: Message = {
      id: tempId,
      sessionId: currentSessionId || 0,
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date().toISOString(),
    };

    if (messagesSnapshot) setMessages([...messagesSnapshot, tempUserMsg]);
    else setMessages(prev => [...prev, tempUserMsg]);

    if (previewUrls && previewUrls.length > 0) {
      setMessageAttachments(prev => ({ ...prev, [tempId]: previewUrls }));
    }

    setInput('');
    setSelectedFiles([]);
    (Array.isArray(filePreviews) ? filePreviews : []).forEach(fp => {
      if (fp?.preview) URL.revokeObjectURL(fp.preview);
    });
    setFilePreviews([]);

    try {
      // Create the persistent session before sending the first request. This
      // updates the browser URL immediately for both text and attachment chats.
      if (isNewSession && requestSessionId == null) {
        const created: any = await chatApi.createSession();
        const createdId = Number(created?.id ?? created?.sessionId ?? created?.session_id);
        const createdPublicId = String(created?.publicId ?? created?.public_id ?? '');
        if (!Number.isFinite(createdId) || createdId <= 0 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(createdPublicId)) {
          throw new Error('The server could not create a persistent chat URL. Please try again.');
        }
        requestSessionId = createdId;
        const createdAt = new Date().toISOString();
        skipMessageLoadRef.current = createdId;
        activeResponseSessionRef.current = createdId;
        setCurrentSessionId(createdId);
        persistSessionId(createdId);
        setMessages(prev => prev.map(item => item.id === tempId ? { ...item, sessionId: createdId } : item));
        setSessions(prev => [
          {
            id: createdId,
            publicId: createdPublicId,
            userId: user.id,
            // Name the chat in the sidebar the moment it is created, instead of
            // waiting for the AI response + title request to finish.
            sessionName: filesToSend && filesToSend.length && !messageText.trim() ? 'File Analysis' : 'New Chat',
            createdAt,
            updatedAt: createdAt,
          },
          ...prev.filter(item => item.id !== createdId),
        ]);
        navigate(`/chat/${createdPublicId}`);
      }

      let response: any;
      const hasFiles = filesToSend && filesToSend.length > 0;
      const finalMessage = messageText.trim() || (hasFiles && filesToSend.some(f => f.type.startsWith('image/')) ? 'Image uploaded' : '');

      if (hasFiles) {
        // File/multimodal requests keep the existing upload pipeline. The
        // response is progressively revealed after the backend returns so
        // the UI remains responsive without changing attachment handling.
        setResponsePhase('thinking');
        response = await chatApi.sendMessageWithFiles(
          finalMessage,
          requestSessionId,
          controller.signal,
          selectedModel,
          filesToSend
        );
      } else {
        response = await chatApi.streamMessage(
          finalMessage,
          requestSessionId,
          controller.signal,
          selectedModel,
          {
            onStatus: (status, metadata?) => {
              if (requestGeneration !== requestGenerationRef.current) return;
              if (status === 'thinking') setResponsePhase('thinking');

              // The backend creates the persistent session before it starts
              // generating the answer. Use the first SSE status event to put
              // its public UUID into the browser URL immediately.
              const incomingSessionId = Number(metadata?.sessionId ?? metadata?.session_id);
              const incomingPublicId = String(metadata?.publicId ?? metadata?.public_id ?? '');
              if (isNewSession && Number.isFinite(incomingSessionId) && incomingSessionId > 0
                  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incomingPublicId)) {
                const now = new Date().toISOString();
                skipMessageLoadRef.current = incomingSessionId;
                activeResponseSessionRef.current = incomingSessionId;
                setCurrentSessionId(incomingSessionId);
                persistSessionId(incomingSessionId);
                setSessions(prev => {
                  const existing = prev.find(session => session.id === incomingSessionId);
                  if (existing) {
                    return prev.map(session => session.id === incomingSessionId
                      ? { ...session, publicId: incomingPublicId, updatedAt: now }
                      : session);
                  }
                  return [{
                    id: incomingSessionId,
                    publicId: incomingPublicId,
                    userId: user.id,
                    sessionName: 'New Chat',
                    createdAt: now,
                    updatedAt: now,
                  }, ...prev];
                });
                const expectedPath = `/chat/${incomingPublicId}`;
                if (window.location.pathname !== expectedPath) navigate(expectedPath, { replace: false });
              }
            },
            onDelta: (chunk) => {
              // A stopped/invalidated request can still have one buffered SSE
              // event arrive after AbortController.abort(). Never create a new
              // assistant bubble from that late event.
              if (requestGeneration !== requestGenerationRef.current) return;
              if (!isSendingRef.current) return;
              if (!chunk) return;

              const streamId = streamingAssistantIdRef.current || `stream-ai-${Date.now()}`;
              streamingAssistantIdRef.current = streamId;

              // Create the empty streamed assistant bubble immediately. The
              // actual text is then rendered by the smooth SSE queue below.
              setMessages(prev => {
                if (prev.some(message => message.id === streamId)) return prev;
                return [
                  ...prev,
                  {
                    id: streamId,
                    sessionId: currentSessionId || 0,
                    role: 'assistant',
                    content: '',
                    timestamp: new Date().toISOString(),
                  },
                ];
              });

              // The backend sends true deltas, so chunks are never trimmed by
              // guessing at overlap: that used to swallow repeated letters
              // ("feels" became "fels"), so the streamed text no longer matched
              // the saved reply and the answer appeared twice. Only a clearly
              // cumulative payload (it starts with everything received so far)
              // is cut down to its new part.
              const previousStreamText = streamReceivedTextRef.current;
              let delta = chunk;
              if (
                previousStreamText.length >= 40
                && chunk.length > previousStreamText.length
                && chunk.startsWith(previousStreamText)
              ) {
                delta = chunk.slice(previousStreamText.length);
              }

              if (!delta) return;
              streamReceivedTextRef.current = previousStreamText + delta;
              streamRenderQueueRef.current += delta;
              startStreamRenderer();
            },
          }
        );
      }

      // A user stop invalidates this request generation. Never finalize or
      // replace the preserved partial response after Stop has been clicked.
      if (requestGeneration !== requestGenerationRef.current) return;

      const activeSessionId = response.sessionId || requestSessionId;

      if (isNewSession && activeSessionId) {
        // Store the new session's ID (not just `true`) so the
        // message-load effect skips ONLY this specific session's fetch.
        // Switching to any other session will still trigger a full load.
        skipMessageLoadRef.current = activeSessionId;
        activeResponseSessionRef.current = activeSessionId;
        setCurrentSessionId(activeSessionId);
        persistSessionId(activeSessionId);

        const now = new Date().toISOString();
        setSessions(prev => {
          if (prev.some(session => session.id === activeSessionId)) return prev;
          return [
            {
              id: activeSessionId,
              publicId: response.publicId || undefined,
              userId: user.id,
              sessionName: 'New Chat',
              createdAt: now,
              updatedAt: now,
            },
            ...prev,
          ];
        });
      }

      // Update the sidebar immediately. Do not wait for the title-generation
      // endpoint: file-only chats used to stay as "New Chat" until refresh.
      if (isNewSession && activeSessionId) {
        const fileNames = (filesToSend || []).map(file => file.name.trim()).filter(Boolean);
        // Text chats keep a neutral placeholder until the AI title arrives and is
        // typed in letter by letter (instead of flashing the raw first message).
        const immediateTitle = messageText.trim()
          ? 'New Chat'
          : fileNames.length === 1
            ? fileNames[0].replace(/\.[^.]+$/, '').slice(0, 60)
            : fileNames.length > 1
              ? `${fileNames[0].replace(/\.[^.]+$/, '').slice(0, 45)} + ${fileNames.length - 1} file${fileNames.length - 1 === 1 ? '' : 's'}`
              : 'File Analysis';

        setSessions(prev =>
          prev.map(session =>
            session.id === activeSessionId
              ? { ...session, sessionName: immediateTitle, updatedAt: new Date().toISOString() }
              : session
          )
        );
      }

      // Let the real streamed text finish rendering before finalizing the
      // message. This prevents the final response from jumping ahead of the
      // visible stream.
      await drainStreamRenderer();
      if (requestGeneration !== requestGenerationRef.current) return;
      setIsTyping(false);
      // The reply finished while another chat is open: flag this one as unread.
      if (!isNewSession && typeof activeSessionId === 'number' && currentSessionIdRef.current !== activeSessionId) setChatUnread(activeSessionId, true);

      const aiContent =
        typeof response?.response === 'string' && response.response.trim()
          ? response.response
          : 'I couldn’t generate a response for this request. Please try again.';
      const cleanedAiContent = cleanMessageContent(aiContent);

      // Track successful chat token usage for the Profile page.
      // Prefer provider usage metadata; otherwise estimate ~1 token per 4 characters.
      try {
        const usage = response?.usage ?? response?.tokenUsage ?? response?.token_usage ?? {};
        const reportedTotal = Number(
          usage?.total_tokens ?? usage?.totalTokens ?? usage?.totalTokenCount ??
          response?.tokenCount ?? response?.token_count ?? response?.total_tokens ?? response?.totalTokens
        );
        const countedTokens = Number.isFinite(reportedTotal) && reportedTotal > 0
          ? Math.round(reportedTotal)
          : Math.max(1, Math.ceil((String(finalMessage || '').length + cleanedAiContent.length) / 4));

        const storageKey = 'twinkle_token_usage_v1';
        const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const dailyActivity = Array.isArray(stored.dailyActivity) ? [...stored.dailyActivity] : [];
        const dayIndex = dailyActivity.findIndex((item: any) => item?.date === today);

        if (dayIndex >= 0) {
          dailyActivity[dayIndex] = {
            ...dailyActivity[dayIndex],
            tokens: Math.max(0, Number(dailyActivity[dayIndex]?.tokens || 0)) + countedTokens,
            messages: Math.max(0, Number(dailyActivity[dayIndex]?.messages || 0)) + 1,
          };
        } else {
          dailyActivity.push({ date: today, tokens: countedTokens, messages: 1 });
        }

        const lifetimeTokens = Math.max(0, Number(stored.lifetimeTokens ?? stored.lifetime_tokens ?? 0) || 0) + countedTokens;
        const peakTokens = Math.max(
          0,
          Number(stored.peakTokens ?? stored.peak_tokens ?? 0) || 0,
          ...dailyActivity.map((item: any) => Math.max(0, Number(item?.tokens || 0) || 0)),
        );
        localStorage.setItem(storageKey, JSON.stringify({ lifetimeTokens, peakTokens, dailyActivity }));
        window.dispatchEvent(new CustomEvent('twinkle-chat-activity-updated', {
          detail: { date: now.toISOString(), tokens: countedTokens },
        }));
      } catch (usageError) {
        console.warn('Could not save local token usage:', usageError);
      }

      onAssistantResponse?.(cleanedAiContent);

      const aiMsg: Message = {
        id: response?.messageId || 'ai-' + Date.now(),
        sessionId: activeSessionId,
        role: 'assistant',
        content: cleanedAiContent,
        timestamp: new Date().toISOString(),
      };

      // Read the streamed bubble's id now: the state updater below may run
      // after this function has already cleared the ref.
      const finalStreamId = streamingAssistantIdRef.current;

      const weatherSnapshot = takeWeatherSnapshot();
      if (weatherSnapshot) {
        const cardKeys = [finalStreamId, aiMsg.id].filter(Boolean).map(String);
        rememberWeatherCard(cardKeys, weatherSnapshot);
        setWeatherCards(prev => {
          const next = { ...prev };
          cardKeys.forEach(key => { next[key] = weatherSnapshot; });
          return next;
        });
      }

      setMessages(prev => {
        // Replace the streamed bubble with the final server message instead
        // of appending another assistant bubble.
        if (finalStreamId) {
          const streamIndex = prev.findIndex(m => m.id === finalStreamId);
          if (streamIndex >= 0) {
            return dedupeMessages(
              prev.map((message, index) =>
                index === streamIndex ? { ...aiMsg, id: message.id } : message
              )
            );
          }
        }

        // A history request can finish at exactly the same time as the final
        // SSE event. If this turn already has the answer, keep it and do not
        // append a second copy.
        const normalizedFinal = normalizeReply(cleanedAiContent);
        if (normalizedFinal) {
          let lastUserIndex = -1;
          for (let i = prev.length - 1; i >= 0; i -= 1) {
            if (prev[i].role === 'user') { lastUserIndex = i; break; }
          }
          const alreadyPresent = prev.slice(lastUserIndex + 1).some(
            message =>
              message.role === 'assistant' &&
              isSameReply(normalizeReply(message.content), normalizedFinal)
          );
          if (alreadyPresent) return dedupeMessages(prev);
        }

        if (prev.some(m => m.id === aiMsg.id)) return dedupeMessages(prev);
        return dedupeMessages([...prev, aiMsg]);
      });
      streamingAssistantIdRef.current = null;
      streamReceivedTextRef.current = '';
      setResponsePhase('idle');

      // Generate and persist a professional AI-generated chat title.
      if ((isNewSession || regenerateTitle || !sessions.some(session => session.id === activeSessionId && session.sessionName && !/^(new chat|chat|e)$/i.test(session.sessionName.trim()))) && activeSessionId) {
        try {
          const titleInput = finalMessage ||
            (filesToSend || []).map(file => file.name).filter(Boolean).join(', ') ||
            'File analysis';
          let titleResponse: any = null;
          try {
            titleResponse = await chatApi.generateTitle(titleInput);
          } catch (titleErr) {
            console.warn('AI chat title request failed, using fallback:', titleErr);
          }

          const titleFromModel = typeof titleResponse?.title === 'string' ? titleResponse.title.trim() : '';
          const polishedModelTitle = polishChatTitle(titleFromModel);
          const newTitle =
            polishedModelTitle.length >= 2 && !/^(new chat|chat|question|request|conversation|e)$/i.test(polishedModelTitle)
              ? polishedModelTitle
              : polishChatTitle(generateProfessionalChatTitle(titleInput, Boolean(filesToSend?.length)), 'New Chat');

          // The chat may have been deleted while its title was being generated;
          // there is nothing left to name (and the server would answer 404).
          if (!goneChatsRef.current.ids.has(activeSessionId)) {
            // Show the name immediately with the typing effect; persist in parallel.
            setTypingSessionTitle({ id: activeSessionId, title: newTitle });
            setSessions(prev =>
              prev.map(session =>
                session.id === activeSessionId
                  ? { ...session, sessionName: newTitle }
                  : session
              )
            );
            await chatApi.renameSession(activeSessionId, newTitle);
          }
        } catch (renameErr) {
          const detail = String((renameErr as any)?.message ?? renameErr);
          if (/not found|404/i.test(detail) || goneChatsRef.current.ids.has(activeSessionId)) {
            // Deleted in the meantime: harmless, so no error is logged.
            console.debug('Chat title not saved: the chat no longer exists.');
          } else {
            console.error('AI-generated Twinkle chat title save failed:', renameErr);
          }
        }
      }
    } catch (err: any) {
      // A stopped/replaced request must never touch the state of the newer one
      // (Stop or "send while responding" already reset everything itself).
      if (requestGeneration !== requestGenerationRef.current) return;
      setIsTyping(false);
      setResponsePhase('idle');
      streamingAssistantIdRef.current = null;
      streamReceivedTextRef.current = '';

      if (err?.name === 'AbortError') {
        console.log('Chat aborted');
        return;
      }

      console.error('Chat error:', err);
      cancelStreamRenderer();

      const errMsg = friendlyErrorMessage(err, typeof navigator === 'undefined' || navigator.onLine);

      setMessages(prev => dedupeMessages([...prev, {
          id: 'error-' + Date.now(),
          sessionId: currentSessionId || 0,
          role: 'assistant',
          content: errMsg,
          timestamp: new Date().toISOString(),
        }]));
    } finally {
      if (requestGeneration !== requestGenerationRef.current) return;
      takeWeatherSnapshot(); // discard a lookup whose reply never arrived
      isSendingRef.current = false;
      abortControllerRef.current = null;
      activeResponseSessionRef.current = null;
      setIsTyping(false);
      setResponsePhase('idle');
      streamingAssistantIdRef.current = null;
      streamReceivedTextRef.current = '';
      setJustFinished(true);
      setTimeout(() => setJustFinished(false), 3000);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    // Acquire the lock BEFORE any async file conversion. Previously two rapid
    // clicks could both pass this check while fileToDataUrl() was awaiting,
    // then both call sendMessage(), producing the same assistant response twice.
    if (isSendingRef.current || isTyping || sendPreparationLockRef.current) return;

    const text = typeof directMessage === 'string' ? directMessage : (input || '');

    // Defensive normalization prevents stale browser/HMR state from causing
    // "Cannot read properties of undefined (reading 'length')" during upload.
    const currentSelectedFiles = Array.isArray(selectedFiles)
      ? selectedFiles.filter((file): file is File => file instanceof File)
      : [];

    if (!text.trim() && currentSelectedFiles.length === 0) return;

    sendPreparationLockRef.current = true;

    const filesToSend = currentSelectedFiles.length > 0
      ? [...currentSelectedFiles]
      : undefined;

    let previewUrls: string[] | undefined;

    try {
      if (filesToSend && filesToSend.length > 0) {
        // Keep a data URL for EVERY attachment so the sent message can
        // render the same attachment after it has been sent or reloaded.
        previewUrls = await Promise.all(
          filesToSend.map(fileToDataUrl)
        );
        rememberAttachmentNames(filesToSend, previewUrls);
      }

      // The server adds attached files to the Library as soon as the upload arrives.
      if (filesToSend && filesToSend.length > 0) {
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('twinkle-library-updated')), 1500);
      }

      await sendMessage(
        text,
        undefined,
        filesToSend,
        previewUrls
      );

      // Documents attached in chat are indexed into the Library in the background.
      if (filesToSend && filesToSend.length > 0) {
        window.dispatchEvent(new CustomEvent('twinkle-library-updated'));
      }

      // Notify Profile immediately so the activity heatmap updates as soon
      // as a conversation is persisted, without waiting for the 30s poll.
      window.dispatchEvent(new CustomEvent('twinkle-chat-activity-updated', {
        detail: { date: new Date().toISOString() },
      }));
    } catch (err: any) {
      console.error('Failed to prepare uploaded file:', err);
      setMessages(prev => [
        ...prev,
        {
          id: 'error-' + Date.now(),
          sessionId: currentSessionId || 0,
          role: 'assistant',
          content:
            typeof err?.message === 'string' && /too large|unsupported|not supported|under \d+/i.test(err.message)
              ? err.message
              : 'The uploaded file could not be prepared. Please check the file and try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      sendPreparationLockRef.current = false;
    }
  };

  // Retry a user message using the conversation state before that message.
  // Persisted attachments are reconstructed so images and documents are
  // actually sent again instead of being reduced to placeholder text.
  const handleRetryMessage = async (msg: Message) => {
    if (isTyping) return;

    const msgIndex = messages.findIndex(m => m.id === msg.id);
    const messagesBeforeMsg = msgIndex > 0 ? messages.slice(0, msgIndex) : [];
    const attachmentUrls = messageAttachments[msg.id] || [];

    try {
      const retryFiles = attachmentUrls.length > 0
        ? await Promise.all(
            attachmentUrls.map((url, index) =>
              dataUrlToFile(
                url,
                index,
                getStoredAttachmentName(url) || undefined
              )
            )
          )
        : undefined;

      const retryText =
        cleanMessageContent(msg.content) === 'Image uploaded'
          ? ''
          : cleanMessageContent(msg.content);

      await sendMessage(
        retryText,
        messagesBeforeMsg,
        retryFiles,
        attachmentUrls.length > 0 ? attachmentUrls : undefined
      );
    } catch (error) {
      console.error('Failed to restore attachments for retry:', error);
      setMessages(prev => [
        ...prev,
        {
          id: 'error-' + Date.now(),
          sessionId: currentSessionId || 0,
          role: 'assistant',
          content: 'The attached file could not be restored for retry. Please upload it again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const silentStopRef = useRef(false);
  const handleStopResponse = () => {
    if (silentStopRef.current) silentStopRef.current = false;
    else toast.info('Response stopped');
    // Invalidate the active send before aborting the network request. This
    // closes the race where the SSE `done` event arrives at the same time as
    // the user presses Stop and the full response gets committed again.
    requestGenerationRef.current += 1;
    activeResponseSessionRef.current = null;
    const streamId = streamingAssistantIdRef.current;
    const streamedText = streamReceivedTextRef.current;

    // Keep the response already received on screen when the user stops it.
    // `streamReceivedTextRef` already includes text that is waiting in the
    // render queue, so it is the complete partial response at this moment.
    if (streamId && streamedText) {
      const completedText = streamedText;
      setMessages(prev =>
        prev.map(message =>
          message.id === streamId
            ? { ...message, content: completedText }
            : message
        )
      );
    }

    abortControllerRef.current?.abort();
    cancelStreamRenderer();
    setIsTyping(false);
    setResponsePhase('idle');
    streamingAssistantIdRef.current = null;
    streamReceivedTextRef.current = '';
    isSendingRef.current = false;
    abortControllerRef.current = null;
    window.speechSynthesis?.cancel();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // The composer stays ready while a reply is streaming. A message sent during
  // that time is queued (the current reply keeps generating) and is sent
  // automatically, in order, as soon as the reply has finished.
  const [queuedSends, setQueuedSends] = useState<Array<{ text: string; sessionId: number | null }>>([]);
  const [queueTick, setQueueTick] = useState(0);

  const queueMessageWhileResponding = () => {
    const text = input.trim();
    if (!text || !isTyping) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setQueuedSends(prev => [
      ...prev,
      { text, sessionId: activeResponseSessionRef.current ?? currentSessionIdRef.current },
    ]);
    toast.info('Message queued. It will be sent after the current response.');
  };

  useEffect(() => {
    if (isTyping || queuedSends.length === 0) return;
    // The previous request releases its locks just after isTyping flips; wait for
    // that instead of dropping the queued message.
    if (isSendingRef.current || sendPreparationLockRef.current) {
      const retry = window.setTimeout(() => setQueueTick(tick => tick + 1), 120);
      return () => window.clearTimeout(retry);
    }
    const [next, ...rest] = queuedSends;
    setQueuedSends(rest);
    // The user moved to a different chat in the meantime: do not send it there.
    if (next.sessionId !== null && currentSessionIdRef.current !== next.sessionId) return;
    void handleSendMessage(undefined, next.text);
    // handleSendMessage is recreated every render; only these inputs matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping, queuedSends, queueTick]);

  // Esc stops a response that is being generated (unless a dialog is open).
  const stopResponseRef = useRef(handleStopResponse);
  stopResponseRef.current = handleStopResponse;
  useEffect(() => {
    if (!isTyping) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      event.preventDefault();
      stopResponseRef.current();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isTyping]);

  // ---- Files in chat ----
  const openChatOutput = async (output: ChatOutputItem) => {
    setFilesPanelOpen(false);
    try {
      const blob = await (await fetch(output.src)).blob();
      await openFilePreview(new File([blob], output.name, { type: blob.type || 'image/png' }));
    } catch (error) {
      console.error('Failed to open output:', error);
      window.open(output.src, '_blank', 'noopener,noreferrer');
    }
  };
  const openUploadsModal = () => {
    setFilesPanelOpen(false);
    setUploadsModalOpen(true);
  };

  // ---- Search in chat ----
  const openChatSearch = () => {
    setShowAllMessages(true);
    setChatSearchOpen(true);
    window.setTimeout(() => chatSearchInputRef.current?.focus(), 30);
  };
  const closeChatSearch = () => {
    setChatSearchOpen(false);
    setChatSearchQuery('');
    setChatSearchIndex(0);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openChatSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chatSearchTerm = chatSearchQuery.trim().toLowerCase();
  const chatSearchMatchIds: Array<string | number> = chatSearchOpen && chatSearchTerm
    ? messages
        .filter(item => cleanMessageContent(item.content).toLowerCase().includes(chatSearchTerm))
        .map(item => item.id)
    : [];
  const chatSearchMatchKey = chatSearchMatchIds.join('|');

  useEffect(() => {
    const css = (globalThis as any).CSS;
    const registry = css?.highlights;
    const clear = () => { try { registry?.delete('twinkle-search'); registry?.delete('twinkle-search-current'); } catch { /* unsupported */ } };
    if (!chatSearchOpen || !chatSearchTerm) { clear(); return; }

    if (!document.getElementById('twinkle-search-style')) {
      const style = document.createElement('style');
      style.id = 'twinkle-search-style';
      style.textContent = '::highlight(twinkle-search){background-color:#fde68a;color:#1f1e1d}::highlight(twinkle-search-current){background-color:#fb923c;color:#1f1e1d}';
      document.head.appendChild(style);
    }

    const currentId = chatSearchMatchIds[Math.min(chatSearchIndex, Math.max(chatSearchMatchIds.length - 1, 0))];
    const all: Range[] = [];
    const current: Range[] = [];
    if (registry && typeof (window as any).Highlight === 'function') {
      document.querySelectorAll<HTMLElement>('[data-msg-id]').forEach(element => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = (node.textContent || '').toLowerCase();
          let from = 0;
          let at: number;
          while ((at = text.indexOf(chatSearchTerm, from)) !== -1) {
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + chatSearchTerm.length);
            (String(currentId) === element.dataset.msgId ? current : all).push(range);
            from = at + chatSearchTerm.length;
          }
        }
      });
      try {
        registry.set('twinkle-search', new (window as any).Highlight(...all));
        registry.set('twinkle-search-current', new (window as any).Highlight(...current));
      } catch { /* highlighting is optional */ }
    }
    if (currentId !== undefined) {
      document.querySelector<HTMLElement>(`[data-msg-id="${String(currentId).replace(/"/g, '')}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSearchOpen, chatSearchTerm, chatSearchIndex, chatSearchMatchKey]);

  const stepChatSearch = (direction: 1 | -1) => {
    if (chatSearchMatchIds.length === 0) return;
    setChatSearchIndex(index => (index + direction + chatSearchMatchIds.length) % chatSearchMatchIds.length);
  };

  // ---- Copy the whole chat as Markdown ----
  const copyWholeChat = async () => {
    const title = sessions.find(item => item.id === currentSessionId)?.sessionName || 'Chat';
    const body = messages
      .map(item => `**${item.role === 'user' ? 'You' : 'Twinkle'}**\n\n${cleanMessageContent(item.content)}`)
      .filter(Boolean)
      .join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(`# ${title}\n\n${body}\n`);
      toast.success('Chat copied to clipboard');
    } catch (error) {
      console.error('Could not copy chat:', error);
      toast.error('Could not copy the chat. Please try again.');
    }
  };

  const createNewSession = () => {

    if (creatingNewSessionRef.current) return;

    const isBlankDraft = currentSessionId === null && messages.length === 0 && !isTyping;
   
if (isBlankDraft) {
  const nextGreeting = getRandomChatGreeting(
    user?.name || user?.username || '',
    chatGreetingRef.current,
    selectedModel
  );

  chatGreetingRef.current = nextGreeting;
  setChatGreeting(nextGreeting);
  setEmptyChatPrompt(current => getNextEmptyChatPrompt(current));

  setMobileOpen(false);
  setModalType('none');
  // From the Chats page (/chats) or any other address, a blank draft still has
  // to leave that page; otherwise "New chat" / "New" appear to do nothing.
  if (window.location.pathname !== '/') navigate('/', { replace: true });
  window.setTimeout(() => inputRef.current?.focus(), 0);
  return;
}

    creatingNewSessionRef.current = true;

    requestGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cancelStreamRenderer();
    isSendingRef.current = false;
    activeResponseSessionRef.current = null;
    streamingAssistantIdRef.current = null;
    streamReceivedTextRef.current = '';
    setIsTyping(false);
    setResponsePhase('idle');
    setJustFinished(false);

    setCurrentSessionId(null);
    persistSessionId(null);
    setMessages([]);
    setMessageAttachments({});
    setInput('');
    setEditingMessage(null);
    setSelectedFiles([]);
    setFilePreviews(prev => {
      prev.forEach(fp => { if (fp?.preview) URL.revokeObjectURL(fp.preview); });
      return [];
    });
    {
      const nextGreeting = getRandomChatGreeting(user?.name || user?.username || '', chatGreetingRef.current, selectedModel);
      chatGreetingRef.current = nextGreeting;
      setChatGreeting(nextGreeting);
    }
    setEmptyChatPrompt(current => getNextEmptyChatPrompt(current));
    setMobileOpen(false);
    setModalType('none');
    skipMessageLoadRef.current = null;

    // A blank draft uses the normal root URL, not a persistent chat UUID.
    if (window.location.pathname !== '/') navigate('/', { replace: true });
    requestAnimationFrame(() => { creatingNewSessionRef.current = false; });
  };

  // The shortcut listener is registered once, so it must call the latest
  // createNewSession (which reads the current chat state) through a ref.
  const createNewSessionRef = useRef<() => void>(() => {});
  createNewSessionRef.current = createNewSession;

  // Shortcuts are detected once for the whole app (GlobalShortcuts in App.tsx)
  // and broadcast here. `live-talk` also works when pressed from Settings.
  const openLiveTalkRef = useRef<() => void>(() => {});
  openLiveTalkRef.current = () => setLiveTalkOpen(true);

  useEffect(() => {
    const run = (action: ShortcutAction) => {
      if (action === 'new-chat') createNewSessionRef.current();
      else if (action === 'live-talk') openLiveTalkRef.current();
    };
    const pending = takePendingShortcut();
    if (pending === 'live-talk') run(pending);
    return onShortcut(run);
  }, []);

  const deleteSession = (sid: number) => {
    setSessionIdToDelete(sid);
    setModalType('delete-single');
  };

  const confirmDeleteSession = () => {
    if (sessionIdToDelete === null) return;

    const deletedSessionId = sessionIdToDelete;
    const removedSession = sessions.find(session => session.id === deletedSessionId);
    const wasCurrent = currentSessionId === deletedSessionId;
    markChatsGone([{ id: deletedSessionId, publicId: removedSession?.publicId }]);
    messageCacheRef.current.delete(deletedSessionId);

    // Optimistic: close the dialog and remove the chat instantly; the server
    // request runs in the background and the chat is restored if it fails.
    setModalType('none');
    setSessionIdToDelete(null);
    setSessions(prev => prev.filter(session => session.id !== deletedSessionId));
    toast.success('Chat deleted');
    setTypingSessionTitle(current => current?.id === deletedSessionId ? null : current);
    if (wasCurrent) {
      setCurrentSessionId(null);
      persistSessionId(null);
      setMessages([]);
      setEditingMessage(null);
      if (window.location.pathname !== '/' && window.location.pathname !== '/chats') navigate('/', { replace: true });
    }

    void chatApi.deleteSession(deletedSessionId).catch(err => {
      console.error('Delete session failed:', err);
      // The delete did not happen, so the chat is not gone after all.
      goneChatsRef.current.ids.delete(deletedSessionId);
      if (removedSession?.publicId) goneChatsRef.current.publicIds.delete(removedSession.publicId.toLowerCase());
      if (removedSession) {
        setSessions(prev => prev.some(session => session.id === deletedSessionId)
          ? prev
          : [removedSession, ...prev]);
      }
      toast.error('The chat could not be deleted. Please try again.');
    });
  };

  const renameSession = async (sid: number, newName: string) => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    try {
      await chatApi.renameSession(sid, trimmedName);

      // Update the parent source of truth immediately. Both desktop and
      // mobile SessionList instances receive this same sessions array.
      setSessions(prev =>
        prev.map(session =>
          session.id === sid
            ? { ...session, sessionName: trimmedName }
            : session
        )
      );
      toast.success('Chat renamed');

    } catch (err) {
      console.error('Rename failed:', err);
      toast.error('The chat could not be renamed. Please try again.');
    }
  };

  // Sidebar "Share": opens the Share session popup for the chosen chat.
  const shareSession = async (sid: number) => {
    setShareSessionId(Number.isFinite(sid) && sid > 0 ? sid : -1);
    return null;
  };

  // The top-right Share button opens the same popup for the open chat. A chat
  // that has no messages yet shows a friendly "start chatting" state instead.
  const handleTopShare = () => {
    setShareSessionId(currentSessionId !== null && currentSessionId > 0 ? currentSessionId : -1);
  };

  const closeShareModal = () => {
    setShareSessionId(null);
  };

  const handleLogout = async () => {
    try { await authApi.logout(); toast.success('Signed out'); } catch (err) { console.error('Logout failed:', err); toast.error('Sign out failed. Please try again.'); }
    finally {
      setCurrentSessionId(null);
      persistSessionId(null);
      onLogout();
    }
  };

  
  const handleStartEdit = (msg: Message) => {
    setEditingMessage({ id: msg.id, content: cleanMessageContent(msg.content) });
    setEditInput(cleanMessageContent(msg.content));
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setEditInput('');
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editInput.trim()) return;
    const editedText = editInput.trim();
    const editedIndex = messages.findIndex(m => m.id === editingMessage.id);
    const messagesBeforeEdit = editedIndex > 0 ? messages.slice(0, editedIndex) : [];
    const attachmentUrls = messageAttachments[String(editingMessage.id)] || [];
    setEditingMessage(null);
    setEditInput('');
    try {
      const editFiles = attachmentUrls.length > 0
        ? await Promise.all(attachmentUrls.map((url, index) =>
            dataUrlToFile(url, index, getStoredAttachmentName(url) || undefined)))
        : undefined;
      await sendMessage(
        editedText,
        messagesBeforeEdit,
        editFiles,
        attachmentUrls.length > 0 ? attachmentUrls : undefined,
        true
      );
    } catch (error) {
      console.error('Failed to restore attachments while editing:', error);
      setMessages(prev => [...prev, {
        id: `edit-attachment-error-${Date.now()}`,
        sessionId: currentSessionId || 0,
        role: 'assistant',
        content: 'The original attachment could not be restored for this edit. Please attach the file again and resend.',
        timestamp: new Date().toISOString(),
      }]);
    }
  };


  /**
   * Fired the moment Live Talk ends. Shows the conversation immediately from
   * the local transcript while the final save/title work finishes in the
   * background; handleLiveSessionComplete then swaps in the saved copy.
   */
  const handleLiveSessionPreview = useCallback((info: {
    sessionId: number | null;
    publicId?: string;
    sessionName?: string;
    turns: Array<{ role: 'user' | 'assistant'; content: string }>;
    weather?: LiveWeatherEntry[];
  }) => {
    const turns = info.turns.filter(turn => turn.content.trim());
    if (turns.length === 0) return;
    if (info.sessionId && info.weather && info.weather.length > 0) {
      liveWeatherRef.current.set(info.sessionId, info.weather);
      setLiveWeatherVersion(version => version + 1);
    }

    const stamp = Date.now();
    const now = new Date().toISOString();
    creatingNewSessionRef.current = true;
    window.setTimeout(() => { creatingNewSessionRef.current = false; }, 600);

    if (info.sessionId) {
      const sid = info.sessionId;
      setSessions(prev => {
        const existing = prev.find(session => session.id === sid);
        const base = existing ?? {
          id: sid,
          userId: user.id,
          sessionName: info.sessionName || 'Live Talk',
          createdAt: now,
          updatedAt: now,
        } as Session;
        return [
          { ...base, publicId: base.publicId || info.publicId, sessionName: info.sessionName || base.sessionName, updatedAt: now },
          ...prev.filter(session => session.id !== sid),
        ];
      });
      // Do not let the history loader replace the preview with a transcript
      // that is still missing the last turn.
      skipMessageLoadRef.current = currentSessionIdRef.current === sid ? null : sid;
      setCurrentSessionId(sid);
      persistSessionId(sid);
      if (info.publicId) navigate(`/chat/${info.publicId}`);
    }

    setEditingMessage(null);
    setMessageAttachments({});
    setMessages(turns.map((turn, index) => ({
      id: `live-preview-${stamp}-${index}`,
      sessionId: info.sessionId || 0,
      role: turn.role,
      content: turn.content,
      timestamp: now,
    })));
  }, [user.id, navigate]);

  const handleLiveSessionComplete = useCallback(async (sessionId: number, sessionName?: string, publicIdFromLive?: string, weather?: LiveWeatherEntry[]) => {
    if (!Number.isFinite(sessionId)) return;
    if (weather && weather.length > 0) {
      liveWeatherRef.current.set(sessionId, weather);
      setLiveWeatherVersion(version => version + 1);
    }

    // Hold the URL/session effects for a moment so they cannot snap back to the
    // chat that was open before Live Talk started (e.g. /chat/<old-uuid>).
    creatingNewSessionRef.current = true;
    try {
      const now = new Date().toISOString();
      let publicId = publicIdFromLive || sessions.find(session => session.id === sessionId)?.publicId;

      // Make the saved chat visible in the sidebar right away.
      setSessions(prev => {
        const existing = prev.find(session => session.id === sessionId);
        const base = existing ?? {
          id: sessionId,
          userId: user.id,
          sessionName: sessionName || 'Live Talk',
          createdAt: now,
          updatedAt: now,
        } as Session;
        return [
          { ...base, publicId: base.publicId || publicId, sessionName: sessionName || base.sessionName, updatedAt: now },
          ...prev.filter(session => session.id !== sessionId),
        ];
      });

      // Select it and put its permanent URL in the address bar in the same
      // batch, so nothing flips back to the previous chat.
      // Read the live value: this callback runs long after Live Talk closed.
      skipMessageLoadRef.current = currentSessionIdRef.current === sessionId ? null : sessionId;
      setEditingMessage(null);
      setCurrentSessionId(sessionId);
      persistSessionId(sessionId);
      if (publicId) navigate(`/chat/${publicId}`);

      // Load the transcript directly. Relying only on the currentSessionId
      // effect meant nothing was fetched when the id did not change.
      const loaded = await loadMessages(sessionId);

      // Backend titles can be a raw truncated transcript; replace those with a
      // clean professional title. Never blocks the UI.
      const firstUser = loaded?.find(message => message.role === 'user' && message.content.trim());
      const currentName = sessionName || sessions.find(session => session.id === sessionId)?.sessionName;
      // The backend titles a Live Talk instantly from the first thing said, so a
      // title that is just the start of that sentence also needs polishing.
      const normalizeTitleText = (value: unknown) => String(value ?? '').replace(/(?:\.{2,}|…)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
      const titleIsTranscript = Boolean(firstUser && currentName)
        && normalizeTitleText(currentName).length > 0
        && normalizeTitleText(firstUser?.content).startsWith(normalizeTitleText(currentName));
      if (firstUser && (isGenericOrRawTitle(currentName) || titleIsTranscript)) {
        void (async () => {
          try {
            const titleResponse: any = await chatApi.generateTitle(firstUser.content);
            const polished = polishChatTitle(titleResponse?.title);
            const finalTitle = polished.length >= 3 && !/^(new chat|chat|question|request|conversation)$/i.test(polished)
              ? polished
              : polishChatTitle(generateProfessionalChatTitle(firstUser.content), 'Live Talk');
            setTypingSessionTitle({ id: sessionId, title: finalTitle });
            setSessions(prev => prev.map(session => session.id === sessionId ? { ...session, sessionName: finalTitle } : session));
            await chatApi.renameSession(sessionId, finalTitle);
          } catch (titleError) {
            console.warn('Live Talk title cleanup failed:', titleError);
          }
        })();
      }

      // Backend always has the permanent URL id; pick it up if Live Talk did
      // not have it yet.
      if (!publicId) {
        try {
          const refreshed: any = await chatApi.getSessions();
          const match = (refreshed?.sessions || []).find((item: any) => Number(item.id) === sessionId);
          publicId = match?.publicId;
          if (publicId) {
            setSessions(prev => prev.map(session => session.id === sessionId ? { ...session, publicId } : session));
            navigate(`/chat/${publicId}`, { replace: true });
          }
        } catch { /* sidebar already shows the chat */ }
      }
    } finally {
      window.setTimeout(() => { creatingNewSessionRef.current = false; }, 400);
    }
  }, [user.id, sessions, navigate, loadMessages]);

  // Leaves the "Chats and tasks" page and shows the chosen chat at its own address.
  const openChatFromList = (id: number) => {
    if (window.location.pathname !== '/chats') return;
    const target = sessions.find(session => session.id === id);
    navigate(target?.publicId ? `/chat/${target.publicId}` : '/', { replace: false });
  };

  // Deletes several chats at once (used by Select on the "Chats and tasks" page).
  const deleteManySessions = (ids: number[]) => {
    const unique = Array.from(new Set(ids)).filter(id => Number.isFinite(id) && id > 0);
    if (unique.length === 0) return;
    const removed = sessions.filter(session => unique.includes(session.id));
    markChatsGone(removed.map(session => ({ id: session.id, publicId: session.publicId })));
    unique.forEach(id => messageCacheRef.current.delete(id));
    setSessions(prev => prev.filter(session => !unique.includes(session.id)));
    setTypingSessionTitle(current => (current && unique.includes(current.id) ? null : current));
    toast.success(unique.length === 1 ? 'Chat deleted' : `${unique.length} chats deleted`);
    if (currentSessionId !== null && unique.includes(currentSessionId)) {
      setCurrentSessionId(null);
      persistSessionId(null);
      setMessages([]);
      setEditingMessage(null);
    }
    unique.forEach(id => {
      void chatApi.deleteSession(id).catch(err => {
        console.error('Delete session failed:', err);
        goneChatsRef.current.ids.delete(id);
        const original = removed.find(session => session.id === id);
        if (original?.publicId) goneChatsRef.current.publicIds.delete(original.publicId.toLowerCase());
        if (original) setSessions(prev => (prev.some(session => session.id === id) ? prev : [original, ...prev]));
        toast.error('A chat could not be deleted. Please try again.');
      });
    });
  };

  // Render the chat shell immediately; avoid a separate full-screen loading animation.

  return (
    <div className="relative flex h-[100dvh] min-h-0 w-full max-w-full overflow-hidden bg-white dark:bg-zinc-950 font-sans transition-colors duration-300">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-zinc-1000/5 rounded-full blur-[160px] pointer-events-none" />

      <Sidebar
        user={user}
        sessions={showFirstWelcome ? [welcomeSession, ...sidebarSessions] : sidebarSessions}
        typingSessionId={typingSessionTitle?.id ?? null}
        onTypingDone={() => setTypingSessionTitle(null)}
        currentSessionId={showFirstWelcome && currentSessionId === null ? WELCOME_SESSION_ID : currentSessionId}
        respondingSessionId={isTyping ? activeResponseSessionRef.current : null}
        onSelectSession={(id) => {
          if (id === WELCOME_SESSION_ID) { setMobileOpen(false); return; }
          setCurrentSessionId(id);
          persistSessionId(id);
          setMobileOpen(false);
          openChatFromList(id);
        }}
        onNewSession={() => {
          createNewSession();
          setMobileOpen(false);
        }}
        onComposeChat={(text) => {
          // Search dialog, Tab: new chat with the typed text ready to send.
          createNewSession();
          setMobileOpen(false);
          window.setTimeout(() => {
            setInput(text);
            inputRef.current?.focus();
          }, 60);
        }}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onShareSession={shareSession}
        onLogout={handleLogout}
        onSettings={onSettings}
        onDesktopStateChange={setDesktopSidebarExpanded}
        onDesktopWidthChange={setDesktopSidebarWidth}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main
        className="relative ml-0 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent transition-[margin] duration-300 ease-out lg:ml-[var(--desktop-sidebar-offset)]"
        style={{ '--desktop-sidebar-offset': `${desktopSidebarExpanded ? desktopSidebarWidth : 32}px` } as React.CSSProperties}
      >
        {showFirstWelcome && !chatsView && (
          <>
            <div className="absolute left-[38px] top-[max(0.75rem,env(safe-area-inset-top))] z-[9997] flex h-8 max-w-[calc(100%-10rem)] items-center lg:hidden">
              <span className="truncate text-[15px] font-medium text-zinc-800 dark:text-zinc-100">
                Your first chat with Twinkle
              </span>
            </div>
          <div className={`absolute z-[9997] hidden h-9 max-w-[calc(100%-18rem)] items-center lg:flex ${desktopSidebarExpanded ? 'left-4 top-3' : 'left-1.5 top-4'}`}>
            <span className="truncate text-[15px] font-medium text-zinc-800 dark:text-zinc-100">
              Your first chat with Twinkle
            </span>
          </div>
          </>
        )}
        {(() => {
          const titledSession = currentSessionId === null ? null : sessions.find(item => item.id === currentSessionId) ?? null;
          if (!titledSession || chatsView) return null;
          return (
            <>
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[9996] hidden h-16 bg-gradient-to-b from-[var(--bg-main)] via-[var(--bg-main)]/80 to-transparent lg:block" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[9996] h-14 bg-gradient-to-b from-[var(--bg-main)] via-[var(--bg-main)]/80 to-transparent lg:hidden" />
              <div className="absolute left-[38px] top-[max(0.75rem,env(safe-area-inset-top))] z-[9998] flex h-8 max-w-[calc(100%-10rem)] items-center lg:hidden">
                <ChatTitleMenu
                  flushLeft
                  sessionId={titledSession.id}
                  title={titledSession.sessionName || 'New Chat'}
                  onRename={renameSession}
                  onShare={shareSession}
                  onCopy={copyWholeChat}
                  onDelete={deleteSession}
                />
              </div>
              <div className={`absolute z-[9998] hidden h-9 max-w-[calc(100%-18rem)] items-center lg:flex ${desktopSidebarExpanded ? 'left-4 top-3' : 'left-1.5 top-4'}`}>
                <ChatTitleMenu
                  flushLeft={!desktopSidebarExpanded}
                  sessionId={titledSession.id}
                  title={titledSession.sessionName || 'New Chat'}
                  onRename={renameSession}
                  onShare={shareSession}
                  onCopy={copyWholeChat}
                  onDelete={deleteSession}
                />
              </div>
            </>
          );
        })()}
        <div className={`absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-[9997] items-center gap-2 ${chatsView ? 'hidden' : 'flex'}`}>
          {chatFiles.length + chatOutputs.length > 0 && (
            <button
              type="button"
              onClick={() => setFilesPanelOpen(open => !open)}
              aria-label="Files in this chat"
              aria-expanded={filesPanelOpen}
              data-tooltip="Files in this chat"
              data-tooltip-side="bottom"
              className="relative inline-flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-zinc-300/70 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 sm:h-9 sm:w-9 dark:border-white/15 dark:bg-[#30302E] dark:text-zinc-200 dark:hover:bg-[#3A3A38]"
            >
              <FileDocIcon className="h-[22px] w-[22px] sm:h-5 sm:w-5" strokeWidth={1.8} />
              <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-zinc-900 px-1 text-[10px] font-semibold leading-none text-white dark:bg-zinc-100 dark:text-zinc-900">
                {chatFiles.length + chatOutputs.length > 99 ? '99+' : chatFiles.length + chatOutputs.length}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={handleTopShare}
            aria-label="Share"
            aria-haspopup="dialog"
            aria-expanded={shareSessionId !== null}
            className="group relative hidden h-9 items-center gap-2 rounded-lg border border-zinc-300/70 bg-white px-3.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 sm:inline-flex dark:border-white/15 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/5"
          >
            <span>Share</span>
          </button>
          {/* Phones: the text button is hidden, so an icon button opens the same popup. */}
          <button
            type="button"
            onClick={handleTopShare}
            aria-label="Share"
            aria-haspopup="dialog"
            aria-expanded={shareSessionId !== null}
            className="inline-flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-zinc-300/70 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 sm:hidden dark:border-white/15 dark:bg-[#30302E] dark:text-zinc-200 dark:hover:bg-[#3A3A38]"
          >
            <Share2 className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
        <OfflineBanner />
        <ChatFilesPanel
          open={filesPanelOpen}
          onClose={() => setFilesPanelOpen(false)}
          files={chatFiles}
          outputs={chatOutputs}
          onOpenOutput={output => void openChatOutput(output)}
          onOpenUploads={openUploadsModal}
        />
        <UploadedFilesModal
          open={uploadsModalOpen}
          onClose={() => setUploadsModalOpen(false)}
          files={chatFiles}
          renderPdfPreview={(src, name) => <PdfPreview src={src} fileName={name} />}
          readDocxText={extractDocxText}
        />
        {chatsView && (
          <ChatsListPage
            sessions={sidebarSessions}
            onOpenSession={(id) => {
              setCurrentSessionId(id);
              persistSessionId(id);
              openChatFromList(id);
            }}
            onNewChat={() => { createNewSession(); setMobileOpen(false); }}
            onDeleteSession={deleteSession}
            onDeleteMany={deleteManySessions}
            onRenameSession={renameSession}
          />
        )}
        {chatSearchOpen && !chatsView && (
          <div role="search" className="absolute right-4 top-14 z-[9997] flex w-[min(380px,calc(100vw-32px))] items-center gap-1.5 rounded-xl border border-zinc-300/70 bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:border-white/15 dark:bg-[#30302E]">
            <SearchIcon className="ml-2 h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.9} />
            <input
              ref={chatSearchInputRef}
              value={chatSearchQuery}
              onChange={event => { setChatSearchQuery(event.target.value); setChatSearchIndex(0); }}
              onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); stepChatSearch(event.shiftKey ? -1 : 1); }
                if (event.key === 'Escape') { event.preventDefault(); closeChatSearch(); }
              }}
              placeholder="Search in this chat"
              aria-label="Search in this chat"
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[14px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
            />
            <span className="shrink-0 px-1 text-[12px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-live="polite">
              {chatSearchTerm ? (chatSearchMatchIds.length ? `${Math.min(chatSearchIndex, chatSearchMatchIds.length - 1) + 1} of ${chatSearchMatchIds.length}` : 'No results') : ''}
            </span>
            <button type="button" onClick={() => stepChatSearch(-1)} aria-label="Previous result" data-tooltip="Previous result" className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => stepChatSearch(1)} aria-label="Next result" data-tooltip="Next result" className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"><ChevronDown className="h-4 w-4" /></button>
            <button type="button" onClick={closeChatSearch} aria-label="Close search" data-tooltip="Close search" className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        )}
        {/* Mobile / tablet: no navbar, only the sidebar toggle in the top-left.
            z-index sits above the page content and composer but below the
            sidebar drawer (z-[10010]) and modals (z-[12000]). */}
        <button
          type="button"
          onClick={(event) => { event.currentTarget.blur(); setMobileOpen(true); }}
          aria-label="Open sidebar"
          data-tooltip="Open sidebar"
          data-tooltip-shortcut={/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? '⌘.' : 'Ctrl+.'}
          data-tooltip-side="right"
          inert={mobileOpen}
          tabIndex={mobileOpen ? -1 : 0}
          className={`lg:hidden absolute left-[15px] top-[max(0.75rem,env(safe-area-inset-top))] z-[9997] flex h-8 w-[17px] items-center justify-center rounded-lg text-zinc-700 transition-all duration-200 before:pointer-events-none before:absolute before:inset-y-0 before:-inset-x-[3px] before:rounded-lg before:transition-colors hover:before:bg-zinc-200/60 after:absolute after:inset-y-0 after:-left-3 after:w-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-200 dark:hover:before:bg-zinc-800 ${
            mobileOpen ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <span className="sr-only">Open sidebar</span>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="relative shrink-0 -translate-y-px">
      <rect x="2.5" y="2.5" width="15" height="15" rx="0.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 3V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {/* Messages */}
        <div
          className={`twinkle-message-scroll-area relative min-h-0 min-w-0 flex-1 w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-contain pt-0 ${messages.length === 0 && !isTyping ? "flex flex-col justify-center pb-40 md:pb-44" : "pb-0"}`}
          style={messages.length === 0 && !isTyping ? undefined : { marginBottom: composerHeight }}
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          <div className={`relative mx-auto box-border w-[calc(100%-1rem)] max-w-[768px] px-0 sm:w-[calc(100%-2rem)] md:w-[calc(100%-3rem)] ${messages.length === 0 && !isTyping ? "pt-0 pb-0" : "pt-12 lg:pt-16 pb-8 md:pb-10"}`}>
            {messages.length === 0 && !isTyping ? showFirstWelcome ? (
              <div ref={emptyGreetingRef} className="mx-auto w-full min-w-0 -translate-y-8 px-2 text-left">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="font-serif text-zinc-900 dark:text-zinc-100"
                >
                  <h2 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.01em] sm:text-[1.75rem]">
                    Welcome, {welcomeName}! I&rsquo;m Twinkle.
                  </h2>
                  <p className="mt-3 text-[1.0625rem] leading-[1.55] sm:text-[1.1875rem]">
                    Bring me anything &mdash; a tricky problem, a rough idea, or something you need to write.
                    We&rsquo;ll work it out together.
                  </p>
                  <p className="mt-4 text-[1.0625rem] leading-[1.55] sm:text-[1.1875rem]">
                    Type below, tap the mic to talk with Live Talk, or attach a file and I&rsquo;ll help with that too.
                  </p>
                  <p className="mt-4 text-[1.0625rem] leading-[1.55] sm:text-[1.1875rem]">
                    Where do you want to start?
                  </p>
                </motion.div>
                <motion.span
                  initial={{ scale: 0.6, opacity: 0, rotate: -40 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                  className="mt-8 flex h-10 w-10 items-center justify-center"
                  aria-hidden="true"
                >
                  <StormLogo className="h-9 w-9" />
                </motion.span>
              </div>
            ) : (
              <div
                ref={emptyGreetingRef}
                className="twinkle-greeting mx-auto flex w-full min-w-0 -translate-y-[32px] items-center justify-center gap-3 px-2 text-left"
              >
                <motion.span
                  initial={{ scale: 0.8, opacity: 0, rotate: -24 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className="twinkle-greeting-logo flex shrink-0 items-center justify-center text-[#D97757]"
                  aria-hidden="true"
                >
                  <StormLogo className="twinkle-chat-logo h-9 w-9 sm:h-10 sm:w-10" />
                </motion.span>
                <motion.h2
                  key={chatGreeting}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="twinkle-greeting-text min-w-0 font-serif text-[1.875rem] font-normal leading-[1.15] tracking-[-0.01em] text-zinc-900 sm:text-[2.375rem] dark:text-zinc-100"
                >
                  {chatGreeting.replace(/\s*(?:\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)+\s*$/u, '')}
                </motion.h2>
              </div>
            ) : (
              <div className="twinkle-message-list space-y-6 pb-6 pt-2 font-normal text-[16px]">
                {hiddenMessageCount > 0 && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowAllMessages(true)}
                      className="rounded-full border border-zinc-300/70 px-4 py-1.5 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
                    >
                      Show {hiddenMessageCount} earlier messages
                    </button>
                  </div>
                )}
                {messages.map((msg, index) => {
                  if (index < hiddenMessageCount) return null;
                  const isEditing = editingMessage?.id === msg.id;
                  const shouldSpin = isTyping && msg.role === 'assistant' && index === messages.length - 1;
                  const attachedImages = messageAttachments[msg.id] || [];
                  const rawMessageContent = cleanMessageContent(msg.content);
                  const safeMessageContent = msg.role === 'assistant'
                    ? sanitizeAssistantText(rawMessageContent, shouldSpin)
                    : rawMessageContent;
                  const displayContent =
                    attachedImages.length > 0 && rawMessageContent === 'Image uploaded'
                      ? ''
                      : maskIncompleteImages(safeMessageContent);

                  return (
                    <div
                      key={msg.id || `msg-${index}`}
                      data-twinkle-message
                      data-msg-id={String(msg.id)}
      data-twinkle-user-content
                      className={`relative flex w-full min-w-0 ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`flex min-w-0 w-full ${
                          msg.role === 'user'
                            ? 'flex-col items-end gap-3'
                            : 'items-start'
                        }`}
                      >
                        {msg.role === 'user' && attachedImages.length > 0 && (
                          <div className="w-full flex justify-end">
                            <div className="flex flex-wrap justify-end gap-2.5 max-w-[92%] sm:max-w-[88%]">
                              {attachedImages.filter(isValidAttachmentDataUrl).map((url, i) => {
                                const mimeMatch = url.match(/^data:([^;,]+)/i);
                                const mime = mimeMatch?.[1]?.toLowerCase() || '';
                                const attachmentName =
                                  getStoredAttachmentName(url) ||
                                  getAttachmentNameFromDataUrl(url, i);
                                const isImage = mime.startsWith('image/');
                                const isPdf = mime === 'application/pdf';

                                const badge =
                                  isPdf ? 'PDF'
                                  : mime === 'application/msword' ? 'DOC'
                                  : mime.includes('wordprocessingml') ? 'DOCX'
                                  : mime === 'application/vnd.ms-excel' ? 'XLS'
                                  : mime.includes('spreadsheetml') ? 'XLSX'
                                  : mime === 'application/vnd.ms-powerpoint' ? 'PPT'
                                  : mime.includes('presentationml') ? 'PPTX'
                                  : (attachmentName.includes('.') ? attachmentName.split('.').pop()!.toUpperCase().slice(0, 5) : '')
                                    || mime.split('/')[1]?.toUpperCase().slice(0, 5)
                                    || 'FILE';

                                return (
                                  <AttachmentTile
                                    key={`sender-attachment-${i}`}
                                    name={attachmentName}
                                    badge={badge}
                                    imageSrc={isImage ? url : null}
                                    pdfSrc={isPdf ? url : null}
                                    title="Open attachment preview"
                                    onClick={() => void openPersistedAttachmentPreview(url, i)}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className={`flex flex-col gap-1 min-w-0 max-w-full ${
                          msg.role === 'user' ? 'items-end w-full' : 'flex-1'
                        }`}>
                          {msg.role === 'assistant' && weatherCards[String(msg.id)] && (
                            <WeatherCard data={weatherCards[String(msg.id)]} />
                          )}
                          {/* Message card: do not render an empty bubble for attachment-only messages. */}
                          {((isEditing || displayContent.trim().length > 0)) && (
                          <div
                            className={`min-w-0 max-w-full ${
                              msg.role === 'user'
                                ? (isEditing
                                    ? 'twinkle-edit-card w-full rounded-2xl border border-zinc-300 bg-white p-3 shadow-[0_2px_10px_rgba(0,0,0,0.06)] dark:border-zinc-600 dark:bg-zinc-900'
                                    : 'twinkle-user-bubble w-fit max-w-[85%] sm:max-w-[75%] rounded-xl bg-zinc-100 px-4 py-2.5 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100')
                                : 'twinkle-assistant-body w-full px-0 py-0 text-zinc-900 dark:text-zinc-100'
                            }`}
                          >
                            <div className="font-serif text-[16px] leading-[1.7] markdown-body twinkle-response-content max-w-none min-w-0 w-full break-words [overflow-wrap:anywhere]">
                              {isEditing ? (
                                <div className="flex w-full min-w-0 flex-col gap-3">
                                  <textarea
                                    value={editInput}
                                    onChange={(e) => setEditInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
                                        if (!isTyping && editInput.trim()) void handleSaveEdit();
                                      }
                                      if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                    ref={(el) => {
                                      if (el) {
                                        el.style.height = 'auto';
                                        el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
                                      }
                                    }}
                                    rows={1}
                                    aria-label="Edit message"
                                    className="block w-full min-w-0 max-w-full resize-none overflow-y-auto bg-transparent p-1 text-[16px] font-normal leading-[1.6] text-zinc-900 outline-none dark:text-zinc-100"
                                    autoFocus
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-300 bg-transparent px-3 text-[14px] font-medium text-zinc-800 transition-colors hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleSaveEdit()}
                                      disabled={!editInput.trim() || isTyping}
                                      className="twinkle-primary-btn inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  urlTransform={(url: string) =>
                                    url.startsWith('data:image/') ? url : defaultUrlTransform(url)
                                  }
                                  components={{
                                    h1({ children, ...props }: any) {
                                      return (
                                        <h1
                                          className="mt-6 mb-2 text-[1.5rem] font-semibold leading-snug tracking-tight text-zinc-950 dark:text-zinc-50"
                                          {...props}
                                        >
                                          {children}
                                        </h1>
                                      );
                                    },
                                    h2({ children, ...props }: any) {
                                      return (
                                        <h2
                                          className="mt-7 mb-2.5 border-b border-zinc-200/70 dark:border-zinc-700/60 pb-1.5 text-[1.25rem] font-semibold leading-snug tracking-tight text-zinc-950 dark:text-zinc-50"
                                          {...props}
                                        >
                                          {children}
                                        </h2>
                                      );
                                    },
                                    h3({ children, ...props }: any) {
                                      return (
                                        <h3
                                          className="mt-5 mb-1.5 text-[1.0625rem] font-semibold leading-snug tracking-tight text-zinc-950 dark:text-zinc-50"
                                          {...props}
                                        >
                                          {children}
                                        </h3>
                                      );
                                    },
                                    h4({ children, ...props }: any) {
                                      return (
                                        <h4
                                          className="mt-4 mb-1.5 text-[1rem] font-semibold leading-snug text-zinc-900 dark:text-zinc-100"
                                          {...props}
                                        >
                                          {children}
                                        </h4>
                                      );
                                    },
                                    hr(props: any) {
                                      return <hr className="my-6 border-0 border-t border-zinc-200 dark:border-zinc-700/70" {...props} />;
                                    },
                                    li({ children, ...props }: any) {
                                      return <li className="pl-1 leading-[1.65] [&>p]:my-1 [&>ul]:my-1.5 [&>ol]:my-1.5" {...props}>{children}</li>;
                                    },
                                    p({ children, ...props }: any) {
                                      return <p className="my-3 leading-[1.7] break-words [overflow-wrap:anywhere] first:mt-0 last:mb-0" {...props}>{children}</p>;
                                    },
                                    ul({ children, ...props }: any) {
                                      return <ul className="my-3 list-disc space-y-1.5 pl-6 leading-7 marker:text-zinc-400" {...props}>{children}</ul>;
                                    },
                                    ol({ children, ...props }: any) {
                                      return <ol className="my-3 list-decimal space-y-1.5 pl-6 leading-7 marker:text-zinc-500" {...props}>{children}</ol>;
                                    },
                                    blockquote({ children, ...props }: any) {
                                      return <blockquote className="my-3 border-l-[3px] border-zinc-300 pl-4 text-zinc-600 dark:text-zinc-300" {...props}>{children}</blockquote>;
                                    },
                                    table({ children, ...props }: any) {
                                      return (
                                        <div
                                          className="twinkle-table-wrap block w-full min-w-0 max-w-full"
                                          style={{ width: '100%', maxWidth: '100%' }}
                                        >
                                          <table
                                            className="twinkle-response-table w-full min-w-full max-w-full"
                                            style={{ width: '100%', minWidth: '100%', maxWidth: '100%', tableLayout: 'auto' }}
                                            {...props}
                                          >
                                            {children}
                                          </table>
                                        </div>
                                      );
                                    },
                                    thead({ children, ...props }: any) {
                                      return <thead {...props}>{children}</thead>;
                                    },
                                    th({ children, ...props }: any) {
                                      return <th className="twinkle-response-th" {...props}>{children}</th>;
                                    },
                                    td({ children, ...props }: any) {
                                      return <td className="twinkle-response-td" {...props}>{children}</td>;
                                    },
                                    img({ src, alt }: any) {
                                      // Name downloads after the prompt that produced this image.
                                      const promptMsg = [...messages.slice(0, index)].reverse().find(item => item.role === 'user');
                                      return <GeneratedImage src={src} alt={alt} prompt={cleanMessageContent(promptMsg?.content || '')} />;
                                    },
                                    strong({ children, ...props }: any) {
                                      return (
                                        <strong className="font-semibold text-zinc-950 dark:text-zinc-50" {...props}>
                                          {children}
                                        </strong>
                                      );
                                    },
                                    em({ children, ...props }: any) {
                                      const value = String(children ?? '');
                                      const isResumeSubtitle =
                                        /Java Developer\s*[—-]\s*Java Backend Developer/i.test(value);
                                      return (
                                        <em
                                          className={isResumeSubtitle ? 'not-italic font-semibold' : undefined}
                                          {...props}
                                        >
                                          {children}
                                        </em>
                                      );
                                    },
                                    a({ children, href, ...props }: any) {
                                      // Always show the complete destination instead
                                      // of a shortened Markdown label such as
                                      // [Cartify Repo](https://github.com/...).
                                      // This keeps every URL visible AND clickable.
                                      const visibleHref = href
                                        ?.replace(/^mailto:/i, '')
                                        .replace(/^tel:/i, '');
                                      const isExternal = /^https?:\/\//i.test(href || '');

                                      return (
                                        <a
                                          href={href}
                                          target={isExternal ? '_blank' : undefined}
                                          rel={isExternal ? 'noopener noreferrer' : undefined}
                                          className="!underline underline-offset-2 decoration-1 !text-blue-600 dark:!text-blue-400 hover:!text-blue-700 dark:hover:!text-blue-300 font-medium break-all"
                                          style={{ textDecoration: 'underline' }}
                                          {...props}
                                        >
                                          {visibleHref || children}
                                        </a>
                                      );
                                    },
                                    pre({ children, ...props }: any) {
                                      return (
                                        <div className="my-4 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200/40 dark:border-zinc-500/20 shadow-lg bg-gradient-to-br from-zinc-50/80 to-zinc-100/60 dark:from-zinc-950/50 dark:to-zinc-800/60">
                                          <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-zinc-200/30 dark:border-zinc-500/15 bg-zinc-100/40 dark:bg-zinc-900/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-1000 shrink-0" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-300 dark:text-zinc-900 dark:text-zinc-100">Code</span>
                                          </div>
                                          <pre
                                            className="max-w-full overflow-x-auto p-3 sm:p-4 md:p-5 text-[0.75rem] sm:text-[0.82rem] leading-relaxed font-mono text-zinc-900 dark:text-zinc-100 dark:text-zinc-300 whitespace-pre"
                                            {...props}
                                          >
                                            {children}
                                          </pre>
                                        </div>
                                      );
                                    },
                                    code({ className, children, ...props }: any) {
                                      const match = /language-(\w+)/.exec(className || '');
                                      const content = String(children).replace(/\n$/, '');
                                      const isInline = props.inline || !className;
                                      return !isInline && match ? (
                                        <CodeBlock language={match[1]} value={content} />
                                      ) : (
                                        <code
                                          className={`${className || ''} bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-600 dark:text-zinc-300 px-1 py-0.5 rounded font-mono text-[0.85em] break-words [overflow-wrap:anywhere]`}
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      );
                                    }
                                  } as Components}
                                >
                                  {normalizeMathDelimiters(displayContent)}
                                </ReactMarkdown>
                              )}
                            </div>
                          </div>
                          )}

                          {/* Message action buttons.
                              Always visible so touch devices do not depend on hover. */}
                          <div
                            className={`twinkle-message-actions flex items-center mt-1 ${
                              msg.role === 'user'
                                ? 'flex-wrap gap-1 justify-end'
                                : 'flex-col-reverse items-start gap-2.5'
                            } ${isEditing ? 'hidden' : ''}`}
                          >
                            {msg.role === 'assistant' && (
                              <span className="ml-1.5 mt-0.5 flex items-center text-[#D97757]" aria-hidden="true">
                                <StormLogo className="h-6 w-6" />
                              </span>
                            )}

                            {msg.role === 'user' && (
                              <RelativeTime
                                value={msg.timestamp}
                                className="text-[12px] font-normal text-zinc-500 dark:text-zinc-400 whitespace-nowrap mr-1"
                              />
                            )}

                            <div className="flex items-center gap-0.5">
                                {msg.role === 'user' ? (
                                  <>
                                    <button type="button" onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(cleanMessageContent(msg.content));
                                        setCopiedId(msg.id);
                                        toast.success('Copied to clipboard');
                                        window.setTimeout(() => setCopiedId(null), 2000);
                                      } catch { window.prompt('Copy this message:', cleanMessageContent(msg.content)); }
                                    }} data-tooltip={copiedId === msg.id ? 'Copied' : 'Copy message'} aria-label="Copy message"
                                      className="twinkle-tooltip-trigger p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-300 transition-all touch-manipulation">
                                      {copiedId === msg.id ? <Check className="w-4 h-4 md:w-3.5 md:h-3.5" /> : <Copy className="w-4 h-4 md:w-3.5 md:h-3.5" />}
                                    </button>
                                    {!isEditing && !isTyping && (
                                      <button type="button" onClick={() => void handleRetryMessage(msg)} data-tooltip="Retry" aria-label="Retry message"
                                        className="twinkle-tooltip-trigger p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-300 transition-all touch-manipulation">
                                        <RotateCw className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                      </button>
                                    )}
                                    {!isEditing && !isTyping && (
                                      <button type="button" onClick={() => handleStartEdit(msg)} data-tooltip="Edit message" aria-label="Edit message"
                                        className="twinkle-tooltip-trigger p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-300 transition-all touch-manipulation">
                                        <Pencil className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <button type="button" onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(cleanMessageContent(msg.content));
                                        setCopiedId(msg.id);
                                        toast.success('Copied to clipboard');
                                        window.setTimeout(() => setCopiedId(null), 2000);
                                      } catch { window.prompt('Copy this response:', cleanMessageContent(msg.content)); }
                                    }} data-tooltip={copiedId === msg.id ? 'Copied' : 'Copy'} aria-label="Copy response"
                                      className="twinkle-tooltip-trigger p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all touch-manipulation text-zinc-500 dark:text-zinc-300">
                                      {copiedId === msg.id ? <Check className="w-[15px] h-[15px] md:w-4 md:h-4" /> : <Copy className="w-[15px] h-[15px] md:w-4 md:h-4" />}
                                    </button>
                                    <button type="button" onClick={() => handleReadAloud(msg)}
                                      data-tooltip={speakingMessageId === msg.id ? 'Stop reading' : 'Read aloud'}
                                      aria-label={speakingMessageId === msg.id ? 'Stop reading aloud' : 'Read response aloud'}
                                      aria-pressed={speakingMessageId === msg.id}
                                      className={`twinkle-tooltip-trigger p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all touch-manipulation ${speakingMessageId === msg.id ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-500 dark:text-zinc-300'}`}>
                                      {speakingMessageId === msg.id ? <VolumeX className="w-[15px] h-[15px] md:w-4 md:h-4" /> : <Volume2 className="w-[15px] h-[15px] md:w-4 md:h-4" />}
                                    </button>
                                    <button type="button" onClick={() => setFeedback(msg.id, 'up')}
                                      data-tooltip="Good response" aria-label="Good response" aria-pressed={messageFeedback[String(msg.id)] === 'up'}
                                      className={`twinkle-tooltip-trigger p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all touch-manipulation ${messageFeedback[String(msg.id)] === 'up' ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-500 dark:text-zinc-300'}`}>
                                      <ThumbsUp className="w-[15px] h-[15px] md:w-4 md:h-4" fill={messageFeedback[String(msg.id)] === 'up' ? 'currentColor' : 'none'} />
                                    </button>
                                    <button type="button" onClick={() => setFeedback(msg.id, 'down')}
                                      data-tooltip="Bad response" aria-label="Bad response" aria-pressed={messageFeedback[String(msg.id)] === 'down'}
                                      className={`twinkle-tooltip-trigger p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all touch-manipulation ${messageFeedback[String(msg.id)] === 'down' ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-500 dark:text-zinc-300'}`}>
                                      <ThumbsDown className="w-[15px] h-[15px] md:w-4 md:h-4" fill={messageFeedback[String(msg.id)] === 'down' ? 'currentColor' : 'none'} />
                                    </button>
                                    {!isTyping && (
                                      <button type="button" onClick={() => {
                                        const previousUserMessage = [...messages.slice(0, index)].reverse().find(m => m.role === 'user');
                                        if (previousUserMessage) void handleRetryMessage(previousUserMessage);
                                      }} data-tooltip="Retry" aria-label="Retry response"
                                        className="twinkle-tooltip-trigger p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all touch-manipulation text-zinc-500 dark:text-zinc-300">
                                        <RotateCw className="w-[15px] h-[15px] md:w-4 md:h-4" />
                                      </button>
                                    )}
                                    <RelativeTime value={msg.timestamp} />
                                  </>
                                )}
                              </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isTyping &&
                  !shouldShowImageProgress(messages, selectedModel, isTyping) &&
                  (() => {
                    const last = messages[messages.length - 1];
                    const replyStarted =
                      !!last && last.role === 'assistant' && cleanMessageContent(last.content).trim().length > 0;
                    return !replyStarted;
                  })() && <ThinkingStatus phase={responsePhase} context={thinkingContext} />}

                {shouldShowImageProgress(messages, selectedModel, isTyping) && (
                  <ImageGenerationProgress
                    prompt={cleanMessageContent([...messages].reverse().find(message => message.role === 'user')?.content || '')}
                  />
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {(messages.length === 0 && !isTyping) && <div ref={messagesEndRef} />}
          </div>

          {/* Soft fade: messages visually disappear into the composer instead of
              abruptly stopping at its top edge while the user scrolls. */}
          <div aria-hidden="true" className="chat-messages-bottom-mask" />
        </div>

        {/* Input bar */}
        <div
          ref={composerWrapRef}
          className={`twinkle-composer-position fixed bottom-0 left-0 right-0 z-[9000] w-full max-w-none overflow-visible bg-transparent px-2 pt-1 pb-[calc(0.35rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-1.5 sm:pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:px-6 lg:pt-2 lg:pb-[calc(0.65rem+env(safe-area-inset-bottom))] ${messages.length === 0 && !isTyping ? 'twinkle-composer-empty-state' : ''}`}
          style={messages.length === 0 && !isTyping && emptyComposerTop !== null ? { top: `${emptyComposerTop}px`, bottom: 'auto' } : undefined}
        >
          <div
            className="twinkle-composer-shell relative mx-auto box-border min-w-0 w-full max-w-[768px]"
            style={{ boxSizing: 'border-box' }}
          >
            {showScrollBottom && !isAtBottom && messages.length > 0 && (
              <button
                type="button"
              className="group absolute left-1/2 top-[-3.25rem] z-[80] flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                aria-label="Scroll to latest message"
                data-tooltip="Scroll to latest message"
                onClick={() => {
                  const container = messagesContainerRef.current;
                  if (!container) return;
                  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                  requestAnimationFrame(() => syncScrollState(container));
                }}
              >
                {isTyping ? (
                  <>
                    <span className="flex items-center justify-center gap-[3px] group-hover:hidden" aria-hidden="true">
                      {[0, 1, 2].map((dot) => (
                        <motion.span
                          key={dot}
                          className="block shrink-0 rounded-full"
                          style={{ width: 5, height: 5, backgroundColor: 'currentColor', opacity: 1 }}
                          animate={{ y: [0, -3, 0], opacity: [0.55, 1, 0.55] }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: dot * 0.16 }}
                        />
                      ))}
                    </span>
                    <span className="hidden items-center justify-center group-hover:flex" aria-hidden="true">
                      <LongTailArrowDown className="h-[18px] w-[18px] md:h-5 md:w-5" />
                    </span>
                  </>
                ) : (
                  <LongTailArrowDown className="h-[18px] w-[18px] md:h-5 md:w-5" aria-hidden="true" />
                )}
              </button>
            )}


            <div className={`relative z-[60] flex w-full min-w-0 flex-col overflow-visible rounded-[20px] border border-zinc-200/90 bg-white shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.035),0_0_0_0.5px_rgba(0,0,0,0.04)] transition-all dark:border-zinc-700/90 dark:bg-zinc-900 dark:shadow-black/20 ${justFinished ? 'animate-blink' : ''}`}>
              {/* File preview strip (kept for consistency but never shown without UI trigger) */}
              <AnimatePresence>
                {filePreviews.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-3 px-3.5 pt-3.5 pb-1">
                    {filePreviews.map(fp => {
                      const isImage = fp.file.type.startsWith('image/') && !!fp.preview;
                      const ext = fp.file.name.includes('.') ? fp.file.name.split('.').pop()!.toUpperCase() : '';
                      return (
                        <AttachmentTile
                          key={fp.id}
                          name={fp.file.name}
                          badge={fp.file.type === 'application/pdf' ? 'PDF' : ext.slice(0, 5) || 'FILE'}
                          imageSrc={isImage ? fp.preview : null}
                          pdfSrc={fp.file.type === 'application/pdf' ? fp.preview : null}
                          warnLowRes
                          title={`Preview ${fp.file.name}`}
                          onClick={() => void openFilePreview(fp.file, fp.preview)}
                          onRemove={() => removeFile(fp.id)}
                        />
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                ref={modelPickerRef}
                className={`twinkle-composer-row relative z-[200] flex min-w-0 items-center${messages.length > 0 ? ' twinkle-composer-inline' : ''}${isTyping ? ' twinkle-composer-streaming' : ''}${voiceInputActive ? ' twinkle-composer-voice' : ''}`}
              >
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.tsv,.json,.xml,.html,.htm,.md,.markdown,.rtf,.odt,.ods,.odp"
                  onChange={(e) => {
                    // FileList is live: copy it BEFORE resetting the input, otherwise
                    // clearing the value empties it and nothing gets attached.
                    const picked = Array.from(e.currentTarget.files ?? []);
                    e.currentTarget.value = '';
                    setUploadModalOpen(false);
                    if (picked.length) void handleFileSelection(picked);
                  }}
                />

                {/* Main prompt area — always above the action row */}
                {voiceInputActive ? (
                  <>
                    {/* Text area on top — the real composer field, filled live while speaking. */}
                    <div
                      className="twinkle-composer-prompt relative flex min-h-[48px] min-w-0 flex-1 items-start px-2 py-1 sm:min-h-[52px]"
                      aria-live="polite"
                      aria-label={voiceSpeechDetected ? 'Listening and transcribing' : 'Speak now'}
                    >
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        rows={1}
                        aria-label="How can I help you today?"
                        className="twinkle-composer-textarea block w-full min-w-0 resize-none overflow-y-auto bg-transparent p-0 text-[16px] font-normal leading-[1.5] text-zinc-900 outline-none placeholder:italic placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500 min-h-[38px] max-h-[200px] sm:text-[16px] sm:min-h-[40px]"
                        placeholder={voiceSpeechDetected ? '' : 'Listening…'}
                        onInput={(e) => {
                          const t = e.target as HTMLTextAreaElement;
                          t.style.height = 'auto';
                          t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
                        }}
                      />
                    </div>

                    {/* Bottom row: + · dotted listening line · ✕ · ✓ */}
                    <motion.button
                      type="button"
                      onClick={openPlusMenu}
                      disabled={isProcessingFiles}
                      aria-label="Attach files"
                      data-tooltip="Attach files"
                      whileTap={{ scale: 0.94 }}
                      className="twinkle-tooltip-trigger twinkle-composer-plus flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <Plus className="h-7 w-7 shrink-0" strokeWidth={1.6} />
                    </motion.button>

                    <div
                      className="twinkle-voice-bars flex min-w-0 items-center justify-end overflow-hidden"
                      style={{ gridArea: 'spacer' }}
                      aria-hidden="true"
                    >
                      <VoiceLevelBars />
                    </div>

                    {/* Cancel — discards dictation and restores the composer. */}
                    <motion.button
                      type="button"
                      onClick={() => { if (Date.now() - voiceUiStartedAtRef.current < 400) return; cancelVoiceInput(); }}
                      aria-label="Cancel dictation"
                      data-tooltip="Cancel"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.92 }}
                      className="twinkle-tooltip-trigger twinkle-composer-mic flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <X className="h-[18px] w-[18px]" strokeWidth={2} />
                    </motion.button>

                    {/* Confirm — keeps the spoken text in the composer. */}
                    <motion.button
                      type="button"
                      onClick={() => { if (Date.now() - voiceUiStartedAtRef.current < 400) return; void stopVoiceCapture(); }}
                      disabled={voiceCaptureStopped}
                      aria-label="Confirm dictation"
                      data-tooltip="Done"
                      whileHover={{ scale: voiceCaptureStopped ? 1 : 1.05 }}
                      whileTap={{ scale: 0.92 }}
                      className="twinkle-tooltip-trigger twinkle-composer-submit flex shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      style={{ width: 36, minWidth: 36, height: 36, flexBasis: 36, justifySelf: 'end' }}
                    >
                      <Check className="h-[18px] w-[18px]" strokeWidth={2} />
                    </motion.button>
                  </>
                ) : (
                  <div className="twinkle-composer-prompt relative flex min-h-[48px] min-w-0 flex-1 items-center px-2 py-1 sm:min-h-[52px] sm:px-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          if (isTyping) queueMessageWhileResponding();
                          else handleSendMessage();
                        }
                      }}
                      placeholder={isPhoneViewport ? 'Ask Anything' : 'How can I help you today?'}
                      rows={1}
                      className="twinkle-composer-textarea scroll-hide block w-full min-w-0 resize-none overflow-y-auto bg-transparent p-0 text-[16px] font-normal leading-[1.5] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500 min-h-[38px] max-h-[200px] transition-[height] duration-150 sm:text-[16px] sm:min-h-[40px]"
                      onInput={(e) => {
                        const t = e.target as HTMLTextAreaElement;
                        t.style.height = 'auto';
                        t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
                      }}
                    />
                  </div>
                )}

                {/* Bottom action row: plus → model → mic → send/live talk */}
                {!voiceInputActive && (
                  <div className="twinkle-composer-actions flex shrink-0 items-center gap-0 px-1 sm:px-1.5">
                  {/* + attachment button */}
                  <motion.button
                    type="button"
                    onClick={openPlusMenu}
                    disabled={isTyping || isProcessingFiles}
                    aria-label="Add files and more"
                    aria-haspopup="menu"
                    aria-expanded={plusMenu !== null}
                    data-tooltip="Add files and more"
                    data-tooltip-side="bottom"
                    data-tooltip-fixed
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.94 }}
                    className="twinkle-tooltip-trigger twinkle-composer-plus group relative self-center flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-700 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
                  >
                    {isProcessingFiles ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600 dark:border-zinc-600 dark:border-t-indigo-400" />
                    ) : (
                      <Plus className="h-7 w-7 shrink-0 opacity-100" strokeWidth={1.6} />
                    )}
                  </motion.button>

                  <div className="min-w-0 flex-1" />

                  {/* Model selector */}
                  <div className="group relative inline-flex h-8 min-w-0 max-w-full shrink items-center gap-1 rounded-lg border-0 bg-transparent px-1.5 text-black shadow-none outline-none transition-colors hover:bg-zinc-100/70 dark:bg-transparent dark:text-white dark:hover:bg-zinc-800/70 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-1.5 sm:px-2">
                    <motion.button
                      type="button"
                      onClick={() => setModelPickerOpen(prev => !prev)}
                      aria-haspopup="listbox"
                      aria-expanded={modelPickerOpen}
                      data-tooltip={selectedModelName}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      
                         className="twinkle-tooltip-trigger group relative inline-flex h-8 min-w-0 max-w-full shrink items-center gap-1 rounded-lg border-0 bg-transparent px-1 text-black shadow-none outline-none transition-colors hover:bg-zinc-100/70 dark:bg-transparent dark:text-white dark:hover:bg-zinc-800/70 disabled:cursor-not-allowed disabled:opacity-50 sm:shrink-0 sm:gap-1.5 sm:px-2"
>
                            <span key={activeModel.id} className="whitespace-nowrap text-[14px] font-normal tracking-normal text-zinc-600 dark:text-zinc-300">
                                {activeModel.name}
                                       </span>
                                 <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-600 dark:text-zinc-300" />
                               </motion.button>
                                    <AnimatePresence>
                                {modelPickerOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.97 }}
                          transition={{ duration: 0.16, ease: 'easeOut' }}
                          role="listbox"
                          aria-label="Select AI model"
                          className="model-dropdown z-[99999] max-h-[min(360px,calc(100dvh-150px))] overflow-y-auto overflow-x-hidden border border-zinc-200/90 bg-white/95 p-1.5 shadow-2xl shadow-zinc-900/20 backdrop-blur-2xl dark:border-zinc-700/90 dark:bg-zinc-900/95 dark:shadow-black/50 sm:max-h-[420px] sm:overflow-y-auto sm:rounded-2xl sm:p-2" style={{ width: 'min(320px, calc(100vw - 24px))' }}
                        >
                          <div className="px-2 pb-2 pt-1">
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                              Select AI model
                            </p>
                          </div>
                          {(() => {
                            const otherModels = MODEL_OPTIONS.filter(option => option.id !== selectedModel);
                            const renderOption = (option: ModelOption, selected: boolean) => (
                              <motion.button
                                key={option.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  chooseModel(option.id);
                                }}
                                whileTap={{ scale: 0.99 }}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected ? 'bg-zinc-100 dark:bg-white/10' : 'hover:bg-zinc-50 dark:hover:bg-white/5'}`}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{option.name}</span>
                                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                                    {option.description}
                                  </span>
                                </span>
                                {selected && <Check className="h-4 w-4 shrink-0 text-zinc-900 dark:text-zinc-100" strokeWidth={2} />}
                              </motion.button>
                            );
                            return (
                              <>
                                {renderOption(activeModel, true)}
                                <div className="mx-2 my-1.5 h-px bg-zinc-200/80 dark:bg-white/10" />
                                <button
                                  ref={moreRowRef}
                                  type="button"
                                  aria-haspopup="listbox"
                                  aria-expanded={modelFlyout !== null || modelMoreOpen}
                                  onMouseEnter={() => { openModelFlyout(); }}
                                  onMouseLeave={scheduleFlyoutClose}
                                  onFocus={() => { openModelFlyout(); }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (flyoutPinned.current) {
                                      // Second click unpins and closes.
                                      flyoutPinned.current = false;
                                      cancelFlyoutClose();
                                      setModelFlyout(null);
                                      return;
                                    }
                                    if (openModelFlyout()) {
                                      flyoutPinned.current = true;
                                      return;
                                    }
                                    setModelMoreOpen(prev => !prev);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/5 ${modelFlyout ? 'bg-zinc-50 dark:bg-white/5' : ''}`}
                                >
                                  More models
                                  <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform duration-200 dark:text-zinc-400 ${modelFlyout ? '-rotate-90' : modelMoreOpen ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence initial={false}>
                                  {modelMoreOpen && !modelFlyout && (
                                    <motion.div
                                      key="more-models"
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2, ease: 'easeOut' }}
                                      className="overflow-hidden"
                                    >
                                      <div className="space-y-0.5 pt-0.5">
                                        {otherModels.map(option => renderOption(option, false))}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                                {modelFlyout && typeof document !== 'undefined' && createPortal(
                                  <motion.div
                                    data-model-flyout
                                    role="listbox"
                                    aria-label="More models"
                                    initial={{ opacity: 0, x: -4 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.14, ease: 'easeOut' }}
                                    onMouseEnter={cancelFlyoutClose}
                                    onMouseLeave={scheduleFlyoutClose}
                                    style={{ position: 'fixed', left: modelFlyout.left, bottom: modelFlyout.bottom, width: 300, zIndex: 2147483000 }}
                                    className="max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl border border-zinc-200/90 bg-white p-2 shadow-2xl shadow-zinc-900/20 dark:border-zinc-700/90 dark:bg-zinc-900 dark:shadow-black/50"
                                  >
                                    <div className="space-y-0.5">
                                      {otherModels.map(option => renderOption(option, false))}
                                    </div>
                                  </motion.div>,
                                  document.body
                                )}
                              </>
                            );
                          })()}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {!voiceInputActive && (
                    <motion.button
                      type="button"
                      // Start voice capture on the earliest pointer event so the
                      // browser can initialize the microphone before the click
                      // event/render cycle completes. The existing guard inside
                      // startVoiceInput prevents the follow-up click from
                      // starting a second recognition session.
                      onPointerEnter={() => warmLiveToken()}
                      onFocus={() => warmLiveToken()}
                      onPointerDown={event => { if (event.pointerType === 'mouse' && event.button === 0) startVoiceInput(); }}
                      onClick={startVoiceInput}
                      disabled={isTyping || isProcessingFiles}
                      aria-label="Voice input"
                      data-tooltip="Dictate"
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.9 }}
                      className="twinkle-tooltip-trigger twinkle-composer-mic ml-1 mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:ml-1 sm:mr-1.5 sm:h-8 sm:w-8"
                    >
                      <Mic className="h-5 w-5" strokeWidth={2} />
                    </motion.button>
                  )}

                  {/* Live Talk / Send */}
                  
                    {!isTyping && !input.trim() && filePreviews.length === 0 ? (
                      <motion.button
                        key="live-talk"
                        type="button"
                        onPointerEnter={() => warmLiveToken()}
                        onPointerDown={event => {
                          // Open on press (mouse) instead of waiting for release;
                          // touch and keyboard open on click. Token warms in parallel.
                          warmLiveToken();
                          if (event.pointerType === 'mouse' && event.button === 0) setLiveTalkOpen(true);
                        }}
                        onClick={() => setLiveTalkOpen(true)}
                        aria-label="Open Live Talk"
                        data-tooltip="Live Talk"
                        className="twinkle-tooltip-trigger twinkle-composer-submit relative z-[30] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-900 transition hover:opacity-70 dark:text-zinc-100 sm:h-7 sm:w-7"
                        style={{
                          background: 'transparent',
                          boxShadow: 'none',
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-[22px] w-[22px]"
                          aria-hidden="true"
                        >
                          <path
                            d="M5 10v4M9 7v10M13 3.5v17M17 8v8M21 10.5v3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </motion.button>
                    ) : (
                      <div className="twinkle-composer-submit-group">
                        {isTyping && (
                          <motion.button
                            key="stop"
                            type="button"
                            onClick={handleStopResponse}
                            aria-label="Stop response"
                            data-tooltip="Stop response"
                            whileTap={{ scale: 0.94 }}
                            className="twinkle-tooltip-trigger twinkle-composer-submit relative z-[30] flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[#E6E6E6] bg-white text-[#1F1E1D] shadow-none transition-colors hover:bg-zinc-50 dark:!border-white/20 dark:!bg-[#30302E] dark:text-zinc-100 dark:hover:!bg-[#3a3a37]"
                            style={{ boxShadow: 'none' }}
                          >
                            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                              <rect x="5" y="5" width="14" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                            </svg>
                          </motion.button>
                        )}
                        <motion.button
                          key="send"
                          type="button"
                          onClick={isTyping ? queueMessageWhileResponding : () => handleSendMessage()}
                          disabled={!input.trim() && (!Array.isArray(filePreviews) || filePreviews.length === 0)}
                          aria-label="Send message"
                          data-tooltip={isTyping ? 'Send after the current response' : 'Send message'}
                          className="twinkle-tooltip-trigger twinkle-composer-submit relative z-[30] flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-transparent text-white shadow-none transition-all duration-200 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
                          style={{ background: '#C6613F', boxShadow: 'none' }}
                        >
                          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                            <path
                              d="M12 19V5M5.5 11.5 12 5l6.5 6.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </motion.button>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
            {messages.length > 0 && (
            <div
              className="twinkle-chat-disclaimer twinkle-chat-disclaimer-fixed !mt-1.5 !mb-0"
              aria-live="polite"
            >
              <p className="text-center text-[12px] leading-relaxed font-normal text-zinc-500 dark:text-zinc-400">
                Twinkle is AI and can make mistakes.
              </p>
            </div>
            )}
          </div>
        </div>
      </main>

      <LiveTalkModal
        open={liveTalkOpen}
        onClose={() => setLiveTalkOpen(false)}
        userName={user.username?.trim() || user.name?.trim() || null}
        onSessionComplete={handleLiveSessionComplete}
        onSessionPreview={handleLiveSessionPreview}
      />

      <AnimatePresence>
        {previewFile && previewUrl && (() => {
          const isImagePreview = previewFile.type.startsWith('image/');
          const isPdfPreview = previewFile.type === 'application/pdf';
          const hasRichPreview = isPdfPreview || previewText !== null;
          const previewSize = `${(previewFile.size / 1024).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KB`;

          if (isImagePreview) {
            return (
              <motion.div
                key="twinkle-image-preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 p-4"
                onMouseDown={(e) => { if (e.target === e.currentTarget) closeFilePreview(); }}
                role="dialog"
                aria-modal="true"
                aria-label={previewFile.name}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="relative flex max-w-full flex-col items-center"
                >
                  {/* Shown from the original bytes: no resampling, only CSS fit-to-screen. */}
                  <img
                    src={previewUrl}
                    alt={previewFile.name}
                    draggable={false}
                    className="block h-auto max-h-[calc(100vh-120px)] w-auto max-w-[calc(100vw-32px)] rounded-xl bg-white object-contain shadow-2xl dark:bg-zinc-900"
                  />
                  <p className="mt-3 max-w-[calc(100vw-32px)] truncate text-[16px] font-normal text-white" data-no-translate>{previewFile.name}</p>
                  <div className="absolute right-2 top-2 flex items-center gap-1.5 sm:-right-24 sm:top-0">
                    <a
                      href={previewUrl}
                      download={previewFile.name}
                      aria-label="Download original"
                      data-tooltip="Download original"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 sm:bg-transparent sm:hover:bg-white/15"
                    >
                      <Download className="h-[18px] w-[18px]" />
                    </a>
                    <button
                      type="button"
                      onClick={closeFilePreview}
                      aria-label="Close preview"
                      data-tooltip="Close"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 sm:bg-transparent sm:hover:bg-white/15"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            );
          }

          // PDFs use the compact dialog: first-page thumbnail, page count, hover to download.
          if (isPdfPreview) {
            return (
              <motion.div
                key="twinkle-file-preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 p-4"
                onMouseDown={(e) => { if (e.target === e.currentTarget) closeFilePreview(); }}
                role="dialog"
                aria-modal="true"
                aria-label={previewFile.name}
              >
                <PdfCompactPreview src={previewUrl} fileName={previewFile.name} onClose={closeFilePreview} />
              </motion.div>
            );
          }

          return (
            <motion.div
              key="twinkle-file-preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 p-4"
              onMouseDown={(e) => { if (e.target === e.currentTarget) closeFilePreview(); }}
              role="dialog"
              aria-modal="true"
              aria-label={previewFile.name}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 6 }}
                transition={{ duration: 0.15 }}
                className={`relative flex max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_12px_48px_rgba(0,0,0,0.18)] dark:border-zinc-700 dark:bg-zinc-900 ${
                  hasRichPreview
                    ? 'h-[min(760px,calc(100vh-32px))] w-[880px]'
                    : 'h-[468px] max-h-[calc(100vh-32px)] w-[520px]'
                }`}
              >
                <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-5">
                  <h2 className="min-w-0 flex-1 truncate text-[20px] font-medium leading-8 text-zinc-900 dark:text-zinc-100" data-no-translate title={previewFile.name}>
                    {previewFile.name}
                  </h2>
                  <div className="-mr-2 flex shrink-0 items-center gap-1">
                    <a
                      href={previewUrl}
                      download={previewFile.name}
                      aria-label="Download original"
                      data-tooltip="Download original"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <Download className="h-[18px] w-[18px]" />
                    </a>
                    <button
                      type="button"
                      onClick={closeFilePreview}
                      aria-label="Close preview"
                      data-tooltip="Close"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {hasRichPreview ? (
                  <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
                    {isPdfPreview ? (
                      <PdfPreview src={previewUrl} fileName={previewFile.name} />
                    ) : (
                      <pre className="min-h-full whitespace-pre-wrap break-words rounded-xl bg-zinc-50 p-4 font-mono text-[13px] leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{previewText}</pre>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 pb-10 text-center">
                    <p className="text-[14px] font-normal text-zinc-600 dark:text-zinc-400">
                      Preview isn’t available for <span data-no-translate>{previewFile.name}</span> ({previewSize}).
                    </p>
                    <a
                      href={previewUrl}
                      download={previewFile.name}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <CircleArrowDown className="h-4 w-4" strokeWidth={1.8} />
                      Download
                    </a>
                  </div>
                )}
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <ShareChatModal
        isOpen={shareSessionId !== null}
        sessionId={shareSessionId}
        owner={{
          name: user?.name || user?.username || '',
          email: user?.email || '',
          avatarUrl: user?.avatarUrl,
        }}
        onStartChat={() => {
          closeShareModal();
          window.setTimeout(() => inputRef.current?.focus(), 60);
        }}
        onClose={closeShareModal}
      />

      {plusMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={plusMenuRef}
          role="menu"
          aria-label="Add files and more"
          style={{ position: 'fixed', left: plusMenu.left, bottom: plusMenu.bottom, zIndex: 2147483000 }}
          className="w-[240px] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-[#30302E]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPlusMenu(null);
              setUploadModalOpen(true);
            }}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[15px] text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/10"
          >
            <Paperclip className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
            Upload or add files
          </button>
          {canTakeScreenshot && (
            <button
              type="button"
              role="menuitem"
              onClick={() => void takeScreenshot()}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[15px] text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/10"
            >
              <Camera className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
              Take a screenshot
            </button>
          )}
        </div>,
        document.body
      )}

      <UploadFilesModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onChooseFiles={() => fileInputRef.current?.click()}
        onFilesDropped={(files) => {
          void handleFileSelection(files);
          setUploadModalOpen(false);
        }}
      />
      <ConfirmationModal
        isOpen={modalType === 'delete-single'}
        onClose={() => setModalType('none')}
        onConfirm={confirmDeleteSession}
        title="Delete chat?"
        confirmText="Delete"
        message={<>This will permanently delete{' '}<strong className="font-semibold text-zinc-700 dark:text-zinc-200">{sessionToDelete?.sessionName || 'this chat'}</strong>. This can’t be undone.</>}
      />
    </div>
  );
}
