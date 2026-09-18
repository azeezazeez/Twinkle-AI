import { useState } from 'react';

const GOOGLE_OAUTH_URL = '/api/auth/oauth/google';

export default function SocialAuthButtons() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    if (loading) {
      return;
    }

    setLoading(true);

    /*
     * Google OAuth is a browser navigation.
     *
     * Do NOT use fetch().
     * Do NOT submit the email form.
     * Do NOT navigate to /login.
     *
     * Vercel:
     * /api/auth/oauth/google
     *
     * rewrites to:
     * https://twinkle-ai-ype3.onrender.com/api/auth/oauth/google
     */
    window.location.assign(GOOGLE_OAUTH_URL);
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
        aria-label="Continue with Google"
        className="
          w-full
          h-14
          rounded-xl
          border
          border-black/20
          bg-white/70
          flex
          items-center
          justify-center
          gap-3
          text-sm
          font-semibold
          text-black
          transition-all
          duration-200
          hover:bg-white
          hover:border-black/40
          disabled:opacity-60
          disabled:cursor-not-allowed
        "
      >
        <span
          className="
            flex
            items-center
            justify-center
            w-5
            h-5
            text-lg
            font-bold
          "
          aria-hidden="true"
        >
          G
        </span>

        <span>
          {loading
            ? 'Opening...'
            : 'Continue with Google'}
        </span>
      </button>
    </div>
  );
}
