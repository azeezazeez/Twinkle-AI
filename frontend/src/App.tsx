/**
 * Twinkle AI — Application Router
 *
 * Authentication:
 *
 * Email:
 * /login
 *   ↓
 * /verify-otp
 *   ↓
 * /
 *
 * Google:
 * /api/auth/oauth/google
 *   ↓
 * Google
 *   ↓
 * /api/auth/oauth/google/callback
 *   ↓
 * /
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

import {
  LanguageProvider,
} from './lib/i18n';

import Login from './pages/Login';
import VerifyOtp from './pages/VerifyOtp';
import ForgotPassword from './pages/ForgotPassword';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

import StormLogo from './components/StormLogo';

import type { User } from './types';


/*
 * ==========================================================
 * CHAT ROUTE
 * ==========================================================
 */

function ChatRoute({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {

  const navigate =
    useNavigate();

  return (
    <Chat
      user={user}
      onLogout={onLogout}
      onProjects={() => {}}
      onProfile={() =>
        navigate('/profile')
      }
      onSettings={() =>
        navigate('/settings')
      }
    />
  );
}


/*
 * ==========================================================
 * AUTHENTICATED APPLICATION
 * ==========================================================
 */

function AuthenticatedApp({
  user,
  setUser,
}: {
  user: User | null;
  setUser: React.Dispatch<
    React.SetStateAction<User | null>
  >;
}) {

  const location =
    useLocation();


  /*
   * ----------------------------------------------------------
   * OAUTH ERROR
   * ----------------------------------------------------------
   */

  useEffect(() => {

    const params =
      new URLSearchParams(
        location.search
      );

    const oauthError =
      params.get(
        'oauthError'
      );

    if (oauthError) {

      console.error(
        '[Twinkle Auth] Google OAuth error:',
        oauthError
      );

    }

  }, [
    location.search,
  ]);


  /*
   * ----------------------------------------------------------
   * LOGOUT
   * ----------------------------------------------------------
   */

  const handleLogout =
    useCallback(
      async () => {

        try {

          await authApi.logout();

        } catch (error) {

          console.error(
            '[Twinkle Auth] Logout request failed:',
            error
          );

        } finally {

          /*
           * Remove only client-side legacy values.
           *
           * The real Spring Session is invalidated
           * by /api/auth/logout.
           */

          localStorage.removeItem(
            'scout_current_session_id'
          );

          localStorage.removeItem(
            'auth_token'
          );

          setUser(null);
        }

      },
      [setUser]
    );


  /*
   * ----------------------------------------------------------
   * LOGIN CALLBACK
   * ----------------------------------------------------------
   */

  const handleLogin =
    useCallback(
      (loggedInUser: User) => {

        localStorage.removeItem(
          'scout_current_session_id'
        );

        /*
         * Do not store a JWT here.
         *
         * Authentication is maintained by the
         * Spring Session cookie.
         */

        localStorage.removeItem(
          'auth_token'
        );

        setUser(
          loggedInUser
        );

      },
      [setUser]
    );


  return (
    <Routes>

      {/* =====================================================
          LOGIN
          ===================================================== */}

      <Route
        path="/login"
        element={
          user ? (
            <Navigate
              to="/"
              replace
            />
          ) : (
            <Login
              onLogin={
                handleLogin
              }
            />
          )
        }
      />


      {/* =====================================================
          OTP
          ===================================================== */}

      <Route
        path="/verify-otp"
        element={
          user ? (
            <Navigate
              to="/"
              replace
            />
          ) : (
            <VerifyOtp
              onLogin={
                handleLogin
              }
            />
          )
        }
      />


      {/* =====================================================
          FORGOT PASSWORD
          ===================================================== */}

      <Route
        path="/forgot-password"
        element={
          user ? (
            <Navigate
              to="/"
              replace
            />
          ) : (
            <ForgotPassword />
          )
        }
      />


      {/* =====================================================
          CHAT
          ===================================================== */}

      <Route
        path="/"
        element={
          user ? (
            <ChatRoute
              user={user}
              onLogout={
                handleLogout
              }
            />
          ) : (
            <Navigate
              to="/login"
              replace
            />
          )
        }
      />


      {/* =====================================================
          PROFILE
          ===================================================== */}

      <Route
        path="/profile"
        element={
          user ? (
            <Profile
              user={user}
              onUserUpdate={
                setUser
              }
            />
          ) : (
            <Navigate
              to="/login"
              replace
            />
          )
        }
      />


      {/* =====================================================
          SETTINGS
          ===================================================== */}

      <Route
        path="/settings"
        element={
          user ? (
            <Settings
              user={user}
            />
          ) : (
            <Navigate
              to="/login"
              replace
            />
          )
        }
      />


      {/* =====================================================
          UNKNOWN ROUTES
          ===================================================== */}

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />

    </Routes>
  );
}


/*
 * ==========================================================
 * LOADING SCREEN
 * ==========================================================
 */

function LoadingScreen() {

  return (
    <div
      className="
        flex
        items-center
        justify-center
        min-h-screen
        bg-[--bg-main]
        transition-colors
        duration-300
      "
    >
      <div
        className="
          flex
          flex-col
          items-center
          gap-4
        "
      >

        <StormLogo
          className="
            w-12
            h-12
            text-indigo-500
            animate-pulse
          "
        />

        <span
          className="
            text-[10px]
            font-bold
            text-[--text-muted]
            uppercase
            tracking-[0.3em]
          "
        >
          Loading...
        </span>

      </div>
    </div>
  );
}


/*
 * ==========================================================
 * APP
 * ==========================================================
 */

export default function App() {

  const [
    user,
    setUser,
  ] = useState<User | null>(
    null
  );


  const [
    loading,
    setLoading,
  ] = useState(true);


  /*
   * ----------------------------------------------------------
   * AUTHENTICATION CHECK
   * ----------------------------------------------------------
   */

  const checkAuth =
    useCallback(
      async () => {

        const withTimeout =
          async <T,>(
            promise: Promise<T>,
            timeoutMs = 12000
          ): Promise<T> => {

            let timeoutId:
              number |
              undefined;


            const timeout =
              new Promise<never>(
                (
                  _,
                  reject
                ) => {

                  timeoutId =
                    window.setTimeout(
                      () => {

                        reject(
                          new Error(
                            'Authentication request timed out.'
                          )
                        );

                      },
                      timeoutMs
                    );

                }
              );


            try {

              return await Promise.race(
                [
                  promise,
                  timeout,
                ]
              );

            } finally {

              if (
                timeoutId !==
                undefined
              ) {

                window.clearTimeout(
                  timeoutId
                );

              }

            }
          };


        try {

          /*
           * First check whether Spring Session
           * considers this browser authenticated.
           */

          const status =
            await withTimeout(
              authApi.getStatus()
            );


          const authenticated =
            status &&
            typeof status ===
              'object' &&
            'authenticated' in
              status &&
            status.authenticated ===
              true;


          if (!authenticated) {

            setUser(null);

            return;
          }


          /*
           * Then load the actual user.
           */

          const profile =
            await withTimeout(
              authApi.getProfile()
            );


          if (
            profile &&
            typeof profile ===
              'object' &&
            'user' in profile &&
            profile.user
          ) {

            setUser(
              profile.user as User
            );

            return;
          }


          setUser(null);

        } catch (error) {

          console.error(
            '[Twinkle Auth] Authentication check failed:',
            error
          );

          setUser(null);

        } finally {

          setLoading(false);
        }

      },
      []
    );


  /*
   * ----------------------------------------------------------
   * INITIAL AUTH CHECK
   * ----------------------------------------------------------
   */

  useEffect(() => {

    void checkAuth();

  }, [
    checkAuth,
  ]);


  /*
   * ----------------------------------------------------------
   * LOADING
   * ----------------------------------------------------------
   */

  if (loading) {

    return (
      <LoadingScreen />
    );
  }


  /*
   * ----------------------------------------------------------
   * APPLICATION
   * ----------------------------------------------------------
   */

  return (
    <LanguageProvider>

      <BrowserRouter
        future={{
          v7_startTransition:
            true,

          v7_relativeSplatPath:
            true,
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
