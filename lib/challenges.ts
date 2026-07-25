// ============================================================================
// XTROVERT — challenge fetch + atomic completion (Steps 1-3)
// ============================================================================
import { supabase } from './supabase';
import { localDateKey } from './streak';
import type { ChallengeRow } from './schema';

const CHALLENGE_COLUMNS = 'id, title, description, required_rank, xp_reward, difficulty';

/**
 * Next active challenge for the user's current rank that they have NOT
 * already completed today (checked against user_completed_challenges,
 * joined via a date filter). Powers both the initial home-screen card and
 * "Load Next Challenge".
 */
export async function fetchNextChallenge(userId: string, rankTitle: string | null): Promise<ChallengeRow | null> {
  if (!rankTitle) {
    return null;
  }
  try {
    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);

    const { data: completedToday, error: completedErr } = await supabase
      .from('user_completed_challenges')
      .select('challenge_id')
      .eq('user_id', userId)
      .gte('completed_at', startOfDayUtc.toISOString());
    if (completedErr) throw completedErr;

    const excludeIds = (completedToday ?? []).map((r) => String((r as Record<string, unknown>).challenge_id));

    let query = supabase
      .from('challenges')
      .select(CHALLENGE_COLUMNS)
      .eq('is_active', true)
      .eq('required_rank', rankTitle);
    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await query.limit(25);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return null;

    const pick = rows[Math.floor(Math.random() * rows.length)] as Record<string, unknown>;
    return {
      id: String(pick.id),
      title: String(pick.title ?? ''),
      description: String(pick.description ?? ''),
      required_rank: pick.required_rank ? String(pick.required_rank) : null,
      xp_reward: Number.isFinite(Number(pick.xp_reward)) ? Number(pick.xp_reward) : 0,
      difficulty: pick.difficulty ? String(pick.difficulty) : null,
    };
  } catch (err) {
    console.warn('[challenges] fetch next failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function fetchCompletedChallengeCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('user_completed_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.warn('[challenges] fetch completed count failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}

export type CompleteChallengeResult = {
  ok: boolean;
  xp_awarded?: number;
  streak_count?: number;
  social_score?: number;
  rank_title?: string;
  error?: string;
};

/**
 * Atomic, server-side completion: inserts the completion row, writes the
 * journal entry, optionally broadcasts to the community feed, and updates
 * social_score / streak_count (only incrementing the streak on the FIRST
 * completion of the local calendar day) — all inside complete_challenge(),
 * a single SECURITY DEFINER transaction keyed off auth.uid(). The client
 * never computes or sends xp/streak values itself.
 */
export async function completeChallenge(params: {
  challengeId: string;
  journalText: string;
  broadcast: boolean;
  postTitle?: string;
  journalTitle?: string;
}): Promise<CompleteChallengeResult> {
  try {
    const { data, error } = await supabase.rpc('complete_challenge', {
      p_challenge_id: params.challengeId,
      p_journal_text: params.journalText,
      p_broadcast: params.broadcast,
      p_post_title: params.postTitle ?? null,
      p_local_date: localDateKey(),
      p_journal_title: params.journalTitle ?? null,
    });
    if (error) throw error;
    const result = data as Record<string, unknown>;
    return {
      ok: true,
      xp_awarded: Number(result.xp_awarded ?? 0),
      streak_count: Number(result.streak_count ?? 0),
      social_score: Number(result.social_score ?? 0),
      rank_title: result.rank_title ? String(result.rank_title) : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not complete challenge';
    console.warn('[challenges] complete failed:', message);
    return { ok: false, error: message };
  }
}
