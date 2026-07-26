// ============================================================================
// XTROVERT — production data contract (single source of truth for DB shapes)
//
// Every table/column the app reads or writes is declared here so a schema
// reconciliation only ever happens in ONE file. If your Master DDL used a
// different column name, change it here (and in supabase/integration.sql for
// the RPCs) and the whole app follows.
//
// These types describe the SELECTed shape the client expects — not the full
// table. Reads are defensively coded in the lib/* modules: a missing column
// or RLS block degrades to empty/placeholder state, never a crash.
// ============================================================================

/** public.challenges */
export type ChallengeRow = {
  id: string;
  title: string;
  description: string;
  required_rank: string | null;
  xp_reward: number;
  difficulty: string | null;
};

/** public.journal_entries (joined with challenge title when available) */
export type JournalEntryRow = {
  id: string;
  challenge_id: string | null;
  content: string;
  title: string | null;
  created_at: string;
  challenge_title: string | null;
};

/** public.community_posts joined with author profile */
export type CommunityPostRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tag: PostTag | null;
  journal_entry_id: string | null;
  view_count: number;
  like_count: number;
  reply_count: number;
  created_at: string;
  author_username: string;
  author_rank: string;
  author_bio: string;
  liked_by_me: boolean;
};

// ---- community post tags ----------------------------------------------------
// Fixed set enforced server-side by a CHECK constraint on community_posts.tag
// — the client list below is for UI convenience only; a hacker sending an
// arbitrary tag value via a raw API call is rejected by the database itself,
// not by this list.
export const POST_TAGS = [
  'Success Stories',
  'Struggling',
  'Motivation',
  'Advice',
  'Question',
  'Milestone',
  'Accountability',
  'Mental Health',
] as const;

export type PostTag = (typeof POST_TAGS)[number];

/** public.post_replies joined with author profile */
export type PostReplyRow = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_username: string;
};

/** A single other participant, used for both 1:1 and group conversations. */
export type ConversationMemberLite = {
  id: string;
  username: string;
  rank_title: string | null;
};

/** public.conversations summary (for the messages list). Covers both 1:1
 * chats (is_group = false, exactly one entry in `members`) and group chats
 * (is_group = true, title optional, 1+ entries in `members`). */
export type ConversationSummary = {
  id: string;
  is_group: boolean;
  title: string | null;
  members: ConversationMemberLite[];
  /** Convenience accessors mirroring the old 1:1-only shape. */
  other_user_id: string;
  other_username: string;
  other_rank: string | null;
  last_message: string | null;
  last_message_at: string | null;
};

/** public.messages */
export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

/** A minimal author identity used across community + messaging. */
export type AuthorLite = {
  id: string;
  username: string;
  rank_title: string;
};

// ---- report reasons (Step 5.4a) --------------------------------------------
export const REPORT_REASONS = [
  'Harassment or bullying',
  'Spam or misleading',
  'Hate speech',
  'Violence or threats',
  'Sexual or inappropriate content',
  'Other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
