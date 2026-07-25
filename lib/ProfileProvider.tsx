import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';

export type ProfileRecord = {
  username: string;
  bio: string;
  rank_title: string;
  social_score: number;
  streak_count: number;
  last_username_change_at: string | null;
  last_bio_change_at: string | null;
};

export type ProfileEditResult = { ok: boolean; error?: string };

type ProfileContextValue = {
  /** Raw profile record, or null while loading / on error. */
  profile: ProfileRecord | null;
  /** True until the initial daily-login RPC + fetch resolves. */
  isLoading: boolean;
  /** Manual re-fetch (does not re-trigger the once-per-session daily login). */
  refreshProfile: () => Promise<void>;
  /**
   * Instantly patch the in-memory profile without a network round-trip.
   * Used after an atomic RPC (e.g. complete_challenge) returns fresh
   * streak / social_score / rank_title so the UI updates immediately.
   */
  applyProfile: (patch: Partial<ProfileRecord>) => void;
  /**
   * Server-validated username change (length/charset/uniqueness/cooldown).
   * A no-op resubmission of the current value never touches the database.
   */
  updateUsername: (next: string) => Promise<ProfileEditResult>;
  /** Server-validated bio change (length/cooldown), same no-op guarantee. */
  updateBio: (next: string) => Promise<ProfileEditResult>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function normalizeProfileRow(row: Record<string, unknown> | null): ProfileRecord | null {
  if (!row) {
    return null;
  }
  return {
    username: String(row.username ?? ''),
    bio: String(row.bio ?? ''),
    rank_title: String(row.rank_title ?? 'Starter'),
    social_score: Number.isFinite(Number(row.social_score)) ? Number(row.social_score) : 0,
    streak_count: Number.isFinite(Number(row.streak_count)) ? Number(row.streak_count) : 0,
    last_username_change_at: row.last_username_change_at ? String(row.last_username_change_at) : null,
    last_bio_change_at: row.last_bio_change_at ? String(row.last_bio_change_at) : null,
  };
}

// The `profiles` table only grants direct column access to the public-safe
// fields (id, username, rank_title) — anyone's bio/score/streak (including
// your own) is intentionally unreadable via a raw select. get_my_profile()
// is a SECURITY DEFINER RPC that returns the full record for ONLY the
// caller's own row (auth.uid()), so this is the sole path back to it.
async function fetchProfileRow(): Promise<ProfileRecord | null> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) {
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return normalizeProfileRow((row as Record<string, unknown> | undefined) ?? null);
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Tracks the user id we already ran the daily-login RPC for, so re-renders
  // (or provider re-mounts within the same session) never spam the backend.
  const dailyLoginRanForUser = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    setIsLoading(true);
    try {
      if (dailyLoginRanForUser.current !== userId) {
        dailyLoginRanForUser.current = userId;

        const { data: rpcData, error: rpcError } = await supabase.rpc('register_daily_login');
        if (rpcError) {
          // Network / RPC failure: fall back to a plain fetch, keep UI alive.
          console.warn('[Profile] register_daily_login failed:', rpcError.message);
        } else {
          const fromRpc = normalizeProfileRow(rpcData as Record<string, unknown>);
          if (fromRpc) {
            setProfile(fromRpc);
            console.log('[Profile] daily login registered', {
              userId,
              streak_count: fromRpc.streak_count,
              social_score: fromRpc.social_score,
              rank_title: fromRpc.rank_title,
            });
            return;
          }
        }
      }

      const fresh = await fetchProfileRow();
      setProfile(fresh);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      // Silent: log only, retain last known/fallback state — never crash UI.
      console.warn('[Profile] load failed:', message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated || !user?.id) {
      dailyLoginRanForUser.current = null;
      setProfile(null);
      setIsLoading(false);
      return;
    }

    loadProfile(user.id);
  }, [authLoading, isAuthenticated, user?.id, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    try {
      const fresh = await fetchProfileRow();
      setProfile(fresh);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh profile';
      console.warn('[Profile] refresh failed:', message);
    }
  }, [user?.id]);

  const applyProfile = useCallback((patch: Partial<ProfileRecord>) => {
    setProfile((prev) => {
      const base: ProfileRecord = prev ?? {
        username: '',
        bio: '',
        rank_title: 'Starter',
        social_score: 0,
        streak_count: 0,
        last_username_change_at: null,
        last_bio_change_at: null,
      };
      return { ...base, ...patch };
    });
  }, []);

  // Both RPCs are server-validated (length/charset/uniqueness/cooldown) and
  // silently no-op server-side if the value is unchanged — the client never
  // decides whether a write happens, it only surfaces the result.
  const updateUsername = useCallback(async (next: string): Promise<ProfileEditResult> => {
    const { data, error } = await supabase.rpc('update_username', { p_new_username: next });
    if (error) {
      return { ok: false, error: error.message };
    }
    const row = normalizeProfileRow((Array.isArray(data) ? data[0] : data) as Record<string, unknown>);
    if (row) applyProfile(row);
    return { ok: true };
  }, [applyProfile]);

  const updateBio = useCallback(async (next: string): Promise<ProfileEditResult> => {
    const { data, error } = await supabase.rpc('update_bio', { p_new_bio: next });
    if (error) {
      return { ok: false, error: error.message };
    }
    const row = normalizeProfileRow((Array.isArray(data) ? data[0] : data) as Record<string, unknown>);
    if (row) applyProfile(row);
    return { ok: true };
  }, [applyProfile]);

  const value = useMemo<ProfileContextValue>(
    () => ({ profile, isLoading, refreshProfile, applyProfile, updateUsername, updateBio }),
    [profile, isLoading, refreshProfile, applyProfile, updateUsername, updateBio],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used inside ProfileProvider');
  }
  return ctx;
}
