// ============================================================================
// XTROVERT — private journal feed (Step 4)
// ============================================================================
import { supabase } from './supabase';
import type { JournalEntryRow } from './schema';

function mapRow(row: Record<string, unknown>): JournalEntryRow {
  const challenge = row.challenges as { title?: string } | null | undefined;
  return {
    id: String(row.id),
    challenge_id: row.challenge_id ? String(row.challenge_id) : null,
    content: String(row.content ?? ''),
    title: row.title ? String(row.title) : null,
    created_at: String(row.created_at ?? ''),
    challenge_title: challenge?.title ? String(challenge.title) : null,
  };
}

/**
 * Private journal entries for the current user, newest first. Attempts a join
 * to the linked challenge title; falls back to a plain select if the embedded
 * relationship is unavailable so the feed always renders.
 */
export async function fetchJournalEntries(userId: string): Promise<JournalEntryRow[]> {
  try {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, challenge_id, content, title, created_at, challenges(title)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
  } catch (err) {
    console.warn('[journal] join fetch failed, retrying flat:', err instanceof Error ? err.message : err);
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('id, challenge_id, content, title, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
    } catch (err2) {
      console.warn('[journal] flat fetch failed:', err2 instanceof Error ? err2.message : err2);
      return [];
    }
  }
}

export type AddJournalEntryResult = {
  ok: boolean;
  entry?: JournalEntryRow;
  error?: string;
};

/**
 * Free-form private journal entry — no challenge required. Routed through
 * the add_journal_entry() RPC; journal_entries itself grants zero direct
 * client writes, so this server-side validated function is the only path.
 * `title` is optional and server-trimmed/length-capped regardless of what
 * the client sends.
 */
export async function addJournalEntry(content: string, title?: string): Promise<AddJournalEntryResult> {
  const { data, error } = await supabase.rpc('add_journal_entry', {
    p_content: content,
    p_title: title && title.trim().length > 0 ? title.trim() : null,
  });
  if (error) {
    console.warn('[journal] add entry failed:', error.message);
    return { ok: false, error: error.message || 'Could not save entry' };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) {
    return { ok: false, error: 'Could not save entry' };
  }
  return { ok: true, entry: mapRow(row) };
}
