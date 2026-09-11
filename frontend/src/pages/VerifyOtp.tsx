/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { authApi } from '../lib/api';
import { User } from '../types';
import { ArrowRight, RefreshCw } from 'lucide-react';
import StormLogo from '../components/StormLogo';

interface Props {
  onLogin: (user: User) => void;
}

export default function VerifyOtp({ onLogin }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const state = location.state as { email?: string; otpSimulated?: string };
    if (state?.email) {
      setEmail(state.email);
      if (state.otpSimulated) {
        setError(`Verification Code: ${state.otpSimulated} (Simulated)`);
      }
    } else {
      // If no email in state, redirect to login
      navigate('/login');
    }
  }, [location, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await authApi.verifyOtp(email, otp);
      if (response.token) {
        localStorage.setItem('auth_token', response.token);
      }
      onLogin(response.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      const response = await authApi.resendOtp(email);
      if (response.otpSimulated) {
        setError(`New code: ${response.otpSimulated} (Simulated)`);
      } else {
        setError('Verification code resent. Please check your inbox.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-[--bg-main] transition-colors duration-300 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px]" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-black/40 backdrop-blur-xl border border-[--border] rounded-3xl md:rounded-[2.5rem] p-6 xs:p-8 md:p-10 shadow-2xl relative z-10"
      >
        <div className="text-center mb-6 md:mb-10">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-4 md:mb-6 shadow-xl shadow-indigo-500/20 text-white p-2.5 md:p-3">
            <StormLogo className="w-full h-full" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-[--text-main] mb-1 md:mb-2 italic">VERIFY</h1>
          <p className="text-[--text-muted] mt-2 md:mt-3 text-[10px] md:text-sm font-medium leading-relaxed">
            We sent a code to <span className="text-indigo-500 font-bold">{email}</span>. Please enter it below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          <div>
            <div className="flex justify-between items-center mb-1.5 md:mb-2 px-1">
              <label className="text-[9px] md:text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em]">Verification Code</label>
            </div>
            <input 
              type="text" 
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 md:px-6 py-3.5 md:py-5 bg-[--surface] border border-[--border] rounded-xl md:rounded-[1.25rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-[--text-main] text-center text-xl md:text-2xl font-black tracking-[0.4em] md:tracking-[0.5em] placeholder:text-[--text-muted]/20"
              placeholder="000000"
              required
            />
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }} 
              animate={{ opacity: 1, x: 0 }}
              className={`p-3 md:p-4 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-bold uppercase tracking-widest leading-relaxed ${
                error.toLowerCase().includes('resent') || error.toLowerCase().includes('code:') ? 'bg-indigo-500/10 text-indigo-500' : 'bg-red-500/10 text-red-500'
              }`}
            >
              {error}
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full py-4 md:py-5 bg-indigo-600 dark:bg-white text-white dark:text-black rounded-xl md:rounded-[1.25rem] font-bold uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-2 md:gap-3 hover:opacity-90 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
          >
            {loading ? 'Verifying...' : (
              <>
                Verify Code
                <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 md:mt-8 text-center">
          <button 
            onClick={handleResend}
            disabled={resending}
            className="text-[9px] md:text-[10px] font-black text-[--text-muted] hover:text-indigo-500 transition-colors uppercase tracking-widest flex items-center gap-1.5 md:gap-2 mx-auto disabled:opacity-50"
          >
            <RefreshCw className={`w-2.5 h-2.5 md:w-3 md:h-3 ${resending ? 'animate-spin' : ''}`} />
            Resend Code
          </button>
        </div>
      </motion.div>
    </div>
  );
}
