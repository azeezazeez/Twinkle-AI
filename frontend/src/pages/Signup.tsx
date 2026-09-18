/**
 * Twinkle AI — Signup
 *
 * Flow:
 * Email → Account Details → OTP → Chat
 *
 * Google:
 * Continue with Google → Google OAuth → Chat
 */

import React, {
  useState,
} from 'react';

import {
  Link,
  useNavigate,
} from 'react-router-dom';

import { motion } from 'motion/react';

import {
  Eye,
  EyeOff,
  X,
} from 'lucide-react';

import { authApi } from '../lib/api';

import type { User } from '../types';


interface Props {
  onSignup: (
    user: User
  ) => void;
}


interface SignupResponse {
  otpSimulated?: string;
}


const GOOGLE_OAUTH_URL =
  '/api/auth/oauth/google';


const isRecord = (
  value: unknown
): value is Record<
  string,
  unknown
> =>
  typeof value === 'object' &&
  value !== null;


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
    isRecord(error) &&
    typeof error.message ===
      'string' &&
    error.message
  ) {
    return error.message;
  }

  return 'Signup failed. Please try again.';
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


export default function Signup({
  onSignup,
}: Props) {

  const navigate =
    useNavigate();


  const [
    step,
    setStep,
  ] = useState<
    'email' | 'details'
  >('email');


  const [
    email,
    setEmail,
  ] = useState('');


  const [
    username,
    setUsername,
  ] = useState('');


  const [
    password,
    setPassword,
  ] = useState('');


  const [
    showPassword,
    setShowPassword,
  ] = useState(false);


  const [
    error,
    setError,
  ] = useState('');


  const [
    loading,
    setLoading,
  ] = useState(false);


  const [
    googleLoading,
    setGoogleLoading,
  ] = useState(false);


  /*
   * ==========================================================
   * PASSWORD VALIDATION
   * ==========================================================
   */

  const validatePassword = (
    pass: string
  ): string | null => {

    if (pass.length < 8) {
      return 'Password must be at least 8 characters long.';
    }

    if (!/[A-Z]/.test(pass)) {
      return 'Password must contain at least one capital letter.';
    }

    if (!/[a-z]/.test(pass)) {
      return 'Password must contain at least one small letter.';
    }

    if (!/[0-9]/.test(pass)) {
      return 'Password must contain at least one number.';
    }

    if (
      !/[!@#$%^&*(),.?":{}|<>]/.test(
        pass
      )
    ) {
      return 'Password must contain at least one special character.';
    }

    return null;
  };


  /*
   * ==========================================================
   * EMAIL STEP
   * ==========================================================
   */

  const handleEmailContinue = (
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

    setEmail(
      normalizedEmail
    );

    setStep('details');
  };


  /*
   * ==========================================================
   * CREATE ACCOUNT
   * ==========================================================
   */

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {

    event.preventDefault();

    setError('');

    const normalizedEmail =
      email.trim().toLowerCase();

    const passwordError =
      validatePassword(password);

    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (!username.trim()) {
      setError(
        'Enter a username.'
      );
      return;
    }

    setLoading(true);

    try {

      const rawResponse: unknown =
        await authApi.signup({
          username:
            username.trim(),

          email:
            normalizedEmail,

          password,
        });


      const response =
        (
          isRecord(rawResponse)
            ? rawResponse
            : {}
        ) as SignupResponse;


      navigate(
        '/verify-otp',
        {
          state: {
            email:
              normalizedEmail,

            otpSimulated:
              typeof response.otpSimulated ===
              'string'
                ? response.otpSimulated
                : undefined,
          },
        }
      );

    } catch (
      err: unknown
    ) {

      const message =
        getErrorMessage(err);

      if (
        /username\s+(already\s+)?(taken|exists|exist)|username.*already/i.test(
          message
        )
      ) {
        setError(
          'Username already exists. Please choose a different username.'
        );
      } else {
        setError(message);
      }

    } finally {
      setLoading(false);
    }
  };


  /*
   * ==========================================================
   * GOOGLE OAUTH
   * ==========================================================
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
     * Direct browser navigation.
     *
     * This completely bypasses the signup form.
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
        px-5
        py-10
      "
    >

      <motion.div
        initial={{
          opacity: 0,
          scale: 0.98,
          y: 8,
        }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
        }}
        transition={{
          duration: 0.2,
        }}
        className="
          relative
          w-full
          max-w-[536px]
          rounded-[24px]
          border
          border-black/15
          dark:border-white/15
          bg-white
          dark:bg-zinc-950
          shadow-[0_12px_40px_rgba(0,0,0,0.10)]
          px-8
          py-10
          sm:px-8
          sm:py-12
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
            right-6
            top-6
            p-1
            text-black
            dark:text-white
            hover:opacity-60
            transition-opacity
          "
        >
          <X
            size={25}
            strokeWidth={1.8}
          />
        </button>


        <div
          className="
            mx-auto
            max-w-[468px]
            text-center
          "
        >

          {/* TITLE */}

          <h1
            className="
              text-[40px]
              leading-tight
              tracking-[-0.03em]
              font-normal
              text-black
              dark:text-white
              mt-2
            "
          >
            Create your account
          </h1>


          {/* DESCRIPTION */}

          <p
            className="
              mt-5
              text-[21px]
              leading-[1.45]
              text-zinc-800
              dark:text-zinc-200
            "
          >
            Sign up to get smarter
            responses and upload
            <br className="hidden sm:block" />
            files, images, and more.
          </p>


          {/* GOOGLE */}

          <div className="mt-12">

            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              aria-label="Continue with Google"
              className="
                w-full
                h-[70px]
                rounded-full
                border
                border-black/15
                dark:border-white/20
                bg-white
                dark:bg-zinc-950
                flex
                items-center
                justify-center
                gap-3
                text-[22px]
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

          </div>


          {/* OR */}

          <div
            className="
              my-8
              flex
              items-center
              gap-8
              text-[18px]
              text-zinc-800
              dark:text-zinc-300
            "
          >

            <span
              className="
                h-px
                flex-1
                bg-zinc-300
                dark:bg-zinc-700
              "
            />

            <span>
              OR
            </span>

            <span
              className="
                h-px
                flex-1
                bg-zinc-300
                dark:bg-zinc-700
              "
            />

          </div>


          {/* EMAIL STEP */}

          {step === 'email' ? (

            <form
              onSubmit={
                handleEmailContinue
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
                className="
                  w-full
                  h-[76px]
                  rounded-full
                  border-[1.5px]
                  border-zinc-500
                  dark:border-zinc-400
                  bg-white
                  dark:bg-zinc-950
                  px-7
                  text-[21px]
                  text-black
                  dark:text-white
                  outline-none
                  focus:border-black
                  dark:focus:border-white
                  placeholder:text-zinc-400
                  transition-colors
                "
              />


              {error && (
                <p
                  className="
                    mt-3
                    text-sm
                    text-red-600
                    dark:text-red-400
                  "
                >
                  {error}
                </p>
              )}


              <button
                type="submit"
                className="
                  mt-7
                  w-full
                  h-[70px]
                  rounded-full
                  bg-[#111111]
                  dark:bg-white
                  text-white
                  dark:text-black
                  text-[21px]
                  font-semibold
                  hover:opacity-90
                  transition-opacity
                "
              >
                Continue
              </button>

            </form>

          ) : (

            /* ACCOUNT DETAILS */

            <form
              onSubmit={handleSubmit}
              className="text-left"
            >

              <label
                className="
                  block
                  text-[15px]
                  text-zinc-600
                  dark:text-zinc-400
                  mb-2
                  ml-6
                "
              >
                Username
              </label>


              <input
                type="text"
                value={username}
                onChange={(event) =>
                  setUsername(
                    event.target.value
                  )
                }
                placeholder="Username"
                autoComplete="username"
                autoFocus
                required
                className="
                  w-full
                  h-[68px]
                  rounded-full
                  border-[1.5px]
                  border-zinc-500
                  dark:border-zinc-400
                  bg-white
                  dark:bg-zinc-950
                  px-7
                  text-[19px]
                  text-black
                  dark:text-white
                  outline-none
                  focus:border-black
                  dark:focus:border-white
                  placeholder:text-zinc-400
                "
              />


              <label
                className="
                  block
                  text-[15px]
                  text-zinc-600
                  dark:text-zinc-400
                  mb-2
                  ml-6
                  mt-5
                "
              >
                Password
              </label>


              <div
                className="relative"
              >

                <input
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  placeholder="Password"
                  autoComplete="new-password"
                  required
                  className="
                    w-full
                    h-[68px]
                    rounded-full
                    border-[1.5px]
                    border-zinc-500
                    dark:border-zinc-400
                    bg-white
                    dark:bg-zinc-950
                    px-7
                    pr-16
                    text-[19px]
                    text-black
                    dark:text-white
                    outline-none
                    focus:border-black
                    dark:focus:border-white
                    placeholder:text-zinc-400
                  "
                />


                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (value) =>
                        !value
                    )
                  }
                  aria-label={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                  className="
                    absolute
                    right-5
                    top-1/2
                    -translate-y-1/2
                    p-2
                    text-zinc-500
                    hover:text-black
                    dark:hover:text-white
                  "
                >
                  {showPassword ? (
                    <EyeOff
                      size={22}
                    />
                  ) : (
                    <Eye
                      size={22}
                    />
                  )}
                </button>

              </div>


              <p
                className="
                  mt-3
                  ml-6
                  text-[13px]
                  leading-relaxed
                  text-zinc-500
                  dark:text-zinc-400
                "
              >
                Use 8+ characters with
                uppercase, lowercase,
                number, and symbol.
              </p>


              {error && (
                <p
                  className="
                    mt-4
                    text-center
                    text-sm
                    text-red-600
                    dark:text-red-400
                  "
                >
                  {error}
                </p>
              )}


              <button
                type="submit"
                disabled={loading}
                className="
                  mt-7
                  w-full
                  h-[70px]
                  rounded-full
                  bg-[#111111]
                  dark:bg-white
                  text-white
                  dark:text-black
                  text-[21px]
                  font-semibold
                  hover:opacity-90
                  transition-opacity
                  disabled:opacity-50
                  disabled:cursor-not-allowed
                "
              >
                {loading
                  ? 'Creating account...'
                  : 'Continue'}
              </button>


              <button
                type="button"
                onClick={() =>
                  setStep('email')
                }
                className="
                  w-full
                  mt-5
                  text-[17px]
                  text-zinc-700
                  dark:text-zinc-300
                  underline
                  underline-offset-4
                "
              >
                Use a different email
              </button>

            </form>
          )}


          {/* LOGIN LINK */}

          <p
            className="
              mt-8
              text-[17px]
              text-zinc-700
              dark:text-zinc-300
            "
          >
            Already have an account?{' '}

            <Link
              to="/login"
              className="
                underline
                underline-offset-4
                hover:text-black
                dark:hover:text-white
              "
            >
              Log in
            </Link>
          </p>


          {/* TERMS */}

          <p
            className="
              mt-7
              text-[17px]
              leading-relaxed
              text-zinc-700
              dark:text-zinc-300
            "
          >
            By continuing, you agree to our{' '}

            <span
              className="
                underline
                underline-offset-4
              "
            >
              Terms of Use
            </span>

            {' '}and{' '}

            <span
              className="
                underline
                underline-offset-4
              "
            >
              Privacy Policy
            </span>
            .
          </p>

        </div>

      </motion.div>
    </div>
  );
}
