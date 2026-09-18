/**
 * Twinkle AI — Unified Email Authentication
 *
 * Flow:
 * Email → Continue → OTP → Chat
 *
 * Google:
 * Continue with Google → Google OAuth → Chat
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { authApi } from '../lib/api';

interface Props {
  onLogin: (user: any) => void;
}

const GOOGLE_OAUTH_URL =
  '/api/auth/oauth/google';

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

  return 'Unable to continue. Please try again.';
};

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M21.35 12.21c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.26Z"
      />

      <path
        fill="#34A853"
        d="M12 21.99c2.63 0 4.84-.87 6.45-2.37l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.52A9.74 9.74 0 0 0 12 21.99Z"
      />

      <path
        fill="#FBBC05"
        d="M6.54 14.06A5.86 5.86 0 0 1 6.24 12c0-.72.12-1.42.3-2.06V7.42H3.3A9.99 9.99 0 0 0 2.25 12c0 1.65.4 3.2 1.05 4.58l3.24-2.52Z"
      />

      <path
        fill="#EA4335"
        d="M12 5.91c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.83 2.98 14.63 2 12 2a9.74 9.74 0 0 0-8.7 5.42l3.24 2.52C7.31 7.63 9.46 5.91 12 5.91Z"
      />
    </svg>
  );
}

export default function Login({
  onLogin: _onLogin,
}: Props) {
  const navigate = useNavigate();

  const [email, setEmail] =
    useState('');

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [googleLoading, setGoogleLoading] =
    useState(false);

  /*
   * ==========================================================
   * EMAIL → OTP
   * ==========================================================
   */

  const handleContinue = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError('');

    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError(
        'Enter your email address.'
      );
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        normalizedEmail
      )
    ) {
      setError(
        'Enter a valid email address.'
      );
      return;
    }

    setLoading(true);

    try {
      const response =
        await authApi.requestOtp(
          normalizedEmail
        );

      navigate('/verify-otp', {
        state: {
          email: normalizedEmail,
        },
      });

      void response;
    } catch (err: unknown) {
      console.error(
        '[Twinkle Auth] OTP request failed:',
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
   * ==========================================================
   * GOOGLE OAUTH
   * ==========================================================
   *
   * IMPORTANT:
   *
   * This is deliberately NOT:
   *
   *   authApi.startGoogleOAuth()
   *
   * We use direct browser navigation so there is absolutely
   * no possibility of this action being treated as part of
   * the email/OTP flow.
   */

  const handleGoogle = () => {
    if (googleLoading) {
      return;
    }

    setGoogleLoading(true);
    setError('');

    console.log(
      '[Twinkle Auth] Starting Google OAuth:',
      GOOGLE_OAUTH_URL
    );

    /*
     * Full browser navigation.
     */
    window.location.assign(
      GOOGLE_OAUTH_URL
    );
  };

  /*
   * ==========================================================
   * UI
   * ==========================================================
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
            navigate('/')
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
            Log in or sign up
          </h1>

          {/* DESCRIPTION */}

          <p
            className="
              mt-3
              text-[15px]
              sm:text-[16px]
              leading-[1.45]
              text-zinc-700
              dark:text-zinc-300
            "
          >
            You'll get smarter responses
            and can
            <br className="hidden sm:block" />
            upload files, images, and more.
          </p>

          {/* GOOGLE */}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            aria-label="Continue with Google"
            className="
              mt-7
              w-full
              h-[52px]
              rounded-full
              border
              border-black/12
              dark:border-white/15
              bg-white
              dark:bg-zinc-950
              flex
              items-center
              justify-center
              gap-2.5
              text-[15px]
              sm:text-[16px]
              font-medium
              text-zinc-900
              dark:text-white
              hover:bg-zinc-50
              dark:hover:bg-zinc-900
              transition-colors
              disabled:opacity-60
              disabled:cursor-not-allowed
            "
          >
            <GoogleIcon />

            {googleLoading
              ? 'Opening...'
              : 'Continue with Google'}
          </button>

          {/* OR */}

          <div
            className="
              my-5
              flex
              items-center
              gap-4
              text-[12px]
              font-medium
              text-zinc-500
              dark:text-zinc-400
            "
          >
            <span
              className="
                h-px
                flex-1
                bg-zinc-200
                dark:bg-zinc-800
              "
            />

            <span>OR</span>

            <span
              className="
                h-px
                flex-1
                bg-zinc-200
                dark:bg-zinc-800
              "
            />
          </div>

          {/* EMAIL FORM */}

          <form
            onSubmit={
              handleContinue
            }
          >
            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="Email address"
              autoComplete="email"
              autoFocus
              required
              disabled={loading}
              className="
                w-full
                h-[56px]
                rounded-full
                border
                border-zinc-400
                dark:border-zinc-600
                bg-white
                dark:bg-zinc-950
                px-5
                text-[16px]
                text-black
                dark:text-white
                outline-none
                focus:border-black
                dark:focus:border-white
                placeholder:text-zinc-400
                transition-colors
                disabled:opacity-60
              "
            />

            {/* ERROR */}

            {error && (
              <p
                role="alert"
                className="
                  mt-2.5
                  text-left
                  px-4
                  text-[13px]
                  text-red-600
                  dark:text-red-400
                "
              >
                {error}
              </p>
            )}

            {/* CONTINUE */}

            <button
              type="submit"
              disabled={
                loading ||
                !email.trim()
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
                disabled:cursor-not-allowed
              "
            >
              {loading
                ? 'Sending code...'
                : 'Continue'}
            </button>
          </form>

          {/* TERMS */}

          <p
            className="
              mt-5
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
