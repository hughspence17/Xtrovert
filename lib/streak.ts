// ============================================================================
// XTROVERT — weekday streak tracker (Step: streak/weekday fix)
//
// public.streak_days (user_id, activity_date) records one row per calendar
// day the user completed their first challenge of the day (written only by
// the SECURITY DEFINER complete_challenge() RPC — never inserted directly by
// clients). This module reads that table to render the Mon-Sun circles,
// entirely independent from profiles.streak_count so the two can never
// silently drift apart.
// ============================================================================
import { supabase } from './supabase';

/** YYYY-MM-DD in the DEVICE's local timezone (never UTC — avoids off-by-one
 * near midnight for users west of UTC). */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Midnight local time on the Monday of the given date's week. */
export function startOfWeekLocal(date: Date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

export function addDaysLocal(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Set of local date-keys (this Mon-Sun week only) the user was active on. */
export async function fetchStreakWeek(userId: string): Promise<Set<string>> {
  try {
    const monday = startOfWeekLocal(new Date());
    const sunday = addDaysLocal(monday, 6);
    const { data, error } = await supabase
      .from('streak_days')
      .select('activity_date')
      .eq('user_id', userId)
      .gte('activity_date', localDateKey(monday))
      .lte('activity_date', localDateKey(sunday));
    if (error) throw error;
    return new Set((data ?? []).map((r) => String((r as Record<string, unknown>).activity_date)));
  } catch (err) {
    console.warn('[streak] fetch week failed:', err instanceof Error ? err.message : err);
    return new Set();
  }
}

export type DayMark = 'done' | 'missed';

/**
 * Maps this Mon-Sun week onto 7 marks. Only days that are BOTH in the past
 * (or today) AND present in `streakWeek` are 'done' — future days in the
 * current week are always 'missed' so the tracker never falsely shows
 * days that haven't happened yet.
 */
export function computeWeekMarks(streakWeek: Set<string>): DayMark[] {
  const monday = startOfWeekLocal(new Date());
  const todayKey = localDateKey(new Date());
  const marks: DayMark[] = [];
  for (let i = 0; i < 7; i += 1) {
    const key = localDateKey(addDaysLocal(monday, i));
    marks.push(key <= todayKey && streakWeek.has(key) ? 'done' : 'missed');
  }
  return marks;
}
