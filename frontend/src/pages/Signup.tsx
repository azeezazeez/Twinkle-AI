/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { authApi } from '../lib/api';
import type { User } from '../types';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import StormLogo from '../components/StormLogo';

interface Props {
  onSignup: (user: User) => void;
}

interface SignupResponse {
  otpSimulated?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message) {
    return error.message;
  }

  return 'Signup failed. Please try again.';
};

export default function Signup({ onSignup }: Props) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validatePassword = (pass: string): string | null => {
    if (pass.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[A-Z]/.test(pass)) return 'Password must contain at least one capital letter.';
    if (!/[a-z]/.test(pass)) return 'Password must contain at least one small letter.';
    if (!/[0-9]/.test(pass)) return 'Password must contain at least one number.';
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) {
      return 'Password must contain at least one special character.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      const rawResponse: unknown = await authApi.signup({
        username: username.trim(),
        email: email.trim(),
        password,
      });

      const response = (isRecord(rawResponse)
        ? rawResponse
        : {}) as SignupResponse;

      navigate('/verify-otp', {
        state: {
          email: email.trim(),
          otpSimulated:
            typeof response.otpSimulated === 'string'
              ? response.otpSimulated
              : undefined,
        },
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-[--bg-main] transition-colors duration-300 relative overflow-hidden">
      <div className="absolute top-1/4 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md p-6 xs:p-8 md:p-10 glass rounded-3xl md:rounded-[2.5rem] shadow-2xl relative z-10 bg-white/70 dark:bg-zinc-900/40"
      >
        <div className="flex flex-col items-center mb-6 md:mb-8 text-center">
          <div className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center mb-6 text-black dark:text-white">
            <StormLogo className="w-full h-full" />
          </div>

          <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-[--text-main] mb-2 italic uppercase">
            Twinkle
          </h1>

          <p className="text-[10px] md:text-sm font-medium tracking-widest uppercase opacity-60 text-[--text-muted]">
            Join the Twinkle community
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
          <div>
            <label className="block text-[9px] md:text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-1.5 md:mb-2 px-1">
              Username
            </label>

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 md:px-5 py-3 md:py-4 bg-[--surface] border border-[--border] rounded-xl md:rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm md:text-base text-[--text-main] placeholder:text-[--text-muted]/30"
              placeholder="username"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-[9px] md:text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-1.5 md:mb-2 px-1">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 md:px-5 py-3 md:py-4 bg-[--surface] border border-[--border] rounded-xl md:rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm md:text-base text-[--text-main] placeholder:text-[--text-muted]/30"
              placeholder="email@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-[9px] md:text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-1.5 md:mb-2 px-1">
              Password
            </label>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 md:px-5 py-3 md:py-4 bg-[--surface] border border-[--border] rounded-xl md:rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-[--text-main] placeholder:text-[--text-muted]/30 text-sm pr-12 md:pr-14"
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 p-1.5 md:p-2 text-[--text-muted] hover:text-[--text-main] transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-4 h-4 md:w-5 md:h-5" />
                )}
              </button>
            </div>

            <p className="mt-2 px-1 text-[9px] md:text-[10px] text-[--text-muted] leading-relaxed font-medium">
              Requires 8+ characters, one uppercase, one lowercase, one number, and one symbol.
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full px-1 text-center text-red-600 dark:text-red-400 text-[9px] md:text-xs font-bold uppercase tracking-widest leading-relaxed"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </motion.div>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            className="w-full py-4 md:py-5 px-6 md:px-8 bg-indigo-600 text-white dark:bg-white dark:text-black rounded-xl md:rounded-[1.25rem] font-bold uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-2 md:gap-3 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-xl"
          >
            {loading ? 'Processing...' : 'Sign Up'}
            <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </form>

        <p className="mt-6 md:mt-8 text-center text-[10px] md:text-xs text-[--text-muted] font-medium tracking-wide">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-indigo-600 dark:text-white font-bold hover:underline transition-colors underline-offset-8 decoration-indigo-500/30"
          >
            Log In
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
