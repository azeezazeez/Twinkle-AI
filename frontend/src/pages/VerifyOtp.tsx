import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api';
import { toast } from '../lib/toast';
import AuthSplitLayout, {
  authRefBodyClass,
  authRefInputClass,
  authRefLinkClass,
  authRefPrimaryClass,
} from '../components/AuthSplitLayout';

interface Props {
  onLogin: (user: any) => void;
}

interface OtpLocationState {
  email?: string;
}

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
  return 'Verification failed. Please try again.';
};

export default function VerifyOtp({ onLogin }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  /* Load the email from the previous page. */
  useEffect(() => {
    const state = (location.state || null) as OtpLocationState | null;

    if (!state?.email) {
      navigate('/login', { replace: true });
      return;
    }

    setEmail(state.email.trim().toLowerCase());
    setOtp('');
    setError('');

    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [location.state, navigate]);

  /* Verify the code: POST /api/auth/verify-otp { email, otpCode } */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const normalizedOtp = otp.trim();

    setError('');
    setSuccessMsg('');

    if (!/^\d{6}$/.test(normalizedOtp)) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    if (!email) {
      setError('Email information is missing. Please start again.');
      return;
    }

    setLoading(true);

    try {
      const response = (await authApi.verifyOtp(email, normalizedOtp)) as { user?: any } | null;

      if (!response || !response.user) {
        throw new Error('Verification succeeded but no user information was returned.');
      }

      onLogin(response.user);
      toast.success('Signed in successfully');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      console.error('[Twinkle Auth] OTP verification failed:', err);
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /* Resend the code */
  const handleResend = async () => {
    if (resending || !email) return;

    setResending(true);
    setError('');
    setSuccessMsg('');

    try {
      await authApi.requestOtp(email);
      toast.success('A new verification code was sent to your email.');
      setOtp('');
      window.setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err: unknown) {
      console.error('[Twinkle Auth] Resend OTP failed:', err);
      toast.error(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthSplitLayout showVideo={false}>
      <form onSubmit={handleSubmit} className="flex flex-col items-center text-center" noValidate>
        <p className={authRefBodyClass}>To continue, click the link sent to</p>
        <p className="break-all text-[16px] font-medium leading-[1.6] text-[var(--text-main)]">{email}</p>

        <p className={`mt-6 ${authRefBodyClass}`}>
          Not seeing the email in your inbox?{' '}
          <button type="button" onClick={() => void handleResend()} disabled={resending} className={authRefLinkClass}>
            Try sending again
          </button>
          .
          <br />
          Wrong email?{' '}
          <button type="button" onClick={() => navigate('/login')} className={authRefLinkClass}>
            Change email address
          </button>
        </p>

        <p className={`mt-9 max-w-[420px] ${authRefBodyClass}`}>
          If the link shows a verification code instead of signing you in, enter it here.
        </p>

        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otp}
          onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Enter verification code"
          aria-label="Enter verification code"
          disabled={loading}
          className={`${authRefInputClass} mt-5 text-center ${otp ? 'text-[20px] tracking-[0.35em]' : ''}`}
        />

        {successMsg && !error && (
          <p role="status" className="mt-3 text-[13px] text-emerald-700 dark:text-emerald-400">
            {successMsg}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} aria-busy={loading} className={`${authRefPrimaryClass} mt-5`}>
          Verify email address
        </button>
      </form>
    </AuthSplitLayout>
  );
}
