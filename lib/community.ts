// ============================================================================
// XTROVERT — community feed, engagement & moderation (Step 5)
// ============================================================================
import { supabase } from './supabase';
import type { CommunityPostRow, PostReplyRow } from './schema';

/** IDs the current user has blocked — used to filter feeds/messages client-side. */
export async function fetchBlockedIds(userId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId);
    if (error) throw error;
    return new Set((data ?? []).map((r) => String((r as Record<string, unknown>).blocked_id)));
  } catch (err) {
    console.warn('[community] fetch blocked ids failed:', err instanceof Error ? err.message : err);
    return new Set();
  }
}

async function fetchProfilesLite(ids: string[]): Promise<Map<string, { username: string; rank_title: string; bio: string }>> {
  const map = new Map<string, { username: string; rank_title: string; bio: string }>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from('profiles').select('id, username, rank_title, bio').in('id', ids);
  if (error) {
    console.warn('[community] profile lookup failed:', error.message);
    return map;
  }
  (data ?? []).forEach((row) => {
    const r = row as Record<string, unknown>;
    map.set(String(r.id), {
      username: r.username ? String(r.username) : 'operator',
      rank_title: r.rank_title ? String(r.rank_title) : 'Starter',
      bio: r.bio ? String(r.bio) : '',
    });
  });
  return map;
}

/**
 * Community feed, newest first. Posts from blocked authors are filtered out
 * entirely (never fetched into local state). Like/reply counts and the
 * viewer's own like state are computed client-side from the join tables —
 * community_posts itself stores no denormalized counters.
 */
export async function fetchCommunityFeed(userId: string): Promise<CommunityPostRow[]> {
  try {
    const blocked = await fetchBlockedIds(userId);

    const { data: posts, error } = await supabase
      .from('community_posts')
      .select('id, user_id, title, content, journal_entry_id, view_count, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const visible = (posts ?? [])
      .map((r) => r as Record<string, unknown>)
      .filter((r) => !blocked.has(String(r.user_id)));
    if (visible.length === 0) return [];

    const postIds = visible.map((r) => String(r.id));
    const authorIds = Array.from(new Set(visible.map((r) => String(r.user_id))));

    const [profiles, likesRes, repliesRes, myLikesRes] = await Promise.all([
      fetchProfilesLite(authorIds),
      supabase.from('post_likes').select('post_id').in('post_id', postIds),
      supabase.from('post_replies').select('post_id').in('post_id', postIds),
      supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
    ]);

    const likeCounts = new Map<string, number>();
    (likesRes.data ?? []).forEach((row) => {
      const pid = String((row as Record<string, unknown>).post_id);
      likeCounts.set(pid, (likeCounts.get(pid) ?? 0) + 1);
    });

    const replyCounts = new Map<string, number>();
    (repliesRes.data ?? []).forEach((row) => {
      const pid = String((row as Record<string, unknown>).post_id);
      replyCounts.set(pid, (replyCounts.get(pid) ?? 0) + 1);
    });

    const likedByMe = new Set((myLikesRes.data ?? []).map((row) => String((row as Record<string, unknown>).post_id)));

    return visible.map((r) => {
      const authorId = String(r.user_id);
      const profile = profiles.get(authorId) ?? { username: 'operator', rank_title: 'Starter', bio: '' };
      const id = String(r.id);
      return {
        id,
        user_id: authorId,
        title: String(r.title ?? ''),
        content: String(r.content ?? ''),
        journal_entry_id: r.journal_entry_id ? String(r.journal_entry_id) : null,
        view_count: Number.isFinite(Number(r.view_count)) ? Number(r.view_count) : 0,
        like_count: likeCounts.get(id) ?? 0,
        reply_count: replyCounts.get(id) ?? 0,
        created_at: String(r.created_at ?? ''),
        author_username: profile.username,
        author_rank: profile.rank_title,
        author_bio: profile.bio,
        liked_by_me: likedByMe.has(id),
      };
    });
  } catch (err) {
    console.warn('[community] fetch feed failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Toggle the current user's like on a post (insert if absent, delete if present). */
export async function togglePostLike(postId: string, userId: string): Promise<void> {
  try {
    const { data, error: selErr } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    if (selErr) throw selErr;

    if (data) {
      const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
      if (error) throw error;
    }
  } catch (err) {
    console.warn('[community] toggle like failed:', err instanceof Error ? err.message : err);
  }
}

/** Replies to a post, oldest first, with the author's username joined. */
export async function fetchReplies(postId: string): Promise<PostReplyRow[]> {
  try {
    const { data, error } = await supabase
      .from('post_replies')
      .select('id, post_id, user_id, content, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const rows = (data ?? []).map((r) => r as Record<string, unknown>);
    const authorIds = Array.from(new Set(rows.map((r) => String(r.user_id))));
    const profiles = await fetchProfilesLite(authorIds);

    return rows.map((r) => ({
      id: String(r.id),
      post_id: String(r.post_id),
      user_id: String(r.user_id),
      content: String(r.content ?? ''),
      created_at: String(r.created_at ?? ''),
      author_username: profiles.get(String(r.user_id))?.username ?? 'operator',
    }));
  } catch (err) {
    console.warn('[community] fetch replies failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function addReply(postId: string, userId: string, content: string): Promise<boolean> {
  try {
    const trimmed = content.trim();
    if (trimmed.length === 0) return false;
    const { error } = await supabase.from('post_replies').insert({ post_id: postId, user_id: userId, content: trimmed });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[community] add reply failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Dedupe-per-viewer view increment via the increment_post_view() RPC. */
export async function incrementPostView(postId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('increment_post_view', { p_post_id: postId });
    if (error) throw error;
    return typeof data === 'number' ? data : null;
  } catch (err) {
    console.warn('[community] increment view failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function reportContent(params: {
  reporterId: string;
  reportedUserId: string;
  postId: string;
  reason: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase.from('content_reports').insert({
      reporter_id: params.reporterId,
      reported_user_id: params.reportedUserId,
      post_id: params.postId,
      reason: params.reason,
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[community] report failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function blockUser(userId: string, blockedId: string): Promise<void> {
  try {
    const { error } = await supabase.from('blocked_users').insert({ blocker_id: userId, blocked_id: blockedId });
    if (error) throw error;
  } catch (err) {
    console.warn('[community] block failed:', err instanceof Error ? err.message : err);
  }
}

/** Free-standing community post, not linked to any journal entry. */
export async function createStandalonePost(userId: string, title: string, content: string): Promise<boolean> {
  try {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (trimmedTitle.length === 0 || trimmedContent.length === 0) return false;
    const { error } = await supabase
      .from('community_posts')
      .insert({ user_id: userId, title: trimmedTitle, content: trimmedContent, journal_entry_id: null });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[community] create post failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
