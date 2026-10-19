import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api';
import { toast } from '../lib/toast';
import AuthSplitLayout, { authRefBodyClass, authRefLinkClass } from '../components/AuthSplitLayout';

interface EmailLocationState {
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
  return 'Unable to continue. Please try again.';
};

function MailboxIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-[#1F4E96] dark:text-[#7DA9E8]"
    >
      <path d="M5 31V20a8 8 0 0 1 8-8h14a8 8 0 0 1 8 8v11Z" />
      <path d="M12 31V21a4 4 0 0 1 8 0v10" />
      <path d="M26 12V5h7v6" />
      <path d="M20 31v5M9 36h22" />
    </svg>
  );
}

/** Second page of the email sign-in: "To continue, click the link sent to …" */
export default function LoginEmail() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const state = (location.state || null) as EmailLocationState | null;
    if (!state?.email) {
      navigate('/login', { replace: true });
      return;
    }
    setEmail(state.email.trim().toLowerCase());
  }, [location.state, navigate]);

  const handleResend = async () => {
    if (resending || !email) return;
    setResending(true);
    setError('');
    setSuccessMsg('');

    try {
      await authApi.requestOtp(email);
      toast.success('A new verification code was sent to your email.');
    } catch (err: unknown) {
      console.error('[Twinkle Auth] Resend OTP failed:', err);
      toast.error(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthSplitLayout showVideo>
      <div className="flex flex-col items-center py-3 text-center">
        <MailboxIcon />

        <p className={`mt-6 ${authRefBodyClass}`}>To continue, click the link sent to</p>
        <p className="break-all text-[16px] font-medium leading-[1.6] text-[var(--text-main)]">{email}</p>

        <div className="mt-6 flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/verify-otp', { state: { email } })}
            className={authRefLinkClass}
          >
            Enter verification code
          </button>
          <button type="button" onClick={() => void handleResend()} disabled={resending} className={authRefLinkClass}>
            Resend email
          </button>
          <button type="button" onClick={() => navigate('/login')} className={authRefLinkClass}>
            Use a different email
          </button>
        </div>

        {successMsg && !error && (
          <p role="status" className="mt-4 text-[13px] text-emerald-700 dark:text-emerald-400">
            {successMsg}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-[13px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </AuthSplitLayout>
  );
}
