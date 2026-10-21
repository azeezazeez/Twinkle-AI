import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Keyboard, Info, ShieldCheck, MessageCircle, AudioLines, Share2, FileText } from 'lucide-react';

const FEATURES = [
  { icon: MessageCircle, title: 'Smart conversations', text: 'Chat with fast, capable models, edit and regenerate replies, and keep every conversation organised in your sidebar.' },
  { icon: AudioLines, title: 'Voice & Live Talk', text: 'Dictate with the microphone, hear replies read aloud, or hold a hands-free Live Talk conversation.' },
  { icon: FileText, title: 'Files & library', text: 'Attach files to a message or build a private document library the assistant can search.' },
  { icon: Share2, title: 'Share chats', text: 'Invite people by email or share a link to a conversation. Only messages up to that moment are shared.' },
];

const LINKS = [
  { icon: Info, label: 'About Twinkle', to: '/settings?tab=about' },
  { icon: Keyboard, label: 'Keyboard shortcuts', to: '/settings?tab=shortcuts' },
  { icon: ShieldCheck, label: 'Data controls', to: '/settings?tab=data' },
];

export default function LearnMore() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 overflow-y-auto bg-white text-zinc-900 dark:bg-[#262624] dark:text-zinc-100">
      <div className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-6 sm:px-8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-[14px] text-zinc-600 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          Back to chat
        </button>

        <h1 className="mt-8 text-[30px] font-semibold tracking-tight">Learn more about Twinkle</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          Twinkle is a chat assistant for writing, research, coding and everyday questions. Here is a quick tour of what you can do.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-zinc-200/80 p-5 dark:border-white/10">
              <Icon className="h-5 w-5 text-[#C6613F]" strokeWidth={1.7} />
              <h2 className="mt-3 text-[16px] font-semibold">{title}</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{text}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-[17px] font-semibold">More resources</h2>
        <div className="mt-3 divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/80 dark:divide-white/10 dark:border-white/10">
          {LINKS.map(({ icon: Icon, label, to }) => (
            <button
              key={to}
              type="button"
              onClick={() => navigate(to)}
              className="flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-zinc-50 focus:outline-none focus-visible:bg-zinc-50 dark:hover:bg-white/5"
            >
              <Icon className="h-[18px] w-[18px] text-zinc-500" strokeWidth={1.7} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
