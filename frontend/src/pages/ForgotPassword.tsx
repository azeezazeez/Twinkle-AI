/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { authApi } from '../lib/api';
import { ArrowRight, ArrowLeft, Mail } from 'lucide-react';
import StormLogo from '../components/StormLogo';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authApi.forgotPassword(email);
      setStep('reset');
      if (response.otpSimulated) {
        setError(`Recovery code: ${response.otpSimulated} (Simulated)`);
      } else {
        setError('Recovery code sent. Please check your inbox.');
      }
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authApi.resetPassword(email, otp, newPassword);
      navigate('/login', { state: { message: 'Password updated successfully.' } });
    } catch (err: any) {
      setError(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authApi.resendOtp(email);
      if (response.otpSimulated) {
        setError(`New code: ${response.otpSimulated} (Simulated)`);
      } else {
        setError('Verification code resent.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-[--bg-main] transition-colors duration-300 relative overflow-hidden">
      <div className="absolute top-1/4 -right-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px]" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white dark:bg-black/40 backdrop-blur-xl border border-[--border] rounded-[2.5rem] p-10 shadow-2xl relative z-10"
      >
        <Link to="/login" className="inline-flex items-center gap-2 text-[10px] font-black text-[--text-muted] hover:text-indigo-500 transition-colors uppercase tracking-widest mb-8">
          <ArrowLeft className="w-3 h-3" />
          Back to Login
        </Link>

        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/20 text-white p-3 mx-auto">
            <StormLogo className="w-full h-full" />
          </div>
          <h1 className="text-4xl font-black text-[--text-main] tracking-tighter uppercase italic">
            {step === 'request' ? 'Recover' : 'Reset'}
          </h1>
          <p className="text-[--text-muted] mt-3 text-sm font-medium">
            {step === 'request' 
              ? 'Enter your email to receive a password reset code.' 
              : `Enter the code sent to your email to reset your password.`}
          </p>
        </div>

        {step === 'request' ? (
          <form onSubmit={handleRequestReset} className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-2 px-1">Email Address</label>
              <div className="relative">
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-12 py-4 bg-[--surface] border border-[--border] rounded-[1.25rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-[--text-main] placeholder:text-[--text-muted]/40 font-medium"
                  placeholder="name@example.com"
                  required
                />
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[--text-muted]/40" />
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className={`p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest leading-relaxed ${
                  error.toLowerCase().includes('resent') || error.toLowerCase().includes('code:') ? 'bg-indigo-500/10 text-indigo-500' : 'bg-red-500/10 text-red-500'
                }`}
              >
                {error}
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-indigo-600 dark:bg-white text-white dark:text-black rounded-[1.25rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:opacity-90 transition-all disabled:opacity-50 shadow-xl"
            >
              {loading ? 'Sending...' : (
                <>
                  Send Code
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-2 px-1">Verification Code</label>
                <input 
                  type="text" 
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-6 py-4 bg-[--surface] border border-[--border] rounded-[1.25rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-[--text-main] text-center text-xl font-bold tracking-[0.5em]"
                  placeholder="000000"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-2 px-1">New Password</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-6 py-4 bg-[--surface] border border-[--border] rounded-[1.25rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-[--text-main]"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className={`p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest leading-relaxed ${
                  error.toLowerCase().includes('sent') || error.toLowerCase().includes('code:') ? 'bg-indigo-500/10 text-indigo-500' : 'bg-red-500/10 text-red-500'
                }`}
              >
                {error}
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={loading || otp.length !== 6 || !newPassword}
              className="w-full py-5 bg-indigo-600 dark:bg-white text-white dark:text-black rounded-[1.25rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:opacity-90 transition-all disabled:opacity-50 shadow-xl"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <div className="text-center pt-4 border-t border-[--border]">
              <p className="text-[10px] text-[--text-muted] mb-2 uppercase tracking-widest">Didn't receive the code?</p>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                className="text-[10px] font-black text-indigo-500 hover:text-indigo-600 uppercase tracking-[0.2em] transition-colors disabled:opacity-50"
              >
                Resend Code
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
