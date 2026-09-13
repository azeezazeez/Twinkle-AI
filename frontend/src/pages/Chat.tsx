import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi, wakeUpServer } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import ConfirmationModal from '../components/ConfirmationModal';

import {
  ArrowDown, ArrowUp,
  Copy, Check, Edit2, Sun, Moon, Menu,
  X, RotateCcw, ChevronDown, Eye, Zap, Brain, Plus, FileText, Mic, Square,
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  user: User;
  onLogout: () => void;
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
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-black text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all hover:scale-105 active:scale-95"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
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

  const lower = subject.toLowerCase();
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

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

interface ModelOption {
  id: string;
  name: string;
  provider: 'Groq';
  description: string;
  icon: React.ElementType;
  vision?: boolean;
  documents?: boolean;
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'openai/gpt-oss-120b', name: 'Nexus Advanced', provider: 'Groq', description: 'Advanced reasoning and coding', icon: Brain },
  { id: 'openai/gpt-oss-20b', name: 'Nexus Fast', provider: 'Groq', description: 'Fast everyday conversations', icon: Zap },
  { id: 'qwen/qwen3.8-27b', name: 'Qwen Vision Pro', provider: 'Groq', description: 'Enhanced vision and reasoning', icon: Eye, vision: true },
];

const MODEL_STORAGE_KEY = 'nexus_selected_model';

