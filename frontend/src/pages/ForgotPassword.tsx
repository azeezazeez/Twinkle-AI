/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api';
import { toast } from '../lib/toast';
import AuthSpinner from '../components/AuthSpinner';
import AuthShell, {
  authInputClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '../components/AuthShell';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = (await authApi.forgotPassword(email)) as { otpSimulated?: string };
      setStep('reset');
      setNotice(
        response?.otpSimulated
          ? `Recovery code: ${response.otpSimulated} (Simulated)`
          : 'Recovery code sent. Please check your inbox.'
      );
      toast.success('Recovery code sent. Please check your inbox.');
    } catch (err: any) {
      toast.error(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await authApi.resetPassword(email, otp, newPassword);
      toast.success('Password updated successfully.');
      navigate('/login', { state: { message: 'Password updated successfully.' } });
    } catch (err: any) {
      toast.error(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = (await authApi.resendOtp(email)) as { otpSimulated?: string };
      setNotice(
        response?.otpSimulated
          ? `New code: ${response.otpSimulated} (Simulated)`
          : 'Verification code resent.'
      );
      toast.success('Verification code resent.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={step === 'request' ? 'Reset your password' : 'Check your email'}
      subtitle={
        step === 'request'
          ? 'Enter your email to receive a password reset code'
          : 'Enter the code we sent and choose a new password'
      }
    >
      {step === 'request' ? (
        <form onSubmit={handleRequestReset} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            aria-label="Email address"
            autoComplete="email"
            autoFocus
            required
            disabled={loading}
            className={authInputClass}
          />

          {error && (
            <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading || !email.trim()} aria-busy={loading} className={`${authPrimaryButtonClass} flex items-center justify-center gap-2`}>
            {loading && <AuthSpinner />}
            {loading ? 'Sending...' : 'Send reset code'}
          </button>

          <div className="mt-3 text-center">
            <button type="button" onClick={() => navigate('/login')} className={authLinkClass}>
              Back to log in
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className="flex flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            aria-label="6-digit verification code"
            required
            className={`${authInputClass} text-center text-[20px] tracking-[0.5em]`}
          />

          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            aria-label="New password"
            autoComplete="new-password"
            required
            className={authInputClass}
          />

          {notice && !error && (
            <p role="status" className="text-[13px] text-emerald-700 dark:text-emerald-400">
              {notice}
            </p>
          )}

          {error && (
            <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || otp.length !== 6 || !newPassword}
            aria-busy={loading}
            className={`${authPrimaryButtonClass} flex items-center justify-center gap-2`}
          >
            {loading && <AuthSpinner />}
            {loading ? 'Resetting...' : 'Reset password'}
          </button>

          <div className="mt-3 flex flex-col items-center gap-3">
            <button type="button" onClick={handleResendOtp} disabled={loading} className={authLinkClass}>
              Resend email
            </button>
            <button type="button" onClick={() => navigate('/login')} className={authLinkClass}>
              Back to log in
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
