import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from 'react-router-dom';

import {
  Suspense,
  lazy,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ComponentType,
} from 'react';

import { authApi } from './lib/api';
import { matchShortcut, dispatchShortcut, setPendingShortcut } from './lib/shortcuts';

import {
  LanguageProvider,
} from './lib/i18n';

import Login from './pages/Login';
import LoginEmail from './pages/LoginEmail';
import VerifyOtp from './pages/VerifyOtp';
import ForgotPassword from './pages/ForgotPassword';
import Chat from './pages/Chat';
// Loaded only when the page is opened, so the first load is much smaller.
// After a new deployment the old hashed chunk no longer exists on the server,
// so a lazy import fails. Reload once to pick up the fresh build instead of
// leaving a blank page.
function lazyRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const KEY = 'twinkle:chunk-reload';
    try {
      const mod = await load();
      try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
      return mod;
    } catch (error) {
      let alreadyTried = false;
      try { alreadyTried = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
      if (!alreadyTried) {
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw error;
    }
  });
}
const Profile = lazyRetry(() => import('./pages/Profile'));
const Settings = lazyRetry(() => import('./pages/Settings'));
const LiveTalkColor = lazyRetry(() => import('./pages/LiveTalkColor'));
const SharedChat = lazyRetry(() => import('./pages/SharedChat'));
const Library = lazyRetry(() => import('./pages/KnowledgeBase'));
const LearnMore = lazyRetry(() => import('./pages/LearnMore'));

import Toaster from './components/Toaster';
import { toast } from './lib/toast';

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
      onSettings={() =>
        navigate('/settings')
      }
    />
  );
}



function LegacyChatRedirect() {
  const { chatUuid } = useParams<{ chatUuid: string }>();
  return <Navigate to={`/chat/${chatUuid ?? ''}`} replace />;
}

/*
 * ==========================================================
 * GLOBAL KEYBOARD SHORTCUTS
 * ==========================================================
 * One listener for the whole app. Settings/shortcuts navigate directly;
 * chat shortcuts are broadcast to the Sidebar/Chat (or, when pressed on a
 * page without a chat, remembered and run right after returning to "/").
 */

function GlobalShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchShortcut(event);
      if (!action) return;

      // Always stop the browser's own meaning (Ctrl+K, Ctrl+Shift+O, ...).
      event.preventDefault();

      if (action === 'settings') {
        navigate('/settings');
        return;
      }
      if (action === 'shortcuts') {
        navigate('/settings?tab=shortcuts');
        return;
      }

      const path = pathRef.current;
      const onChat = path === '/' || path === '/chats' || path.startsWith('/chat/');
      if (onChat) {
        dispatchShortcut(action);
        return;
      }

      // Not on a chat page: go there first, then run the action.
      if (action !== 'new-chat') setPendingShortcut(action);
      navigate('/');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return null;
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

      toast.error('Google sign-in failed. Please try again.', { id: 'oauth-error' });

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
    <Suspense
      fallback={
        <div className="flex h-full min-h-screen w-full items-center justify-center bg-[var(--bg-main)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-[#C6613F]" />
        </div>
      }
    >
    {user && <GlobalShortcuts />}
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
          EMAIL LOGIN ("click the link sent to ...")
          ===================================================== */}

      <Route
        path="/login/email"
        element={
          user ? (
            <Navigate
              to="/"
              replace
            />
          ) : (
            <LoginEmail />
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
          PUBLIC SHARED CHAT
          This route intentionally does not require authentication.
          ===================================================== */}

      <Route
        path="/share/:token"
        element={<SharedChat />}
      />
      {/* Backward compatibility for links created before the /share route. */}
      <Route
        path="/shared/:token"
        element={<SharedChat />}
      />


      <Route
        path="/learn-more"
        element={user ? <LearnMore /> : <Navigate to="/login" replace />}
      />

      {/* =====================================================
          PRIVATE DOCUMENT LIBRARY (RAG)
          ===================================================== */}
      <Route
        path="/library"
        element={user ? <Library /> : <Navigate to="/login" replace />}
      />
      <Route path="/knowledge" element={<Navigate to="/library" replace />} />

      {/* =====================================================
          CHAT
          ===================================================== */}

      {/* Old /c/<id> links keep working and move to /chat/<id>. */}
      <Route path="/c/:chatUuid" element={<LegacyChatRedirect />} />

      <Route
        path="/chat/:chatUuid"
        element={
          user ? (
            <ChatRoute user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* "Chats and tasks": full list of chats, opened from the sidebar arrow. */}
      <Route
        path="/chats"
        element={
          user ? (
            <ChatRoute user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

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
              onLogout={handleLogout}
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
          LIVE TALK COLOR
          ===================================================== */}

      <Route
        path="/live-talk-color"
        element={
          user ? (
            <LiveTalkColor />
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
    </Suspense>
  );
}


/*
 * ==========================================================
 * LOADING SCREEN
 * ==========================================================
 */

/** Silent placeholder while the session is restored: no logo, text or animation. */
function LoadingScreen() {
  return <div className="min-h-screen bg-[--bg-main]" aria-busy="true" />;
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

      <Toaster />

      <BrowserRouter>

        <AuthenticatedApp
          user={user}
          setUser={setUser}
        />

      </BrowserRouter>

    </LanguageProvider>
  );
}