export default function Chat({ user, onLogout }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(readPersistedSessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [justFinished, setJustFinished] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string | number; content: string } | null>(null);
  const [editInput, setEditInput] = useState('');
  const [modalType, setModalType] = useState<'none' | 'delete-all' | 'delete-single'>('none');
  const [sessionIdToDelete, setSessionIdToDelete] = useState<number | null>(null);
  const [serverWaking, setServerWaking] = useState(false);
  const [requestHasFiles, setRequestHasFiles] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // File upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ id: string; file: File; preview?: string }[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [messageAttachments, setMessageAttachments] = useState<Record<string | number, string[]>>({});

  // Browser microphone recording -> backend Gemini transcription
  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechBaseRef = useRef('');

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
    setSelectedModel(modelId);
    setModelPickerOpen(false);
    try { localStorage.setItem(MODEL_STORAGE_KEY, modelId); } catch {}
  }, []);

  const activeModel = MODEL_OPTIONS.find(m => m.id === selectedModel) || MODEL_OPTIONS[0];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
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

  // =========================================================
  // MICROPHONE -> GEMINI TRANSCRIPTION
  // =========================================================

  const getSupportedAudioMimeType = useCallback((): string => {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];

    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
  }, []);

  const stopListening = useCallback(async (shouldTranscribe = true) => {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      setIsListening(false);
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      return;
    }

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    setIsListening(false);

    if (!shouldTranscribe) {
      audioChunksRef.current = [];
      mediaRecorderRef.current = null;
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isTyping || isProcessingFiles) return;

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      alert('Microphone recording is not supported by this browser.');
      return;
    }

    const mimeType = getSupportedAudioMimeType();
    if (!mimeType) {
      alert('This browser does not support a compatible audio recording format.');
      return;
    }

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      mediaStreamRef.current?.getTracks().forEach(track => track.stop());

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      speechBaseRef.current = inputRef.current?.value || '';

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error('Microphone recording error:', event);
        setIsListening(false);
        mediaRecorderRef.current = null;
        stream.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        audioChunksRef.current = [];
        alert('The microphone recording failed. Please try again.');
      };

      recorder.onstop = async () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        stream.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;

        if (chunks.length === 0) return;

        const audioBlob = new Blob(chunks, {
          type: mimeType.split(';')[0] || mimeType,
        });

        if (audioBlob.size === 0) return;

        try {
          setIsTyping(true);

          const transcribedText = await chatApi.transcribeAudio(audioBlob);

          if (transcribedText) {
            const existingText = speechBaseRef.current.trim();
            const combinedText = existingText
              ? `${existingText} ${transcribedText}`.trim()
              : transcribedText.trim();

            setInput(combinedText);
            speechBaseRef.current = combinedText;

            requestAnimationFrame(() => inputRef.current?.focus());
          }
        } catch (error: any) {
          console.error('Audio transcription failed:', error);
          alert(
            typeof error?.message === 'string' && error.message.trim()
              ? error.message
              : 'Could not transcribe the recording. Please try again.'
          );
        } finally {
          setIsTyping(false);
        }
      };

      recorder.start();
      setIsListening(true);
      inputRef.current?.focus();
    } catch (error: any) {
      console.error('Microphone access failed:', error);
      setIsListening(false);
      mediaRecorderRef.current = null;
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;

      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        alert('Microphone access was denied. Please allow microphone access in your browser and try again.');
      } else if (error?.name === 'NotFoundError') {
        alert('No microphone was found on this device.');
      } else {
        alert('Could not start the microphone. Please try again.');
      }
    }
  }, [getSupportedAudioMimeType, isProcessingFiles, isTyping]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening(true);
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      try {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch {
        // Ignore recorder cleanup errors during unmount.
      }
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    };
  }, []);

  // Load sessions & messages
  const loadSessions = useCallback(async () => {
    try {
      wakeUpServer();
      const response = await chatApi.getSessions() as any;
      setSessions(response.sessions || []);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      if (err.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

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
            (url: unknown): url is string => typeof url === 'string' && url.length > 0
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

  // Keep scrolling inside the message panel only. Using scrollIntoView() here
  // can scroll the outer page/layout and make the fixed navbar or composer
  // appear to jump. Directly scrolling the message container keeps both
  // the navbar and composer in their fixed positions.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const frame = requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [messages, isTyping]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
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

      const newPreviews = incomingFiles.map(file => ({
        id: `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`,
        file,
        preview: file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined,
      }));

      setFilePreviews(prev => [...prev, ...newPreviews]);
      setSelectedFiles(prev => [...prev, ...incomingFiles]);
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
    regenerateTitle = false
  ) => {
    if ((!messageText.trim() && (!filesToSend || filesToSend.length === 0))) return;
    if (isSendingRef.current) return;
    if (isListening) stopListening();

    isSendingRef.current = true;
    setIsTyping(true);
    setJustFinished(false);
    setServerWaking(false);

    const currentRequestHasFiles = Boolean(filesToSend && filesToSend.length > 0);
    setRequestHasFiles(currentRequestHasFiles);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempId = `temp-${Date.now()}`;
    const tempUserMsg: Message = {
      id: tempId,
      sessionId: currentSessionId || 0,
      role: 'user',
      content: messageText.trim() || (filesToSend?.some(f => f.type.startsWith('image/')) ? 'Image uploaded' : ''),
      timestamp: new Date().toISOString(),
    };

    if (messagesSnapshot) setMessages([...messagesSnapshot, tempUserMsg]);
    else setMessages(prev => [...prev, tempUserMsg]);

    if (previewUrls && previewUrls.length > 0) {
      setMessageAttachments(prev => ({ ...prev, [tempId]: previewUrls }));
    }

    setInput('');
    setSelectedFiles([]);
    filePreviews.forEach(fp => {
      if (fp.preview) URL.revokeObjectURL(fp.preview);
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
        await loadSessions();
      }

      setIsTyping(false);

      const aiContent =
        typeof response?.response === 'string'
          ? response.response
          : typeof response?.error === 'string'
            ? response.error
            : 'I could not generate a response for this request.';

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

      // Generate the title locally using saved deterministic actions.
      // No AI model/API call is used for naming the conversation.
      if ((isNewSession || regenerateTitle) && activeSessionId) {
        try {
          const newTitle = generateProfessionalChatTitle(
            finalMessage,
            currentRequestHasFiles
          );

          // The rename API is only persistence; the title itself is generated locally.
          await chatApi.renameSession(activeSessionId, newTitle);

          setSessions(prev =>
            prev.map(session =>
              session.id === activeSessionId
                ? { ...session, sessionName: newTitle }
                : session
            )
          );

          await loadSessions();
        } catch (renameErr) {
          console.error('Deterministic chat title save failed:', renameErr);
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
    const text = directMessage !== undefined ? directMessage : input;
    if (!text.trim() && selectedFiles.length === 0) return;

    const filesToSend = selectedFiles.length > 0 ? [...selectedFiles] : undefined;
    let previewUrls: string[] | undefined;

    try {
      if (filesToSend) {
        const imageFiles = filesToSend.filter(file =>
          file.type.startsWith('image/')
        );

        if (imageFiles.length > 0) {
          previewUrls = await Promise.all(
            imageFiles.map(fileToDataUrl)
          );
        }
      }

      await sendMessage(
        text,
        undefined,
        filesToSend,
        previewUrls
      );
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
  const handleRetryMessage = (msg: Message) => {
    if (isTyping) return;
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    const messagesBeforeMsg = msgIndex > 0 ? messages.slice(0, msgIndex) : [];
    sendMessage(cleanMessageContent(msg.content), messagesBeforeMsg);
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
    if (!sessionIdToDelete) return;
    try {
      await chatApi.deleteSession(sessionIdToDelete);
      if (currentSessionId === sessionIdToDelete) {
        setCurrentSessionId(null);
        persistSessionId(null);
        setMessages([]);
      }
      await loadSessions();
    } catch (err) { console.error('Delete session failed:', err); }
    finally {
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

      // Confirm the persisted server state after the optimistic UI update.
      await loadSessions();
    } catch (err) {
      console.error('Rename failed:', err);
      // Re-sync with the server if the rename request failed after a partial
      // UI update or if the backend returned an unexpected result.
      try { await loadSessions(); } catch (syncErr) { console.error('Session sync failed:', syncErr); }
    }
  };

  const confirmClearAll = async () => {
    try {
      await chatApi.clearSessions();
      setCurrentSessionId(null);
      persistSessionId(null);
      setMessages([]);
      await loadSessions();
    } catch (err) { console.error('Clear sessions failed:', err); }
    finally { setModalType('none'); }
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (err) { console.error('Logout failed:', err); }
    finally {
      setCurrentSessionId(null);
      persistSessionId(null);
      onLogout();
    }
  };

  const cleanMessageContent = (content: unknown): string => {
    if (typeof content !== 'string') return '';

    return content
      .replace(/\n?\n?\[Attached Files:.*?\]/g, '')
      .trim();
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


  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-sans text-zinc-400 bg-white dark:bg-zinc-950 transition-colors duration-300">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-4"
        >
          <StormLogo className="w-12 h-12 text-indigo-500/50" />
          <span className="tracking-widest text-[10px] font-black uppercase">Loading...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] min-h-0 w-full max-w-full overflow-hidden bg-white dark:bg-zinc-950 font-sans transition-colors duration-300">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none" />

      <Sidebar
        user={user}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => { setCurrentSessionId(id); persistSessionId(id); }}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onClearAll={() => setModalType('delete-all')}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className="relative flex h-full min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden bg-transparent pt-14 md:pt-16 lg:pl-14">
        {/* Header - fixed so mobile/tablet refresh or message scrolling can never push it away */}
        <header className="fixed top-0 left-0 right-0 lg:left-14 z-[10000] h-14 md:h-16 w-auto bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl border-b border-zinc-200 dark:border-zinc-800 flex items-center shrink-0">
          {/* Mobile menu: fixed to the left edge so it never overlaps the chat title */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden absolute left-3 md:left-5 top-1/2 -translate-y-1/2 z-[10001] w-9 h-9 flex items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            aria-label="Open chats"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Center title: reserves space for both left menu and right theme button */}
          <div className="absolute left-14 right-14 sm:left-16 sm:right-16 md:left-20 md:right-20 flex flex-col items-center gap-0.5 text-center min-w-0 overflow-hidden">
            <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
              <StormLogo className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 dark:text-indigo-500 shrink-0" />
              <span className="text-[10px] md:text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest truncate">Nexus AI</span>
              <div className="hidden sm:flex items-center gap-1 ml-1 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
            <span className="block w-full text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 truncate">
              {sessions.find(s => s.id === currentSessionId)?.sessionName || 'New Chat'}
            </span>
          </div>

          {/* Theme button: always pinned to the right-most edge */}
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="absolute right-2 sm:right-3 md:right-4 top-1/2 -translate-y-1/2 z-[10001] w-9 h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
          >
              <AnimatePresence mode="wait" initial={false}>
                {isDark
                  ? <motion.span key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><Sun className="w-4 h-4" /></motion.span>
                  : <motion.span key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><Moon className="w-4 h-4" /></motion.span>
                }
              </AnimatePresence>
            </motion.button>
        </header>

        {/* Messages */}
        <div
          className="min-h-0 min-w-0 flex-1 w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-contain scroll-hide pb-32 pt-0 md:pb-36"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 md:px-6 pt-6 md:pt-10 pb-8 md:pb-10">
            {messages.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-2 max-w-2xl mx-auto">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-8">
                  <StormLogo className="w-12 h-12 md:w-14 md:h-14 text-indigo-600" />
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">How can I help you today?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                  {['Plan a 3-day trip to Tokyo', 'How to build a SaaS with React?', 'Write a professional covering letter', 'Explain the theory of relativity'].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(undefined, s)}
                      className="group p-3.5 md:p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 transition-all text-left shadow-sm"
                    >
                      <span className="block truncate">{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5 md:space-y-7 pb-6 pt-2">
                {messages.map((msg, index) => {
                  const isEditing = editingMessage?.id === msg.id;
                  const shouldSpin = isTyping && msg.role === 'assistant' && index === messages.length - 1;
                  const attachedImages = messageAttachments[msg.id] || [];

                  return (
                    <div
                      key={msg.id || `msg-${index}`}
                      className={`flex w-full min-w-0 ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`flex min-w-0 w-full items-start gap-2.5 md:gap-3 ${
                          msg.role === 'user'
                            ? 'flex-row-reverse max-w-[92%] sm:max-w-[88%]'
                            : 'max-w-full'
                        }`}
                      >
                        <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 flex items-center justify-center mt-1">
                          {msg.role === 'user' ? (
                            <div className="w-full h-full rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm overflow-hidden">
                              <UserAvatar name={user?.username || 'User'} className="w-full h-full text-[10px]" />
                            </div>
                          ) : (
                            <StormLogo className={`w-6 h-6 text-indigo-500 dark:text-indigo-400 ${shouldSpin ? 'animate-spin' : ''}`} />
                          )}
                        </div>

                        <div className="flex flex-col gap-1 min-w-0 flex-1 max-w-full">
                          {/* Message card */}
                          <div
                            className={`min-w-0 max-w-full ${
                              msg.role === 'user'
                                ? 'w-fit max-w-[92%] sm:max-w-[88%] px-3.5 py-3 sm:px-4 sm:py-3.5 rounded-2xl shadow-sm border overflow-hidden bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-tr-none'
                                : 'w-full text-zinc-900 dark:text-zinc-100'
                            }`}
                          >
                            {attachedImages.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-3">
                                {attachedImages.map((url, i) => (
                                  <div key={i} className="relative group/img max-w-full">
                                    <img
                                      src={url}
                                      alt={`Attachment ${i + 1}`}
                                      className="max-w-full w-auto h-auto max-h-[180px] rounded-xl object-cover border border-zinc-200/50 dark:border-zinc-600/40 shadow-sm"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

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
                                      className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-40 bg-indigo-600 text-white hover:bg-indigo-700"
                                    >
                                      Send
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    pre({ children, ...props }: any) {
                                      return (
                                        <div className="my-4 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-indigo-200/40 dark:border-indigo-500/20 shadow-lg bg-gradient-to-br from-indigo-50/80 to-violet-50/60 dark:from-indigo-950/50 dark:to-violet-950/40">
                                          <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-indigo-200/30 dark:border-indigo-500/15 bg-indigo-100/40 dark:bg-indigo-900/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 dark:text-indigo-500">Architecture</span>
                                          </div>
                                          <pre
                                            className="max-w-full overflow-x-auto p-3 sm:p-4 md:p-5 text-[0.75rem] sm:text-[0.82rem] leading-relaxed font-mono text-indigo-700 dark:text-indigo-300 whitespace-pre"
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
                                          className={`${className || ''} bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded font-mono text-[0.85em] break-words [overflow-wrap:anywhere]`}
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      );
                                    }
                                  } as Components}
                                >
                                  {cleanMessageContent(msg.content)}
                                </ReactMarkdown>
                              )}
                            </div>
                          </div>

                          {/* Message action buttons.
                              Always visible so touch devices do not depend on hover. */}
                          <div
                            className={`flex flex-wrap items-center gap-1 mt-1 px-1 ${
                              msg.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {msg.role === 'assistant' && (
                              <span className="text-[10px] font-black text-indigo-500/60 uppercase tracking-[0.18em] mr-auto pl-1">
                                Nexus AI
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
                                    className="p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all touch-manipulation"
                                  >
                                    <RotateCcw className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(msg)}
                                    title="Edit message"
                                    aria-label="Edit message"
                                    className="p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all touch-manipulation"
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
                                    ? 'text-emerald-500'
                                    : 'text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400'
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
                      <StormLogo className="w-6 h-6 text-indigo-500 animate-spin" />
                    </div>
                    <div className="min-w-0 max-w-full px-1 py-2 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="w-1.5 h-1.5 bg-indigo-600 rounded-full"
                        />
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                          className="w-1.5 h-1.5 bg-indigo-600 rounded-full"
                        />
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                          className="w-1.5 h-1.5 bg-indigo-600 rounded-full"
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
        <div className="fixed bottom-0 left-0 right-0 z-[9000] w-full max-w-full overflow-visible border-t border-zinc-200/70 bg-white/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-2xl dark:border-zinc-800/70 dark:bg-zinc-950/95 sm:px-4 md:px-6 md:pt-4 md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="w-full max-w-3xl mx-auto relative min-w-0">
            <AnimatePresence>
              {showScrollBottom && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  onClick={() => messagesContainerRef.current?.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' })}
                  className="absolute -top-14 right-2 p-2.5 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 transition-all z-10 hover:scale-110"
                >
                  <ArrowDown className="w-4 h-4 md:w-5 md:h-5" />
                </motion.button>
              )}
            </AnimatePresence>

            <div className={`relative z-[60] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg transition-all ${justFinished ? 'animate-blink' : ''}`}>
              {/* File preview strip (kept for consistency but never shown without UI trigger) */}
              <AnimatePresence>
                {filePreviews.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-3 px-3 pt-3 pb-2.5 border-b border-zinc-100 dark:border-zinc-800/70">
                    {filePreviews.map(fp => (
                      <div key={fp.id} className="relative flex flex-col items-center gap-1 shrink-0">
                        {fp.preview ? (
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-700 shadow-sm border border-zinc-200/60">
                            <img src={fp.preview} alt={fp.file.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                            <X className="w-6 h-6 text-indigo-500" />
                          </div>
                        )}
                        <span className="text-[9px] font-medium text-zinc-400 truncate max-w-[64px]">{fp.file.name}</span>
                        <button onClick={() => removeFile(fp.id)} className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center bg-zinc-600 dark:bg-zinc-500 text-white shadow-md hover:bg-red-500">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                ref={modelPickerRef}
                className="relative z-[200] flex items-center gap-2 px-3 py-2.5 sm:px-4"
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
                  className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors duration-200 hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
                >
                  <motion.span
                    className="pointer-events-none absolute inset-0 rounded-2xl bg-indigo-500/0 blur-md"
                    whileHover={{ scale: 1.15, opacity: 0.18 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                  />

                  <motion.span
                    className="relative z-10 flex items-center justify-center"
                    animate={isProcessingFiles ? { rotate: 90 } : { rotate: 0 }}
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 22,
                    }}
                  >
                    {isProcessingFiles ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600 dark:border-zinc-600 dark:border-t-indigo-400" />
                    ) : (
                      <Plus className="h-5 w-5 stroke-[2.2]" />
                    )}
                  </motion.span>
                </motion.button>

                {/* Ask Anything */}
                <div className="relative min-w-0 flex-1">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      if (isListening) speechBaseRef.current = e.target.value;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={isListening ? 'Listening…' : 'Ask Anything'}
                    rows={1}
                    className="block w-full min-w-0 resize-none overflow-y-auto bg-transparent px-1 py-3 text-sm font-medium leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500 min-h-[46px] max-h-[180px]"
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement;
                      t.style.height = 'auto';
                      t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
                    }}
                  />
                </div>

                {/* Model selector */}
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
                    className="group inline-flex h-11 min-w-0 shrink-0 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/90 px-2.5 text-left shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50/60 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800/80 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-950/30 sm:px-3 sm:max-w-[230px] sm:justify-start"
                  >
                    <motion.span
                      animate={{ scale: modelPickerOpen ? 1.05 : 1 }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400"
                    >
                      <activeModel.icon className="h-3.5 w-3.5" />
                    </motion.span>

                    <span className="min-w-0 max-w-[72px] text-left sm:max-w-[160px]">
                      <span className="block truncate text-[11px] font-bold text-zinc-800 dark:text-zinc-100">
                        {activeModel.name}
                      </span>
                      <span className="hidden sm:block truncate text-[9px] font-medium text-zinc-400 dark:text-zinc-500">
                        {activeModel.vision ? 'VISION' : 'CHAT'} · GROQ
                      </span>
                    </span>

                    <motion.span
                      animate={{ rotate: modelPickerOpen ? 180 : 0 }}
                      transition={{ duration: 0.18 }}
                      className="ml-auto shrink-0"
                    >
                      <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                    </motion.span>
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
                        className="absolute bottom-[calc(100%+10px)] right-0 z-[99999] w-[min(390px,calc(100vw-16px))] max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/95 p-2 shadow-2xl shadow-zinc-900/20 backdrop-blur-2xl dark:border-zinc-700/90 dark:bg-zinc-900/95 dark:shadow-black/50"
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
                                className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${selected ? 'border-indigo-300 bg-indigo-50 shadow-sm dark:border-indigo-500/60 dark:bg-indigo-950/40' : 'border-transparent hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80'}`}
                              >
                                <span
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
                                >
                                  <Icon className="h-4 w-4" />
                                </span>

                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <span className="truncate text-xs font-bold text-zinc-800 dark:text-zinc-100">
                                      {option.name}
                                    </span>
                                    <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                                      GROQ
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block truncate text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                                    {option.description}{option.vision ? ' · Vision' : ''}
                                  </span>
                                </span>

                                {selected && (
                                  <Check className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Microphone */}
                <motion.button
                  type="button"
                  onClick={toggleListening}
                  disabled={isTyping || isProcessingFiles}
                  aria-label={isListening ? 'Stop recording' : 'Voice input'}
                  title={isListening ? 'Stop recording' : 'Voice input'}
                  whileHover={{ scale: 1.04, y: -1 }}
                  whileTap={{ scale: 0.94 }}
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 24,
                    mass: 0.6,
                  }}
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                    isListening
                      ? 'border-red-300 bg-red-50 text-red-600 shadow-red-500/15 dark:border-red-500/50 dark:bg-red-950/30 dark:text-red-400'
                      : 'border-zinc-200 bg-white text-zinc-500 hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400'
                  }`}
                >
                  {isListening ? (
                    <motion.span
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                      className="flex items-center justify-center"
                    >
                      <Square className="h-4 w-4 fill-current stroke-[2.5]" />
                    </motion.span>
                  ) : (
                    <Mic className="h-5 w-5 stroke-[2.2]" />
                  )}
                  {isListening && (
                    <motion.span
                      className="pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-950"
                      animate={{ opacity: [1, 0.35, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                </motion.button>

                {/* Send / Stop */}
                <motion.button
                  type="button"
                  onClick={isTyping ? handleStopResponse : () => handleSendMessage()}
                  disabled={!input.trim() && filePreviews.length === 0 && !isTyping}
                  aria-label={isTyping ? 'Stop response' : 'Send message'}
                  title={isTyping ? 'Stop response' : 'Send message'}
                  whileHover={{
                    scale: isTyping || input.trim() || filePreviews.length ? 1.06 : 1,
                    y: -1,
                  }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border shadow-sm transition-all duration-200 ${isTyping ? 'border-indigo-400 bg-white dark:border-indigo-500 dark:bg-zinc-800' : input.trim() || filePreviews.length ? 'border-zinc-300 bg-white hover:border-indigo-400 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-indigo-500' : 'border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500'}`}
                >
                  {isTyping ? (
                    <span className="relative flex h-full w-full items-center justify-center">
                      <svg className="absolute inset-0 h-full w-full animate-spin" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="55 45" strokeLinecap="round" />
                      </svg>
                      <span className="relative z-10 h-3 w-3 rounded-sm bg-zinc-800 dark:bg-zinc-200" />
                    </span>
                  ) : (
                    <motion.span
                      animate={{
                        y: input.trim() || filePreviews.length ? 0 : 1,
                        scale: input.trim() || filePreviews.length ? 1 : 0.9,
                      }}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </motion.span>
                  )}
                </motion.button>
              </div>

            </div>
            <p className="mt-2.5 px-2 text-center text-[10px] sm:text-[11px] leading-relaxed font-medium text-zinc-500/60 dark:text-zinc-400/60">
              Nexus AI is AI and can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </main>

      <ConfirmationModal isOpen={modalType === 'delete-single'} onClose={() => setModalType('none')} onConfirm={confirmDeleteSession} title="Delete Chat" message="This action cannot be undone." confirmText="Delete" />
      <ConfirmationModal isOpen={modalType === 'delete-all'} onClose={() => setModalType('none')} onConfirm={confirmClearAll} title="Clear All Chats" message="All chats will be permanently deleted." confirmText="Clear All" />
    </div>
  );
}
