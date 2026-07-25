// ============================================================================
// XTROVERT — 1:1 + group messaging, realtime (Step 6 + group chat extension)
// ============================================================================
import { supabase } from './supabase';
import type { ConversationMemberLite, ConversationSummary, MessageRow } from './schema';

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Find (or lazily create) the 1:1 conversation with another user. */
export async function findOrCreateConversation(otherUserId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('find_or_create_direct_conversation', {
      p_other_user: otherUserId,
    });
    if (error) throw error;
    return data ? String(data) : null;
  } catch (err) {
    console.warn('[messaging] find/create convo failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Create a new group conversation with the given members (the caller is
 * added automatically server-side). Server-validated: 1-19 other members,
 * all must be real profiles. Returns the new conversation id, or null.
 */
export async function createGroupConversation(
  memberIds: string[],
  title?: string,
): Promise<{ ok: boolean; conversationId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('create_group_conversation', {
      p_member_ids: memberIds,
      p_title: title && title.trim().length > 0 ? title.trim() : null,
    });
    if (error) throw error;
    return { ok: true, conversationId: data ? String(data) : undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create group chat';
    console.warn('[messaging] create group failed:', message);
    return { ok: false, error: message };
  }
}

/**
 * Candidate users the current viewer is *allowed* to see (per the profiles
 * RLS policy: self, or anyone who has posted/replied in the community, or
 * anyone already sharing a conversation) — i.e. exactly who can be added to
 * a new group chat. Deliberately never enumerates silent/inactive users.
 */
export async function fetchKnownUsers(
  userId: string,
  blockedIds: Set<string> = new Set(),
): Promise<ConversationMemberLite[]> {
  try {
    const [posts, replies, convoMembers] = await Promise.all([
      supabase.from('community_posts').select('user_id').neq('user_id', userId),
      supabase.from('post_replies').select('user_id').neq('user_id', userId),
      supabase.from('conversation_members').select('conversation_id').eq('user_id', userId),
    ]);

    const ids = new Set<string>();
    (posts.data ?? []).forEach((r) => ids.add(String((r as Record<string, unknown>).user_id)));
    (replies.data ?? []).forEach((r) => ids.add(String((r as Record<string, unknown>).user_id)));

    const myConvoIds = (convoMembers.data ?? []).map((r) => String((r as Record<string, unknown>).conversation_id));
    if (myConvoIds.length > 0) {
      const { data: others } = await supabase
        .from('conversation_members')
        .select('user_id')
        .in('conversation_id', myConvoIds)
        .neq('user_id', userId);
      (others ?? []).forEach((r) => ids.add(String((r as Record<string, unknown>).user_id)));
    }

    blockedIds.forEach((id) => ids.delete(id));
    ids.delete(userId);
    if (ids.size === 0) return [];

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, username, rank_title')
      .in('id', Array.from(ids));
    if (error) throw error;

    return (profiles ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        username: r.username ? String(r.username) : 'operator',
        rank_title: r.rank_title ? String(r.rank_title) : null,
      };
    });
  } catch (err) {
    console.warn('[messaging] known users failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Conversation summaries for the current user — works for both 1:1 chats
 * and group chats. Conversations containing a blocked member are omitted
 * for 1:1 (the whole point of blocking); for groups, blocked members are
 * simply excluded from the displayed member list.
 */
export async function fetchConversations(
  userId: string,
  blockedIds: Set<string> = new Set(),
): Promise<ConversationSummary[]> {
  try {
    const { data: mine, error: mineErr } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', userId);
    if (mineErr) throw mineErr;

    const convoIds = (mine ?? []).map((r) => String((r as Record<string, unknown>).conversation_id));
    if (convoIds.length === 0) return [];

    const { data: convos, error: convosErr } = await supabase
      .from('conversations')
      .select('id, is_group, title')
      .in('id', convoIds);
    if (convosErr) throw convosErr;

    const { data: others, error: othersErr } = await supabase
      .from('conversation_members')
      .select('conversation_id, user_id, profiles(username, rank_title)')
      .in('conversation_id', convoIds)
      .neq('user_id', userId);
    if (othersErr) throw othersErr;

    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', convoIds)
      .order('created_at', { ascending: false });

    const lastByConvo = new Map<string, { content: string; created_at: string }>();
    (msgs ?? []).forEach((m) => {
      const r = m as Record<string, unknown>;
      const cid = String(r.conversation_id);
      if (!lastByConvo.has(cid)) {
        lastByConvo.set(cid, { content: String(r.content ?? ''), created_at: String(r.created_at ?? '') });
      }
    });

    const membersByConvo = new Map<string, ConversationMemberLite[]>();
    (others ?? []).forEach((row) => {
      const r = row as Record<string, unknown>;
      const otherId = String(r.user_id);
      if (blockedIds.has(otherId)) return;
      const profile = firstOf(r.profiles as Record<string, unknown> | Record<string, unknown>[]);
      const cid = String(r.conversation_id);
      const list = membersByConvo.get(cid) ?? [];
      list.push({
        id: otherId,
        username: profile?.username ? String(profile.username) : 'operator',
        rank_title: profile?.rank_title ? String(profile.rank_title) : null,
      });
      membersByConvo.set(cid, list);
    });

    const convoMetaById = new Map<string, { is_group: boolean; title: string | null }>();
    (convos ?? []).forEach((row) => {
      const r = row as Record<string, unknown>;
      convoMetaById.set(String(r.id), {
        is_group: Boolean(r.is_group),
        title: r.title ? String(r.title) : null,
      });
    });

    const summaries: ConversationSummary[] = [];
    membersByConvo.forEach((members, cid) => {
      if (members.length === 0) return; // 1:1 whose only other member is blocked
      const meta = convoMetaById.get(cid) ?? { is_group: false, title: null };
      const last = lastByConvo.get(cid);
      const primary = members[0];
      summaries.push({
        id: cid,
        is_group: meta.is_group,
        title: meta.title,
        members,
        other_user_id: primary.id,
        other_username: primary.username,
        other_rank: primary.rank_title,
        last_message: last?.content ?? null,
        last_message_at: last?.created_at ?? null,
      });
    });

    summaries.sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
    return summaries;
  } catch (err) {
    console.warn('[messaging] conversations failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchMessages(
  conversationId: string,
  blockedIds: Set<string> = new Set(),
): Promise<MessageRow[]> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? [])
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          conversation_id: String(r.conversation_id),
          sender_id: String(r.sender_id),
          content: String(r.content ?? ''),
          created_at: String(r.created_at ?? ''),
        };
      })
      .filter((m) => !blockedIds.has(m.sender_id));
  } catch (err) {
    console.warn('[messaging] fetch messages failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: senderId, content: content.trim() });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[messaging] send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Realtime subscription to new messages in a conversation. Returns an
 * unsubscribe function. Safe no-op cleanup if the channel never connects.
 */
export function subscribeToMessages(
  conversationId: string,
  onInsert: (message: MessageRow) => void,
): () => void {
  try {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          onInsert({
            id: String(r.id),
            conversation_id: String(r.conversation_id),
            sender_id: String(r.sender_id),
            content: String(r.content ?? ''),
            created_at: String(r.created_at ?? ''),
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('[messaging] subscribe failed:', err instanceof Error ? err.message : err);
    return () => {};
  }
}
