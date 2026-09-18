import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi, createLiveToken } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import ConfirmationModal from '../components/ConfirmationModal';
import LiveTalkModal from '../components/LiveTalkModal';

import {
  ArrowDown, ArrowUp,
  Copy, Check, Edit2,
  X, RotateCcw, ChevronDown, Eye, Zap, Brain, Plus, FileText, Mic, AudioLines,
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  user: User;
  onLogout: () => void;
  onProfile?: () => void;
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

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
};

const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;

const compressImage = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size <= MAX_IMAGE_BYTES) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      try {
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not prepare the image for upload.');

        context.drawImage(image, 0, 0, width, height);

        canvas.toBlob(
          blob => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error(`Could not compress ${file.name}.`));
              return;
            }

            const baseName = file.name.replace(/\.[^.]+$/, '');
            resolve(new File([blob], `${baseName}.jpg`, {
              type: 'image/jpeg',
              lastModified: file.lastModified,
            }));
          },
          'image/jpeg',
          0.82
        );
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not read ${file.name} as an image.`));
    };

    image.src = objectUrl;
  });
};

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
  { id: 'openai/gpt-oss-20b', name: 'Twinkle', description: 'Fast everyday conversations', icon: Zap },
  { id: 'openai/gpt-oss-120b', name: 'Twinkle Pro', description: 'Advanced reasoning and coding', icon: Brain },
  { id: 'gemini-3.8-flash', name: 'Twinkle Vision', description: 'Advanced image & file understanding', icon: Eye, vision: true, documents: true },
];

const MODEL_STORAGE_KEY = 'Twinkle_selected_model';

const playModelSwitchSound = () => {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(520, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(760, context.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.onended = () => void context.close();
  } catch {
    // UI feedback sound is optional.
  }
};

const RESPONSE_STATUS_MESSAGES = [
  'Preparing your response…',
  'Reviewing your request…',
  'Working through the details…',
  'Putting everything together…',
];

const EMPTY_CHAT_PROMPTS = [
  "What's on your mind today?",
  "What would you like to explore?",
  "What can I help you with today?",
  "What are you working on?",
  "What would you like to create today?",
  "What should we figure out together?",
];

const getNextEmptyChatPrompt = (current: string): string => {
  if (EMPTY_CHAT_PROMPTS.length <= 1) return EMPTY_CHAT_PROMPTS[0];
  const available = EMPTY_CHAT_PROMPTS.filter(prompt => prompt !== current);
  return available[Math.floor(Math.random() * available.length)];
};



const downsamplePcm16k = (input: Float32Array, sampleRate: number): Int16Array => {
  if (sampleRate === 16000) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
  }

  const ratio = sampleRate / 16000;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(length);
  let outputIndex = 0;
  let inputIndex = 0;

  while (outputIndex < length) {
    const nextInputIndex = Math.min(input.length, Math.round((outputIndex + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let i = inputIndex; i < nextInputIndex; i += 1) {
      sum += input[i];
      count += 1;
    }
    const sample = Math.max(-1, Math.min(1, count ? sum / count : input[Math.min(inputIndex, input.length - 1)] || 0));
    output[outputIndex] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    outputIndex += 1;
    inputIndex = nextInputIndex;
  }

  return output;
};

const int16ToBase64 = (pcm: Int16Array): string => {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
};

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

export default function Chat({ user, onLogout, onProfile, onSettings }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [typingSessionTitle, setTypingSessionTitle] = useState<{ id: number; title: string } | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [justFinished, setJustFinished] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [responseStatus, setResponseStatus] = useState('Preparing your response…');
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string | number; content: string } | null>(null);
  const [editInput, setEditInput] = useState('');
  const [modalType, setModalType] = useState<'none' | 'delete-all' | 'delete-single'>('none');
  const [sessionIdToDelete, setSessionIdToDelete] = useState<number | null>(null);
  const [serverWaking, setServerWaking] = useState(false);
  const [requestHasFiles, setRequestHasFiles] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(false);
  const [liveTalkOpen, setLiveTalkOpen] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [voiceInputActive, setVoiceInputActive] = useState(false);
  useEffect(() => {
    if (!isTyping) {
      setResponseStatus('Preparing your response…');
      return;
    }
    let index = 0;
    setResponseStatus(RESPONSE_STATUS_MESSAGES[0]);
    const interval = window.setInterval(() => {
      index = (index + 1) % RESPONSE_STATUS_MESSAGES.length;
      setResponseStatus(RESPONSE_STATUS_MESSAGES[index]);
    }, 2200);
    return () => window.clearInterval(interval);
  }, [isTyping]);

  const [typedSessionTitle, setTypedSessionTitle] = useState('');

  useEffect(() => {
    if (!typingSessionTitle) {
      setTypedSessionTitle('');
      return;
    }
    setTypedSessionTitle('');
    let index = 0;
    const { title } = typingSessionTitle;
    const interval = window.setInterval(() => {
      index += 1;
      setTypedSessionTitle(title.slice(0, index));
      if (index >= title.length) {
        window.clearInterval(interval);
        setTypingSessionTitle(null);
      }
    }, 45);
    return () => window.clearInterval(interval);
  }, [typingSessionTitle]);

  const sidebarSessions = sessions.map(session =>
    typingSessionTitle?.id === session.id
      ? { ...session, sessionName: typedSessionTitle }
      : session
  );
  const sessionToDelete = sessions.find(session => session.id === sessionIdToDelete);
  // Keep the chat interface clean on login; the sidebar opens only when requested.

  const voiceBaseInputRef = useRef('');
  const voiceDraftRef = useRef('');
  const voiceSocketRef = useRef<WebSocket | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const voiceProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const voiceSilentGainRef = useRef<GainNode | null>(null);
  const voiceStartRef = useRef(0);
  const voiceTurnCompleteResolverRef = useRef<(() => void) | null>(null);
  const [voiceDraftVersion, setVoiceDraftVersion] = useState(0);

  const cleanupVoiceAudio = useCallback(() => {
    try { voiceProcessorRef.current?.disconnect(); } catch {}
    try { voiceSourceRef.current?.disconnect(); } catch {}
    try { voiceSilentGainRef.current?.disconnect(); } catch {}
    voiceProcessorRef.current = null;
    voiceSourceRef.current = null;
    voiceSilentGainRef.current = null;

    voiceStreamRef.current?.getTracks().forEach(track => track.stop());
    voiceStreamRef.current = null;

    const context = voiceAudioContextRef.current;
    voiceAudioContextRef.current = null;
    if (context) void context.close().catch(() => undefined);
  }, []);

  const cancelVoiceInput = useCallback(() => {
    voiceStartRef.current += 1;
    try {
      const socket = voiceSocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.close(1000, 'cancelled');
      else socket?.close();
    } catch {}
    voiceSocketRef.current = null;
    voiceTurnCompleteResolverRef.current?.();
    voiceTurnCompleteResolverRef.current = null;
    cleanupVoiceAudio();
    voiceDraftRef.current = '';
    voiceBaseInputRef.current = '';
    setVoiceDraftVersion(version => version + 1);
    setVoiceInputActive(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [cleanupVoiceAudio]);

  const commitVoiceInput = useCallback(async () => {
    if (!voiceInputActive) return;

    // Stop capturing immediately, but give Gemini a short window to deliver
    // the final input-transcription chunk before we commit it to the composer.
    try {
      const socket = voiceSocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        } catch {}

        await new Promise<void>(resolve => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            if (voiceTurnCompleteResolverRef.current === finish) {
              voiceTurnCompleteResolverRef.current = null;
            }
            resolve();
          };
          const timer = window.setTimeout(finish, 550);
          voiceTurnCompleteResolverRef.current = finish;
        });
      }
    } catch {}

    const base = voiceBaseInputRef.current.trim();
    const spoken = voiceDraftRef.current.trim();
    const combined = `${base}${base && spoken ? ' ' : ''}${spoken}`.trim();

    voiceStartRef.current += 1;
    try { voiceSocketRef.current?.close(1000, 'committed'); } catch {}
    voiceSocketRef.current = null;
    voiceTurnCompleteResolverRef.current?.();
    voiceTurnCompleteResolverRef.current = null;
    cleanupVoiceAudio();

    setInput(combined);
    voiceDraftRef.current = '';
    voiceBaseInputRef.current = '';
    setVoiceDraftVersion(version => version + 1);
    setVoiceInputActive(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [cleanupVoiceAudio, voiceInputActive]);

  const startVoiceInput = useCallback(async () => {
    if (voiceInputActive || isTyping || isProcessingFiles) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      window.alert('Microphone access is not supported in this browser. Please use a current Chrome, Edge, or Safari browser.');
      return;
    }

    const attempt = ++voiceStartRef.current;
    voiceBaseInputRef.current = input.trim();
    voiceDraftRef.current = '';
    setVoiceDraftVersion(version => version + 1);
    setVoiceInputActive(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (attempt !== voiceStartRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      voiceStreamRef.current = stream;

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser.');
      const context = new AudioContextCtor();
      voiceAudioContextRef.current = context;
      if (context.state === 'suspended') await context.resume();

      const { token, model } = await createLiveToken('Charon', 'auto', true);
      if (attempt !== voiceStartRef.current) return;

      const socket = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`
      );
      voiceSocketRef.current = socket;

      socket.onopen = () => {
        if (attempt !== voiceStartRef.current) return;
        socket.send(JSON.stringify({
          setup: {
            model: `models/${model}`,
            generationConfig: { responseModalities: ['AUDIO'] },
            systemInstruction: {
              parts: [{
                text: `Twinkle AI speech-to-text mode. Transcribe the user's speech accurately. Preserve the user's wording and language. The selected language is ${getSpeechLanguage()}. Do not translate the user's speech. Do not answer the user.`,
              }],
            },
            inputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                prefixPaddingMs: 250,
                silenceDurationMs: 900,
              },
            },
          },
        }));
      };

      socket.onmessage = async event => {
        if (attempt !== voiceStartRef.current) return;
        try {
          let message: any;
          if (typeof event.data === 'string') message = JSON.parse(event.data);
          else if (event.data instanceof Blob) message = JSON.parse(await event.data.text());
          else if (event.data instanceof ArrayBuffer) message = JSON.parse(new TextDecoder().decode(new Uint8Array(event.data)));
          else return;

          if (message?.error) throw new Error(message.error.message || 'Speech transcription service returned an error.');

          const text = String(message?.serverContent?.inputTranscription?.text || '');
          if (text) {
            voiceDraftRef.current += text;
            setVoiceDraftVersion(version => version + 1);
          }

          if (message?.serverContent?.turnComplete) {
            voiceTurnCompleteResolverRef.current?.();
          }
        } catch (error) {
          console.error('Twinkle speech transcription error:', error);
        }
      };

      socket.onerror = () => {
        if (attempt !== voiceStartRef.current) return;
        console.error('Twinkle speech transcription WebSocket error.');
        window.setTimeout(() => {
          if (attempt === voiceStartRef.current && !voiceDraftRef.current.trim()) {
            cancelVoiceInput();
            window.alert('Speech-to-text could not connect. Please check your internet connection and allow microphone access for localhost.');
          }
        }, 0);
      };

      socket.onclose = event => {
        if (attempt !== voiceStartRef.current) return;
        voiceSocketRef.current = null;
        if (event.code !== 1000 && !voiceDraftRef.current.trim()) {
          cancelVoiceInput();
        }
      };

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(2048, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;

      processor.onaudioprocess = audioEvent => {
        if (attempt !== voiceStartRef.current) return;
        const activeSocket = voiceSocketRef.current;
        if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
        const pcm = downsamplePcm16k(audioEvent.inputBuffer.getChannelData(0), context.sampleRate);
        try {
          activeSocket.send(JSON.stringify({
            realtimeInput: {
              audio: {
                data: int16ToBase64(pcm),
                mimeType: 'audio/pcm;rate=16000',
              },
            },
          }));
        } catch {}
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);
      voiceSourceRef.current = source;
      voiceProcessorRef.current = processor;
      voiceSilentGainRef.current = silentGain;
    } catch (error: any) {
      if (attempt !== voiceStartRef.current) return;
      console.error('Speech-to-text start failed:', error);
      cancelVoiceInput();
      const message = String(error?.message || 'Unable to start speech-to-text.');
      if (/permission|denied|notallowed/i.test(message)) {
        window.alert('Microphone permission was denied. Allow microphone access for localhost and try again.');
      } else {
        window.alert(`Speech-to-text could not start. ${message}`);
      }
    }
  }, [cancelVoiceInput, input, isProcessingFiles, isTyping, voiceInputActive]);

  useEffect(() => () => {
    voiceStartRef.current += 1;
    try { voiceSocketRef.current?.close(); } catch {}
    voiceSocketRef.current = null;
    cleanupVoiceAudio();
  }, [cleanupVoiceAudio]);

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
  const [emptyChatPrompt, setEmptyChatPrompt] = useState(() =>
    EMPTY_CHAT_PROMPTS[Math.floor(Math.random() * EMPTY_CHAT_PROMPTS.length)]
  );
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // File upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ id: string; file: File; preview?: string }[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [messageAttachments, setMessageAttachments] = useState<Record<string | number, string[]>>({});

  // Theme
  const [isDark, setIsDark] = useState<boolean>(() => {
    const dark = getInitialTheme();
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', dark);
    }
    return dark;
  });

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(event.target as Node)) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const chooseModel = useCallback((modelId: string) => {
    if (modelId !== selectedModel) playModelSwitchSound();
    setSelectedModel(modelId);
    setModelPickerOpen(false);
    try { localStorage.setItem(MODEL_STORAGE_KEY, modelId); } catch {}
  }, [selectedModel]);

  const activeModel = MODEL_OPTIONS.find(m => m.id === selectedModel) || MODEL_OPTIONS[0];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const firstMessageScrollPendingRef = useRef(false);
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Stores the specific session ID that should skip one message load
  // (the newly created session after first send), so switching to any
  // OTHER existing session always loads its messages correctly.
  const skipMessageLoadRef = useRef<number | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

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
      const detail = (event as CustomEvent<{ id: number; sessionName?: string }>).detail;
      if (!detail?.id) return;

      const now = new Date().toISOString();
      setSessions(prev => {
        const existing = prev.find(session => session.id === detail.id);
        if (existing) {
          const updated = {
            ...existing,
            sessionName: detail.sessionName || existing.sessionName,
            updatedAt: now,
          };
          return [updated, ...prev.filter(session => session.id !== detail.id)];
        }

        return [
          {
            id: detail.id,
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

  const loadMessages = useCallback(async (sid: number) => {
    try {
      const response = await chatApi.getMessages(sid) as any;
      const rawMessages = Array.isArray(response?.messages) ? response.messages : [];

      const normalizedMessages: Message[] = rawMessages.map((msg: any, index: number) => ({
        id: msg?.id ?? `history-${sid}-${index}`,
        sessionId: Number(msg?.sessionId ?? sid),
        role: msg?.role === 'user' ? 'user' : 'assistant',
        content: cleanMessageContent(msg?.content),
        timestamp: msg?.timestamp || new Date().toISOString(),
      }));

      setMessages(normalizedMessages);

      const persistedAttachments: Record<string | number, string[]> = {};
      rawMessages.forEach((msg: any, index: number) => {
        const id = msg?.id ?? `history-${sid}-${index}`;
        if (Array.isArray(msg?.attachments) && msg.attachments.length > 0) {
          persistedAttachments[id] = msg.attachments.filter(
            (url: unknown): url is string => isValidAttachmentDataUrl(url)
          );
        }
      });

      setMessageAttachments(persistedAttachments);
    } catch (err: any) {
      console.error('Failed to load messages:', err);
      if (err.status === 401) onLogout();
    }
  }, [onLogout]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

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
    if (currentSessionId) {
      if (skipMessageLoadRef.current === currentSessionId) {
        // This is the new session we just created inline — messages are
        // already in state from the sendMessage flow, so skip the fetch.
        skipMessageLoadRef.current = null;
        return;
      }
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, loadMessages]);

  // Keep scrolling inside the message panel only so the floating composer
  // remains stable while the conversation scrolls.
  //
  // On mobile, the first message of a newly started chat is positioned near
  // the top of the conversation so the sent message is immediately visible.
  // Later messages keep the existing bottom-scrolling behavior.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const frame = requestAnimationFrame(() => {
      if (
        firstMessageScrollPendingRef.current &&
        window.matchMedia('(max-width: 767px)').matches
      ) {
        const firstMessage = container.querySelector<HTMLElement>(
          '[data-twinkle-message]'
        );

        if (firstMessage) {
          // Keep the first sent message clearly below the fixed mobile header.
          // The message list gets a matching top inset, so the message can never
          // be positioned underneath the navbar when a new chat starts.
          const mobileHeaderOffset = 92;
          const targetTop = Math.max(0, firstMessage.offsetTop - mobileHeaderOffset);
          setShowScrollBottom(false);
          container.scrollTo({
            top: targetTop,
            behavior: 'smooth',
          });
          firstMessageScrollPendingRef.current = false;
          return;
        }
      }

      setShowScrollBottom(false);
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [messages, isTyping]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // The scroll-to-bottom control is meaningful only when a conversation
    // exists and the user is actually away from the latest messages.
    setShowScrollBottom(messages.length > 0 && distanceFromBottom > 100);
  };

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

  // File handlers (kept but no UI to trigger them)
  const handleFileSelection = async (files: FileList | null) => {
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

      const processedFiles: File[] = [];
      for (const file of incomingFiles) {
        processedFiles.push(file.type.startsWith('image/') ? await compressImage(file) : file);
      }

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
      alert(
        typeof error?.message === 'string'
          ? error.message
          : 'The selected file could not be prepared. Please try again.'
      );
    } finally {
      setIsProcessingFiles(false);
    }
  };

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

    isSendingRef.current = true;
    setIsTyping(true);
    setJustFinished(false);
    setServerWaking(false);

    const currentRequestHasFiles = Boolean(filesToSend && filesToSend.length > 0);
    setRequestHasFiles(currentRequestHasFiles);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempId = `temp-${Date.now()}`;

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

    const isNewSession = !currentSessionId;
    const wakingTimer = setTimeout(() => {
      if (isSendingRef.current) setServerWaking(true);
    }, 10000);

    try {
      let response: any;
      const hasFiles = filesToSend && filesToSend.length > 0;
      const finalMessage = messageText.trim() || (hasFiles && filesToSend.some(f => f.type.startsWith('image/')) ? 'Image uploaded' : '');

      if (hasFiles) {
        response = await chatApi.sendMessageWithFiles(
          finalMessage,
          currentSessionId,
          controller.signal,
          selectedModel,
          filesToSend
        );
      } else {
        response = await chatApi.sendMessage(
          finalMessage,
          currentSessionId,
          controller.signal,
          selectedModel
        );
      }

      clearTimeout(wakingTimer);
      setServerWaking(false);

      const activeSessionId = response.sessionId || currentSessionId;

      if (isNewSession && activeSessionId) {
        // Store the new session's ID (not just `true`) so the
        // message-load effect skips ONLY this specific session's fetch.
        // Switching to any other session will still trigger a full load.
        skipMessageLoadRef.current = activeSessionId;
        setCurrentSessionId(activeSessionId);
        persistSessionId(activeSessionId);

        const now = new Date().toISOString();
        setSessions(prev => {
          if (prev.some(session => session.id === activeSessionId)) return prev;
          return [
            {
              id: activeSessionId,
              userId: user.id,
              sessionName: 'New Chat',
              createdAt: now,
              updatedAt: now,
            },
            ...prev,
          ];
        });
      }

      setIsTyping(false);

      const aiContent =
        typeof response?.response === 'string'
          ? response.response
          : typeof response?.error === 'string'
            ? response.error
            : 'I could not generate a response for this request.';

      onAssistantResponse?.(aiContent);

      const aiMsg: Message = {
        id: response?.messageId || 'ai-' + Date.now(),
        sessionId: activeSessionId,
        role: 'assistant',
        content: cleanMessageContent(aiContent),
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => {
        if (prev.some(m => m.id === aiMsg.id)) return prev;
        return [...prev, aiMsg];
      });

      // Generate and persist a professional AI-generated chat title.
      if ((isNewSession || regenerateTitle) && activeSessionId) {
        try {
          const titleResponse: any = await chatApi.generateTitle(
            finalMessage || 'File analysis'
          );

          const newTitle =
            typeof titleResponse?.title === 'string' && titleResponse.title.trim()
              ? titleResponse.title.trim()
              : 'New Chat';

          await chatApi.renameSession(activeSessionId, newTitle);
          setTypingSessionTitle({ id: activeSessionId, title: newTitle });

          // Keep the Sidebar's sessions prop synchronized immediately.
          setSessions(prev =>
            prev.map(session =>
              session.id === activeSessionId
                ? { ...session, sessionName: newTitle }
                : session
            )
          );

          // The optimistic sidebar update above is already authoritative for
          // this UI. Avoid an extra network round-trip after every message.
        } catch (renameErr) {
          console.error('AI-generated Twinkle AI chat title save failed:', renameErr);
        }
      }
    } catch (err: any) {
      clearTimeout(wakingTimer);
      setServerWaking(false);
      setIsTyping(false);

      if (err?.name === 'AbortError') {
        console.log('Chat aborted');
        return;
      }

      console.error('Chat error:', err);

      const status = Number(err?.status);

      let errMsg =
        'Something went wrong. Please try again.';

      if (status === 400) {
        errMsg =
          err.message ||
          'The request could not be processed. Please check your message and try again.';
      } else if (status === 401) {
        errMsg =
          'Your session has expired. Please log in again.';
      } else if (status === 403) {
        errMsg =
          'You do not have permission to perform this action.';
      } else if (status === 404) {
        errMsg =
          'The requested resource could not be found.';
      } else if (status === 413) {
        errMsg =
          'The uploaded file is too large. Please choose a smaller file.';
      } else if (status === 415) {
        errMsg =
          'This file type is not supported.';
      } else if (status === 422) {
        errMsg =
          'The uploaded content could not be processed.';
      } else if (status === 429) {
        errMsg =
          'The AI service is currently busy. Please wait a few seconds and try again.';
      } else if (status === 502 || status === 503 || status === 504) {
        errMsg =
          'The AI service is temporarily unavailable. Please try again shortly.';
      } else if (
        typeof err?.message === 'string' &&
        err.message.toLowerCase().includes('starting up')
      ) {
        errMsg =
          'The server is still warming up. Please wait a moment and try again.';
      } else if (
        typeof err?.message === 'string' &&
        err.message.trim()
      ) {
        errMsg = err.message;
      }

      setMessages(prev => [
        ...prev,
        {
          id: 'error-' + Date.now(),
          sessionId: currentSessionId || 0,
          role: 'assistant',
          content: errMsg,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      isSendingRef.current = false;
      abortControllerRef.current = null;
      setRequestHasFiles(false);
      setIsTyping(false);
      setJustFinished(true);
      setTimeout(() => setJustFinished(false), 3000);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    const text = typeof directMessage === 'string' ? directMessage : (input || '');

    // Defensive normalization prevents stale browser/HMR state from causing
    // "Cannot read properties of undefined (reading 'length')" during upload.
    const currentSelectedFiles = Array.isArray(selectedFiles)
      ? selectedFiles.filter((file): file is File => file instanceof File)
      : [];

    if (!text.trim() && currentSelectedFiles.length === 0) return;

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

      await sendMessage(
        text,
        undefined,
        filesToSend,
        previewUrls
      );

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
            typeof err?.message === 'string'
              ? err.message
              : 'The uploaded file could not be prepared. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
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

  const handleStopResponse = () => {
    abortControllerRef.current?.abort();
    setIsTyping(false);
    setServerWaking(false);
    isSendingRef.current = false;
    abortControllerRef.current = null;
    window.speechSynthesis?.cancel();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const createNewSession = () => {
    setEmptyChatPrompt(current => getNextEmptyChatPrompt(current));
    setCurrentSessionId(null);
    persistSessionId(null);
    setMessages([]);
    setInput('');
    setEditingMessage(null);
    setSelectedFiles([]);
    setFilePreviews([]);
  };

  const deleteSession = (sid: number) => {
    setSessionIdToDelete(sid);
    setModalType('delete-single');
  };

  const confirmDeleteSession = async () => {
    if (sessionIdToDelete === null) return;

    const deletedSessionId = sessionIdToDelete;

    try {
      await chatApi.deleteSession(deletedSessionId);

      // Update React state immediately after the server confirms deletion.
      // This keeps the sidebar in sync without requiring a browser refresh.
      setSessions(prev => prev.filter(session => session.id !== deletedSessionId));

      if (currentSessionId === deletedSessionId) {
        setCurrentSessionId(null);
        persistSessionId(null);
        setMessages([]);
        setEditingMessage(null);
        setTypingSessionTitle(current =>
          current?.id === deletedSessionId ? null : current
        );
      }
    } catch (err) {
      console.error('Delete session failed:', err);
    } finally {
      setSessionIdToDelete(null);
      setModalType('none');
    }
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

    } catch (err) {
      console.error('Rename failed:', err);
    }
  };

  const confirmClearAll = async () => {
    try {
      await chatApi.clearSessions();

      // Clear the local session collection as soon as the backend confirms
      // the operation so the sidebar updates immediately.
      setSessions([]);
      setTypingSessionTitle(null);
      setSessionIdToDelete(null);
      setCurrentSessionId(null);
      persistSessionId(null);
      setMessages([]);
      setEditingMessage(null);
    } catch (err) {
      console.error('Clear sessions failed:', err);
    } finally {
      setModalType('none');
    }
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (err) { console.error('Logout failed:', err); }
    finally {
      setCurrentSessionId(null);
      persistSessionId(null);
      onLogout();
    }
  };

  
const normalizeTwinkleIdentity = (content: string): string => {
  const normalized = content.trim();

  // Replace the old default identity response with a clearer Twinkle AI
  // introduction. Keep this narrowly scoped so documents mentioning Twinkle
  // are not rewritten accidentally.
  if (
    /^I['’]m\s+Twinkle\s+AI,\s+a\s+helpful\s+assistant\s+designed\s+to\s+help\s+you\s+with\s+information,\s+analysis,\s+and\s+more\.?$/i.test(normalized)
  ) {
    return `Hi! I’m Twinkle AI, a professional AI assistant designed to help you understand information, solve problems, work with files, write and analyze content, develop software, and accomplish tasks efficiently.

I adapt my responses to what you’re actually asking. I aim to provide clear, accurate, practical, and meaningful answers rather than following a rigid response template.

You can ask me questions, give me a file or image to analyze, ask for help with coding or technical problems, request writing or explanations, or simply tell me what you’re trying to accomplish — I’ll help you figure out the best way forward.`;
  }

  return content;
};

const cleanMessageContent = (content: unknown): string => {
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
      .trim();

    // The upload flow can persist the internal "no question/instruction"
    // formatting prompt as the user's message. It is an implementation
    // detail and must never be rendered as chat content, including after
    // the conversation is refreshed and messages are loaded from the API.
    if (/^The user uploaded document\(s\) but did not provide a question or instruction\./i.test(cleaned)) {
      return '';
    }

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
    setEditingMessage(null);
    setEditInput('');
    await sendMessage(editedText, messagesBeforeEdit, undefined, undefined, true);
  };


  /**
   * Called by LiveTalkModal only after its final turn has been persisted.
   * Make that saved Live Talk session the active chat immediately so the
   * normal chat area displays the complete transcript without a refresh.
   */
  const handleLiveSessionComplete = useCallback(async (rawSessionId: number) => {
    const sessionId = Number(rawSessionId);
    if (!Number.isFinite(sessionId)) return;

    // Put the Live Talk session into the parent's source of truth before
    // selecting it. This keeps the session-validation effect from clearing
    // currentSessionId because it has not seen the new session yet.
    setSessions(prev => {
      const existing = prev.find(session => Number(session.id) === sessionId);
      if (existing) {
        return [
          { ...existing, id: sessionId, updatedAt: new Date().toISOString() },
          ...prev.filter(session => Number(session.id) !== sessionId),
        ];
      }

      const now = new Date().toISOString();
      return [
        {
          id: sessionId,
          userId: user.id,
          sessionName: 'Live Talk',
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ];
    });

    // Make Live Talk the active conversation and immediately fetch the
    // persisted transcript. Do NOT leave messages empty and wait for another
    // click/refresh; the history endpoint is the source of truth.
    setCurrentSessionId(sessionId);
    persistSessionId(sessionId);
    setMessages([]);
    setMessageAttachments({});
    setEditingMessage(null);

    await loadMessages(sessionId);
  }, [user.id, loadMessages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-sans text-zinc-400 bg-white dark:bg-zinc-950 transition-colors duration-300">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-4"
        >
          <StormLogo className="w-12 h-12 text-black dark:text-white transition-transform duration-500 ease-in-out hover:rotate-180" />
          <span className="tracking-widest text-[10px] font-black uppercase">Loading...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] min-h-0 w-full max-w-full overflow-hidden bg-white dark:bg-zinc-950 font-sans transition-colors duration-300">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-zinc-1000/5 rounded-full blur-[160px] pointer-events-none" />

      <Sidebar
        user={user}
        sessions={sidebarSessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => {
          setCurrentSessionId(id);
          persistSessionId(id);
          setMobileOpen(false);
        }}
        onNewSession={() => {
          createNewSession();
          setMobileOpen(false);
        }}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onClearAll={() => setModalType('delete-all')}
        onLogout={handleLogout}
        onProfile={onProfile}
        onSettings={onSettings}
        onDesktopStateChange={setDesktopSidebarExpanded}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main className={"relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent transition-[margin] duration-300 ease-out " + (desktopSidebarExpanded ? "lg:ml-[360px]" : "lg:ml-14")}>
        {/* Mobile header */}
        <header
          className="lg:hidden absolute top-0 inset-x-0 z-[9997] h-14 flex items-center justify-between px-3 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800"
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open sidebar"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-700 dark:text-zinc-200"
          >
            <span className="sr-only">Open sidebar</span>
            <span className="flex flex-col gap-1" aria-hidden="true">
              <span className="w-[18px] h-[2px] bg-current rounded-full" />
              <span className="w-[18px] h-[2px] bg-current rounded-full" />
              <span className="w-[18px] h-[2px] bg-current rounded-full" />
            </span>
          </button>

          <span className="absolute left-1/2 -translate-x-1/2 pointer-events-none text-base font-medium text-zinc-900 dark:text-white">
            Twinkle
          </span>

          <button
            type="button"
            onClick={() => {
              createNewSession();
              setMobileOpen(false);
            }}
            aria-label="New chat"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-700 dark:text-zinc-200"
          >
            <Edit2 className="w-5 h-5" strokeWidth={1.7} />
          </button>
        </header>
        {/* Messages */}
        <div
          className="min-h-0 min-w-0 flex-1 w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-contain scroll-hide pb-32 pt-0 md:pb-36"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          <div className="w-full max-w-4xl mx-auto px-3 sm:px-5 md:px-7 lg:px-8 pt-[92px] md:pt-8 pb-8 md:pb-10">
            {messages.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-2 max-w-3xl mx-auto">
                <motion.div
                  initial={{ scale: 0.82, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mb-6"
                >
                  <StormLogo className="twinkle-chat-logo w-12 h-12 md:w-14 md:h-14 text-zinc-800 dark:text-zinc-100" />
                </motion.div>
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {emptyChatPrompt}
                </h2>
              </div>
            ) : (
              <div className="space-y-5 md:space-y-7 pb-6 pt-2">
                {messages.map((msg, index) => {
                  const isEditing = editingMessage?.id === msg.id;
                  const shouldSpin = isTyping && msg.role === 'assistant' && index === messages.length - 1;
                  const attachedImages = messageAttachments[msg.id] || [];
                  const rawMessageContent = cleanMessageContent(msg.content);
                  const displayContent =
                    attachedImages.length > 0 && rawMessageContent === 'Image uploaded'
                      ? ''
                      : rawMessageContent;

                  return (
                    <div
                      key={msg.id || `msg-${index}`}
                      data-twinkle-message
                      className={`flex w-full min-w-0 ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`flex min-w-0 w-full gap-2.5 md:gap-3 ${
                          msg.role === 'user'
                            ? 'flex-col items-end'
                            : 'items-start'
                        }`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="shrink-0 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center mt-1">
                            <StormLogo className={`w-6 h-6 text-black dark:text-white ${shouldSpin ? 'animate-spin' : ''}`} />
                          </div>
                        )}

                        {msg.role === 'user' && attachedImages.length > 0 && (
                          <div className="w-full flex justify-end -mt-1">
                            <div className="flex flex-wrap justify-end gap-2.5 max-w-[92%] sm:max-w-[88%]">
                              {attachedImages.filter(isValidAttachmentDataUrl).map((url, i) => {
                                const mimeMatch = url.match(/^data:([^;,]+)/i);
                                const mime = mimeMatch?.[1]?.toLowerCase() || '';
                                const attachmentName =
                                  getStoredAttachmentName(url) ||
                                  getAttachmentNameFromDataUrl(url, i);
                                const isImage = mime.startsWith('image/');
                                const isPdf = mime === 'application/pdf';

                                return (
                                  <button
                                    key={`sender-attachment-${i}`}
                                    type="button"
                                    onClick={() => void openPersistedAttachmentPreview(url, i)}
                                    title="Open attachment preview"
                                    className="group relative overflow-hidden rounded-xl border border-zinc-200/70 bg-white text-left shadow-sm transition-all hover:border-zinc-500 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
                                  >
                                    {isImage ? (
                                      <img
                                        src={url}
                                        alt={`Attachment ${i + 1}`}
                                        className="block h-32 w-32 object-cover transition-transform duration-200 group-hover:scale-[1.03] sm:h-36 sm:w-36"
                                      />
                                    ) : isPdf ? (
                                      <div className="relative h-32 w-32 overflow-hidden bg-white dark:bg-zinc-800 sm:h-36 sm:w-36">
                                        <iframe
                                          src={`${url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                          title={`PDF attachment ${i + 1}`}
                                          className="pointer-events-none absolute left-0 top-0 h-[576px] w-[408px] origin-top-left scale-[0.31] bg-white"
                                        />
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent px-2 pb-2 pt-8">
                                          <span className="text-[9px] font-bold uppercase tracking-wider text-white">PDF</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex h-32 w-32 flex-col items-center justify-center gap-2 bg-zinc-50 px-2 dark:bg-zinc-800 sm:h-36 sm:w-36">
                                        <FileText className="h-9 w-9 text-zinc-900 dark:text-zinc-100" />
                                        <span className="rounded-md bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-600 dark:text-zinc-300">
                                          {mime === 'application/msword' ? 'DOC'
                                            : mime.includes('wordprocessingml') ? 'DOCX'
                                            : mime === 'application/vnd.ms-excel' ? 'XLS'
                                            : mime.includes('spreadsheetml') ? 'XLSX'
                                            : mime === 'application/vnd.ms-powerpoint' ? 'PPT'
                                            : mime.includes('presentationml') ? 'PPTX'
                                            : mime.split('/')[1]?.toUpperCase() || 'FILE'}
                                        </span>
                                        <span className="text-center text-[9px] font-medium text-zinc-400">
                                          Click to preview
                                        </span>
                                      </div>
                                    )}
                                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                                      <Eye className="h-3.5 w-3.5" />
                                    </span>
                                    <span
                                      className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-[9px] font-semibold text-white"
                                      title={attachmentName}
                                    >
                                      {attachmentName}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className={`flex flex-col gap-1 min-w-0 max-w-full ${
                          msg.role === 'user' ? 'items-end w-full' : 'flex-1'
                        }`}>
                          {/* Message card: do not render an empty bubble for attachment-only messages. */}
                          {((isEditing || displayContent.trim().length > 0)) && (
                          <div
                            className={`min-w-0 max-w-full ${
                              msg.role === 'user'
                                ? 'w-fit max-w-[92%] sm:max-w-[88%] px-3.5 py-3 sm:px-4 sm:py-3.5 rounded-2xl shadow-sm border overflow-hidden bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-tr-none'
                                : 'w-full rounded-2xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/70 dark:bg-zinc-900/40 px-4 py-3.5 md:px-5 md:py-4 shadow-sm text-zinc-900 dark:text-zinc-100'
                            }`}
                          >
                            <div className="text-sm md:text-base leading-relaxed markdown-body max-w-none min-w-0 w-full break-words [overflow-wrap:anywhere]">
                              {isEditing ? (
                                <div className="flex flex-col gap-3 w-full min-w-0 p-1">
                                  <textarea
                                    value={editInput}
                                    onChange={(e) => setEditInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveEdit();
                                      }
                                      if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                    className="w-full max-w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none min-h-[100px] bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700"
                                    autoFocus
                                  />
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <span className="text-[9px] text-zinc-400 mr-auto">Ctrl/⌘ + Enter to send · Esc to cancel</span>
                                    <button
                                      onClick={handleCancelEdit}
                                      className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={handleSaveEdit}
                                      disabled={!editInput.trim() || isTyping}
                                      className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-40 bg-black text-white hover:bg-zinc-700"
                                    >
                                      Send
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    h1({ children, ...props }: any) {
                                      return (
                                        <h1
                                          className="mt-5 mb-3 pb-2 border-b border-zinc-300 dark:border-zinc-700 text-2xl md:text-3xl font-black tracking-tight text-zinc-950 dark:text-zinc-50"
                                          {...props}
                                        >
                                          {children}
                                        </h1>
                                      );
                                    },
                                    h2({ children, ...props }: any) {
                                      return (
                                        <h2
                                          className="mt-5 mb-3 pb-2 border-b border-zinc-300 dark:border-zinc-700 text-xl md:text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50"
                                          {...props}
                                        >
                                          {children}
                                        </h2>
                                      );
                                    },
                                    h3({ children, ...props }: any) {
                                      return (
                                        <h3
                                          className="mt-4 mb-2 pb-2 border-b border-zinc-300 dark:border-zinc-700 text-lg md:text-xl font-black tracking-tight text-zinc-950 dark:text-zinc-50"
                                          {...props}
                                        >
                                          {children}
                                        </h3>
                                      );
                                    },
                                    strong({ children, ...props }: any) {
                                      return (
                                        <strong className="font-black" {...props}>
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
                                          className={isResumeSubtitle ? 'not-italic font-black' : undefined}
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
                                        <div className="my-4 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200/40 dark:border-zinc-500/20 shadow-lg bg-gradient-to-br from-zinc-50/80 to-violet-50/60 dark:from-zinc-950/50 dark:to-violet-950/40">
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
                                  {displayContent}
                                </ReactMarkdown>
                              )}
                            </div>
                          </div>
                          )}

                          {/* Message action buttons.
                              Always visible so touch devices do not depend on hover. */}
                          <div
                            className={`flex flex-wrap items-center gap-1 mt-1 px-1 ${
                              msg.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {msg.role === 'assistant' && (
                              <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.18em] mr-auto pl-1">
                                Twinkle
                              </span>
                            )}

                            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest whitespace-nowrap mr-1">
                              {msg.timestamp
                                ? new Date(msg.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : 'Now'}
                            </span>

                            <div className="flex items-center gap-0.5">
                              {/* User: Re-send + Edit + Copy */}
                              {msg.role === 'user' && !isEditing && !isTyping && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRetryMessage(msg)}
                                    title="Retry message"
                                    aria-label="Retry message"
                                    className="p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-600 dark:text-zinc-300 transition-all touch-manipulation"
                                  >
                                    <RotateCcw className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(msg)}
                                    title="Edit message"
                                    aria-label="Edit message"
                                    className="p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-600 dark:text-zinc-300 transition-all touch-manipulation"
                                  >
                                    <Edit2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                  </button>
                                </>
                              )}

                              {/* Copy is available for EVERY message */}
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(cleanMessageContent(msg.content));
                                  setCopiedId(msg.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                title="Copy message"
                                aria-label="Copy message"
                                className={`p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 transition-all touch-manipulation ${
                                  copiedId === msg.id
                                    ? 'text-zinc-500'
                                    : 'text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-600 dark:text-zinc-300'
                                }`}
                              >
                                {copiedId === msg.id
                                  ? <Check className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                  : <Copy className="w-4 h-4 md:w-3.5 md:h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isTyping && (
                  <div className="flex items-start gap-3 min-w-0 max-w-full">
                    <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 flex items-center justify-center mt-1">
                      <StormLogo className="w-6 h-6 text-zinc-800 dark:text-zinc-100 animate-pulse" />
                    </div>
                    <div className="min-w-0 max-w-full px-1 py-2 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="w-1.5 h-1.5 bg-black rounded-full"
                        />
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                          className="w-1.5 h-1.5 bg-black rounded-full"
                        />
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                          className="w-1.5 h-1.5 bg-black rounded-full"
                        />
                      </div>
                      <AnimatePresence>
                        {serverWaking && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-[10px] font-medium text-zinc-400"
                          >
                            {requestHasFiles
                              ? 'Processing uploaded file — this may take 10–15 seconds…'
                              : 'Server is waking up, please wait a moment…'}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {(messages.length === 0 && !isTyping) && <div ref={messagesEndRef} />}
          </div>
        </div>

        {/* Input bar */}
        <div className={"fixed bottom-0 left-0 right-0 z-[9000] w-auto max-w-none overflow-visible bg-transparent px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6 md:pt-4 md:pb-[calc(1rem+env(safe-area-inset-bottom))] " + (desktopSidebarExpanded ? "lg:left-[360px]" : "lg:left-14")}>
          <div className="mx-auto w-full max-w-[920px] min-w-0 relative">
            <AnimatePresence>
              {showScrollBottom && messages.length > 0 && (
                isTyping ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className="absolute -top-14 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/75 bg-white/65 px-3.5 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-white/50 backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/55 dark:ring-white/10"
                    aria-live="polite"
                    aria-label={responseStatus}
                  >
                    <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                      <motion.span
                        animate={{ y: [0, -1.5, 0], opacity: [0.35, 1, 0.35] }}
                        transition={{ repeat: Infinity, duration: 1.15, ease: 'easeInOut' }}
                        className="h-1.5 w-1.5 rounded-full bg-zinc-700 dark:bg-zinc-200"
                      />
                      <motion.span
                        animate={{ y: [0, -1.5, 0], opacity: [0.35, 1, 0.35] }}
                        transition={{ repeat: Infinity, duration: 1.15, ease: 'easeInOut', delay: 0.16 }}
                        className="h-1.5 w-1.5 rounded-full bg-zinc-700 dark:bg-zinc-200"
                      />
                      <motion.span
                        animate={{ y: [0, -1.5, 0], opacity: [0.35, 1, 0.35] }}
                        transition={{ repeat: Infinity, duration: 1.15, ease: 'easeInOut', delay: 0.32 }}
                        className="h-1.5 w-1.5 rounded-full bg-zinc-700 dark:bg-zinc-200"
                      />
                    </span>

                    <motion.span
                      key={responseStatus}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="whitespace-nowrap text-[11px] font-medium tracking-tight text-zinc-700 dark:text-zinc-200"
                    >
                      {responseStatus}
                    </motion.span>
                  </motion.div>
                ) : (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    onClick={() =>
                      messagesContainerRef.current?.scrollTo({
                        top: messagesContainerRef.current.scrollHeight,
                        behavior: 'smooth',
                      })
                    }
                    className="absolute -top-14 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/70 bg-white/60 p-2.5 text-black shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-white/50 backdrop-blur-xl transition-all hover:scale-110 hover:bg-white/75 dark:border-white/15 dark:bg-zinc-900/50 dark:ring-white/10 dark:hover:bg-zinc-900/65"
                    aria-label="Scroll to latest message"
                    title="Scroll to latest message"
                  >
                    <ArrowDown className="h-4 w-4 md:h-5 md:w-5" />
                  </motion.button>
                )
              )}
            </AnimatePresence>

            <div className={`relative z-[60] flex w-full min-w-0 flex-col overflow-visible rounded-[24px] border border-zinc-200/90 bg-white shadow-[0_2px_18px_rgba(0,0,0,0.08)] transition-all dark:border-zinc-700/90 dark:bg-zinc-900 dark:shadow-black/20 ${justFinished ? 'animate-blink' : ''}`}>
              {/* File preview strip (kept for consistency but never shown without UI trigger) */}
              <AnimatePresence>
                {filePreviews.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-3 px-3 pt-3 pb-2.5 border-b border-zinc-100 dark:border-zinc-800/70">
                    {filePreviews.map(fp => (
                      <div key={fp.id} className="relative flex flex-col items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void openFilePreview(fp.file, fp.preview)}
                          className="group/preview relative block w-20 text-left"
                          title={`Preview ${fp.file.name}`}
                        >
                          {fp.file.type.startsWith('image/') && fp.preview ? (
                            <div className="w-20 h-16 rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-700 shadow-sm border border-zinc-200/60 cursor-pointer">
                              <img src={fp.preview} alt={fp.file.name} className="w-full h-full object-cover transition-transform group-hover/preview:scale-105" />
                            </div>
                          ) : fp.file.type === 'application/pdf' && fp.preview ? (
                            <div className="relative w-20 h-16 rounded-xl overflow-hidden bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-zinc-700 cursor-pointer">
                              <iframe src={`${fp.preview}#page=1&view=FitH`} title={`Preview ${fp.file.name}`} className="pointer-events-none absolute inset-0 h-[288px] w-[360px] origin-top-left scale-[0.222] bg-white" />
                              <div className="absolute inset-0 bg-transparent group-hover/preview:bg-zinc-1000/5 transition-colors" />
                            </div>
                          ) : (
                            <div className="w-20 h-16 rounded-xl flex flex-col items-center justify-center gap-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:border-zinc-500 dark:hover:border-zinc-500/50 transition-colors">
                              <FileText className="w-6 h-6 text-zinc-900 dark:text-zinc-100" />
                              <span className="text-[8px] font-black uppercase text-zinc-500 dark:text-zinc-400">{fp.file.name.split('.').pop()?.toUpperCase() || 'FILE'}</span>
                            </div>
                          )}
                          <span className="mt-1 block text-[9px] font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-[80px]" title={fp.file.name}>{fp.file.name}</span>
                          <span className="block text-[8px] text-zinc-400">{formatFileSize(fp.file.size)}</span>
                        </button>
                        <button onClick={() => removeFile(fp.id)} className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center bg-zinc-600 dark:bg-zinc-500 text-white shadow-md hover:bg-zinc-500">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                ref={modelPickerRef}
                className="twinkle-composer-row relative z-[200] flex min-w-0 items-center gap-1.5 px-2.5 py-2 sm:gap-2 sm:px-3 sm:py-2.5 md:px-4"
              >
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.tsv,.json,.xml,.html,.htm,.md,.markdown,.rtf,.odt,.ods,.odp"
                  onChange={(e) => {
                    void handleFileSelection(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />

                {/* + attachment button */}
                <motion.button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isTyping || isProcessingFiles}
                  aria-label="Attach files"
                  title="Attach files"
                  whileHover={{ scale: 1.04, y: -1 }}
                  whileTap={{ scale: 0.94, y: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 24,
                    mass: 0.6,
                  }}
                  className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <motion.span
                    className="pointer-events-none absolute inset-0 rounded-2xl bg-zinc-1000/0 blur-md"
                    whileHover={{ scale: 1.15, opacity: 0.18 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                  />

                  <motion.span
                    className="relative z-10 flex items-center justify-center"
                    animate={isProcessingFiles ? { rotate: 90 } : { rotate: 0 }}
                    whileHover={{ scale: 1.12, rotate: 180 }}
                    whileTap={{ scale: 0.9, rotate: 180 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 22,
                    }}
                  >
                    {isProcessingFiles ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600 dark:border-zinc-600 dark:border-t-indigo-400" />
                    ) : (
                      <Plus className="h-[22px] w-[22px] stroke-[2.25]" />
                    )}
                  </motion.span>
                </motion.button>

                {/* Composer text / speech-to-text mode */}
                {voiceInputActive ? (
                  <div
                    className="relative flex min-w-0 flex-1 items-center gap-2 px-1 sm:gap-3"
                    aria-live="polite"
                    aria-label="Listening for speech"
                  >
                    <span className="shrink-0 text-[13px] font-medium text-zinc-400 sm:text-sm">
                      Listening...
                    </span>

                    <div className="relative flex h-8 min-w-0 flex-1 items-center overflow-hidden">
                      <div className="absolute inset-y-1 left-0 right-0 flex items-center gap-[4px] opacity-75">
                        {Array.from({ length: 54 }, (_, index) => {
                          const hasSpeech = voiceDraftVersion > 0;
                          const height = hasSpeech
                            ? 5 + ((index * 17) % 18)
                            : 3 + ((index * 7) % 5);
                          return (
                            <motion.span
                              key={index}
                              className="w-[3px] shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600"
                              animate={hasSpeech
                                ? { scaleY: [0.55, 1.35, 0.7, 1.05, 0.55] }
                                : { scaleY: [0.7, 1, 0.7] }}
                              transition={{
                                duration: 0.9 + (index % 5) * 0.08,
                                repeat: Infinity,
                                delay: index * 0.018,
                                ease: 'easeInOut',
                              }}
                              style={{ height: `${height}px`, transformOrigin: 'center' }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={cancelVoiceInput}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-800 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      aria-label="Discard voice input"
                      title="Discard"
                    >
                      <X className="h-5 w-5" strokeWidth={2.1} />
                    </button>

                    <button
                      type="button"
                      onClick={commitVoiceInput}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      aria-label="Use voice input"
                      title="Use voice input"
                    >
                      <Check className="h-5 w-5" strokeWidth={2.1} />
                    </button>
                  </div>
                ) : (
                  <div className="relative min-w-0 flex-1 flex items-center">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Ask Anything"
                      rows={1}
                      className="twinkle-composer-textarea block w-full min-w-0 resize-none overflow-y-auto bg-transparent px-1 py-2 text-[15px] font-medium leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500 min-h-[42px] max-h-[180px] sm:min-h-[46px] sm:py-2.5"
                      onInput={(e) => {
                        const t = e.target as HTMLTextAreaElement;
                        t.style.height = 'auto';
                        t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
                      }}
                    />
                  </div>
                )}

                {/* Think / model selector */}
                <div className="relative shrink-0">
                  <motion.button
                    type="button"
                    onClick={() => setModelPickerOpen(prev => !prev)}
                    disabled={isTyping}
                    aria-haspopup="listbox"
                    aria-expanded={modelPickerOpen}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="group relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-black shadow-none outline-none transition-colors hover:bg-zinc-100/70 dark:bg-transparent dark:text-white dark:hover:bg-zinc-800/70 disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5"
                  >
                    <span className="max-w-[190px] truncate text-xs font-semibold tracking-tight text-zinc-800 dark:text-zinc-100 sm:text-sm">
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
                        className="fixed bottom-[calc(88px+env(safe-area-inset-bottom,0px))] right-2 z-[99999] w-[min(360px,calc(100vw-16px))] max-w-[calc(100vw-16px)] max-h-[min(360px,calc(100dvh-180px))] overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200/90 bg-white/95 p-1.5 shadow-2xl shadow-zinc-900/20 backdrop-blur-2xl dark:border-zinc-700/90 dark:bg-zinc-900/95 dark:shadow-black/50 sm:absolute sm:bottom-[calc(100%+8px)] sm:right-0 sm:w-[360px] sm:max-w-[calc(100vw-24px)] sm:max-h-[420px] sm:overflow-hidden sm:rounded-2xl sm:p-2"
                      >
                        <div className="px-2 pb-2 pt-1">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
                            Select AI model
                          </p>
                        </div>
                        <div className="space-y-1">
                          {MODEL_OPTIONS.map(option => {
                            const Icon = option.icon;
                            const selected = option.id === selectedModel;
                            return (
                              <motion.button
                                key={option.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => chooseModel(option.id)}
                                whileHover={{ x: 2 }}
                                whileTap={{ scale: 0.985 }}
                                transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                                className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${selected ? 'border-zinc-500 bg-zinc-100 shadow-sm dark:border-zinc-500 dark:bg-zinc-950/40' : 'border-transparent hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80'}`}
                              >
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-black text-white shadow-md' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <span className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">{option.name}</span>
                                  </span>
                                  <span className="mt-0.5 block truncate text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                                    {option.description}{option.vision ? ' · Vision' : ''}
                                  </span>
                                </span>
                                {selected && <Check className="h-4 w-4 shrink-0 text-zinc-600 dark:text-zinc-600 dark:text-zinc-300" />}
                              </motion.button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {!voiceInputActive && (
                  <motion.button
                    type="button"
                    onClick={startVoiceInput}
                    disabled={isTyping || isProcessingFiles}
                    aria-label="Voice input"
                    title="Voice input"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.9 }}
                    className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:h-11 sm:w-9"
                  >
                    <Mic className="h-[20px] w-[20px]" strokeWidth={2} />
                  </motion.button>
                )}

                {/* Live Talk / Send occupy the same action slot, like ChatGPT. */}
                <AnimatePresence mode="wait" initial={false}>
                  {!isTyping && !input.trim() && filePreviews.length === 0 ? (
                    <motion.button
                      key="live-talk"
                      type="button"
                      onClick={() => setLiveTalkOpen(true)}
                      aria-label="Open Live Talk"
                      title="Live Talk"
                      initial={{ opacity: 0, scale: 0.88, y: 2 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.88, y: 2 }}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.92 }}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ec6aa8] text-white shadow-[0_8px_20px_rgba(236,106,168,.22)] transition hover:bg-[#e85f9f] sm:h-11 sm:w-11"
                    >
                      <AudioLines className="h-[19px] w-[19px]" strokeWidth={2.1} />
                    </motion.button>
                  ) : (
                    <motion.button
                      key="send"
                      type="button"
                      onClick={isTyping ? handleStopResponse : () => handleSendMessage()}
                      disabled={!input.trim() && (!Array.isArray(filePreviews) || filePreviews.length === 0) && !isTyping}
                      aria-label={isTyping ? 'Stop response' : 'Send message'}
                      title={isTyping ? 'Stop response' : 'Send message'}
                      initial={{ opacity: 0, scale: 0.88, y: 2 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.88, y: 2 }}
                      whileHover={{ scale: isTyping || input.trim() || filePreviews.length ? 1.06 : 1, y: -1 }}
                      whileTap={{ scale: 0.92 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm transition-all duration-200 sm:h-11 sm:w-11 ${isTyping ? 'border-[#ec6aa8] bg-[#ec6aa8] text-white shadow-[#ec6aa8]/20' : 'border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-zinc-500'}`}
                    >
                      {isTyping ? (
                        <span className="relative flex h-full w-full items-center justify-center">
                          <span className="h-3.5 w-3.5 rounded-[3px] bg-white shadow-sm" />
                        </span>
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

            </div>
            <p className="mt-2.5 px-2 text-center text-[10px] sm:text-[11px] leading-relaxed font-medium text-zinc-500/60 dark:text-zinc-400/60">
              Twinkle is AI and can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </main>

      <LiveTalkModal
        open={liveTalkOpen}
        userName={user.username || user.name}
        onClose={() => setLiveTalkOpen(false)}
        onSessionComplete={handleLiveSessionComplete}
      />

      <AnimatePresence>
        {previewFile && previewUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 p-3 sm:p-6 backdrop-blur-sm"
            onMouseDown={(e) => { if (e.target === e.currentTarget) closeFilePreview(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-zinc-900"
            >
              <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-600 dark:text-zinc-300">
                  {previewFile.type.startsWith('image/') ? <Eye className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{previewFile.name}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">{previewFile.type === 'application/pdf' ? 'PDF preview' : previewFile.type.startsWith('image/') ? 'Image preview' : /\.docx$/i.test(previewFile.name) ? 'DOCX preview' : 'Document preview'}</p>
                </div>
                <button type="button" onClick={closeFilePreview} aria-label="Close preview" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-zinc-100 p-3 dark:bg-zinc-950 sm:p-5">
                {previewFile.type.startsWith('image/') ? (
                  <div className="flex min-h-full items-center justify-center"><img src={previewUrl} alt={previewFile.name} className="max-h-full max-w-full rounded-xl object-contain shadow-lg" /></div>
                ) : previewFile.type === 'application/pdf' ? (
                  <iframe src={`${previewUrl}#toolbar=1&navpanes=0&view=FitH`} title={`PDF preview: ${previewFile.name}`} className="h-full min-h-[70vh] w-full rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800" />
                ) : previewText !== null ? (
                  <pre className="mx-auto min-h-full max-w-4xl whitespace-pre-wrap break-words rounded-xl bg-white p-5 font-mono text-xs leading-relaxed text-zinc-800 shadow-sm dark:bg-zinc-900 dark:text-zinc-200">{previewText}</pre>
                ) : (
                  <div className="flex min-h-full items-center justify-center"><div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm dark:bg-zinc-900"><FileText className="mx-auto mb-4 h-12 w-12 text-zinc-900 dark:text-zinc-100" /><h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{previewFile.name}</h3><p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">This document is attached and ready for AI analysis. The browser cannot render this legacy Office format directly.</p></div></div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={modalType === 'delete-single'}
        onClose={() => setModalType('none')}
        onConfirm={confirmDeleteSession}
        title="Delete chat?"
        message={
          <>
            This will delete{' '}
            <strong className="font-bold">
              {sessionToDelete?.sessionName || 'this chat'}
            </strong>.
          </>
        }
        confirmText="Delete"
      />
      <ConfirmationModal
        isOpen={modalType === 'delete-all'}
        onClose={() => setModalType('none')}
        onConfirm={confirmClearAll}
        title="Clear all chats?"
        message="All chats will be permanently deleted."
        confirmText="Clear All"
      />
    </div>
  );
}
