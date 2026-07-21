import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * High-level auth status for UI / guards.
 * - loading: bootstrapping getSession / optional anonymous sign-in
 * - anonymous: signed in with a frictionless anonymous Supabase user
 * - authenticated: permanent account (email, OAuth, phone, etc.)
 * - signed_out: explicit sign-out with no active session
 * - error: bootstrap or auth action failed
 *
 * Anonymous users can be upgraded to `authenticated` later via
 * supabase.auth.updateUser(), linkIdentity(), or sign-in flows — this
 * provider never blocks those APIs.
 */
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'signed_out' | 'error';

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** Derived status — use for routing/guards without inspecting user flags directly. */
  authStatus: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  isPermanent: boolean;
  error: string | null;
  /** Re-read the persisted session from secure storage. */
  refreshSession: () => Promise<void>;
  /** Clear the active session. Does NOT auto-mint a new anonymous user. */
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function deriveAuthStatus(
  session: Session | null,
  isLoading: boolean,
  hasError: boolean,
): AuthStatus {
  if (isLoading) {
    return 'loading';
  }
  if (hasError && !session) {
    return 'error';
  }
  if (!session?.user) {
    return 'signed_out';
  }
  if (session.user.is_anonymous) {
    return 'anonymous';
  }
  return 'authenticated';
}

function logAuthState(event: AuthChangeEvent | 'BOOTSTRAP', session: Session | null, status: AuthStatus) {
  const userId = session?.user?.id ?? 'none';
  console.log('[Auth]', {
    event,
    authStatus: status,
    userId,
    isAnonymous: session?.user?.is_anonymous ?? false,
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bootstrapComplete = useRef(false);

  useEffect(() => {
    let mounted = true;

    const applySession = (nextSession: Session | null, event: AuthChangeEvent | 'BOOTSTRAP') => {
      if (!mounted) {
        return;
      }
      setSession(nextSession);
      const status = deriveAuthStatus(nextSession, false, false);
      logAuthState(event, nextSession, status);
    };

    // 1) Subscribe first so login / logout / token refresh events are never missed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) {
        return;
      }

      setSession(nextSession);
      setError(null);

      const status = deriveAuthStatus(nextSession, false, false);
      logAuthState(event, nextSession, status);

      // After the first auth event post-bootstrap, we are no longer "loading".
      if (bootstrapComplete.current) {
        setIsLoading(false);
      }
    });

    // 2) Restore any persisted session; only mint anonymous when none exists.
    (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        if (!mounted) {
          return;
        }

        if (data.session) {
          applySession(data.session, 'BOOTSTRAP');
        } else {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) {
            throw anonError;
          }
          // onAuthStateChange will fire SIGNED_IN; log here too for boot visibility.
          applySession(anonData.session, 'BOOTSTRAP');
        }

        setError(null);
      } catch (err) {
        if (!mounted) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to initialize auth session';
        setError(message);
        setSession(null);
        logAuthState('BOOTSTRAP', null, 'error');
        console.error('[Auth] bootstrap failed:', message);
      } finally {
        if (mounted) {
          bootstrapComplete.current = true;
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshSession = useCallback(async () => {
    const { data, error: refreshError } = await supabase.auth.getSession();
    if (refreshError) {
      setError(refreshError.message);
      return;
    }
    setSession(data.session);
    setError(null);
    const status = deriveAuthStatus(data.session, false, Boolean(refreshError));
    logAuthState('BOOTSTRAP', data.session, status);
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
      setSession(null);
      setError(null);
      logAuthState('SIGNED_OUT', null, 'signed_out');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign out';
      setError(message);
      console.error('[Auth] signOut failed:', message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null;
    const isAnonymous = Boolean(user?.is_anonymous);
    const authStatus = deriveAuthStatus(session, isLoading, Boolean(error));

    return {
      session,
      user,
      authStatus,
      isLoading,
      isAuthenticated: Boolean(user),
      isAnonymous,
      isPermanent: Boolean(user) && !isAnonymous,
      error,
      refreshSession,
      signOut,
    };
  }, [session, isLoading, error, refreshSession, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
