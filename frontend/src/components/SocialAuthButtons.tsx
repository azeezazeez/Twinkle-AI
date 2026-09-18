import { useState } from 'react';
import { authApi } from '../lib/api';

export default function SocialAuthButtons() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    if (loading) return;

    setLoading(true);

    try {
      authApi.startGoogleOAuth();
    } catch (error) {
      console.error('[Twinkle Auth] Google OAuth failed:', error);
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full h-14 rounded-xl border border-black/20 bg-white/70
                   flex items-center justify-center gap-3
                   text-sm font-semibold text-black
                   transition-all duration-200
                   hover:bg-white hover:border-black/40
                   disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="text-lg font-bold">
          G
        </span>

        <span>
          {loading ? 'Opening...' : 'Continue with Google'}
        </span>
      </button>
    </div>
  );
}