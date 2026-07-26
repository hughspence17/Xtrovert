// ============================================================================
// XTROVERT — TACTICAL SOCIAL EXPOSURE MVP
// Single-file architecture: tokens, state engine, navigation, screens, modals.
// Expo SDK 57 / React Native 0.86 / React Navigation 7
// ============================================================================

import {
    createBottomTabNavigator,
    type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
} from '@expo-google-fonts/dm-sans';
import { StatusBar } from 'expo-status-bar';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Easing,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
    type PressableProps,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Reanimated, {
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import {
    SafeAreaProvider,
    useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './lib/AuthProvider';
import { ProfileProvider, useProfile } from './lib/ProfileProvider';
import {
  fetchNextChallenge,
  completeChallenge,
  fetchCompletedChallengeCount,
} from './lib/challenges';
import { fetchJournalEntries, addJournalEntry } from './lib/journal';
import { fetchDailyQuote } from './lib/quotes';
import { fetchStreakWeek, computeWeekMarks } from './lib/streak';
import {
  fetchCommunityFeed,
  togglePostLike,
  fetchReplies,
  addReply as addReplyDb,
  incrementPostView,
  reportContent,
  blockUser,
  fetchBlockedIds,
  createStandalonePost,
} from './lib/community';
import {
  findOrCreateConversation,
  createGroupConversation,
  fetchKnownUsers,
  fetchConversations,
  fetchMessages,
  sendMessage,
  subscribeToMessages,
} from './lib/messaging';
import type {
  ChallengeRow,
  CommunityPostRow,
  PostReplyRow,
  ConversationSummary,
  ConversationMemberLite,
  MessageRow,
} from './lib/schema';
import { REPORT_REASONS, POST_TAGS } from './lib/schema';
import type { PostTag } from './lib/schema';

// ============================================================================
// SECTION 1 — DESIGN TOKENS ("TACTICAL GREEN" SYSTEM)
// Deep obsidian canvas, dark tactical moss surfaces, brushed slate green
// elevations, and electric neon green accents with soft ambient glows.
// ============================================================================

const COLORS = {
  // Deep obsidian — near-black with a subtle cool moss tint.
  canvas: '#0B0E0D',
  // Solid fill behind the fixed top header so scrolled content cleanly
  // disappears beneath it without ever bleeding through.
  headerBg: '#0B0E0D',
  // Dark brushed tactical slate — standard surface containers.
  surface: '#131A16',
  // Card / modal body fill — dark brushed tactical slate.
  elevated: '#131A16',
  // Subtle 1px solid structural border around all cards.
  border: '#1E2C24',
  // Dimmer hairline for internal dividers and quiet outlines.
  divider: 'rgba(142, 175, 157, 0.16)',
  // Primary accent — high-voltage neon green for the logo 'X', active
  // buttons, progress fills, active streak days, and outer glows.
  neon: '#00FF66',
  // Secondary accent — deep emerald for secondary buttons and pressed fills.
  emerald: '#10B981',
  // Ambient glow used for box-shadows around active elements.
  glow: 'rgba(0, 255, 102, 0.22)',
  // Crisp, bold off-white primary typography.
  body: '#F3F4F6',
  // Sage green for subtitles, fractions, and descriptions.
  muted: '#8EAF9D',
  disabled: '#1E2A22',
  // Dark ink used on top of neon-filled buttons.
  onNeon: '#04150C',
};

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
// San Francisco (SF Pro) system stack for regular text/body copy, with a
// clean native sans-serif fallback on Android so it never crashes.
const SANS = Platform.select({
  ios: 'SF Pro Text',
  android: 'sans-serif',
  default: 'System',
});
// SF Pro Display for large hero numbers and major headers (bold, tight
// letter-spacing), falling back to the native condensed sans on Android.
const DISPLAY = Platform.select({
  ios: 'SF Pro Display',
  android: 'sans-serif-medium',
  default: 'System',
});

// DM Sans family names (loaded at runtime in the App root via useFonts).
// Applied to the Phase 2 dynamic profile text nodes per the typography spec.
const DM_SANS = 'DMSans_400Regular';
const DM_SANS_SEMI = 'DMSans_600SemiBold';
const DM_SANS_BOLD = 'DMSans_700Bold';
const DM_SANS_HEAVY = 'DMSans_800ExtraBold';

// Height of the fixed header's brand row (XTROVERT wordmark + status pills).
const HEADER_BRAND_HEIGHT = 56;

// Height of the Live Activity ticker row rendered inside the fixed header,
// directly below the brand row. Every screen pads its scrollable content by
// insets.top + HEADER_BRAND_HEIGHT + this amount so the header never
// overlaps or blocks core UI elements.
const LIVE_TICKER_HEIGHT = 30;

// Flat Social Score reward applied whenever a user replies to someone else's
// community post (community support now feeds the single Social Score metric).
const REPLY_SCORE_REWARD = 10;

// Flat reward applied to a user's Social Score for every verified quest
// submission. Bound to both the award logic and the challenge XP label so
// the two can never drift out of sync.
const SOCIAL_SCORE_REWARD = 50;

// Mirrors public.ranks.xp_required — the Social Growth progress bar/fraction
// on Home and Progress reads the *next* rank's threshold from this map
// (never a fixed ceiling), so it stays meaningful at every rank instead of
// flatlining once social_score exceeds an arbitrary constant.
const RANK_XP_REQUIRED: Record<string, number> = {
  Starter: 0,
  Bronze: 100,
  Silver: 500,
  Gold: 1500,
  Platinum: 4000,
};

// Page size used for the Journal archive's infinite scroll — both the
// initial page and every subsequent `onEndReached` load.
const JOURNAL_PAGE_SIZE = 2;

// Simulated network latency for loading the next page of the Journal
// archive, purely so the infinite-scroll footer spinner is perceptible.
const JOURNAL_LOAD_DELAY_MS = 350;

// Fires a light, subtle haptic tap. Swallows errors on platforms/devices
// without haptic support (e.g. web) so it never crashes a press handler.
function triggerHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// ============================================================================
// TYPES
// ============================================================================

// The active challenge surfaced on Home, sourced from public.challenges.
interface ActiveChallenge {
  id: string;
  title: string;
  instructions: string;
  requiredRank: string | null;
  xpReward: number;
  difficulty: string;
}

// A community post joined with its author identity (public.community_posts +
// public.profiles) plus live engagement counters.
interface CommunityPost {
  id: string;
  userId: string;
  authorUsername: string;
  authorRank: string;
  authorBio: string;
  title: string;
  body: string;
  tag: PostTag | null;
  createdAt: string;
  viewCount: number;
  likeCount: number;
  replyCount: number;
  liked: boolean;
  journalEntryId: string | null;
}

// A private journal entry (public.journal_entries) for the Home journal feed.
interface JournalItem {
  id: string;
  title: string | null;
  challengeTitle: string | null;
  content: string;
  createdAt: string;
}

interface DailyQuote {
  text: string;
  author: string;
}

interface AppContextShape {
  // Challenge flow (Steps 1-3)
  activeChallenge: ActiveChallenge | null;
  challengeLoading: boolean;
  challengeCompleted: boolean;
  lastAwardedXp: number;
  submitChallenge: (
    text: string,
    broadcast: boolean,
    postTitle: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  loadNextChallenge: () => Promise<void>;
  resetCompletedFlag: () => void;
  // Personal journal (Step 4)
  journalEntries: JournalItem[];
  journalLoading: boolean;
  refreshJournal: () => Promise<void>;
  addPersonalJournalEntry: (content: string, title?: string) => Promise<{ ok: boolean; error?: string }>;
  // Community + moderation (Step 5)
  communityFeed: CommunityPost[];
  feedLoading: boolean;
  refreshFeed: () => Promise<void>;
  likePost: (postId: string) => Promise<void>;
  reportPost: (postId: string, reportedUserId: string, reason: string) => Promise<boolean>;
  blockAuthor: (blockedId: string) => Promise<void>;
  registerView: (postId: string) => Promise<void>;
  createPost: (title: string, body: string, tag: PostTag | null) => Promise<{ ok: boolean; error?: string }>;
  setReplyCount: (postId: string, count: number) => void;
  // Progress (Step 6)
  completedCount: number;
  dailyQuote: DailyQuote | null;
  dailyQuoteLoading: boolean;
  // Weekly streak tracker (real per-day history, not a synthetic guess)
  streakWeek: Set<string>;
}

// ============================================================================
// SECTION 2 — INITIAL SEED MOCK DATA
// ============================================================================

// Quest / feed / journal content now comes live from Supabase (public.challenges,
// public.community_posts, public.journal_entries). Only presentational pools
// (ticker, quotes, growth-stage titles) remain seeded below.

// Clean single-bullet format: "[Username] completed a task • [Username] completed a task".
// No "[system log]" labels, no doubled bullet/space artifacts.
const TICKER_ITEMS: string[] = [
  '@Alex_Grit completed a task',
  '@Marcus_V cleared Level 4',
  '@David_Grit reached a 21 day streak',
  '@Sam_Forge cleared Level 6',
  '@Rob_Ironside logged a new exposure rep',
];

// The Home screen's Daily Quote card now reads live from Supabase
// (public.daily_quotes via the get_daily_quote() RPC) — see lib/quotes.ts.
// The table has zero client write grants, so there is no path for a user
// to inject or alter quotes; it rotates automatically, one per calendar
// day, computed server-side.

// Ordered growth-stage titles. The user's level indexes into this list so the
// Home screen's stage subtitle is derived dynamically from live state.
const STAGE_TITLES: string[] = [
  'The Seed',
  'The Sprout',
  'The Seedling',
  'The Sapling',
  'The Young Tree',
  'The Rooted Oak',
  'The Tall Pine',
  'The Old Growth',
  'The Redwood',
  'The Ancient Grove',
];

function getStageTitle(level: number): string {
  const index = Math.max(0, Math.min(level, STAGE_TITLES.length - 1));
  return STAGE_TITLES[index];
}

// Ordered rank progression (mirrors public.ranks). Used to derive a numeric
// "growth stage" and a difficulty label from a rank title.
const RANK_ORDER = ['Starter', 'Bronze', 'Silver', 'Gold', 'Platinum'];

function rankStage(rankTitle: string | null | undefined): number {
  const idx = RANK_ORDER.indexOf(rankTitle ?? 'Starter');
  return (idx < 0 ? 0 : idx) + 1;
}

// Progress toward the *next* rank's XP threshold — replaces a flat /1000
// ceiling that made the bar/fraction stop meaning anything above Bronze.
// At max rank (Platinum) there's no "next" target, so the ring reports full
// and the fraction shows total score with no denominator.
function computeRankProgress(
  rankTitle: string | null | undefined,
  socialScore: number,
): { ratio: number; target: number | null } {
  const idx = RANK_ORDER.indexOf(rankTitle ?? 'Starter');
  const safeIdx = idx < 0 ? 0 : idx;
  const nextRank = RANK_ORDER[safeIdx + 1];
  if (!nextRank) {
    return { ratio: 1, target: null };
  }
  const nextThreshold = RANK_XP_REQUIRED[nextRank] ?? Math.max(socialScore, 1);
  const ratio = nextThreshold > 0 ? Math.min(Math.max(socialScore / nextThreshold, 0), 1) : 1;
  return { ratio, target: nextThreshold };
}

const RANK_DIFFICULTY: Record<string, string> = {
  Starter: 'Easy',
  Bronze: 'Easy',
  Silver: 'Medium',
  Gold: 'Hard',
  Platinum: 'Elite',
};

// Difficulty label for a challenge: prefer its own difficulty column, else
// derive from the rank it requires so the pill always shows real data.
function difficultyForChallenge(difficulty: string | null, requiredRank: string | null): string {
  if (difficulty && difficulty.trim().length > 0) return difficulty;
  if (requiredRank && RANK_DIFFICULTY[requiredRank]) return RANK_DIFFICULTY[requiredRank];
  return 'Medium';
}

// Weekly completion marks for the Day Streak tracker now come from real
// per-day activity history (public.streak_days), not a synthetic guess —
// see computeWeekMarks() in lib/streak.ts. This correctly renders gaps
// (e.g. Mon + Wed but not Tue) instead of always drawing a contiguous
// block ending today.

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ============================================================================
// SECTION 3 — APPLICATION STATE ENGINE (LOCAL MEMORY STORE)
// ============================================================================

const AppContext = createContext<AppContextShape | null>(null);

function useAppContext(): AppContextShape {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used inside AppProvider');
  }
  return ctx;
}

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

function formatDateStamp(d: Date): string {
  const day = d.getDate().toString().padStart(2, '0');
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Calendar-day key (YYYY-MM-DD) used strictly for streak gating so multiple
// challenge completions in the same day cannot inflate the streak counter.
function getDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapChallenge(row: ChallengeRow): ActiveChallenge {
  return {
    id: String(row.id),
    title: String(row.title ?? 'CHALLENGE'),
    instructions: String(row.description ?? ''),
    requiredRank: row.required_rank ?? null,
    xpReward: Number.isFinite(Number(row.xp_reward)) ? Number(row.xp_reward) : 0,
    difficulty: difficultyForChallenge(row.difficulty, row.required_rank),
  };
}

// Usernames are display labels (not identifiers — auth.uid()/profiles.id are
// the only real identity, joined on everywhere), shown bare with no leading
// '@'. Kept as a named helper (rather than inlining `String(x)` everywhere)
// so the single "how do we render a username" decision lives in one place,
// and so any stray legacy '@'-prefixed value is normalized away.
function withAt(username: string): string {
  return username.replace(/^@+/, '');
}

function mapCommunityPost(row: CommunityPostRow): CommunityPost {
  return {
    id: row.id,
    userId: row.user_id,
    authorUsername: withAt(row.author_username),
    authorRank: row.author_rank,
    authorBio: row.author_bio,
    title: row.title,
    body: row.content,
    tag: row.tag,
    createdAt: row.created_at,
    viewCount: row.view_count,
    likeCount: row.like_count,
    replyCount: row.reply_count,
    liked: row.liked_by_me,
    journalEntryId: row.journal_entry_id,
  };
}

function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile, applyProfile } = useProfile();
  const userId = user?.id ?? null;
  const rankTitle = profile?.rank_title ?? null;

  const [activeChallenge, setActiveChallenge] = useState<ActiveChallenge | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(true);
  const [challengeCompleted, setChallengeCompleted] = useState(false);
  const [lastAwardedXp, setLastAwardedXp] = useState(0);

  const [journalEntries, setJournalEntries] = useState<JournalItem[]>([]);
  const [journalLoading, setJournalLoading] = useState(true);

  const [communityFeed, setCommunityFeed] = useState<CommunityPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  const [completedCount, setCompletedCount] = useState(0);

  const [dailyQuote, setDailyQuote] = useState<DailyQuote | null>(null);
  const [dailyQuoteLoading, setDailyQuoteLoading] = useState(true);

  const [streakWeek, setStreakWeek] = useState<Set<string>>(new Set());

  // Fetched once per app session — the quote is the same for everyone all
  // day, so there's nothing gained by re-fetching on every render.
  useEffect(() => {
    let mounted = true;
    setDailyQuoteLoading(true);
    fetchDailyQuote().then((q) => {
      if (mounted) {
        setDailyQuote(q);
        setDailyQuoteLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadChallenge = useCallback(async () => {
    if (!userId) {
      return;
    }
    setChallengeLoading(true);
    const row = await fetchNextChallenge(userId, rankTitle);
    setActiveChallenge(row ? mapChallenge(row) : null);
    setChallengeLoading(false);
  }, [userId, rankTitle]);

  const refreshJournal = useCallback(async () => {
    if (!userId) {
      return;
    }
    setJournalLoading(true);
    const rows = await fetchJournalEntries(userId);
    setJournalEntries(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        challengeTitle: r.challenge_title,
        content: r.content,
        createdAt: r.created_at,
      })),
    );
    setJournalLoading(false);
  }, [userId]);

  const refreshFeed = useCallback(async () => {
    if (!userId) {
      return;
    }
    setFeedLoading(true);
    const rows = await fetchCommunityFeed(userId);
    setCommunityFeed(rows.map(mapCommunityPost));
    setFeedLoading(false);
  }, [userId]);

  const refreshCompletedCount = useCallback(async () => {
    if (!userId) {
      return;
    }
    setCompletedCount(await fetchCompletedChallengeCount(userId));
  }, [userId]);

  const refreshStreakWeek = useCallback(async () => {
    if (!userId) {
      return;
    }
    setStreakWeek(await fetchStreakWeek(userId));
  }, [userId]);

  // Initial + on-auth data hydration.
  useEffect(() => {
    if (!userId) {
      return;
    }
    loadChallenge();
    refreshJournal();
    refreshFeed();
    refreshCompletedCount();
    refreshStreakWeek();
  }, [userId, loadChallenge, refreshJournal, refreshFeed, refreshCompletedCount, refreshStreakWeek]);

  const addPersonalJournalEntry = useCallback(async (content: string, title?: string) => {
    const result = await addJournalEntry(content, title);
    if (result.ok && result.entry) {
      const entry = result.entry;
      setJournalEntries((prev) => [
        {
          id: entry.id,
          title: entry.title,
          challengeTitle: entry.challenge_title,
          content: entry.content,
          createdAt: entry.created_at,
        },
        ...prev,
      ]);
    }
    return { ok: result.ok, error: result.error };
  }, []);

  const setReplyCount = useCallback((postId: string, count: number) => {
    setCommunityFeed((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, replyCount: count } : post)),
    );
  }, []);

  const submitChallenge = useCallback(
    async (text: string, broadcast: boolean, postTitle: string) => {
      if (!activeChallenge || !userId) {
        return { ok: false };
      }
      const result = await completeChallenge({
        challengeId: activeChallenge.id,
        journalText: text,
        broadcast,
        postTitle: postTitle.trim() || undefined,
      });
      if (!result.ok) {
        return { ok: false, error: result.error };
      }

      setLastAwardedXp(activeChallenge.xpReward);
      setChallengeCompleted(true);

      // Step 2e: patch useProfile() instantly from the RPC's returned row so
      // the header streak pill, growth card, and score counters update now.
      const patch: Partial<{ streak_count: number; social_score: number; rank_title: string }> = {};
      if (typeof result.streak_count === 'number') patch.streak_count = result.streak_count;
      if (typeof result.social_score === 'number') patch.social_score = result.social_score;
      if (typeof result.rank_title === 'string') patch.rank_title = result.rank_title;
      applyProfile(patch);

      refreshJournal();
      refreshCompletedCount();
      refreshStreakWeek();
      if (broadcast) {
        refreshFeed();
      }
      return { ok: true };
    },
    [
      activeChallenge,
      userId,
      applyProfile,
      refreshJournal,
      refreshCompletedCount,
      refreshStreakWeek,
      refreshFeed,
    ],
  );

  const loadNextChallenge = useCallback(async () => {
    setChallengeCompleted(false);
    await loadChallenge();
  }, [loadChallenge]);

  const resetCompletedFlag = useCallback(() => setChallengeCompleted(false), []);

  const likePost = useCallback(
    async (postId: string) => {
      if (!userId) {
        return;
      }
      // Optimistic toggle for instant feedback; DB write follows.
      setCommunityFeed((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                liked: !post.liked,
                likeCount: post.liked ? Math.max(0, post.likeCount - 1) : post.likeCount + 1,
              }
            : post,
        ),
      );
      await togglePostLike(postId, userId);
    },
    [userId],
  );

  const reportPost = useCallback(
    async (postId: string, reportedUserId: string, reason: string) => {
      if (!userId) {
        return false;
      }
      return reportContent({ reporterId: userId, reportedUserId, postId, reason });
    },
    [userId],
  );

  const blockAuthor = useCallback(
    async (blockedId: string) => {
      if (!userId) {
        return;
      }
      // Immediately drop their content locally, then persist + re-sync.
      setCommunityFeed((prev) => prev.filter((post) => post.userId !== blockedId));
      await blockUser(userId, blockedId);
      refreshFeed();
    },
    [userId, refreshFeed],
  );

  const registerView = useCallback(async (postId: string) => {
    const count = await incrementPostView(postId);
    if (count != null) {
      setCommunityFeed((prev) =>
        prev.map((post) => (post.id === postId ? { ...post, viewCount: count } : post)),
      );
    }
  }, []);

  const createPost = useCallback(
    async (title: string, body: string, tag: PostTag | null) => {
      if (!userId) {
        return { ok: false, error: 'Not signed in' };
      }
      const result = await createStandalonePost(userId, title, body, tag);
      if (result.ok) {
        await refreshFeed();
      }
      return result;
    },
    [userId, refreshFeed],
  );

  const value = useMemo<AppContextShape>(
    () => ({
      activeChallenge,
      challengeLoading,
      challengeCompleted,
      lastAwardedXp,
      submitChallenge,
      loadNextChallenge,
      resetCompletedFlag,
      journalEntries,
      journalLoading,
      refreshJournal,
      addPersonalJournalEntry,
      communityFeed,
      feedLoading,
      refreshFeed,
      likePost,
      reportPost,
      blockAuthor,
      registerView,
      createPost,
      setReplyCount,
      completedCount,
      dailyQuote,
      dailyQuoteLoading,
      streakWeek,
    }),
    [
      activeChallenge,
      challengeLoading,
      challengeCompleted,
      lastAwardedXp,
      submitChallenge,
      loadNextChallenge,
      resetCompletedFlag,
      journalEntries,
      journalLoading,
      refreshJournal,
      addPersonalJournalEntry,
      communityFeed,
      feedLoading,
      refreshFeed,
      likePost,
      reportPost,
      blockAuthor,
      registerView,
      createPost,
      setReplyCount,
      completedCount,
      dailyQuote,
      dailyQuoteLoading,
      streakWeek,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ============================================================================
// SECTION 3B — MESSAGING (gated: opened only from the header pill or the
// "Message" button on another operator's profile — never a bottom tab).
// ============================================================================

type ChatTarget = {
  conversationId: string;
  isGroup: boolean;
  title: string | null;
  /** All other participants (length 1 for a 1:1 chat, 1+ for a group). */
  members: ConversationMemberLite[];
  // Convenience accessors for the common 1:1 case.
  otherUserId: string;
  otherUsername: string;
  otherRank: string | null;
};

function chatTargetFromSummary(item: ConversationSummary): ChatTarget {
  return {
    conversationId: item.id,
    isGroup: item.is_group,
    title: item.title,
    members: item.members,
    otherUserId: item.other_user_id,
    otherUsername: withAt(item.other_username),
    otherRank: item.other_rank,
  };
}

/** Display name for a conversation row/header: explicit title, else the
 * joined @handles of every other participant. */
function conversationDisplayName(item: { title: string | null; members: ConversationMemberLite[] }): string {
  if (item.title) return item.title;
  if (item.members.length === 0) return 'operator';
  return item.members.map((m) => withAt(m.username)).join(', ');
}

type MessagingContextValue = {
  /** Open the conversation list overlay. */
  openMessages: () => void;
  /** Find/create a 1:1 chat with a user and open it directly. */
  openChatWith: (otherUserId: string, otherUsername: string, otherRank: string | null) => Promise<void>;
};

const MessagingContext = createContext<MessagingContextValue | null>(null);

function useMessaging(): MessagingContextValue {
  const ctx = useContext(MessagingContext);
  if (!ctx) {
    throw new Error('useMessaging must be used inside MessagingProvider');
  }
  return ctx;
}

function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [visible, setVisible] = useState(false);
  const [chat, setChat] = useState<ChatTarget | null>(null);

  const openMessages = useCallback(() => {
    triggerHaptic();
    setChat(null);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setChat(null);
  }, []);

  const openChatWith = useCallback(
    async (otherUserId: string, otherUsername: string, otherRank: string | null) => {
      triggerHaptic();
      setVisible(true);
      const conversationId = await findOrCreateConversation(otherUserId);
      if (conversationId) {
        setChat({
          conversationId,
          isGroup: false,
          title: null,
          members: [{ id: otherUserId, username: otherUsername, rank_title: otherRank }],
          otherUserId,
          otherUsername: withAt(otherUsername),
          otherRank,
        });
      }
    },
    [],
  );

  const value = useMemo<MessagingContextValue>(
    () => ({ openMessages, openChatWith }),
    [openMessages, openChatWith],
  );

  return (
    <MessagingContext.Provider value={value}>
      {children}
      <MessagesOverlay
        visible={visible}
        chat={chat}
        userId={userId}
        onClose={close}
        onBack={() => setChat(null)}
        onOpenConversation={setChat}
      />
    </MessagingContext.Provider>
  );
}

function MessagesOverlay({
  visible,
  chat,
  userId,
  onClose,
  onBack,
  onOpenConversation,
}: {
  visible: boolean;
  chat: ChatTarget | null;
  userId: string | null;
  onClose: () => void;
  onBack: () => void;
  onOpenConversation: (target: ChatTarget) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={chat ? onBack : onClose}
    >
      <View style={styles.overlayFill}>
        <View
          style={[
            styles.overlayInner,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
        >
          {chat ? (
            <ChatView chat={chat} userId={userId} onBack={onBack} onClose={onClose} />
          ) : (
            <ConversationList userId={userId} onOpen={onOpenConversation} onClose={onClose} />
          )}
        </View>
      </View>
    </Modal>
  );
}

function ConversationList({
  userId,
  onOpen,
  onClose,
}: {
  userId: string | null;
  onOpen: (target: ChatTarget) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const blocked = await fetchBlockedIds(userId);
    const convos = await fetchConversations(userId, blocked);
    setItems(convos);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      if (!userId) {
        if (mounted) setLoading(false);
        return;
      }
      const blocked = await fetchBlockedIds(userId);
      const convos = await fetchConversations(userId, blocked);
      if (mounted) {
        setItems(convos);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  return (
    <>
      <View style={styles.messagesHeaderRow}>
        <Text style={styles.messagesTitle}>MESSAGES</Text>
        <View style={styles.messagesHeaderActions}>
          <Pressable
            onPress={() => setGroupPickerVisible(true)}
            hitSlop={10}
            style={styles.messagesNewGroupBtn}
          >
            <Text style={styles.messagesNewGroupText}>{'\u2795'} GROUP</Text>
          </Pressable>
          <Pressable onPress={onClose} hitSlop={10} style={styles.messagesCloseBtn}>
            <Text style={styles.messagesCloseText}>{'\u2715'}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.neon} style={styles.messagesSpinner} />
      ) : items.length === 0 ? (
        <Text style={styles.messagesEmpty}>
          No conversations yet. Open an operator&apos;s profile in the Community feed and tap
          Message to start one, or tap + GROUP above to start a group chat.
        </Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.messagesListContent}
          renderItem={({ item }) => {
            const name = conversationDisplayName(item);
            return (
              <SpringPressable
                onPress={() => onOpen(chatTargetFromSummary(item))}
                style={({ pressed }) => [styles.card, styles.convoRow, pressed && styles.cardPressed]}
              >
                <Avatar handle={item.is_group ? '#' : withAt(item.other_username)} size={40} />
                <View style={styles.convoTextBlock}>
                  <Text style={styles.convoName} numberOfLines={1} ellipsizeMode="tail">
                    {item.is_group ? name : withAt(item.other_username)}
                  </Text>
                  <Text style={styles.convoPreview} numberOfLines={1} ellipsizeMode="tail">
                    {item.last_message ?? 'No messages yet'}
                  </Text>
                </View>
                <Text style={styles.accordionChevron}>{'\u203A'}</Text>
              </SpringPressable>
            );
          }}
        />
      )}

      <NewGroupModal
        visible={groupPickerVisible}
        userId={userId}
        onClose={() => setGroupPickerVisible(false)}
        onCreated={async (target) => {
          setGroupPickerVisible(false);
          await reload();
          onOpen(target);
        }}
      />
    </>
  );
}

// Group chat creation: picks from the same pool of users the community/DM
// RLS policy already permits the viewer to see (public posters, repliers,
// existing DM partners) — never a full user directory / enumeration.
function NewGroupModal({
  visible,
  userId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  userId: string | null;
  onClose: () => void;
  onCreated: (target: ChatTarget) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<ConversationMemberLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !userId) return;
    let mounted = true;
    setLoading(true);
    setSelected(new Set());
    setTitle('');
    setError('');
    (async () => {
      const blocked = await fetchBlockedIds(userId);
      const users = await fetchKnownUsers(userId, blocked);
      if (mounted) {
        setCandidates(users);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [visible, userId]);

  if (!visible) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!userId || selected.size === 0 || creating) return;
    setCreating(true);
    setError('');
    const result = await createGroupConversation(Array.from(selected), title);
    setCreating(false);
    if (!result.ok || !result.conversationId) {
      setError(result.error ?? 'Could not create group chat.');
      return;
    }
    const members = candidates.filter((c) => selected.has(c.id));
    onCreated({
      conversationId: result.conversationId,
      isGroup: true,
      title: title.trim() || null,
      members,
      otherUserId: members[0]?.id ?? '',
      otherUsername: members[0]?.username ?? 'operator',
      otherRank: members[0]?.rank_title ?? null,
    });
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <View pointerEvents="box-none" style={styles.centeredCardWrap}>
          <View style={styles.centeredCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.centeredCardScrollContent}
            >
              <SectionHeader label="NEW GROUP CHAT" centered />

              <Text style={styles.accountEditLabel}>GROUP NAME (OPTIONAL)</Text>
              <TextInput
                style={styles.accountEditInput}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Bronze Squad"
                placeholderTextColor={COLORS.muted}
                maxLength={40}
                editable={!creating}
                keyboardAppearance="dark"
              />

              <Text style={[styles.accountEditLabel, { marginTop: 14 }]}>
                SELECT MEMBERS ({selected.size} selected)
              </Text>

              {loading ? (
                <ActivityIndicator color={COLORS.neon} style={styles.messagesSpinner} />
              ) : candidates.length === 0 ? (
                <Text style={styles.messagesEmpty}>
                  No eligible operators yet. You can add anyone you&apos;ve DMed, or anyone who has
                  posted/replied in the Community tab.
                </Text>
              ) : (
                candidates.map((c) => {
                  const checked = selected.has(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => toggle(c.id)}
                      style={({ pressed }) => [
                        styles.card,
                        styles.convoRow,
                        styles.groupMemberRow,
                        pressed && styles.cardPressed,
                      ]}
                    >
                      <Avatar handle={withAt(c.username)} size={36} />
                      <View style={styles.convoTextBlock}>
                        <Text style={styles.convoName} numberOfLines={1}>
                          {withAt(c.username)}
                        </Text>
                        {c.rank_title ? (
                          <Text style={styles.convoPreview} numberOfLines={1}>
                            {c.rank_title}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[styles.groupCheckbox, checked && styles.groupCheckboxChecked]}>
                        {checked ? <Text style={styles.groupCheckboxMark}>{'\u2713'}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                onPress={handleCreate}
                disabled={selected.size === 0 || creating}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.accordionInlineButton,
                  (selected.size === 0 || creating) && styles.primaryButtonDisabled,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {creating ? 'CREATING...' : `CREATE GROUP (${selected.size})`}
                </Text>
              </Pressable>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.accordionInlineButton,
                  styles.cancelButtonAlt,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>CANCEL</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ChatView({
  chat,
  userId,
  onBack,
  onClose,
}: {
  chat: ChatTarget;
  userId: string | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const listRef = useRef<FlatList<MessageRow>>(null);

  const reload = useCallback(async () => {
    const blocked = userId ? await fetchBlockedIds(userId) : new Set<string>();
    const msgs = await fetchMessages(chat.conversationId, blocked);
    setMessages(msgs);
    setLoading(false);
  }, [chat.conversationId, userId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setSendError('');
    (async () => {
      const blocked = userId ? await fetchBlockedIds(userId) : new Set<string>();
      const msgs = await fetchMessages(chat.conversationId, blocked);
      if (mounted) {
        setMessages(msgs);
        setLoading(false);
      }
    })();

    // Realtime: append inbound messages, deduped by id.
    const unsubscribe = subscribeToMessages(chat.conversationId, (incoming) => {
      setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [chat.conversationId, userId]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !userId || sending) {
      return;
    }
    setSending(true);
    setSendError('');
    setDraft('');
    // A 2-second per-user cooldown across every conversation is enforced by
    // a database trigger — a fast typist never hits it, but a script trying
    // to flood messages does, and the server rejection is surfaced here.
    const result = await sendMessage(chat.conversationId, userId, text);
    if (result.ok) {
      await reload();
    } else {
      setDraft(text);
      setSendError(result.error ?? 'Could not send message.');
    }
    setSending(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.overlayFlex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.messagesHeaderRow}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.messagesCloseBtn}>
          <Text style={styles.messagesBackText}>{'\u2039'}</Text>
        </Pressable>
        <View style={styles.chatHeaderTextBlock}>
          <Text style={styles.convoName} numberOfLines={1} ellipsizeMode="tail">
            {chat.isGroup ? conversationDisplayName(chat) : chat.otherUsername}
          </Text>
          {chat.isGroup ? (
            <Text style={styles.chatHeaderRank} numberOfLines={1}>
              {chat.members.length + 1} members
            </Text>
          ) : chat.otherRank ? (
            <Text style={styles.chatHeaderRank} numberOfLines={1}>
              {chat.otherRank}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.messagesCloseBtn}>
          <Text style={styles.messagesCloseText}>{'\u2715'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.neon} style={styles.messagesSpinner} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chatListContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.messagesEmpty}>
              No messages yet. Say something to break the ice.
            </Text>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            const senderName =
              chat.isGroup && !mine
                ? chat.members.find((m) => m.id === item.sender_id)?.username
                : null;
            return (
              <View style={[styles.msgBubbleRow, mine && styles.msgBubbleRowMine]}>
                <View style={[styles.msgBubble, mine ? styles.msgBubbleMine : styles.msgBubbleTheirs]}>
                  {senderName ? (
                    <Text style={styles.msgSenderLabel} numberOfLines={1}>
                      {withAt(senderName)}
                    </Text>
                  ) : null}
                  <Text style={[styles.msgText, mine && styles.msgTextMine]}>{item.content}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {sendError ? <Text style={[styles.errorText, styles.chatErrorText]}>{sendError}</Text> : null}

      <View style={styles.chatInputRow}>
        <TextInput
          style={styles.chatInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message..."
          placeholderTextColor={COLORS.muted}
          keyboardAppearance="dark"
          multiline
        />
        <Pressable
          onPress={handleSend}
          disabled={draft.trim().length === 0 || sending}
          style={({ pressed }) => [
            styles.chatSendBtn,
            (draft.trim().length === 0 || sending) && styles.chatSendBtnDisabled,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.chatSendText}>{'\u27A4'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ============================================================================
// SHARED UI PRIMITIVES
// ============================================================================

// Slim centered tier pill shown at the top of scrollable content on the
// Community and Profile tabs (the Challenges tab elevates this readout
// into the hero TierOrb instead).
function TierBanner({ label }: { label: string }) {
  return (
    <View style={styles.hudBar}>
      <Text style={styles.hudText} numberOfLines={1} ellipsizeMode="tail">
        {`\u25C8  ${label}`}
      </Text>
    </View>
  );
}

// Spring-based press feedback wrapper. Drop-in visual upgrade over a plain
// Pressable: identical props and handlers, plus a buttery scale-down spring
// on press. Purely cosmetic — no behavior changes.
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

function SpringPressable({
  containerStyle,
  ...props
}: PressableProps & { containerStyle?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Reanimated.View style={[containerStyle, animatedStyle]}>
      <Pressable
        {...props}
        onPressIn={(e) => {
          scale.value = withSpring(0.97, PRESS_SPRING);
          props.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, PRESS_SPRING);
          props.onPressOut?.(e);
        }}
      />
    </Reanimated.View>
  );
}

// ============================================================================
// DETERMINATE PROGRESS PRIMITIVES (dependency-free, pure React Native)
// ProgressRing draws a circular neon arc mapped to a 0..1 ratio using the
// classic two-half-disc "pie" technique (transformOrigin is supported on
// RN 0.76+), then punches a hole to leave a ring with content centered.
// ProgressBar is a simple horizontal track + neon fill.
// ============================================================================

function ProgressRing({
  size,
  strokeWidth,
  progress,
  color = COLORS.neon,
  trackColor = COLORS.disabled,
  holeColor = COLORS.elevated,
  children,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  color?: string;
  trackColor?: string;
  holeColor?: string;
  children?: React.ReactNode;
}) {
  const ratio = Math.max(0, Math.min(1, progress));
  const angle = ratio * 360;
  const radius = size / 2;

  // A right-bulging semicircle pinned so its flat (left) edge sits on the
  // ring's center and pivots there. At 0deg it covers the right half; a
  // track-colored copy rotated by `angle` masks it back down to an arc.
  const half = (rotate: number, col: string, key: string) => (
    <View
      key={key}
      style={{
        position: 'absolute',
        left: radius,
        top: 0,
        width: radius,
        height: size,
        backgroundColor: col,
        borderTopRightRadius: radius,
        borderBottomRightRadius: radius,
        transformOrigin: '0% 50%',
        transform: [{ rotate: `${rotate}deg` }],
      }}
    />
  );

  const layers: React.ReactNode[] = [];
  if (ratio > 0) {
    layers.push(half(0, color, 'a'));
    if (angle > 180) {
      layers.push(half(180, color, 'b'));
    }
    // Mask the remainder back to the track color. Skipped at a full ring,
    // where a 360deg mask would wrap around and erase the fill.
    if (ratio < 1) {
      layers.push(half(angle, trackColor, 'mask'));
    }
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: trackColor,
          overflow: 'hidden',
        }}
      >
        {layers}
      </View>
      <View
        style={{
          position: 'absolute',
          width: size - strokeWidth * 2,
          height: size - strokeWidth * 2,
          borderRadius: (size - strokeWidth * 2) / 2,
          backgroundColor: holeColor,
        }}
      />
      {children}
    </View>
  );
}

function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

// ============================================================================
// AMBIENT COSMOS BACKGROUND (PARALLAX STARFIELD)
// A fixed field of soft neon-green particles behind every screen's content.
// It drifts autonomously on a slow loop and shifts vertically at a slower
// parallax rate as the user scrolls, creating a deep 3D effect. Rendered
// once per screen, non-interactive, and animated entirely on the UI thread.
// ============================================================================

const WINDOW = Dimensions.get('window');

const STARS = Array.from({ length: 34 }, () => ({
  x: Math.random() * WINDOW.width,
  y: Math.random() * WINDOW.height * 1.5,
  size: 1.5 + Math.random() * 3,
  opacity: 0.10 + Math.random() * 0.38,
  glow: Math.random() > 0.72,
}));

function Starfield({ scrollY }: { scrollY: SharedValue<number> }) {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 16000 }), -1, true);
  }, [drift]);

  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.value * 14 - scrollY.value * 0.16 }],
  }));

  return (
    <View pointerEvents="none" style={styles.starfield}>
      <Reanimated.View style={[styles.starfieldLayer, layerStyle]}>
        {STARS.map((star, index) => (
          <View
            key={index}
            style={[
              styles.starDot,
              {
                left: star.x,
                top: star.y,
                width: star.size,
                height: star.size,
                borderRadius: star.size / 2,
                opacity: star.opacity,
              },
              star.glow && styles.starDotGlow,
            ]}
          />
        ))}
      </Reanimated.View>
    </View>
  );
}

// ============================================================================
// TIER ORB — HERO STAGE VISUAL (CHALLENGES TAB)
// The operator's tier readout elevated into a glowing green energy sphere:
// layered translucent circles fake a radial-gradient depth, an ambient halo
// breathes on a slow loop, and the tier number reads like an instrument.
// ============================================================================

function TierOrb({ level }: { level: number }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 2800 }), -1, true);
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.55,
    transform: [{ scale: 1 + pulse.value * 0.07 }],
  }));

  return (
    <View style={styles.orbWrap}>
      <Reanimated.View style={[styles.orbHalo, haloStyle]} />
      <View style={styles.orbSphere}>
        <View style={styles.orbSheen} />
        <View style={styles.orbCore} />
        <Text style={styles.orbLabel}>OPERATOR TIER</Text>
        <Text style={styles.orbNumber}>{level}</Text>
        <Text style={styles.orbCaption}>LEVEL</Text>
      </View>
    </View>
  );
}

