// ============================================================================
// XTROVERT — daily quote (Supabase-backed, read-only for clients)
//
// public.daily_quotes has no client INSERT/UPDATE/DELETE grants at all — the
// list is curated server-side only. get_daily_quote() is a SECURITY DEFINER
// RPC that deterministically rotates through active quotes by calendar date
// (same quote for every user, all day), so there is nothing for a hacker to
// tamper with on this feature short of owning the database itself.
// ============================================================================
import { supabase } from './supabase';

export type DailyQuote = {
  text: string;
  author: string;
};

export async function fetchDailyQuote(): Promise<DailyQuote | null> {
  try {
    const { data, error } = await supabase.rpc('get_daily_quote');
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      text: String(row.quote_text ?? ''),
      author: String(row.author ?? ''),
    };
  } catch (err) {
    console.warn('[quotes] fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
