/**
 * Twinkle AI — Application Router
 * Unified authentication: Login/Signup → OTP → Chat.
 */

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';

import {
  useState,
  useEffect,
  useCallback,
} from 'react';

import { authApi } from './lib/api';
import { LanguageProvider } from './lib/i18n';

import Login from './pages/Login';
import VerifyOtp from './pages/VerifyOtp';
import ForgotPassword from './pages/ForgotPassword';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

import StormLogo from './components/StormLogo';
import type { User } from './types';

function ChatRoute({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const navigate = useNavigate();

  return (
    <Chat
      user={user}
      onLogout={onLogout}
      onProjects={() => {}}
      onProfile={() => navigate('/profile')}
      onSettings={() => navigate('/settings')}
    />
  );
}

function AuthenticatedApp({
  user,
  setUser,
}: {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}) {
  const location = useLocation();

  useEffect(() => {
    const oauthError = new URLSearchParams(
      location.search
    ).get('oauthError');

    if (oauthError) {
      console.error('Google OAuth error:', oauthError);
    }
  }, [location.search]);

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      localStorage.removeItem('scout_current_session_id');
      localStorage.removeItem('auth_token');
      setUser(null);
    }
  }, [setUser]);

  const handleLogin = useCallback(
    (loggedInUser: User) => {
      localStorage.removeItem('scout_current_session_id');
      setUser(loggedInUser);
    },
    [setUser]
  );

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <Login onLogin={handleLogin} />
          )
        }
      />

      <Route
        path="/verify-otp"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <VerifyOtp onLogin={handleLogin} />
          )
        }
      />

      <Route
        path="/forgot-password"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <ForgotPassword />
          )
        }
      />

      <Route
        path="/"
        element={
          user ? (
            <ChatRoute
              user={user}
              onLogout={handleLogout}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/profile"
        element={
          user ? (
            <Profile
              user={user}
              onUserUpdate={setUser}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/settings"
        element={
          user ? (
            <Settings user={user} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[--bg-main] transition-colors duration-300">
      <div className="flex flex-col items-center gap-4">
        <StormLogo
          className="w-12 h-12 text-indigo-500 animate-pulse"
        />
        <span className="text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.3em]">
          Loading...
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const withTimeout = async <T,>(
      promise: Promise<T>,
      timeoutMs = 12000
    ): Promise<T> => {
      let timeoutId: number | undefined;

      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error('Authentication request timed out.'));
        }, timeoutMs);
      });

      try {
        return await Promise.race([promise, timeout]);
      } finally {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      }
    };

    try {
      const status = await withTimeout(authApi.getStatus());

      const authenticated =
        status &&
        typeof status === 'object' &&
        'authenticated' in status &&
        status.authenticated === true;

      if (!authenticated) {
        setUser(null);
        return;
      }

      const profile = await withTimeout(authApi.getProfile());

      if (
        profile &&
        typeof profile === 'object' &&
        'user' in profile &&
        profile.user
      ) {
        setUser(profile.user as User);
        return;
      }

      setUser(null);
    } catch (error) {
      console.error('[Twinkle Auth] Authentication check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <LanguageProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthenticatedApp
          user={user}
          setUser={setUser}
        />
      </BrowserRouter>
    </LanguageProvider>
  );
}
