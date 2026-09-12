/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { authApi } from '../lib/api';
import type { User } from '../types';
import { ArrowRight, CheckCircle, Eye, EyeOff } from 'lucide-react';
import StormLogo from '../components/StormLogo';

interface Props {
  onLogin: (user: User) => void;
}

interface LoginLocationState {
  message?: string;
}

interface LoginResponse {
  token?: string;
  user?: User;
}

interface ApiErrorShape {
  message?: unknown;
  email?: unknown;
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

  return 'Unable to log in. Please try again.';
};

export default function Login({ onLogin }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const state = location.state as LoginLocationState | null;

    if (!state?.message) {
      return;
    }

    setSuccessMsg(state.message);

    const timer = window.setTimeout(() => {
      setSuccessMsg('');
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const rawResponse: unknown = await authApi.login({
        username: username.trim(),
        password,
      });

      const response = (isRecord(rawResponse)
        ? rawResponse
        : {}) as LoginResponse;

      if (response.token) {
        localStorage.setItem('auth_token', response.token);
      }

      if (!response.user) {
        throw new Error('Login succeeded but no user information was returned.');
      }

      onLogin(response.user);
    } catch (err: unknown) {
      const accountError = (
        isRecord(err) ? err : {}
      ) as ApiErrorShape;

      if (accountError.message === 'Account not verified') {
        navigate('/verify-otp', {
          state: {
            email: typeof accountError.email === 'string'
              ? accountError.email
              : username.trim(),
          },
        });
        return;
      }

      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-[--bg-main] transition-colors duration-300 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-6 xs:p-8 md:p-10 glass rounded-3xl md:rounded-[2.5rem] shadow-2xl relative z-10 bg-white/70 dark:bg-zinc-900/40"
      >
        <div className="flex flex-col items-center mb-8 md:mb-10 text-center">
          <div className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center mb-6 text-black dark:text-white">
            <StormLogo className="w-full h-full" />
          </div>

          <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-[--text-main] mb-2 italic uppercase">
            Twinkle
          </h1>

          <p className="text-[--text-muted] text-xs md:text-sm font-medium tracking-widest uppercase opacity-60">
            The Future of Intelligence
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          <div>
            <label className="block text-[9px] md:text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-1.5 md:mb-2 px-1">
              Username
            </label>

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 md:px-6 py-3.5 md:py-4 bg-[--surface] border border-[--border] rounded-xl md:rounded-[1.25rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-sm md:text-base text-[--text-main] placeholder:text-[--text-muted]/40 font-medium"
              placeholder="Enter your username"
              autoComplete="username"
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
                className="w-full px-4 md:px-6 py-3.5 md:py-4 bg-[--surface] border border-[--border] rounded-xl md:rounded-[1.25rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-sm md:text-base text-[--text-main] placeholder:text-[--text-muted]/40 font-medium pr-12 md:pr-14"
                placeholder="••••••••"
                autoComplete="current-password"
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
          </div>

          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full px-1 text-center text-emerald-600 dark:text-emerald-400 text-[9px] md:text-xs font-bold uppercase tracking-widest leading-relaxed flex items-center justify-center gap-2 md:gap-3"
              role="status"
              aria-live="polite"
            >
              <CheckCircle className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
              {successMsg}
            </motion.div>
          )}

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

          <div className="pt-1 md:pt-2">
            <div className="flex justify-center mb-3 md:mb-4">
              <Link
                to="/forgot-password"
                className="text-[10px] md:text-[11px] font-black text-indigo-500 hover:underline uppercase tracking-widest"
              >
                Forgot Password?
              </Link>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              className="w-full py-4 md:py-5 px-6 md:px-8 bg-indigo-600 text-white dark:bg-white dark:text-black rounded-xl md:rounded-[1.25rem] font-bold uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-2 md:gap-3 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-xl"
            >
              {loading ? 'Logging in...' : 'Log In'}
              <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </form>

        <p className="mt-8 md:mt-10 text-center text-[10px] md:text-xs text-[--text-muted] font-medium tracking-wide">
          Don't have an account?{' '}
          <Link
            to="/signup"
            className="text-indigo-600 dark:text-white font-bold hover:underline transition-colors underline-offset-8 decoration-indigo-500/30"
          >
            Sign Up
          </Link>
        </p>
      </motion.div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 opacity-30 select-none pointer-events-none">
        <p className="text-[10px] font-black text-[--text-muted] uppercase tracking-[0.3em]">
          Safe &amp; Secure
        </p>
      </div>
    </div>
  );
}
