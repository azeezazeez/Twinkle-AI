import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api';
import { toast } from '../lib/toast';
import AuthSplitLayout, {
  authRefInputClass,
  authRefPrimaryClass,
  authRefSecondaryClass,
} from '../components/AuthSplitLayout';

interface Props {
  onLogin: (user: any) => void;
}

const GOOGLE_OAUTH_URL = '/api/auth/oauth/google';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'Unable to continue. Please try again.';
};

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.35 12.21c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.26Z" />
      <path fill="#34A853" d="M12 21.99c2.63 0 4.84-.87 6.45-2.37l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.52A9.74 9.74 0 0 0 12 21.99Z" />
      <path fill="#FBBC05" d="M6.54 14.06A5.86 5.86 0 0 1 6.24 12c0-.72.12-1.42.3-2.06V7.42H3.3A9.99 9.99 0 0 0 2.25 12c0 1.65.4 3.2 1.05 4.58l3.24-2.52Z" />
      <path fill="#EA4335" d="M12 5.91c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.83 2.98 14.63 2 12 2a9.74 9.74 0 0 0-8.7 5.42l3.24 2.52C7.31 7.63 9.46 5.91 12 5.91Z" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-black/15 border-t-[var(--text-main)] dark:border-white/20 dark:border-t-white"
    />
  );
}

export default function Login({ onLogin: _onLogin }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const notice =
    typeof (location.state as { message?: unknown } | null)?.message === 'string'
      ? ((location.state as { message: string }).message)
      : '';

  useEffect(() => {
    if (notice) toast.success(notice, { id: 'login-notice' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const resetOauthLoading = () => setOauthLoading(false);
    window.addEventListener('pageshow', resetOauthLoading);
    return () => window.removeEventListener('pageshow', resetOauthLoading);
  }, []);

  /* Email -> one-time code, then the "click the link" page */
  const handleContinue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Enter your email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      await authApi.requestOtp(normalizedEmail);
      toast.success(`Verification code sent to ${normalizedEmail}`);
      navigate('/login/email', { state: { email: normalizedEmail } });
    } catch (err: unknown) {
      console.error('[Twinkle Auth] OTP request failed:', err);
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /* Google: full browser navigation, never part of the email flow. */
  const handleGoogle = () => {
    if (oauthLoading) return;
    setOauthLoading(true);
    setError('');
    window.location.assign(GOOGLE_OAUTH_URL);
  };

  return (
    <AuthSplitLayout showVideo>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => handleGoogle()}
          disabled={oauthLoading}
          aria-busy={oauthLoading}
          aria-label="Continue with Google"
          className={`${authRefSecondaryClass} justify-center`}
        >
          {oauthLoading ? (
            <Spinner />
          ) : (
            <>
              <GoogleIcon />
              Continue with Google
            </>
          )}
        </button>

        <div className="text-center text-[14px] text-[var(--text-muted)]">OR</div>

        <form onSubmit={handleContinue} className="flex flex-col gap-5" noValidate>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email"
            aria-label="Enter your email"
            autoComplete="email"
            autoFocus
            disabled={loading}
            className={authRefInputClass}
          />

          {notice && !error && (
            <p role="status" className="-mt-2 text-[13px] text-emerald-700 dark:text-emerald-400">
              {notice}
            </p>
          )}

          {error && (
            <p role="alert" className="-mt-2 text-[13px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} aria-busy={loading} className={authRefPrimaryClass}>
            Continue with email
          </button>
        </form>
      </div>
    </AuthSplitLayout>
  );
}
