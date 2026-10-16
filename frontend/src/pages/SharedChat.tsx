import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Bot, User as UserIcon } from 'lucide-react';
import { chatApi } from '../lib/api';
import type { SharedChatResponse } from '../types';
import StormLogo from '../components/StormLogo';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SharedChat = () => {
  const { token } = useParams<{ token: string }>();
  const [chat, setChat] = useState<SharedChatResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSharedChat = async () => {
      if (!token) {
        setError('This share link is invalid.');
        setLoading(false);
        return;
      }

      try {
        const response = await chatApi.getSharedSession(token) as SharedChatResponse;
        if (!cancelled) setChat(response);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'This shared chat is no longer available.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadSharedChat();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-white font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center">
              <StormLogo className="h-full w-full text-zinc-900 dark:text-white" />
            </div>
            <span className="text-lg font-medium tracking-tight">Twinkle</span>
          </div>

          <Link
            to="/"
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
            Open Twinkle
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="text-center">
              <StormLogo className="mx-auto h-10 w-10 animate-pulse text-zinc-500" />
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading shared chat…</p>
            </div>
          </div>
        ) : error ? (
          <div className="mx-auto mt-12 max-w-lg rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <AlertCircle className="mx-auto h-10 w-10 text-zinc-400" strokeWidth={1.6} />
            <h1 className="mt-4 text-xl font-medium">Shared chat unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{error}</p>
          </div>
        ) : chat ? (
          <>
            <div className="mb-8">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">Shared conversation</p>
              <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">{chat.sessionName}</h1>
            </div>

            <div className="space-y-8">
              {chat.messages.map(message => {
                const isUser = message.role === 'user';

                return (
                  <article key={message.id} className="flex gap-4">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {isUser ? (
                        <UserIcon className="h-4 w-4" strokeWidth={1.8} />
                      ) : (
                        <Bot className="h-4 w-4" strokeWidth={1.8} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pt-1">
                      <p className="mb-2 text-xs font-medium text-zinc-400">{isUser ? 'You' : 'Twinkle AI'}</p>
                      <div className="prose prose-zinc max-w-none text-[15px] leading-7 dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content || ''}
                        </ReactMarkdown>
                      </div>

                      {message.attachments?.length ? (
                        <div className="mt-4 space-y-3">
                          {message.attachments.map((attachment, index) => (
                            <img
                              key={`${message.id}-attachment-${index}`}
                              src={attachment}
                              alt="Shared attachment"
                              className="max-h-[520px] max-w-full rounded-2xl border border-zinc-200 object-contain dark:border-zinc-700"
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default SharedChat;
