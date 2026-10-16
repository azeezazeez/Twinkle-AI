/**
 * Twinkle AI — OTP Verification
 *
 * Flow:
 * Email → OTP → Chat
 */

import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useLocation,
  useNavigate,
} from 'react-router-dom';

import { motion } from 'motion/react';

import {
  ArrowLeft,
  X,
} from 'lucide-react';

import { authApi } from '../lib/api';

interface Props {
  onLogin: (user: any) => void;
}

interface OtpLocationState {
  email?: string;
}

const getErrorMessage = (
  error: unknown
): string => {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (
      error as {
        message?: unknown;
      }
    ).message === 'string'
  ) {
    return (
      error as {
        message: string;
      }
    ).message;
  }

  return 'Verification failed. Please try again.';
};

export default function VerifyOtp({
  onLogin,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const inputRef =
    useRef<HTMLInputElement>(null);

  const [email, setEmail] =
    useState('');

  const [otp, setOtp] =
    useState('');

  const [error, setError] =
    useState('');

  const [successMsg, setSuccessMsg] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [resending, setResending] =
    useState(false);

  /*
   * ------------------------------------------------------------
   * LOAD EMAIL FROM LOGIN PAGE
   * ------------------------------------------------------------
   */

  useEffect(() => {
    const state =
      (location.state || null) as
        | OtpLocationState
        | null;

    if (!state?.email) {
      navigate(
        '/login',
        {
          replace: true,
        }
      );

      return;
    }

    setEmail(
      state.email
        .trim()
        .toLowerCase()
    );

    setOtp('');
    setError('');

    window.setTimeout(
      () => {
        inputRef.current?.focus();
      },
      50
    );
  }, [
    location.state,
    navigate,
  ]);

  /*
   * ------------------------------------------------------------
   * VERIFY OTP
   * ------------------------------------------------------------
   */

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const normalizedOtp =
      otp.trim();

    setError('');
    setSuccessMsg('');

    /*
     * OTP VALIDATION
     */

    if (
      !/^\d{6}$/.test(
        normalizedOtp
      )
    ) {
      setError(
        'Please enter the 6-digit verification code.'
      );

      return;
    }

    if (!email) {
      setError(
        'Email information is missing. Please start again.'
      );

      return;
    }

    setLoading(true);

    try {
      /*
       * --------------------------------------------------------
       * VERIFY OTP
       *
       * Backend:
       * POST /api/auth/verify-otp
       *
       * Body:
       * {
       *   "email": "user@example.com",
       *   "otpCode": "123456"
       * }
       * --------------------------------------------------------
       */

      const response =
        await authApi.verifyOtp(
          email,
          normalizedOtp
        );

      /*
       * --------------------------------------------------------
       * USER MUST BE RETURNED
       * --------------------------------------------------------
       */

      if (
        !response ||
        !response.user
      ) {
        throw new Error(
          'Verification succeeded but no user information was returned.'
        );
      }

      /*
       * --------------------------------------------------------
       * SAVE USER THROUGH APP AUTH CONTEXT
       * --------------------------------------------------------
       */

      onLogin(
        response.user
      );

      /*
       * --------------------------------------------------------
       * GO DIRECTLY TO CHAT
       * --------------------------------------------------------
       */

      navigate(
        '/',
        {
          replace: true,
        }
      );
    } catch (
      err: unknown
    ) {
      console.error(
        '[Twinkle Auth] OTP verification failed:',
        err
      );

      setError(
        getErrorMessage(err)
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * ------------------------------------------------------------
   * RESEND OTP
   * ------------------------------------------------------------
   */

  const handleResend = async () => {
    if (
      resending ||
      !email
    ) {
      return;
    }

    setResending(true);
    setError('');
    setSuccessMsg('');

    try {
      await authApi.requestOtp(
        email
      );

      setSuccessMsg(
        'A new verification code was sent to your email.'
      );

      setOtp('');

      window.setTimeout(
        () => {
          inputRef.current?.focus();
        },
        50
      );
    } catch (
      err: unknown
    ) {
      console.error(
        '[Twinkle Auth] Resend OTP failed:',
        err
      );

      setError(
        getErrorMessage(err)
      );
    } finally {
      setResending(false);
    }
  };

  /*
   * ------------------------------------------------------------
   * UI
   * ------------------------------------------------------------
   */

  return (
    <div
      className="
        min-h-screen
        bg-[--bg-main]
        flex
        items-center
        justify-center
        px-4
        py-6
        sm:px-6
        sm:py-8
      "
    >
      <motion.div
        initial={{
          opacity: 0,
          y: 8,
          scale: 0.985,
        }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
        }}
        transition={{
          duration: 0.2,
        }}
        className="
          relative
          w-full
          max-w-[460px]
          rounded-[22px]
          border
          border-black/10
          dark:border-white/10
          bg-white
          dark:bg-zinc-950
          shadow-[0_16px_45px_rgba(0,0,0,0.10)]
          px-6
          py-7
          sm:px-8
          sm:py-8
        "
      >
        {/* CLOSE */}

        <button
          type="button"
          onClick={() =>
            navigate('/login')
          }
          aria-label="Close"
          className="
            absolute
            right-5
            top-5
            p-1.5
            text-black
            dark:text-white
            hover:opacity-55
            transition-opacity
          "
        >
          <X
            size={22}
            strokeWidth={1.8}
          />
        </button>

        {/* BACK */}

        <button
          type="button"
          onClick={() =>
            navigate('/login')
          }
          aria-label="Back"
          className="
            absolute
            left-5
            top-5
            p-1.5
            text-zinc-600
            dark:text-zinc-400
            hover:text-black
            dark:hover:text-white
            transition-colors
          "
        >
          <ArrowLeft
            size={20}
            strokeWidth={1.8}
          />
        </button>

        <div
          className="
            mx-auto
            max-w-[390px]
            text-center
            pt-2
          "
        >
          {/* TITLE */}

          <h1
            className="
              text-[30px]
              sm:text-[34px]
              leading-tight
              tracking-[-0.035em]
              font-normal
              text-black
              dark:text-white
            "
          >
            Check your inbox
          </h1>

          {/* DESCRIPTION */}

          <p
            className="
              mt-3
              text-[15px]
              sm:text-[16px]
              leading-[1.5]
              text-zinc-700
              dark:text-zinc-300
            "
          >
            Enter the 6-digit code we sent to
            <br className="hidden sm:block" />

            <span
              className="
                font-medium
                text-black
                dark:text-white
              "
            >
              {email}
            </span>
          </p>

          {/* OTP FORM */}

          <form
            onSubmit={handleSubmit}
            className="mt-7"
          >
            <input
              ref={inputRef}
              type="text"
              maxLength={6}
              value={otp}
              onChange={(event) => {
                const value =
                  event.target.value
                    .replace(
                      /\D/g,
                      ''
                    )
                    .slice(
                      0,
                      6
                    );

                setOtp(value);
                setError('');
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              aria-label="Verification code"
              placeholder="000000"
              disabled={loading}
              className="
                w-full
                h-[58px]
                rounded-full
                border
                border-zinc-400
                dark:border-zinc-600
                bg-white
                dark:bg-zinc-950
                px-5
                text-center
                text-[20px]
                tracking-[0.38em]
                text-black
                dark:text-white
                outline-none
                focus:border-black
                dark:focus:border-white
                placeholder:text-zinc-300
                dark:placeholder:text-zinc-700
                transition-colors
                disabled:opacity-60
              "
            />

            {/* SUCCESS */}

            {successMsg && (
              <p
                className="
                  mt-3
                  text-[13px]
                  text-emerald-600
                  dark:text-emerald-400
                "
              >
                {successMsg}
              </p>
            )}

            {/* ERROR */}

            {error && (
              <p
                role="alert"
                className="
                  mt-3
                  text-[13px]
                  text-red-600
                  dark:text-red-400
                "
              >
                {error}
              </p>
            )}

            {/* VERIFY */}

            <button
              type="submit"
              disabled={
                loading ||
                otp.length !== 6
              }
              className="
                mt-4
                w-full
                h-[54px]
                rounded-full
                bg-[#111111]
                dark:bg-white
                text-white
                dark:text-black
                text-[16px]
                font-semibold
                hover:opacity-90
                transition-opacity
                disabled:opacity-50
              "
            >
              {loading
                ? 'Verifying...'
                : 'Continue'}
            </button>
          </form>

          {/* RESEND */}

          <button
            type="button"
            onClick={handleResend}
            disabled={
              resending ||
              loading
            }
            className="
              mt-4
              text-[14px]
              text-zinc-700
              dark:text-zinc-300
              underline
              underline-offset-4
              hover:text-black
              dark:hover:text-white
              disabled:opacity-50
            "
          >
            {resending
              ? 'Sending...'
              : 'Resend code'}
          </button>

          {/* TERMS */}

          <p
            className="
              mt-7
              text-[12px]
              leading-relaxed
              text-zinc-500
              dark:text-zinc-400
            "
          >
            By continuing, you agree to our{' '}

            <span className="underline underline-offset-3">
              Terms of Use
            </span>

            {' '}and{' '}

            <span className="underline underline-offset-3">
              Privacy Policy
            </span>
            .
          </p>
        </div>
      </motion.div>
    </div>
  );
}