// ============================================================================
// FIXED TOP HEADER — BRAND ROW + LIVE ACTIVITY TICKER
// Anchored to the true top of the screen with a solid `headerBg` fill so
// scrolled content slides cleanly underneath. Left: XTROVERT wordmark.
// Right: the operator's streak counter as a glowing badge of honor. The
// existing live activity ticker renders as a second row directly below.
// ============================================================================

function AppHeader() {
  const insets = useSafeAreaInsets();
  const { profile, isLoading: profileLoading } = useProfile();
  const { openMessages } = useMessaging();

  // 🔥 Streak pill binds to Supabase. Show a subtle placeholder while the
  // profile loads so it never renders undefined/NaN.
  const streakLabel = profileLoading || !profile ? '---' : String(profile.streak_count);

  // The header is non-interactive except the 💬 message pill, which is the
  // gated entry point into the Messages overlay (Step 6.2). `box-none` lets
  // touches fall through everywhere except that Pressable.
  return (
    <View pointerEvents="box-none" style={[styles.appHeader, { paddingTop: insets.top }]}>
      <View pointerEvents="box-none" style={styles.appHeaderRow}>
        <Text style={styles.brandWordmark} numberOfLines={1}>
          <Text style={styles.brandAccent}>X</Text>TROVERT
        </Text>
        <View pointerEvents="box-none" style={styles.headerBadgeRow}>
          <View style={styles.headerPill}>
            <Text style={styles.headerPillGlyph}>{'\uD83D\uDD25'}</Text>
            <Text style={styles.headerPillNumber}>{streakLabel}</Text>
          </View>
          <Pressable
            onPress={openMessages}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open messages"
            style={({ pressed }) => [
              styles.headerPill,
              styles.headerPillButton,
              pressed && styles.headerPillPressed,
            ]}
          >
            <Text style={styles.headerPillGlyph}>{'\uD83D\uDCAC'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SectionHeader({ label, centered }: { label: string; centered?: boolean }) {
  return (
    <Text
      style={[styles.sectionHeader, centered && styles.sectionHeaderCentered]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {label}
    </Text>
  );
}

// Requirement (Point 3): circular avatar shown next to a handle. Renders the
// real profile picture when one is set; otherwise falls back to a sleek,
// theme-consistent initials circle so the UI never shows a broken image.
function Avatar({
  handle,
  profilePictureUrl,
  size = 32,
}: {
  handle: string;
  profilePictureUrl?: string | null;
  size?: number;
}) {
  const initial = handle.replace('@', '').charAt(0).toUpperCase();
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (profilePictureUrl) {
    return (
      <View style={[styles.avatarCircleWrap, dimensionStyle]}>
        <Image source={{ uri: profilePictureUrl }} style={styles.avatarCircleImage} />
      </View>
    );
  }

  return (
    <View style={[styles.avatarCircleWrap, dimensionStyle]}>
      <Text style={[styles.avatarCircleFallbackText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

// Generic centered popup used for every "tap a section to see more detail"
// interaction across the app (Operator Vitals, Profile sections, etc.).
// Wrapped in RN's native `Modal` so it always renders in its own top-level
// window, permanently above every other layer (ticker, tab bar, cards)
// without any manual zIndex/elevation bookkeeping.
function InfoPopupModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        {/* True backdrop: a sibling (not an ancestor) of the content below,
            so it can never intercept/compete with the ScrollView's own pan
            gesture — only genuine taps outside the card close the popup. */}
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <View pointerEvents="box-none" style={styles.centeredCardWrap}>
          <View style={styles.centeredCard}>
            <ScrollView
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.centeredCardScrollContent}
            >
              <SectionHeader label={title} centered />
              {children}
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.accordionInlineButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>{'\u2713'}  CLOSE</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// PERSISTENT LIVE ACTIVITY TICKER
// Rendered as the second row inside the fixed AppHeader (below the brand
// row). The header itself owns the safe-area inset and the solid fill, so
// this component is now a simple in-flow marquee row. Non-interactive.
// Every modal in the app renders via RN's native `Modal`, which always
// paints in its own top-level window above the header regardless.
// ============================================================================

function LiveTicker() {
  const translateX = useRef(new Animated.Value(0)).current;
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    if (contentWidth <= 0) {
      return;
    }
    translateX.setValue(0);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: -contentWidth,
        duration: contentWidth * 30,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [contentWidth, translateX]);

  const tickerString = `${TICKER_ITEMS.join(' \u2022 ')} \u2022 `;

  return (
    <View pointerEvents="none" style={styles.liveTicker}>
      <Animated.View style={[styles.tickerTrack, { transform: [{ translateX }] }]}>
        <Text
          style={styles.tickerText}
          numberOfLines={1}
          onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
        >
          {tickerString}
        </Text>
        <Text style={styles.tickerText} numberOfLines={1}>
          {tickerString}
        </Text>
      </Animated.View>
    </View>
  );
}

// ============================================================================
// TAB 1 — CHALLENGES (PRIMARY EXPOSURE COCKPIT)
// ============================================================================

// Minimum characters for a valid field report (Step 2.2a).
const MIN_JOURNAL_CHARS = 60;
// Minimum distinct words required to defeat single-word / gibberish spam.
const MIN_UNIQUE_WORDS = 5;
// Submit cooldown to prevent rapid multi-tap double submissions (Step 2.2c).
const SUBMIT_COOLDOWN_MS = 3000;

// Anti-spam / content validation (Step 2.2a + 2.2b). Returns whether the
// entry is submittable plus a human-readable status for the live counter.
function analyzeJournalEntry(text: string): { valid: boolean; status: string; count: number } {
  const trimmed = text.trim();
  const count = trimmed.length;

  if (count < MIN_JOURNAL_CHARS) {
    return { valid: false, status: `${count}/${MIN_JOURNAL_CHARS} min characters`, count };
  }
  // Repeated single character spam (e.g. "aaaaaaaaaa...").
  if (/(.)\1{9,}/.test(trimmed)) {
    return { valid: false, status: 'Too many repeated characters — write a real reflection.', count };
  }
  const words = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const uniqueWords = new Set(words);
  if (uniqueWords.size < MIN_UNIQUE_WORDS) {
    return {
      valid: false,
      status: `Add more detail — at least ${MIN_UNIQUE_WORDS} distinct words required.`,
      count,
    };
  }
  // Character diversity guard against keyboard-mash gibberish.
  const uniqueChars = new Set(trimmed.replace(/\s/g, '').toLowerCase());
  if (uniqueChars.size < 8) {
    return { valid: false, status: 'This looks like gibberish — describe what actually happened.', count };
  }
  return { valid: true, status: `${count} characters — looks good.`, count };
}

// Step 2: the challenge rectification / journaling modal. Anti-spam validated,
// broadcast toggle defaults OFF (user must opt in) and reveals a title input,
// and a 3s submit cooldown animation guards against multi-tap.
function VerificationOverlay({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (
    text: string,
    broadcast: boolean,
    postTitle: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const insets = useSafeAreaInsets();
  const [entryText, setEntryText] = useState('');
  const [broadcastFeed, setBroadcastFeed] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const cooldownAnim = useRef(new Animated.Value(0)).current;

  const analysis = analyzeJournalEntry(entryText);
  const isValid = analysis.valid;
  const canSubmit = isValid && !submitting;

  // Reset the draft whenever the modal closes so it always opens clean.
  useEffect(() => {
    if (!visible) {
      setEntryText('');
      setBroadcastFeed(false);
      setPostTitle('');
      setSubmitting(false);
      setErrorText('');
      cooldownAnim.setValue(0);
    }
  }, [visible, cooldownAnim]);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setErrorText('');
    cooldownAnim.setValue(0);
    Animated.timing(cooldownAnim, {
      toValue: 1,
      duration: SUBMIT_COOLDOWN_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    const result = await onSubmit(entryText.trim(), broadcastFeed, postTitle.trim());
    if (!result.ok && result.error) {
      setErrorText(result.error);
    }

    // If the parent didn't close us (e.g. a failure), re-enable after cooldown.
    setTimeout(() => setSubmitting(false), SUBMIT_COOLDOWN_MS);
  };

  if (!visible) {
    return null;
  }

  const cooldownWidth = cooldownAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.overlayFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <View
            pointerEvents="box-none"
            style={[
              styles.overlayInner,
              { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.overlayScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>{'\u2715'}  CANCEL — DISCARD ENTRY</Text>
              </Pressable>

              <Text style={styles.overlayHeader}>
                [ VERIFICATION PROTOCOL: Did you execute this rep honestly, or are
                you cheating your own progression? The grid demands an honest
                readout. ]
              </Text>

              <View style={styles.overlayCard}>
                <SectionHeader label="FIELD READOUT — MANDATORY" />
                <TextInput
                  style={styles.verificationInput}
                  multiline
                  value={entryText}
                  onChangeText={setEntryText}
                  placeholder="Describe exactly what happened. What did you say, what did you feel, what did you learn..."
                  placeholderTextColor={COLORS.muted}
                  textAlignVertical="top"
                  keyboardAppearance="dark"
                  editable={!submitting}
                />
                <Text style={[styles.charCounter, isValid && styles.charCounterValid]}>
                  {analysis.status}
                </Text>
              </View>

              <View style={styles.overlayCard}>
                <View style={[styles.toggleRow, !broadcastFeed && styles.toggleRowLast]}>
                  <Text style={styles.toggleLabel} numberOfLines={2} ellipsizeMode="tail">
                    Broadcast to Community
                  </Text>
                  <Switch
                    value={broadcastFeed}
                    onValueChange={setBroadcastFeed}
                    disabled={submitting}
                    trackColor={{ false: COLORS.border, true: COLORS.emerald }}
                    thumbColor={broadcastFeed ? COLORS.neon : COLORS.muted}
                  />
                </View>
                {broadcastFeed ? (
                  <View style={styles.broadcastTitleBlock}>
                    <Text style={styles.broadcastTitleLabel}>POST TITLE</Text>
                    <TextInput
                      style={styles.titleInput}
                      value={postTitle}
                      onChangeText={setPostTitle}
                      placeholder="Give your broadcast a clear, direct title..."
                      placeholderTextColor={COLORS.muted}
                      keyboardAppearance="dark"
                      editable={!submitting}
                    />
                  </View>
                ) : null}
              </View>

              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

              <View
                pointerEvents={canSubmit ? 'auto' : 'none'}
                style={{ opacity: isValid ? 1 : 0.4 }}
              >
                <Pressable
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.submitCooldownButton,
                    !isValid && styles.primaryButtonDisabled,
                    pressed && !submitting && styles.primaryButtonPressed,
                  ]}
                >
                  {submitting ? (
                    <Animated.View style={[styles.submitCooldownFill, { width: cooldownWidth }]} />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {submitting ? 'LOGGING...' : '\u25C6  SUBMIT RECTIFICATION'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// Requirement (Point 5): the Daily Quest container is a simple, clickable
// preview card — no inline accordion. Tapping it opens a standalone,
// centered Modal popup with the full briefing and the primary CTA.
// Standalone, centered popup for the active challenge — full instructions and
// the Secure Challenge CTA live here, above the dimmed backdrop.
function QuestDetailModal({
  visible,
  challenge,
  onClose,
  onSecureQuest,
}: {
  visible: boolean;
  challenge: ActiveChallenge | null;
  onClose: () => void;
  onSecureQuest: () => void;
}) {
  if (!visible || !challenge) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <View pointerEvents="box-none" style={styles.centeredCardWrap}>
          <View style={styles.centeredCard}>
            <ScrollView
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.centeredCardScrollContent}
            >
              <Text style={styles.questTier}>
                {(challenge.requiredRank ?? 'FIELD').toUpperCase()} DIRECTIVE
              </Text>
              <Text style={[styles.questTitle, styles.questTitleCentered]}>{challenge.title}</Text>
              <View style={styles.questDivider} />
              <Text style={styles.bodyText}>{challenge.instructions}</Text>
              <View style={styles.accordionButtonWrap}>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    onSecureQuest();
                  }}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.accordionInlineButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>{'\u25C6'}  SECURE QUEST &amp; LOG DATA</Text>
                </Pressable>
              </View>
              <Pressable onPress={onClose} style={styles.abortButton}>
                <Text style={styles.abortButtonText}>CLOSE</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Requirement (Point 5): reduced-footprint, clickable preview card — tapping
// it opens a standalone popup with the full lockout description.
function SystemLockPreviewCard({ onPress }: { onPress: () => void }) {
  return (
    <SpringPressable
      onPress={onPress}
      style={({ pressed }) => [styles.lockBanner, pressed && styles.cardPressed]}
    >
      <View style={styles.lockBannerHeaderRow}>
        <Text style={styles.lockBannerTitle}>{'\u2B22'}  SYSTEM LOCK ACTIVE</Text>
        <Text style={styles.accordionChevron}>{'\u203A'}</Text>
      </View>
    </SpringPressable>
  );
}

function SystemLockModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <View pointerEvents="box-none" style={styles.centeredCardWrap}>
          <View style={styles.centeredCard}>
            <ScrollView
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.centeredCardScrollContent}
            >
              <Text style={[styles.lockBannerTitle, styles.lockModalTitle]}>
                {'\u2B22'}  SYSTEM LOCK ACTIVE
              </Text>
              <View style={styles.questDivider} />
              <Text style={styles.bodyText}>
                Instagram, TikTok, and Snapchat Screen Time blocks are engaged.
                Execute your real-world mission to override the lockout protocol.
              </Text>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.accordionInlineButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>{'\u2713'}  CLOSE</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---- Home card: Growth Stage overview --------------------------------------
// Circular growth ring driven by the live social_score, hero stage number, and
// the Supabase rank_title. Support Growth was removed — social_score is now the
// single progression metric. Pressing opens the existing score-breakdown popup.
function GrowthStageCard({ onPressDetails }: { onPressDetails: () => void }) {
  const { profile, isLoading: profileLoading } = useProfile();

  const loading = profileLoading || !profile;
  const socialScore = profile?.social_score ?? 0;
  const rankTitle = loading ? 'Starter' : profile?.rank_title || 'Starter';
  const { ratio: socialRatio, target: nextRankTarget } = computeRankProgress(rankTitle, socialScore);
  const stageNumber = loading ? '---' : String(rankStage(rankTitle));

  const socialScoreLabel = loading ? '---' : String(socialScore);
  const socialTargetLabel = nextRankTarget === null ? 'MAX' : String(nextRankTarget);
  const socialPctLabel = loading ? '---' : `${Math.round(socialRatio * 100)}%`;

  return (
    <SpringPressable
      onPress={() => {
        triggerHaptic();
        onPressDetails();
      }}
      style={({ pressed }) => [styles.card, styles.growthCard, pressed && styles.cardPressed]}
    >
      <View style={styles.growthTopRow}>
        <ProgressRing size={76} strokeWidth={6} progress={loading ? 0 : socialRatio}>
          <Text style={styles.growthRingGlyph}>{'\uD83C\uDF31'}</Text>
        </ProgressRing>
        <View style={styles.growthTopText}>
          <Text style={styles.growthLabel}>GROWTH STAGE</Text>
          <Text style={styles.growthNumber}>{stageNumber}</Text>
          <Text style={styles.growthStageTitle} numberOfLines={1}>
            {rankTitle}
          </Text>
          <Text style={styles.growthMotivation}>Keep growing.</Text>
        </View>
        <Text style={styles.growthChevron}>{'\u203A'}</Text>
      </View>

      <View style={styles.growthDivider} />

      <View style={styles.growthBottomRow}>
        <View style={styles.growthMetricCol}>
          <Text style={styles.growthMetricLabel}>SOCIAL GROWTH</Text>
          <Text style={styles.growthMetricValue}>
            {socialScoreLabel}
            <Text style={styles.growthMetricMax}> / {socialTargetLabel}</Text>
          </Text>
          <ProgressBar ratio={loading ? 0 : socialRatio} />
          <Text style={styles.growthMetricPct}>{socialPctLabel}</Text>
        </View>
      </View>
    </SpringPressable>
  );
}

// ---- Home card: Today's Challenge (hero) -----------------------------------
function TodayChallengeCard({ onAccept }: { onAccept: () => void }) {
  const { activeChallenge, challengeLoading } = useAppContext();

  if (challengeLoading && !activeChallenge) {
    return (
      <View style={[styles.card, styles.challengeCard]}>
        <Text style={styles.challengeKicker}>{'\u26A1'}  TODAY&apos;S CHALLENGE</Text>
        <Text style={styles.challengeTitle}>---</Text>
        <Text style={styles.challengeDesc}>Loading your next directive...</Text>
      </View>
    );
  }

  if (!activeChallenge) {
    return (
      <View style={[styles.card, styles.challengeCard]}>
        <Text style={styles.challengeKicker}>{'\u26A1'}  TODAY&apos;S CHALLENGE</Text>
        <Text style={styles.challengeTitle} numberOfLines={2}>ALL CLEAR</Text>
        <Text style={styles.challengeDesc}>
          No challenges available for your rank right now. Check back soon, operator.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.challengeCard]}>
      <Text style={styles.challengeKicker}>{'\u26A1'}  TODAY&apos;S CHALLENGE</Text>

      <View style={styles.challengeBodyRow}>
        <View style={styles.challengeTextBlock}>
          <Text style={styles.challengeTitle} numberOfLines={3}>
            {activeChallenge.title}
          </Text>
          <Text style={styles.challengeDesc} numberOfLines={3} ellipsizeMode="tail">
            {activeChallenge.instructions}
          </Text>
        </View>
        <View style={styles.challengeGlowCircle}>
          <Text style={styles.challengeGlowGlyph}>{'\uD83D\uDCAC'}</Text>
        </View>
      </View>

      <View style={styles.challengeBadgeRow}>
        <View style={styles.difficultyPill}>
          <Text style={styles.difficultyPillText}>{activeChallenge.difficulty}</Text>
        </View>
        <Text style={styles.challengeReward}>+{activeChallenge.xpReward} Social Growth</Text>
      </View>

      <SpringPressable
        onPress={() => {
          triggerHaptic();
          onAccept();
        }}
        style={({ pressed }) => [styles.acceptButton, pressed && styles.acceptButtonPressed]}
      >
        <Text style={styles.acceptButtonText}>ACCEPT CHALLENGE</Text>
        <Text style={styles.acceptButtonArrow}>{'\u2192'}</Text>
      </SpringPressable>
    </View>
  );
}

// ---- Home body: operator identity slot (username + bio) --------------------
// Lives in the dashboard body — NOT the top nav logo banner. Binds to the live
// Supabase profile with subtle loading placeholders.
function IdentitySlot() {
  const { profile, isLoading } = useProfile();

  const loading = isLoading || !profile;
  const usernameRaw = profile?.username ?? '';
  const usernameLabel = loading ? '---' : usernameRaw ? withAt(usernameRaw) : '—';
  const bioLabel = loading ? '---' : profile?.bio || 'No bio yet';

  return (
    <View style={[styles.card, styles.identitySlotCard]}>
      <Text style={styles.identitySlotUsername} numberOfLines={1} ellipsizeMode="tail">
        {usernameLabel}
      </Text>
      <Text style={styles.identitySlotBio} numberOfLines={2} ellipsizeMode="tail">
        {bioLabel}
      </Text>
    </View>
  );
}

// ---- Home card: Day Streak tracker -----------------------------------------
function DayStreakCard() {
  const { profile, isLoading } = useProfile();
  const { streakWeek } = useAppContext();

  const loading = isLoading || !profile;
  const streakCount = profile?.streak_count ?? 0;
  const streakLabel = loading ? '---' : String(streakCount);
  const week = computeWeekMarks(streakWeek);

  return (
    <View style={[styles.card, styles.streakCard]}>
      <View style={styles.streakLeft}>
        <Text style={styles.streakFlame}>{'\uD83D\uDD25'}</Text>
        <View>
          <Text style={styles.streakNumber}>{streakLabel}</Text>
          <Text style={styles.streakCaption}>Day Streak</Text>
        </View>
      </View>
      <View style={styles.streakDays}>
        {week.map((state, index) => (
          <View
            key={index}
            style={[styles.dayCircle, state === 'done' && styles.dayCircleDone]}
          >
            <Text
              style={[styles.dayCircleText, state === 'done' && styles.dayCircleTextDone]}
            >
              {WEEKDAY_LABELS[index]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---- Home card: Daily Quote (new structural addition) ----------------------
function DailyQuoteCard() {
  const { dailyQuote, dailyQuoteLoading } = useAppContext();

  const showSkeleton = dailyQuoteLoading && !dailyQuote;
  const text = dailyQuote?.text ?? '---';
  const author = dailyQuote?.author ?? '---';

  return (
    <View style={[styles.card, styles.quoteCard]}>
      <View style={styles.quoteLeafCircle}>
        <Text style={styles.quoteLeafGlyph}>{'\uD83C\uDF31'}</Text>
      </View>
      <View style={styles.quoteTextBlock}>
        {showSkeleton ? (
          <ActivityIndicator color={COLORS.neon} />
        ) : (
          <>
            <Text style={styles.quoteText}>&ldquo;{text}&rdquo;</Text>
            <Text style={styles.quoteAuthor}>&ndash; {author}</Text>
          </>
        )}
      </View>
      <Text style={styles.quoteMountain}>{'\uD83C\uDFD4\uFE0F'}</Text>
    </View>
  );
}

// Human-readable "time left" for a cooldown, e.g. "6h" or "3d".
function formatRemaining(ms: number): string {
  if (ms <= 0) return '0h';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.ceil(ms / 86_400_000)}d`;
}

// Requirement (Point 5): editable username/bio inside Account Overview.
// Every actual write is server-validated (length/charset/uniqueness/cooldown)
// via update_username()/update_bio() — this component only decides what to
// show and disables the button locally as a UX nicety; the database is the
// real gatekeeper, so there is no way to bypass the cooldown or spoof
// someone else's row from here even if this client-side logic were removed.
const USERNAME_COOLDOWN_MS = 7 * 86_400_000;
const BIO_COOLDOWN_MS = 1 * 86_400_000;

function AccountEditSection() {
  const { profile, updateUsername, updateBio } = useProfile();
  const [usernameDraft, setUsernameDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState('');
  const [bioMsg, setBioMsg] = useState('');

  useEffect(() => {
    setUsernameDraft(profile?.username ?? '');
  }, [profile?.username]);
  useEffect(() => {
    setBioDraft(profile?.bio ?? '');
  }, [profile?.bio]);

  if (!profile) {
    return null;
  }

  const usernameChanged = usernameDraft.trim().length > 0 && usernameDraft.trim() !== profile.username;
  const bioChanged = bioDraft.trim() !== profile.bio;

  const usernameCooldownMs = profile.last_username_change_at
    ? new Date(profile.last_username_change_at).getTime() + USERNAME_COOLDOWN_MS - Date.now()
    : 0;
  const bioCooldownMs = profile.last_bio_change_at
    ? new Date(profile.last_bio_change_at).getTime() + BIO_COOLDOWN_MS - Date.now()
    : 0;
  const usernameLocked = usernameCooldownMs > 0;
  const bioLocked = bioCooldownMs > 0;

  const handleSaveUsername = async () => {
    if (!usernameChanged || usernameSaving || usernameLocked) {
      return;
    }
    setUsernameSaving(true);
    setUsernameMsg('');
    const result = await updateUsername(usernameDraft.trim());
    setUsernameMsg(result.ok ? 'Username updated.' : result.error ?? 'Could not update username.');
    setUsernameSaving(false);
  };

  const handleSaveBio = async () => {
    if (!bioChanged || bioSaving || bioLocked) {
      return;
    }
    setBioSaving(true);
    setBioMsg('');
    const result = await updateBio(bioDraft.trim());
    setBioMsg(result.ok ? 'Bio updated.' : result.error ?? 'Could not update bio.');
    setBioSaving(false);
  };

  return (
    <View style={styles.accountEditBlock}>
      <View style={styles.questDivider} />
      <Text style={styles.accountEditLabel}>USERNAME</Text>
      <TextInput
        style={styles.accountEditInput}
        value={usernameDraft}
        onChangeText={setUsernameDraft}
        placeholder="username"
        placeholderTextColor={COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        editable={!usernameSaving}
        keyboardAppearance="dark"
      />
      {usernameLocked ? (
        <Text style={styles.accountEditHint}>
          Next change available in {formatRemaining(usernameCooldownMs)}.
        </Text>
      ) : null}
      {usernameMsg ? <Text style={styles.accountEditHint}>{usernameMsg}</Text> : null}
      <Pressable
        onPress={handleSaveUsername}
        disabled={!usernameChanged || usernameSaving || usernameLocked}
        style={({ pressed }) => [
          styles.primaryButton,
          styles.accountEditSaveButton,
          (!usernameChanged || usernameLocked) && styles.primaryButtonDisabled,
          pressed && styles.primaryButtonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>{usernameSaving ? 'SAVING...' : 'SAVE USERNAME'}</Text>
      </Pressable>

      <View style={styles.questDivider} />

      <Text style={styles.accountEditLabel}>BIO</Text>
      <TextInput
        style={[styles.accountEditInput, styles.accountEditBioInput]}
        value={bioDraft}
        onChangeText={setBioDraft}
        placeholder="Tell other operators a little about yourself..."
        placeholderTextColor={COLORS.muted}
        multiline
        maxLength={220}
        editable={!bioSaving}
        keyboardAppearance="dark"
        textAlignVertical="top"
      />
      <Text style={styles.accountEditCounter}>{bioDraft.trim().length}/220</Text>
      {bioLocked ? (
        <Text style={styles.accountEditHint}>Next change available in {formatRemaining(bioCooldownMs)}.</Text>
      ) : null}
      {bioMsg ? <Text style={styles.accountEditHint}>{bioMsg}</Text> : null}
      <Pressable
        onPress={handleSaveBio}
        disabled={!bioChanged || bioSaving || bioLocked}
        style={({ pressed }) => [
          styles.primaryButton,
          styles.accountEditSaveButton,
          (!bioChanged || bioLocked) && styles.primaryButtonDisabled,
          pressed && styles.primaryButtonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>{bioSaving ? 'SAVING...' : 'SAVE BIO'}</Text>
      </Pressable>
    </View>
  );
}

// Dev/QA-only test-account switcher — compiled out of production builds by
// the __DEV__ guard. Lets a tester sign in as a permanent test operator
// (created via the Supabase dashboard) to verify messaging/community
// features from a second identity. Never touches game-state RPCs; it only
// calls the same signInWithPassword/signOut Supabase Auth APIs.
function DevTestPanel() {
  const { user, isAnonymous, signOut, signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!__DEV__) {
    return null;
  }

  const handleSignIn = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setMsg('');
    const result = await signInWithPassword(email.trim(), password);
    setMsg(result.ok ? 'Signed in as test operator.' : result.error ?? 'Sign-in failed.');
    setBusy(false);
  };

  const handleSignOut = async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
    setMsg('Signed out. Sign in as another test operator below, or restart the app to mint a fresh anonymous session.');
  };

  return (
    <View style={styles.accountEditBlock}>
      <View style={styles.questDivider} />
      <Text style={styles.accountEditLabel}>DEV/QA TEST LOGIN — HIDDEN IN PRODUCTION BUILDS</Text>
      <Text style={styles.accountEditHint}>
        Session: {isAnonymous ? 'anonymous' : 'permanent'} · uid {user?.id?.slice(0, 8) ?? '---'}
      </Text>
      <TextInput
        style={styles.accountEditInput}
        value={email}
        onChangeText={setEmail}
        placeholder="test operator email"
        placeholderTextColor={COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!busy}
        keyboardAppearance="dark"
      />
      <TextInput
        style={styles.accountEditInput}
        value={password}
        onChangeText={setPassword}
        placeholder="password"
        placeholderTextColor={COLORS.muted}
        secureTextEntry
        autoCapitalize="none"
        editable={!busy}
        keyboardAppearance="dark"
      />
      {msg ? <Text style={styles.accountEditHint}>{msg}</Text> : null}
      <Pressable
        onPress={handleSignIn}
        disabled={!email.trim() || !password || busy}
        style={({ pressed }) => [
          styles.primaryButton,
          styles.accountEditSaveButton,
          (!email.trim() || !password) && styles.primaryButtonDisabled,
          pressed && styles.primaryButtonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>{busy ? 'WORKING...' : 'SIGN IN AS TEST OPERATOR'}</Text>
      </Pressable>
      <Pressable
        onPress={handleSignOut}
        disabled={busy}
        style={({ pressed }) => [
          styles.primaryButton,
          styles.accountEditSaveButton,
          styles.cancelButtonAlt,
          pressed && styles.primaryButtonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>SIGN OUT</Text>
      </Pressable>
    </View>
  );
}

// Formats an ISO timestamp into the app's "DD MON YYYY" stamp; empty on parse.
function formatIsoDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : formatDateStamp(d);
}

// Step 4: Home tab now surfaces a Journal nav card (mirroring the Profile
// tab's pattern) instead of dumping every entry's full body text inline.
// Tapping it opens the same shared JournalModal used on Profile.
function HomeJournalNavCard({ onPress }: { onPress: () => void }) {
  const { journalEntries } = useAppContext();

  return (
    <View>
      <SectionHeader label="PERSONAL JOURNAL" />
      <SpringPressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, styles.journalNavCard, pressed && styles.cardPressed]}
      >
        <View style={styles.cardIconBadge}>
          <Text style={styles.cardIconGlyph}>{'\u25A6'}</Text>
        </View>
        <View style={styles.journalNavTextBlock}>
          <Text style={styles.journalNavTitle}>JOURNAL</Text>
          <Text style={styles.journalNavSubtext} numberOfLines={2} ellipsizeMode="tail">
            {journalEntries.length} logged reflections — tap to review or write a new entry.
          </Text>
        </View>
        <Text style={styles.accordionChevron}>{'\u203A'}</Text>
      </SpringPressable>
    </View>
  );
}

function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList, 'Challenges'>>();
  const {
    activeChallenge,
    challengeCompleted,
    lastAwardedXp,
    submitChallenge,
    loadNextChallenge,
  } = useAppContext();
  const { profile } = useProfile();
  const { journalEntries } = useAppContext();
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [questModalVisible, setQuestModalVisible] = useState(false);
  const [vitalsModalVisible, setVitalsModalVisible] = useState(false);
  const [journalVisible, setJournalVisible] = useState(false);

  const streakLabel = profile ? String(profile.streak_count) : '---';
  const socialScoreLabel = profile ? String(profile.social_score) : '---';

  // Pressing the Home tab icon while the verification overlay is open aborts it.
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      setOverlayVisible(false);
    });
    return unsubscribe;
  }, [navigation]);

  const handleSubmit = async (text: string, broadcast: boolean, postTitle: string) => {
    const result = await submitChallenge(text, broadcast, postTitle);
    if (result.ok) {
      setOverlayVisible(false);
    }
    return result;
  };

  const handleLoadAnother = async () => {
    setQuestModalVisible(false);
    await loadNextChallenge();
  };

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  return (
    <View style={styles.screenRoot}>
      <Starfield scrollY={scrollY} />
      <Reanimated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.screenScroll,
          {
            paddingTop: insets.top + HEADER_BRAND_HEIGHT + 16,
            paddingBottom: insets.bottom + 80 + 140,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <IdentitySlot />

        <GrowthStageCard onPressDetails={() => setVitalsModalVisible(true)} />

        {challengeCompleted ? (
          <>
            <View style={[styles.card, styles.missionCompleteCard]}>
              <Text style={styles.challengeKicker}>{'\u2713'}  QUEST CLEARED</Text>
              <Text style={styles.challengeTitle} numberOfLines={2} ellipsizeMode="tail">
                {activeChallenge?.title ?? 'CHALLENGE COMPLETE'}
              </Text>
              <View style={styles.growthDivider} />
              <Text style={styles.bodyText}>
                +{lastAwardedXp} Social Score awarded. Current streak: {streakLabel} days.
              </Text>
            </View>

            {/* Step 3: unlimited daily challenges — load the next uncompleted one. */}
            <SpringPressable
              onPress={handleLoadAnother}
              style={({ pressed }) => [
                styles.acceptButton,
                styles.acceptButtonStandalone,
                pressed && styles.acceptButtonPressed,
              ]}
            >
              <Text style={styles.acceptButtonText}>LOAD NEXT CHALLENGE</Text>
              <Text style={styles.acceptButtonArrow}>{'\u27F3'}</Text>
            </SpringPressable>
          </>
        ) : (
          <TodayChallengeCard onAccept={() => setQuestModalVisible(true)} />
        )}

        <DayStreakCard />

        <DailyQuoteCard />

        <HomeJournalNavCard onPress={() => setJournalVisible(true)} />
      </Reanimated.ScrollView>

      <AppHeader />

      <JournalModal
        visible={journalVisible}
        onClose={() => setJournalVisible(false)}
        journals={journalEntries}
      />

      <VerificationOverlay
        visible={overlayVisible}
        onClose={() => setOverlayVisible(false)}
        onSubmit={handleSubmit}
      />

      <QuestDetailModal
        visible={questModalVisible}
        challenge={activeChallenge}
        onClose={() => setQuestModalVisible(false)}
        onSecureQuest={() => {
          setQuestModalVisible(false);
          setOverlayVisible(true);
        }}
      />

      <InfoPopupModal
        visible={vitalsModalVisible}
        onClose={() => setVitalsModalVisible(false)}
        title="SCORE BREAKDOWN"
      >
        <Text style={styles.bodyText}>
          Unbroken Streak counts consecutive calendar days on which you complete at least one
          challenge. Completing multiple challenges in the same day only counts once — current
          streak: {streakLabel} days.
        </Text>
        <View style={styles.questDivider} />
        <Text style={styles.bodyText}>
          Social Score is your single progression metric. Every verified challenge submission
          awards its listed XP — current total: {socialScoreLabel}.
        </Text>
      </InfoPopupModal>
    </View>
  );
}

// ============================================================================
// TAB 2 — COMMUNITY (ACTION REPORT TIMELINE)
// ============================================================================

// Relative "Xm/Xh/Xd ago" stamp from an ISO timestamp; falls back to a date.
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) {
    return '';
  }
  const diffMin = Math.floor((Date.now() - t) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatIsoDate(iso);
}

function FeedCard({
  post,
  onPressHandle,
  onPressPost,
  onToggleLike,
}: {
  post: CommunityPost;
  onPressHandle: (post: CommunityPost) => void;
  onPressPost: (post: CommunityPost) => void;
  onToggleLike: (postId: string) => void;
}) {
  const replyCountLabel =
    post.replyCount === 0
      ? 'No replies yet'
      : `${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'}`;

  return (
    <SpringPressable
      onPress={() => onPressPost(post)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.feedTopRow}>
        <Avatar handle={post.authorUsername} size={32} />
        <Pressable onPress={() => onPressHandle(post)} style={styles.handlePressable} hitSlop={8}>
          <Text style={styles.feedHandle} numberOfLines={1} ellipsizeMode="tail">
            {post.authorUsername}
          </Text>
        </Pressable>
        <Text style={styles.feedLevelTag} numberOfLines={1}>
          [{post.authorRank.toUpperCase()}]
        </Text>
        <Text style={styles.feedTimestamp} numberOfLines={1} ellipsizeMode="tail">
          {relativeTime(post.createdAt)}
        </Text>
      </View>

      <Text style={styles.feedTitle} numberOfLines={2} ellipsizeMode="tail">
        {post.title}
      </Text>

      {post.tag ? (
        <View style={styles.postTagPill}>
          <Text style={styles.postTagPillText}>{post.tag.toUpperCase()}</Text>
        </View>
      ) : null}

      <Text style={styles.bodyText}>{post.body}</Text>

      <View style={styles.feedBottomRow}>
        <Pressable onPress={() => onToggleLike(post.id)} style={styles.likeButton} hitSlop={8}>
          <Text style={[styles.likeIcon, post.liked && styles.likeIconActive]}>
            {post.liked ? '\u2665' : '\u2661'}
          </Text>
          <Text style={[styles.likeCountText, post.liked && styles.likeCountTextActive]}>
            {post.likeCount}
          </Text>
        </Pressable>

        <Text style={styles.replyCountText} numberOfLines={1} ellipsizeMode="tail">
          {replyCountLabel}
        </Text>

        <View style={styles.viewCountWrap}>
          <Text style={styles.viewCountIcon}>{'\u25C9'}</Text>
          <Text style={styles.viewCountText}>{post.viewCount}</Text>
        </View>
      </View>
    </SpringPressable>
  );
}

// Step 6.1: inspecting an operator exposes a "Message" action (find/create a
// 1:1 chat). Also offers a user-level Block (Step 5.4b).
function InspectProfileModal({
  post,
  currentUserId,
  onClose,
  onMessage,
  onBlock,
}: {
  post: CommunityPost | null;
  currentUserId: string | null;
  onClose: () => void;
  onMessage: (post: CommunityPost) => void;
  onBlock: (post: CommunityPost) => void;
}) {
  if (!post) {
    return null;
  }

  const isSelf = post.userId === currentUserId;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <View pointerEvents="box-none" style={styles.centeredCardWrap}>
          <View style={styles.centeredCard}>
            <ScrollView
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.centeredCardScrollContentAlignCenter}
            >
              <View style={styles.inspectAvatar}>
                <Text style={styles.inspectAvatarText}>
                  {post.authorUsername.replace('@', '').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.inspectHandle} numberOfLines={1} ellipsizeMode="tail">
                {post.authorUsername}
              </Text>
              <Text style={styles.inspectLevel}>RANK — {post.authorRank.toUpperCase()}</Text>
              <View style={styles.inspectDivider} />
              <Text style={styles.inspectSubtext}>
                {post.authorBio.trim()
                  ? post.authorBio
                  : 'Operators grow through real-world reps — the grid does not rank operators ' +
                    'against each other.'}
              </Text>

              {!isSelf ? (
                <Pressable
                  onPress={() => onMessage(post)}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.inspectCloseButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>{'\uD83D\uDCAC'}  MESSAGE</Text>
                </Pressable>
              ) : null}

              {!isSelf ? (
                <Pressable
                  onPress={() => onBlock(post)}
                  style={({ pressed }) => [styles.dangerButton, pressed && styles.cardPressed]}
                >
                  <Text style={styles.dangerButtonText}>{'\u2298'}  BLOCK OPERATOR</Text>
                </Pressable>
              ) : null}

              <Pressable onPress={onClose} style={styles.abortButton}>
                <Text style={styles.abortButtonText}>CLOSE DOSSIER</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Step 5.4a: reason picker for reporting content.
function ReportModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  if (!visible) {
    return null;
  }
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <View pointerEvents="box-none" style={styles.centeredCardWrap}>
          <View style={styles.centeredCard}>
            <SectionHeader label="REPORT CONTENT" centered />
            <Text style={styles.bodyText}>
              Select a reason. Our team reviews every report and takes action on violations.
            </Text>
            <View style={styles.reportReasonList}>
              {REPORT_REASONS.map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => onSubmit(reason)}
                  style={({ pressed }) => [styles.reportReasonRow, pressed && styles.cardPressed]}
                >
                  <Text style={styles.reportReasonText}>{reason}</Text>
                  <Text style={styles.accordionChevron}>{'\u203A'}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={onClose} style={styles.abortButton}>
              <Text style={styles.abortButtonText}>CANCEL</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PostDetailModal({
  post,
  currentUserId,
  onClose,
  onToggleLike,
  onReport,
  onBlock,
  onReplyCountChange,
}: {
  post: CommunityPost | null;
  currentUserId: string | null;
  onClose: () => void;
  onToggleLike: (postId: string) => void;
  onReport: (post: CommunityPost, reason: string) => void;
  onBlock: (post: CommunityPost) => void;
  onReplyCountChange: (postId: string, count: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [replyText, setReplyText] = useState('');
  const [replies, setReplies] = useState<PostReplyRow[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [sending, setSending] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [replyError, setReplyError] = useState('');

  const postId = post?.id ?? null;

  useEffect(() => {
    if (!postId) {
      setReplyText('');
      setReplies([]);
      setReplyError('');
      return;
    }
    let mounted = true;
    setLoadingReplies(true);
    (async () => {
      const rows = await fetchReplies(postId);
      if (mounted) {
        setReplies(rows);
        setLoadingReplies(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [postId]);

  if (!post) {
    return null;
  }

  // Server-side minimum (10 chars, enforced by a database trigger) is
  // mirrored here only so the button disables sensibly.
  const canSubmit = replyText.trim().length >= 10 && !sending;
  const isOwnPost = post.userId === currentUserId;

  const handleSend = async () => {
    if (!canSubmit || !currentUserId) {
      return;
    }
    setSending(true);
    setReplyError('');
    const text = replyText.trim();
    setReplyText('');
    const result = await addReplyDb(post.id, currentUserId, text);
    if (result.ok) {
      const rows = await fetchReplies(post.id);
      setReplies(rows);
      // Keep the feed card's badge (and "No replies yet" text) in sync the
      // instant a reply lands, instead of only on the modal's own state.
      onReplyCountChange(post.id, rows.length);
    } else {
      setReplyText(text);
      setReplyError(result.error ?? 'Could not post reply. Try again.');
    }
    setSending(false);
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.overlayFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <View
            pointerEvents="box-none"
            style={[
              styles.overlayInner,
              { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.overlayScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={onClose} style={styles.abortButton}>
                <Text style={styles.abortButtonText}>{'\u2715'}  CLOSE REPORT</Text>
              </Pressable>

              <View style={styles.overlayCard}>
                <View style={styles.feedTopRow}>
                  <Avatar handle={post.authorUsername} size={32} />
                  <Text style={styles.feedHandle} numberOfLines={1} ellipsizeMode="tail">
                    {post.authorUsername}
                  </Text>
                  <Text style={styles.feedLevelTag} numberOfLines={1}>
                    [{post.authorRank.toUpperCase()}]
                  </Text>
                  <Text style={styles.feedTimestamp} numberOfLines={1} ellipsizeMode="tail">
                    {relativeTime(post.createdAt)}
                  </Text>
                </View>
                <Text style={styles.feedTitle} numberOfLines={2} ellipsizeMode="tail">
                  {post.title}
                </Text>
                {post.tag ? (
                  <View style={styles.postTagPill}>
                    <Text style={styles.postTagPillText}>{post.tag.toUpperCase()}</Text>
                  </View>
                ) : null}
                <Text style={styles.bodyText}>{post.body}</Text>

                <View style={styles.feedBottomRow}>
                  <Pressable onPress={() => onToggleLike(post.id)} style={styles.likeButton} hitSlop={8}>
                    <Text style={[styles.likeIcon, post.liked && styles.likeIconActive]}>
                      {post.liked ? '\u2665' : '\u2661'}
                    </Text>
                    <Text style={[styles.likeCountText, post.liked && styles.likeCountTextActive]}>
                      {post.likeCount}
                    </Text>
                  </Pressable>
                  <View style={styles.viewCountWrap}>
                    <Text style={styles.viewCountIcon}>{'\u25C9'}</Text>
                    <Text style={styles.viewCountText}>{post.viewCount} views</Text>
                  </View>
                </View>

                {/* Step 5.4: moderation controls (hidden on your own post). */}
                {!isOwnPost ? (
                  <View style={styles.moderationRow}>
                    <Pressable
                      onPress={() => setReportVisible(true)}
                      style={({ pressed }) => [styles.moderationBtn, pressed && styles.cardPressed]}
                    >
                      <Text style={styles.moderationBtnText}>{'\u26A0'}  REPORT</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onBlock(post)}
                      style={({ pressed }) => [styles.moderationBtn, pressed && styles.cardPressed]}
                    >
                      <Text style={styles.moderationBtnText}>{'\u2298'}  BLOCK</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <SectionHeader label={`REPLIES (${replies.length})`} />

              {loadingReplies ? (
                <View style={styles.overlayCard}>
                  <ActivityIndicator color={COLORS.neon} />
                </View>
              ) : replies.length === 0 ? (
                <View style={styles.overlayCard}>
                  <Text style={styles.bodyText}>
                    No replies yet. Be the first to reinforce this operator.
                  </Text>
                </View>
              ) : (
                replies.map((reply) => (
                  <View key={reply.id} style={styles.replyCard}>
                    <View style={styles.replyHeaderRow}>
                      <View style={styles.replyHandleRow}>
                        <Avatar handle={withAt(reply.author_username)} size={22} />
                        <Text style={styles.replyHandle} numberOfLines={1} ellipsizeMode="tail">
                          {withAt(reply.author_username)}
                        </Text>
                      </View>
                      <Text style={styles.feedTimestamp} numberOfLines={1}>
                        {relativeTime(reply.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.bodyText}>{reply.content}</Text>
                  </View>
                ))
              )}

              <View style={styles.overlayCard}>
                <SectionHeader label="SEND A SUPPORT REPLY" />
                <TextInput
                  style={styles.replyInput}
                  multiline
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Back this operator up with a direct, honest reply..."
                  placeholderTextColor={COLORS.muted}
                  textAlignVertical="top"
                  keyboardAppearance="dark"
                  editable={!sending}
                />
              </View>

              {replyError ? <Text style={styles.errorText}>{replyError}</Text> : null}

              <View
                pointerEvents={canSubmit ? 'auto' : 'none'}
                style={{ opacity: canSubmit ? 1 : 0.4 }}
              >
                <Pressable
                  onPress={handleSend}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    !canSubmit && styles.primaryButtonDisabled,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>
                    {sending ? 'SENDING...' : '\u27A4  SEND SUPPORT REPLY'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={(reason) => {
          setReportVisible(false);
          onReport(post, reason);
        }}
      />
    </Modal>
  );
}

function CreatePostModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string, body: string, tag: PostTag | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tag, setTag] = useState<PostTag | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!visible) {
      setTitle('');
      setBody('');
      setTag(null);
      setSubmitting(false);
      setErrorText('');
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  // Server-side minimums (title 3+, body 20+, enforced by a database
  // trigger) are mirrored here only so the button disables sensibly — the
  // real, unbypassable rule lives in Postgres, not in this check.
  const canSubmit = title.trim().length >= 3 && body.trim().length >= 20 && !submitting;

  const handlePost = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setErrorText('');
    const result = await onSubmit(title.trim(), body.trim(), tag);
    if (result.ok) {
      onClose();
    } else {
      setErrorText(result.error ?? 'Could not post. Try again.');
    }
    setSubmitting(false);
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.overlayFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <View
            pointerEvents="box-none"
            style={[
              styles.overlayInner,
              { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.overlayScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>{'\u2715'}  CANCEL — DISCARD POST</Text>
              </Pressable>

              <Text style={styles.overlayHeader}>
                [ BROADCAST: Publish a standalone field note to the global grid.
                No challenge completion required. ]
              </Text>

              <View style={styles.overlayCard}>
                <SectionHeader label="POST TITLE" />
                <TextInput
                  style={styles.titleInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Give your field note a clear, direct title..."
                  placeholderTextColor={COLORS.muted}
                  keyboardAppearance="dark"
                />
              </View>

              <View style={styles.overlayCard}>
                <SectionHeader label="POST BODY" />
                <TextInput
                  style={styles.verificationInput}
                  multiline
                  value={body}
                  onChangeText={setBody}
                  placeholder="Share what's on your mind with the grid..."
                  placeholderTextColor={COLORS.muted}
                  textAlignVertical="top"
                  keyboardAppearance="dark"
                  editable={!submitting}
                />
              </View>

              <View style={styles.overlayCard}>
                <SectionHeader label="TAG (OPTIONAL)" />
                <View style={styles.tagPickerRow}>
                  {POST_TAGS.map((t) => {
                    const selected = tag === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setTag(selected ? null : t)}
                        style={[styles.tagChip, selected && styles.tagChipSelected]}
                      >
                        <Text style={[styles.tagChipText, selected && styles.tagChipTextSelected]}>
                          {t}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

              <View
                pointerEvents={canSubmit ? 'auto' : 'none'}
                style={{ opacity: canSubmit ? 1 : 0.4 }}
              >
                <Pressable
                  onPress={handlePost}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    !canSubmit && styles.primaryButtonDisabled,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>
                    {submitting ? 'PUBLISHING…' : `${'\u27A4'}  PUBLISH TO GRID`}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile } = useProfile();
  const currentUserId = user?.id ?? null;
  const {
    communityFeed,
    feedLoading,
    refreshFeed,
    likePost,
    reportPost,
    blockAuthor,
    registerView,
    createPost,
    setReplyCount,
  } = useAppContext();
  const { openChatWith } = useMessaging();
  const [inspectedPost, setInspectedPost] = useState<CommunityPost | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [createPostVisible, setCreatePostVisible] = useState(false);

  // Re-derive the open post from the live feed each render so the modal
  // reflects newly added likes/counts immediately.
  const activeOpenPost = openPostId
    ? communityFeed.find((post) => post.id === openPostId) ?? null
    : null;

  const rankLabel = profile?.rank_title ? `RANK: ${profile.rank_title.toUpperCase()}` : 'RANK: ---';

  // Step 5.2: register a view for the current user exactly once per post per
  // session (server dedups permanently); repeat opens never re-fire.
  const viewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (openPostId && !viewedRef.current.has(openPostId)) {
      viewedRef.current.add(openPostId);
      registerView(openPostId);
    }
  }, [openPostId, registerView]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  return (
    <View style={styles.screenRoot}>
      <Starfield scrollY={scrollY} />
      <Reanimated.FlatList
        data={communityFeed}
        keyExtractor={(item) => item.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        onRefresh={refreshFeed}
        refreshing={feedLoading}
        contentContainerStyle={[
          styles.screenScroll,
          {
            paddingTop: insets.top + HEADER_BRAND_HEIGHT + 16,
            paddingBottom: insets.bottom + 80 + 140,
          },
        ]}
        ListHeaderComponent={
          <View>
            <TierBanner label={rankLabel} />
            <SectionHeader label="ACTION REPORT TIMELINE" />
          </View>
        }
        ListEmptyComponent={
          feedLoading ? (
            <ActivityIndicator color={COLORS.neon} style={styles.messagesSpinner} />
          ) : (
            <View style={styles.card}>
              <Text style={styles.bodyText}>
                The grid is quiet. Complete a challenge and broadcast it to start the timeline.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <FeedCard
            post={item}
            onPressHandle={setInspectedPost}
            onPressPost={(post) => setOpenPostId(post.id)}
            onToggleLike={likePost}
          />
        )}
      />

      <AppHeader />

      <SpringPressable
        onPress={() => setCreatePostVisible(true)}
        containerStyle={[styles.fabContainer, { bottom: insets.bottom + 80 + 24 }]}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabLabel}>NEW POST</Text>
      </SpringPressable>

      <InspectProfileModal
        post={inspectedPost}
        currentUserId={currentUserId}
        onClose={() => setInspectedPost(null)}
        onMessage={(post) => {
          setInspectedPost(null);
          openChatWith(post.userId, post.authorUsername, post.authorRank);
        }}
        onBlock={(post) => {
          setInspectedPost(null);
          blockAuthor(post.userId);
        }}
      />

      <PostDetailModal
        post={activeOpenPost}
        currentUserId={currentUserId}
        onClose={() => setOpenPostId(null)}
        onToggleLike={likePost}
        onReport={(post, reason) => reportPost(post.id, post.userId, reason)}
        onBlock={(post) => {
          setOpenPostId(null);
          blockAuthor(post.userId);
        }}
        onReplyCountChange={setReplyCount}
      />

      <CreatePostModal
        visible={createPostVisible}
        onClose={() => setCreatePostVisible(false)}
        onSubmit={(title, body, tag) => createPost(title, body, tag)}
      />
    </View>
  );
}

// ============================================================================
// TAB 3 — PROFILE & DEDICATED JOURNAL ARCHIVE
// ============================================================================

// Requirement (Point 10/12): each personal log entry is its own clickable
// accordion — collapsed shows a truncated preview, tapping reveals the full
// reflection. No social features (likes/views/replies) here by design.
function JournalEntryCard({
  entry,
  expanded,
  onToggle,
}: {
  entry: JournalItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.journalMetaRow}>
        <Text style={styles.journalDate} numberOfLines={1} ellipsizeMode="tail">
          {formatIsoDate(entry.createdAt)}
        </Text>
        {entry.challengeTitle ? (
          <Text style={styles.journalTier} numberOfLines={1} ellipsizeMode="tail">
            {entry.challengeTitle}
          </Text>
        ) : null}
      </View>
      {entry.title ? (
        <Text style={styles.journalEntryTitle} numberOfLines={1} ellipsizeMode="tail">
          {entry.title}
        </Text>
      ) : null}
      <View style={styles.questDivider} />
      <Text style={styles.bodyText} numberOfLines={expanded ? undefined : 3} ellipsizeMode="tail">
        {entry.content}
      </Text>
      <Text style={styles.tapHintText}>{expanded ? 'TAP TO COLLAPSE' : 'TAP TO EXPAND'}</Text>
    </Pressable>
  );
}

// Requirement (Point 6): dedicated Journal screen mirroring the clean
// layout of the Community feed — chronological entries with a true
// infinite-scroll archive loader (FlatList + onEndReached) and per-entry
// expansion — with zero social features (no likes/views/replies).
// Free-form personal journal entry — no challenge required. Same anti-spam
// validation as the challenge readout (60 char min, word/character
// diversity checks) and the same submit-cooldown pattern; the write itself
// is routed through add_journal_entry(), a SECURITY DEFINER RPC, since the
// journal_entries table grants zero direct client writes.
function NewJournalEntryModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { addPersonalJournalEntry } = useAppContext();
  const [titleText, setTitleText] = useState('');
  const [entryText, setEntryText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const cooldownAnim = useRef(new Animated.Value(0)).current;

  const analysis = analyzeJournalEntry(entryText);
  const isValid = analysis.valid;
  const canSubmit = isValid && !submitting;

  useEffect(() => {
    if (!visible) {
      setTitleText('');
      setEntryText('');
      setSubmitting(false);
      setErrorText('');
      cooldownAnim.setValue(0);
    }
  }, [visible, cooldownAnim]);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setErrorText('');
    cooldownAnim.setValue(0);
    Animated.timing(cooldownAnim, {
      toValue: 1,
      duration: SUBMIT_COOLDOWN_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    const result = await addPersonalJournalEntry(entryText.trim(), titleText.trim());
    if (result.ok) {
      onClose();
    } else {
      setErrorText(result.error ?? 'Could not save entry. Try again.');
    }
    setTimeout(() => setSubmitting(false), SUBMIT_COOLDOWN_MS);
  };

  if (!visible) {
    return null;
  }

  const cooldownWidth = cooldownAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.overlayFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <View
            pointerEvents="box-none"
            style={[
              styles.overlayInner,
              { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.overlayScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>{'\u2715'}  CANCEL — DISCARD ENTRY</Text>
              </Pressable>

              <SectionHeader label="NEW PERSONAL LOG" centered />

              <View style={styles.overlayCard}>
                <Text style={styles.broadcastTitleLabel}>TITLE (OPTIONAL)</Text>
                <TextInput
                  style={styles.titleInput}
                  value={titleText}
                  onChangeText={setTitleText}
                  placeholder="Give this entry a title..."
                  placeholderTextColor={COLORS.muted}
                  maxLength={80}
                  editable={!submitting}
                  keyboardAppearance="dark"
                />
              </View>

              <View style={styles.overlayCard}>
                <TextInput
                  style={styles.verificationInput}
                  multiline
                  value={entryText}
                  onChangeText={setEntryText}
                  placeholder="Write a private reflection — no challenge required..."
                  placeholderTextColor={COLORS.muted}
                  textAlignVertical="top"
                  keyboardAppearance="dark"
                  editable={!submitting}
                />
                <Text style={[styles.charCounter, isValid && styles.charCounterValid]}>
                  {analysis.status}
                </Text>
              </View>

              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

              <View
                pointerEvents={canSubmit ? 'auto' : 'none'}
                style={{ opacity: isValid ? 1 : 0.4 }}
              >
                <Pressable
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.submitCooldownButton,
                    !isValid && styles.primaryButtonDisabled,
                    pressed && !submitting && styles.primaryButtonPressed,
                  ]}
                >
                  {submitting ? (
                    <Animated.View style={[styles.submitCooldownFill, { width: cooldownWidth }]} />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {submitting ? 'SAVING...' : '\u25C6  SAVE TO JOURNAL'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function JournalModal({
  visible,
  onClose,
  journals,
}: {
  visible: boolean;
  onClose: () => void;
  journals: JournalItem[];
}) {
  const insets = useSafeAreaInsets();
  const [visibleCount, setVisibleCount] = useState(JOURNAL_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(new Set());
  const [newEntryVisible, setNewEntryVisible] = useState(false);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setVisibleCount(JOURNAL_PAGE_SIZE);
      setExpandedEntryIds(new Set());
      setLoadingMore(false);
      setNewEntryVisible(false);
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    }
  }, [visible]);

  useEffect(
    () => () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    },
    [],
  );

  if (!visible) {
    return null;
  }

  const visibleJournals = journals.slice(0, visibleCount);
  const hasMore = visibleCount < journals.length;

  const handleEndReached = () => {
    if (loadingMore || !hasMore) {
      return;
    }
    setLoadingMore(true);
    loadTimeoutRef.current = setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + JOURNAL_PAGE_SIZE, journals.length));
      setLoadingMore(false);
    }, JOURNAL_LOAD_DELAY_MS);
  };

  const toggleEntry = (id: string) => {
    setExpandedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} />
        <View
          pointerEvents="box-none"
          style={[
            styles.overlayInner,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <FlatList
            data={visibleJournals}
            keyExtractor={(item) => item.id}
            style={styles.overlayFlex}
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.overlayScrollContent}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={
              <View>
                <Pressable onPress={onClose} style={styles.abortButton}>
                  <Text style={styles.abortButtonText}>{'\u2715'}  CLOSE JOURNAL</Text>
                </Pressable>
                <Pressable
                  onPress={() => setNewEntryVisible(true)}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.newEntryButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>{'+'}  NEW JOURNAL ENTRY</Text>
                </Pressable>
                <SectionHeader label="PERSONAL LOG — TIMELINE ARCHIVE" centered />
              </View>
            }
            renderItem={({ item }) => (
              <JournalEntryCard
                entry={item}
                expanded={expandedEntryIds.has(item.id)}
                onToggle={() => toggleEntry(item.id)}
              />
            )}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.journalLoadingFooter}>
                  <ActivityIndicator color={COLORS.neon} />
                  <Text style={styles.journalLoadingText}>Loading archive...</Text>
                </View>
              ) : !hasMore && visibleJournals.length > 0 ? (
                <Text style={styles.journalEndText}>[ END OF ARCHIVE ]</Text>
              ) : null
            }
          />
        </View>
      </View>

      <NewJournalEntryModal visible={newEntryVisible} onClose={() => setNewEntryVisible(false)} />
    </Modal>
  );
}

function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { journalEntries } = useAppContext();
  const { profile, isLoading: profileLoading } = useProfile();
  const [journalVisible, setJournalVisible] = useState(false);
  const [identityModalVisible, setIdentityModalVisible] = useState(false);
  const [socialModalVisible, setSocialModalVisible] = useState(false);

  const loading = profileLoading || !profile;
  const socialScoreLabel = loading ? '---' : String(profile.social_score);
  const streakLabel = loading ? '---' : String(profile.streak_count);
  const rankTitle = loading ? 'Starter' : profile.rank_title || 'Starter';
  const usernameRaw = profile?.username ?? '';
  const handleLabel = loading
    ? '---'
    : usernameRaw
      ? withAt(usernameRaw)
      : '—';

  const initials = usernameRaw
    .replace('@', '')
    .split(/[_\s]/)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2) || 'OP';

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  return (
    <View style={styles.screenRoot}>
      <Starfield scrollY={scrollY} />
      <Reanimated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.screenScroll,
          {
            paddingTop: insets.top + HEADER_BRAND_HEIGHT + 16,
            paddingBottom: insets.bottom + 80 + 140,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <TierBanner label={`RANK: ${rankTitle.toUpperCase()}`} />

        {/* Every informational section is an interactive card with haptic
            feedback that opens a popup with deeper detail. */}
        <SpringPressable
          onPress={() => {
            triggerHaptic();
            setIdentityModalVisible(true);
          }}
          style={({ pressed }) => [styles.card, styles.identityCard, pressed && styles.cardPressed]}
        >
          <View style={styles.avatarBlock}>
            <View style={styles.avatarSheen} />
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.identityHandle} numberOfLines={1} ellipsizeMode="tail">
            {handleLabel}
          </Text>
          <View style={styles.streakBadge}>
            <Text style={styles.streakBadgeText}>
              {'\u25B2'} STREAK: {streakLabel} DAYS UNBROKEN
            </Text>
          </View>
          <Text style={styles.tapHintText}>TAP FOR ACCOUNT OVERVIEW</Text>
        </SpringPressable>

        <View style={styles.attributesGrid}>
          <SpringPressable
            onPress={() => {
              triggerHaptic();
              setSocialModalVisible(true);
            }}
            containerStyle={styles.gridBlockContainer}
            style={({ pressed }) => [styles.card, styles.gridBlock, pressed && styles.cardPressed]}
          >
            <Text style={styles.gridHeader} numberOfLines={2} ellipsizeMode="tail">
              SOCIAL FITNESS SCORE
            </Text>
            <Text style={styles.gridScore}>{socialScoreLabel}</Text>
            <Text style={styles.gridSubtext}>
              Points accumulated via real-world social friction and community support.
            </Text>
          </SpringPressable>
        </View>

        <SectionHeader label="PERSONAL RECORDS" />
        <SpringPressable
          onPress={() => {
            triggerHaptic();
            setJournalVisible(true);
          }}
          style={({ pressed }) => [styles.card, styles.journalNavCard, pressed && styles.cardPressed]}
        >
          <View style={styles.cardIconBadge}>
            <Text style={styles.cardIconGlyph}>{'\u25A6'}</Text>
          </View>
          <View style={styles.journalNavTextBlock}>
            <Text style={styles.journalNavTitle}>JOURNAL</Text>
            <Text style={styles.journalNavSubtext} numberOfLines={2} ellipsizeMode="tail">
              {journalEntries.length} logged reflections — tap to review your timeline archive.
            </Text>
          </View>
          <Text style={styles.accordionChevron}>{'\u203A'}</Text>
        </SpringPressable>
      </Reanimated.ScrollView>

      <AppHeader />

      <JournalModal
        visible={journalVisible}
        onClose={() => setJournalVisible(false)}
        journals={journalEntries}
      />

      <InfoPopupModal
        visible={identityModalVisible}
        onClose={() => setIdentityModalVisible(false)}
        title="ACCOUNT OVERVIEW"
      >
        <Text style={styles.bodyText}>
          Operator {handleLabel} currently holds the {rankTitle} rank with an unbroken streak of{' '}
          {streakLabel} days. Every verified challenge feeds directly into the single Social Score
          below.
        </Text>
        <AccountEditSection />
        <DevTestPanel />
      </InfoPopupModal>

      <InfoPopupModal
        visible={socialModalVisible}
        onClose={() => setSocialModalVisible(false)}
        title="SOCIAL SCORE BREAKDOWN"
      >
        <Text style={styles.bodyText}>
          Your single progression metric. Points accumulate via real-world social friction and
          direct peer reinforcement — every verified challenge submission awards its listed XP.
          Current total: {socialScoreLabel}.
        </Text>
      </InfoPopupModal>
    </View>
  );
}

// ============================================================================
// TAB 2 — PROGRESS (GROWTH ANALYTICS & COMPLETION ARCHIVE)
// New tab. Reads exclusively from existing state — live scores, streak,
// level, journal completion logs, and broadcast posts. Also hosts the
// System Lock status card/modal (relocated from Home) so that feature is
// preserved. No new mechanics introduced.
// ============================================================================

function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { journalEntries, completedCount } = useAppContext();
  const { profile, isLoading: profileLoading } = useProfile();
  const [lockModalVisible, setLockModalVisible] = useState(false);

  const loading = profileLoading || !profile;
  const socialScore = profile?.social_score ?? 0;
  // Step 6.3 live bindings.
  const rankTitle = loading ? 'Starter' : profile?.rank_title || 'Starter';
  const { ratio: socialRatio, target: nextRankTarget } = computeRankProgress(rankTitle, socialScore);
  const socialScoreLabel = loading ? '---' : String(socialScore);
  const socialTargetLabel = nextRankTarget === null ? 'MAX' : String(nextRankTarget);
  const socialPctLabel = loading
    ? '---'
    : nextRankTarget === null
      ? 'Max rank reached'
      : `${Math.round(socialRatio * 100)}% to next tier`;
  const streakLabel = loading ? '---' : String(profile.streak_count);
  const questsCompletedLabel = loading ? '---' : String(completedCount);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  return (
    <View style={styles.screenRoot}>
      <Starfield scrollY={scrollY} />
      <Reanimated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.screenScroll,
          {
            paddingTop: insets.top + HEADER_BRAND_HEIGHT + 16,
            paddingBottom: insets.bottom + 80 + 140,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SectionHeader label="GROWTH ANALYTICS" />
        <View style={[styles.card, styles.growthCard]}>
          <View style={styles.progressMetricHeaderRow}>
            <Text style={styles.growthMetricLabel}>SOCIAL GROWTH</Text>
            <Text style={styles.progressMetricValue}>
              {socialScoreLabel}
              <Text style={styles.growthMetricMax}> / {socialTargetLabel}</Text>
            </Text>
          </View>
          <ProgressBar ratio={loading ? 0 : socialRatio} />
          <Text style={styles.progressMetricPct}>{socialPctLabel}</Text>
        </View>

        <SectionHeader label="MILESTONES" />
        <View style={styles.card}>
          <View style={styles.vitalsRow}>
            <Text style={styles.vitalsLabel}>GROWTH STAGE / RANK</Text>
            <Text style={styles.vitalsValue}>{rankTitle.toUpperCase()}</Text>
          </View>
          <View style={styles.vitalsRow}>
            <Text style={styles.vitalsLabel}>UNBROKEN STREAK</Text>
            <Text style={styles.vitalsValue}>{streakLabel} DAYS</Text>
          </View>
          <View style={[styles.vitalsRow, styles.vitalsRowLast]}>
            <Text style={styles.vitalsLabel}>QUESTS COMPLETED</Text>
            <Text style={styles.vitalsValue}>{questsCompletedLabel}</Text>
          </View>
        </View>

        <SystemLockPreviewCard
          onPress={() => {
            triggerHaptic();
            setLockModalVisible(true);
          }}
        />

        <SectionHeader label="COMPLETED QUEST ARCHIVE" />
        {journalEntries.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.bodyText}>
              No completed quests logged yet. Clear a challenge to start your archive.
            </Text>
          </View>
        ) : (
          journalEntries.map((entry) => (
            <View key={entry.id} style={styles.card}>
              <View style={styles.journalMetaRow}>
                <Text style={styles.journalDate}>{formatIsoDate(entry.createdAt)}</Text>
                {entry.challengeTitle ? (
                  <Text style={styles.journalTier} numberOfLines={1} ellipsizeMode="tail">
                    {entry.challengeTitle}
                  </Text>
                ) : null}
              </View>
              {entry.title ? (
                <Text style={styles.journalEntryTitle} numberOfLines={1} ellipsizeMode="tail">
                  {entry.title}
                </Text>
              ) : null}
              <View style={styles.growthDivider} />
              <Text style={styles.bodyText} numberOfLines={3} ellipsizeMode="tail">
                {entry.content}
              </Text>
            </View>
          ))
        )}
      </Reanimated.ScrollView>

      <AppHeader />

      <SystemLockModal visible={lockModalVisible} onClose={() => setLockModalVisible(false)} />
    </View>
  );
}

// ============================================================================
// SECTION 4 — NAVIGATION SHELL (CUSTOM BOTTOM TABS)
// ============================================================================

type RootTabParamList = {
  Challenges: undefined;
  Progress: undefined;
  Community: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// Monochrome, tintable unicode glyphs so the active tab can render in
// high-voltage neon green while inactive tabs stay muted sage.
const TAB_GLYPHS: Record<keyof RootTabParamList, string> = {
  Challenges: '\u2302', // ⌂ home
  Progress: '\u2637', // ☷ analytics bars
  Community: '\u25A4', // ▤ community
  Profile: '\u25A3', // ▣ profile
};

const TAB_LABELS: Record<keyof RootTabParamList, string> = {
  Challenges: 'Home',
  Progress: 'Progress',
  Community: 'Community',
  Profile: 'Profile',
};

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>{glyph}</Text>;
}

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.tabLabelWrap}>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.tabDot, focused && styles.tabDotActive]} />
    </View>
  );
}

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: COLORS.canvas,
    card: COLORS.surface,
    border: COLORS.border,
    text: COLORS.body,
    primary: COLORS.neon,
  },
};

function RootTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.neon,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: COLORS.headerBg,
          borderTopWidth: 1,
          borderTopColor: COLORS.divider,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          elevation: 12,
        },
        tabBarItemStyle: {
          minHeight: 48,
          minWidth: 48,
        },
        tabBarIcon: ({ focused }) => (
          <TabIcon glyph={TAB_GLYPHS[route.name]} focused={focused} />
        ),
        tabBarLabel: ({ focused }) => (
          <TabLabel label={TAB_LABELS[route.name]} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Challenges" component={ChallengesScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Community" component={CommunityScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ============================================================================
// ROOT APP
// ============================================================================

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSans_800ExtraBold,
  });

  // Gate render until fonts resolve; on font error we still render (nodes fall
  // back to the system font) so a font CDN hiccup never blocks the app.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ProfileProvider>
          <AppProvider>
            <MessagingProvider>
              <NavigationContainer theme={navTheme}>
                <StatusBar style="light" />
                <RootTabs />
              </NavigationContainer>
            </MessagingProvider>
          </AppProvider>
        </ProfileProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// ============================================================================
// STYLES — TACTICAL HUD SYSTEM
// ============================================================================

const styles = StyleSheet.create({
  // ---- screen scaffolding -------------------------------------------------
  screenRoot: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  screenScroll: {
    paddingHorizontal: 16,
  },

  // ---- fixed top header (brand row + streak badge + ticker) ------------------
  appHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    zIndex: 5,
  },
  appHeaderRow: {
    height: HEADER_BRAND_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  brandWordmark: {
    fontFamily: DISPLAY,
    color: COLORS.body,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandAccent: {
    color: COLORS.neon,
  },

  // ---- header status pills (flame streak + chat notifications) ---------------
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    boxShadow: '0 0 14px rgba(0, 255, 102, 0.12)',
  },
  headerPillGlyph: {
    fontSize: 13,
  },
  headerPillNumber: {
    fontFamily: DM_SANS_HEAVY,
    color: COLORS.body,
    fontSize: 14,
    fontWeight: '800',
    minWidth: 16,
    textAlign: 'center',
  },
  headerStreakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    boxShadow: '0 0 14px rgba(0, 230, 118, 0.22)',
  },
  headerStreakGlyph: {
    color: COLORS.neon,
    fontSize: 9,
    marginRight: 6,
  },
  headerStreakNumber: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
    marginRight: 6,
  },
  headerStreakLabel: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 8,
    letterSpacing: 1.5,
  },

  // ---- ambient starfield ------------------------------------------------------
  starfield: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  starfieldLayer: {
    position: 'absolute',
    top: -60,
    left: 0,
    right: 0,
    bottom: -60,
  },
  starDot: {
    position: 'absolute',
    backgroundColor: COLORS.neon,
  },
  starDotGlow: {
    boxShadow: '0 0 6px rgba(0, 230, 118, 0.8)',
  },

  // ---- tier orb (hero stage visual) --------------------------------------------
  orbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  orbHalo: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    boxShadow: '0 0 60px rgba(0, 230, 118, 0.30)',
  },
  orbSphere: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.40)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 0 32px rgba(0, 230, 118, 0.25)',
  },
  orbSheen: {
    position: 'absolute',
    top: 10,
    left: 16,
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(240, 253, 244, 0.05)',
  },
  orbCore: {
    position: 'absolute',
    bottom: -22,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(0, 230, 118, 0.10)',
  },
  orbLabel: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 8,
    letterSpacing: 2,
    marginBottom: 2,
  },
  orbNumber: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 1,
    lineHeight: 48,
  },
  orbCaption: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 3,
    marginTop: 2,
  },

  // ---- HUD tier pill (Community / Profile) -----------------------------------
  hudBar: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 20,
  },
  hudText: {
    fontFamily: MONO,
    fontSize: 11,
    color: COLORS.muted,
    letterSpacing: 1,
    textAlign: 'center',
  },

  // ---- section headers ----------------------------------------------------
  sectionHeader: {
    fontFamily: SANS,
    color: COLORS.body,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeaderCentered: {
    textAlign: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeaderInline: {
    fontFamily: SANS,
    color: COLORS.body,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },

  // ---- accordion primitives -------------------------------------------------
  accordionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accordionHeaderTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  accordionChevron: {
    color: COLORS.neon,
    fontSize: 16,
    fontWeight: '800',
  },
  accordionButtonWrap: {
    marginTop: 16,
  },
  accordionInlineButton: {
    marginBottom: 0,
  },

  // ---- cards (glassmorphism + razor-thin neon tactical borders) ---------------
  card: {
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },
  cardAccent: {
    boxShadow: '0 0 24px rgba(0, 255, 102, 0.10)',
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    borderWidth: 1,
    borderColor: COLORS.divider,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardIconGlyph: {
    color: COLORS.neon,
    fontSize: 17,
  },

  // ---- body text ------------------------------------------------------------
  bodyText: {
    fontFamily: SANS,
    color: COLORS.body,
    fontSize: 14,
    lineHeight: 22,
  },

  // ---- quest card -----------------------------------------------------------
  questTier: {
    fontFamily: MONO,
    fontSize: 11,
    color: COLORS.neon,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  questTitle: {
    fontFamily: SANS,
    color: COLORS.body,
    fontSize: 21,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  questDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 12,
  },
  missionCompleteCard: {
    borderColor: COLORS.neon,
    boxShadow: '0 0 28px rgba(0, 230, 118, 0.22)',
  },

  // ---- protocol lock banner (reduced footprint, below CTA) -------------------
  lockBanner: {
    backgroundColor: 'rgba(16, 23, 19, 0.80)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  lockBannerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lockBannerTitle: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // ---- primary CTA (neon fill + ambient glow) --------------------------------
  primaryButton: {
    minHeight: 56,
    backgroundColor: COLORS.neon,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 24,
    boxShadow: '0 0 26px rgba(0, 230, 118, 0.35)',
  },
  primaryButtonPressed: {
    backgroundColor: COLORS.emerald,
  },
  primaryButtonDisabled: {
    backgroundColor: COLORS.disabled,
    boxShadow: '0 0 0 rgba(0, 0, 0, 0)',
  },
  primaryButtonText: {
    fontFamily: SANS,
    color: COLORS.onNeon,
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // ---- prominent cancel button ------------------------------------------------
  cancelButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.elevated,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 20,
  },
  cancelButtonText: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // ---- vitals rows ----------------------------------------------------------
  vitalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  vitalsRowLast: {
    borderBottomWidth: 0,
  },
  vitalsLabel: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 12,
    letterSpacing: 1,
  },
  vitalsValue: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ---- shared full-screen overlay scaffolding ----------------------------------
  // Every modal/popup in the app renders via RN's native `Modal` component,
  // which always paints in its own top-level window above everything else
  // (ticker, tab bar, cards) with zero manual zIndex/elevation bookkeeping.
  // `overlayFill` is therefore just the flex-filling root of that window.
  overlayFill: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 7, 0.94)',
  },
  // True backdrop — a sibling of the KAV/content it sits behind (never an
  // ancestor wrapping it), so its press responder can never contest the
  // ScrollView/FlatList's own pan responder. Vertical swipes inside a modal
  // strictly scroll content; only genuine taps outside the content close it.
  modalBackdropFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlayFlex: {
    flex: 1,
  },
  overlayInner: {
    flex: 1,
    paddingHorizontal: 16,
  },
  overlayScrollContent: {
    flexGrow: 1,
    paddingBottom: 140,
  },
  overlayScrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 140,
  },
  // ---- centered card popups (Quest/Lock/Info/Inspect modals) -----------------
  centeredCardWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centeredCard: {
    width: '100%',
    maxHeight: '80%',
    overflow: 'hidden',
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 22,
    boxShadow: '0 0 40px rgba(0, 230, 118, 0.18)',
  },
  centeredCardScrollContent: {
    flexGrow: 1,
  },
  centeredCardScrollContentAlignCenter: {
    flexGrow: 1,
    alignItems: 'center',
  },
  questTitleCentered: {
    textAlign: 'center',
  },
  lockModalTitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 4,
  },
  overlayHeader: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 13,
    lineHeight: 22,
    letterSpacing: 0.5,
    marginBottom: 20,
  },
  overlayCard: {
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  verificationInput: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    color: COLORS.body,
    fontFamily: SANS,
    fontSize: 14,
    lineHeight: 22,
    padding: 12,
    textAlignVertical: 'top',
  },
  titleInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    color: COLORS.body,
    fontFamily: SANS,
    fontSize: 15,
    fontWeight: '700',
    padding: 12,
  },
  replyInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    color: COLORS.body,
    fontFamily: SANS,
    fontSize: 14,
    lineHeight: 22,
    padding: 12,
    textAlignVertical: 'top',
    marginBottom: 4,
  },
  charCounter: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 10,
  },
  charCounterValid: {
    color: COLORS.neon,
  },
  accountEditBlock: {
    width: '100%',
    marginTop: 4,
  },
  accountEditLabel: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  accountEditInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    color: COLORS.body,
    fontFamily: SANS,
    fontSize: 14,
    padding: 12,
  },
  accountEditBioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  accountEditCounter: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 6,
    textAlign: 'right',
  },
  accountEditHint: {
    fontFamily: DM_SANS,
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 8,
  },
  accountEditSaveButton: {
    marginTop: 12,
    marginBottom: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  toggleRowLast: {
    borderBottomWidth: 0,
  },
  toggleLabel: {
    color: COLORS.body,
    fontSize: 14,
    lineHeight: 22,
    flexShrink: 1,
    paddingRight: 12,
  },
  abortButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abortButtonText: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 12,
    letterSpacing: 1,
  },

  // ---- live activity ticker (in-flow row inside the fixed AppHeader) ---------
  liveTicker: {
    height: LIVE_TICKER_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tickerTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerText: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.5,
  },

  // ---- avatars (Point 3: real profile picture or theme-consistent fallback) ---
  avatarCircleWrap: {
    marginRight: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 230, 118, 0.06)',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleImage: {
    width: '100%',
    height: '100%',
  },
  avatarCircleFallbackText: {
    color: COLORS.emerald,
    fontWeight: '800',
  },

  // ---- feed cards ---------------------------------------------------------------
  feedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  handlePressable: {
    minHeight: 48,
    justifyContent: 'center',
    flexShrink: 1,
  },
  feedHandle: {
    color: COLORS.neon,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  feedLevelTag: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  feedTimestamp: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    marginLeft: 'auto',
  },
  feedTitle: {
    fontFamily: SANS,
    color: COLORS.body,
    fontSize: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  feedBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  replyCountText: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.5,
    flexShrink: 1,
    textAlign: 'center',
  },

  // ---- like / view counters -------------------------------------------------------
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  likeIcon: {
    color: COLORS.muted,
    fontSize: 15,
    marginRight: 4,
  },
  likeIconActive: {
    color: COLORS.emerald,
  },
  likeCountText: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  likeCountTextActive: {
    color: COLORS.emerald,
  },
  viewCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewCountIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  viewCountText: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.5,
  },

  // ---- post detail replies -------------------------------------------------------
  replyCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  replyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  replyHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    paddingRight: 8,
  },
  replyHandle: {
    color: COLORS.neon,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ---- floating action button -----------------------------------------------------
  fabContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 6,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.neon,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 28px rgba(0, 230, 118, 0.40)',
  },
  fabPressed: {
    backgroundColor: COLORS.emerald,
  },
  fabIcon: {
    color: COLORS.onNeon,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 26,
  },
  fabLabel: {
    color: COLORS.onNeon,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // ---- inspect profile modal -----------------------------------------------------
  inspectAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: COLORS.neon,
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    boxShadow: '0 0 22px rgba(0, 230, 118, 0.30)',
  },
  inspectAvatarText: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 26,
    fontWeight: '800',
  },
  inspectHandle: {
    fontFamily: SANS,
    color: COLORS.body,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  inspectLevel: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 1,
  },
  inspectDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 16,
  },
  inspectMetrics: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  inspectSubtext: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  inspectCloseButton: {
    alignSelf: 'stretch',
    marginBottom: 0,
  },

  // ---- profile identity ------------------------------------------------------------
  identityCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  // Glowing energy-sphere treatment for the operator's own avatar orb.
  avatarBlock: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.40)',
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
    boxShadow: '0 0 30px rgba(0, 230, 118, 0.28)',
  },
  avatarSheen: {
    position: 'absolute',
    top: 8,
    left: 12,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(240, 253, 244, 0.05)',
  },
  avatarText: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 2,
  },
  identityHandle: {
    fontFamily: SANS,
    color: COLORS.body,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },
  streakBadge: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
    boxShadow: '0 0 16px rgba(0, 230, 118, 0.20)',
  },
  streakBadgeText: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // ---- attributes grid ----------------------------------------------------------------
  attributesGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  gridBlockContainer: {
    flex: 1,
  },
  gridBlock: {
    flex: 1,
    marginBottom: 16,
  },
  gridHeader: {
    fontFamily: SANS,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  gridScore: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  gridSubtext: {
    fontFamily: SANS,
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
  },

  // ---- journal nav card (Profile tab entry point) --------------------------------------
  journalNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  journalNavTextBlock: {
    flex: 1,
    paddingRight: 10,
  },
  journalNavTitle: {
    fontFamily: SANS,
    color: COLORS.body,
    fontSize: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  journalNavSubtext: {
    fontFamily: SANS,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  // ---- journal timeline (dedicated Journal modal) --------------------------------------
  journalMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  journalDate: {
    fontFamily: MONO,
    color: COLORS.body,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  journalTier: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  journalEntryTitle: {
    fontFamily: DM_SANS_BOLD,
    color: COLORS.body,
    fontSize: 15,
    marginTop: 6,
  },
  tapHintText: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 10,
  },

  // ---- journal infinite-scroll footer (Point 6) ------------------------------
  journalLoadingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  journalLoadingText: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.5,
    marginLeft: 10,
  },
  journalEndText: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // ---- tab bar icons + labels + active dot --------------------------------------------------
  tabIcon: {
    fontSize: 22,
    color: COLORS.muted,
  },
  tabIconFocused: {
    color: COLORS.neon,
  },
  tabLabelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tabLabel: {
    fontFamily: DISPLAY,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabLabelFocused: {
    color: COLORS.neon,
    fontWeight: '700',
  },
  tabDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 3,
    backgroundColor: 'transparent',
  },
  tabDotActive: {
    backgroundColor: COLORS.neon,
    boxShadow: '0 0 8px rgba(0, 255, 102, 0.85)',
  },

  // ---- determinate progress bar (Home + Progress) -------------------------------------------
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.disabled,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.neon,
    boxShadow: '0 0 10px rgba(0, 255, 102, 0.5)',
  },

  // ---- Home: Growth Stage card --------------------------------------------------------------
  growthCard: {
    padding: 18,
  },
  growthTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  growthRingGlyph: {
    fontSize: 26,
  },
  growthTopText: {
    flex: 1,
    marginLeft: 14,
  },
  growthLabel: {
    fontFamily: DISPLAY,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  growthNumber: {
    fontFamily: DISPLAY,
    color: COLORS.body,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  growthStageTitle: {
    fontFamily: DM_SANS_BOLD,
    color: COLORS.neon,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  growthMotivation: {
    fontFamily: SANS,
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  growthChevron: {
    color: COLORS.neon,
    fontSize: 22,
    fontWeight: '800',
    marginLeft: 8,
  },
  growthDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 16,
  },
  growthBottomRow: {
    flexDirection: 'row',
    gap: 16,
  },
  growthMetricCol: {
    flex: 1,
  },
  growthMetricLabel: {
    fontFamily: DM_SANS_BOLD,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  growthMetricValue: {
    fontFamily: DM_SANS_HEAVY,
    color: COLORS.body,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  growthMetricMax: {
    fontFamily: DM_SANS,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  growthMetricPct: {
    fontFamily: DM_SANS,
    color: COLORS.neon,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },

  // ---- Home: Today's Challenge hero card ----------------------------------------------------
  challengeCard: {
    borderColor: 'rgba(0, 255, 102, 0.28)',
    boxShadow: '0 0 30px rgba(0, 255, 102, 0.10)',
  },
  challengeKicker: {
    fontFamily: DISPLAY,
    color: COLORS.neon,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  challengeBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  challengeTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  challengeTitle: {
    fontFamily: DISPLAY,
    color: COLORS.body,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 27,
    marginBottom: 8,
  },
  challengeDesc: {
    fontFamily: SANS,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  challengeGlowCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0, 255, 102, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 28px rgba(0, 255, 102, 0.5)',
  },
  challengeGlowGlyph: {
    fontSize: 30,
  },
  challengeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  difficultyPill: {
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  difficultyPillText: {
    fontFamily: DISPLAY,
    color: COLORS.neon,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  challengeReward: {
    fontFamily: SANS,
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  acceptButton: {
    flexDirection: 'row',
    minHeight: 54,
    backgroundColor: COLORS.neon,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    boxShadow: '0 0 26px rgba(0, 255, 102, 0.4)',
  },
  acceptButtonPressed: {
    backgroundColor: COLORS.emerald,
  },
  acceptButtonStandalone: {
    marginTop: 4,
    marginBottom: 16,
  },
  acceptButtonText: {
    fontFamily: DISPLAY,
    color: COLORS.onNeon,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  acceptButtonArrow: {
    color: COLORS.onNeon,
    fontSize: 18,
    fontWeight: '800',
  },

  // ---- Home: Day Streak tracker -------------------------------------------------------------
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  streakFlame: {
    fontSize: 28,
  },
  streakNumber: {
    fontFamily: DM_SANS_HEAVY,
    color: COLORS.body,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  streakCaption: {
    fontFamily: DM_SANS,
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },

  // ---- Home body: operator identity slot (username + bio) --------------------
  identitySlotCard: {
    paddingVertical: 14,
  },
  identitySlotUsername: {
    fontFamily: DM_SANS_HEAVY,
    color: COLORS.body,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  identitySlotBio: {
    fontFamily: DM_SANS,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  streakDays: {
    flexDirection: 'row',
    gap: 4,
  },
  dayCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleDone: {
    backgroundColor: COLORS.neon,
    borderColor: COLORS.neon,
    boxShadow: '0 0 10px rgba(0, 255, 102, 0.5)',
  },
  dayCircleText: {
    fontFamily: DISPLAY,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  dayCircleTextDone: {
    color: COLORS.onNeon,
  },

  // ---- Home: Daily Quote card ---------------------------------------------------------------
  quoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quoteLeafCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 255, 102, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quoteLeafGlyph: {
    fontSize: 20,
  },
  quoteTextBlock: {
    flex: 1,
    paddingRight: 8,
  },
  quoteText: {
    fontFamily: SANS,
    color: COLORS.body,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  quoteAuthor: {
    fontFamily: SANS,
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
  },
  quoteMountain: {
    fontSize: 26,
    marginLeft: 4,
  },

  // ---- Progress tab metrics -----------------------------------------------------------------
  progressMetricHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressMetricValue: {
    fontFamily: DISPLAY,
    color: COLORS.body,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  progressMetricPct: {
    fontFamily: SANS,
    color: COLORS.neon,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },

  // ---- Header message pill (Step 6.2) --------------------------------------
  headerPillButton: {
    backgroundColor: COLORS.surface,
  },
  headerPillPressed: {
    opacity: 0.6,
  },

  // ---- Journal completion modal: broadcast + cooldown (Step 2) -------------
  broadcastTitleBlock: {
    marginTop: 12,
  },
  broadcastTitleLabel: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  submitCooldownButton: {
    overflow: 'hidden',
  },
  submitCooldownFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.glow,
  },
  newEntryButton: {
    marginBottom: 16,
  },
  errorText: {
    fontFamily: DM_SANS,
    color: '#FF6B6B',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  chatErrorText: {
    marginTop: 6,
    marginBottom: 0,
    paddingHorizontal: 12,
  },
  tagPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
  },
  tagChipSelected: {
    borderColor: COLORS.neon,
    backgroundColor: COLORS.disabled,
  },
  tagChipText: {
    fontFamily: MONO,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  tagChipTextSelected: {
    color: COLORS.neon,
  },
  postTagPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.neon,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  postTagPillText: {
    fontFamily: MONO,
    color: COLORS.neon,
    fontSize: 10,
    letterSpacing: 0.5,
  },

  // ---- Home tab personal journal feed (Step 4) -----------------------------
  journalFeedCard: {
    marginBottom: 12,
  },
  journalFeedEmpty: {
    fontFamily: DM_SANS,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  journalFeedDate: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  journalFeedTag: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.neon,
    fontSize: 11,
    letterSpacing: 0.4,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  journalFeedText: {
    fontFamily: DM_SANS,
    color: COLORS.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },

  // ---- Moderation: report + block (Step 5) ---------------------------------
  dangerButton: {
    backgroundColor: 'rgba(220, 38, 38, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.5)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    fontFamily: DM_SANS_BOLD,
    color: '#FCA5A5',
    fontSize: 13,
    letterSpacing: 0.6,
  },
  reportReasonList: {
    marginTop: 8,
  },
  reportReasonRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginBottom: 10,
  },
  reportReasonText: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.body,
    fontSize: 14,
  },
  moderationRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  moderationBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moderationBtnText: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.muted,
    fontSize: 12,
    letterSpacing: 0.6,
  },

  // ---- Messaging overlay (Step 6) ------------------------------------------
  messagesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  messagesTitle: {
    fontFamily: DM_SANS_HEAVY,
    color: COLORS.body,
    fontSize: 20,
    letterSpacing: 0.5,
    flex: 1,
  },
  messagesCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  messagesCloseText: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.muted,
    fontSize: 12,
    letterSpacing: 0.6,
  },
  messagesBackText: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.neon,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  messagesHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messagesNewGroupBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.emerald,
    backgroundColor: COLORS.surface,
  },
  messagesNewGroupText: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.neon,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  groupMemberRow: {
    borderBottomWidth: 0,
    marginBottom: 8,
    borderRadius: 12,
  },
  groupCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCheckboxChecked: {
    borderColor: COLORS.neon,
    backgroundColor: COLORS.emerald,
  },
  groupCheckboxMark: {
    color: COLORS.onNeon,
    fontSize: 13,
    fontFamily: DM_SANS_BOLD,
  },
  cancelButtonAlt: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
  },
  messagesSpinner: {
    marginTop: 40,
  },
  messagesEmpty: {
    fontFamily: DM_SANS,
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
    lineHeight: 21,
  },
  messagesListContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  convoTextBlock: {
    flex: 1,
  },
  convoName: {
    fontFamily: DM_SANS_BOLD,
    color: COLORS.body,
    fontSize: 15,
  },
  convoPreview: {
    fontFamily: DM_SANS,
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 2,
  },
  chatHeaderTextBlock: {
    flex: 1,
  },
  chatHeaderRank: {
    fontFamily: DM_SANS,
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  chatListContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  msgBubbleRow: {
    flexDirection: 'row',
    marginVertical: 4,
    justifyContent: 'flex-start',
  },
  msgBubbleRowMine: {
    justifyContent: 'flex-end',
  },
  msgBubble: {
    maxWidth: '78%',
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  msgBubbleMine: {
    backgroundColor: COLORS.emerald,
    borderColor: COLORS.emerald,
    borderBottomRightRadius: 4,
  },
  msgBubbleTheirs: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontFamily: DM_SANS,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.body,
  },
  msgTextMine: {
    color: COLORS.onNeon,
  },
  msgSenderLabel: {
    fontFamily: DM_SANS_SEMI,
    color: COLORS.neon,
    fontSize: 11,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  chatInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: DM_SANS,
    fontSize: 14,
    color: COLORS.body,
    backgroundColor: COLORS.surface,
  },
  chatSendBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: COLORS.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendBtnDisabled: {
    opacity: 0.4,
  },
  chatSendText: {
    fontFamily: DM_SANS_BOLD,
    color: COLORS.onNeon,
    fontSize: 13,
    letterSpacing: 0.6,
  },
});
