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
import { AuthProvider } from './lib/AuthProvider';

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

// Height of the fixed header's brand row (XTROVERT wordmark + status pills).
const HEADER_BRAND_HEIGHT = 56;

// Height of the Live Activity ticker row rendered inside the fixed header,
// directly below the brand row. Every screen pads its scrollable content by
// insets.top + HEADER_BRAND_HEIGHT + this amount so the header never
// overlaps or blocks core UI elements.
const LIVE_TICKER_HEIGHT = 30;

// Flat reward applied to a user's Support Score whenever they reply to
// someone else's community post.
const SUPPORT_SCORE_REWARD = 10;

// Flat reward applied to a user's Social Score for every verified quest
// submission. Bound to both the award logic and the challenge XP label so
// the two can never drift out of sync.
const SOCIAL_SCORE_REWARD = 50;

// Ceilings used to render the Social/Support "growth" progress bars and
// percentages on the Home and Progress screens.
const MAX_SOCIAL_SCORE = 1000;
const MAX_SUPPORT_SCORE = 1000;

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

interface UserProfile {
  handle: string;
  level: number;
  socialScore: number;
  supportScore: number;
  streak: number;
  // ISO date (YYYY-MM-DD) of the last day a challenge was completed. Used to
  // gate streak increments to once-per-calendar-day.
  lastCompletedDate: string | null;
}

interface Quest {
  id: string;
  level: number;
  title: string;
  instructions: string;
}

interface Reply {
  id: string;
  handle: string;
  text: string;
  timestamp: string;
  likeCount: number;
  liked: boolean;
  profilePictureUrl?: string | null;
}

interface FeedPost {
  id: string;
  handle: string;
  level: number;
  title: string;
  body: string;
  timestamp: string;
  socialScore: number;
  supportScore: number;
  viewCount: number;
  // User IDs (here, operator handles) that have already registered a view
  // on this post, so repeat opens by the same user never inflate viewCount.
  viewedBy: string[];
  likeCount: number;
  liked: boolean;
  profilePictureUrl?: string | null;
  replies: Reply[];
}

interface JournalEntry {
  id: string;
  date: string;
  level: number;
  text: string;
}

interface DailyQuote {
  text: string;
  author: string;
}

interface AppContextShape {
  userProfile: UserProfile;
  activeQuest: Quest;
  communityFeed: FeedPost[];
  userJournals: JournalEntry[];
  dailyQuote: DailyQuote;
  submitVerification: (text: string, broadcast: boolean) => void;
  loadNextChallenge: () => void;
  addReply: (postId: string, text: string) => void;
  addStandalonePost: (title: string, body: string) => void;
  toggleLike: (postId: string) => void;
  toggleReplyLike: (postId: string, replyId: string) => void;
  registerPostView: (postId: string, viewerId: string) => void;
}

// ============================================================================
// SECTION 2 — INITIAL SEED MOCK DATA
// ============================================================================

const QUEST_POOL: Quest[] = [
  {
    id: 'quest-001',
    level: 5,
    title: 'THE CUSTOM ORDER',
    instructions:
      'Ask a barista for their personal drink recommendation and order it without hesitating or changing your mind.',
  },
  {
    id: 'quest-002',
    level: 5,
    title: 'THE COLD GREETING',
    instructions:
      'Make direct eye contact and say a genuine "good morning" to three strangers you pass on the street.',
  },
  {
    id: 'quest-003',
    level: 5,
    title: 'THE HONEST OPINION',
    instructions:
      'In your next group conversation, voice a genuine opinion that mildly disagrees with the consensus — calmly, and without apologizing for it.',
  },
  {
    id: 'quest-004',
    level: 5,
    title: 'THE COLD CALL',
    instructions:
      'Call a real business — a restaurant, a barbershop, a clinic — to ask a question instead of looking the answer up online.',
  },
];

const SEED_FEED: FeedPost[] = [
  {
    id: 'feed-001',
    handle: '@Alex_Grit',
    level: 7,
    title: 'Overcoming Gym Approach Friction',
    body:
      'Saw the same guy repping 315 on bench for three weeks straight. Every session I told myself I would ask him for a spot check on my form and every session I bailed. Tonight I walked over mid-rest, heart hammering like I was about to fight him, and just said it plainly: "Your setup is dialed. Mind checking my arch?" He spent ten minutes coaching me. The anxiety was a complete phantom. The rep was in my head, not in the room.',
    timestamp: '2h ago',
    socialScore: 840,
    supportScore: 610,
    viewCount: 412,
    viewedBy: [],
    likeCount: 58,
    liked: false,
    replies: [
      {
        id: 'reply-001',
        handle: '@David_Grit',
        text: 'This is exactly the kind of rep that compounds. Proud of you for making the ask instead of just admiring from across the gym.',
        timestamp: '1h ago',
        likeCount: 6,
        liked: false,
      },
    ],
  },
  {
    id: 'feed-002',
    handle: '@Marcus_V',
    level: 4,
    title: 'Coffee Order — Full Eye Contact Protocol',
    body:
      'Mission was to order my entire coffee without breaking eye contact once. Sounds trivial. It is not. My default is to stare at the menu board or my shoes the second another human looks at me. I held the barista\u2019s gaze through the whole order, the payment, and the thank-you. Voice stayed level. She didn\u2019t recoil or think I was strange — she just took the order like a normal interaction, because it WAS a normal interaction. Logging this so future me remembers: nobody is scrutinizing you. Nobody.',
    timestamp: '5h ago',
    socialScore: 512,
    supportScore: 388,
    viewCount: 203,
    viewedBy: [],
    likeCount: 21,
    liked: false,
    replies: [],
  },
  {
    id: 'feed-003',
    handle: '@David_Grit',
    level: 8,
    title: 'Spoke First in the Monday Standup',
    body:
      'Twenty-one days unbroken. Today\u2019s rep: be the first voice in the crowded Monday meeting instead of hiding in the back praying nobody calls on me. I opened with the sprint blocker before anyone else spoke. Hands were sweating under the table but my voice came out flat and clear. My manager followed up with me after — first time he has ever done that. Visibility compounds. Silence also compounds. Choose which one you are stacking.',
    timestamp: '9h ago',
    socialScore: 1120,
    supportScore: 764,
    viewCount: 589,
    viewedBy: [],
    likeCount: 74,
    liked: false,
    replies: [
      {
        id: 'reply-002',
        handle: '@Alex_Grit',
        text: '21 days is no joke. The fact you spoke first before anyone else called on you is a completely different nervous system than three weeks ago.',
        timestamp: '6h ago',
        likeCount: 9,
        liked: false,
      },
    ],
  },
  {
    id: 'feed-004',
    handle: '@Rob_Ironside',
    level: 3,
    title: 'Asked a Stranger for Directions — No Phone Crutch',
    body:
      'Level 3 protocol: navigate downtown without GPS, ask real humans for directions minimum three times. First ask was brutal — I rehearsed the sentence four times before approaching an older guy at a bus stop. He was completely friendly. Second and third asks took zero rehearsal. The friction curve collapses fast when you actually load the bar. Three months ago I would have walked forty minutes in the wrong direction before speaking to a stranger. Grid works if you work it.',
    timestamp: '14h ago',
    socialScore: 290,
    supportScore: 205,
    viewCount: 156,
    viewedBy: [],
    likeCount: 14,
    liked: false,
    replies: [],
  },
  {
    id: 'feed-005',
    handle: '@Sam_Forge',
    level: 6,
    title: 'Returned a Wrong Order Without Apologizing Once',
    body:
      'They brought me the wrong dish. Old me eats it quietly and leaves a tip on top, furious at myself for a week. Tonight I flagged the waiter, stated the mix-up in one plain sentence, zero apologies, zero nervous laughter, and asked for the correct order. He fixed it in five minutes and comped the drink. Total emotional damage: none. The catastrophic social explosion my brain promised me for thirty years simply does not exist. It never existed.',
    timestamp: '1d ago',
    socialScore: 678,
    supportScore: 540,
    viewCount: 298,
    viewedBy: [],
    likeCount: 33,
    liked: false,
    replies: [],
  },
];

const SEED_JOURNALS: JournalEntry[] = [
  {
    id: 'journal-003',
    date: '10 JUL 2026',
    level: 4,
    text:
      'Complimented a stranger\u2019s watch at the gas station and held the follow-up small talk for a full minute without exit-seeking. Voice cracked on the opener but I stayed planted. He ended up recommending a watch forum. Net positive interaction from pure cold approach.',
  },
  {
    id: 'journal-002',
    date: '09 JUL 2026',
    level: 4,
    text:
      'Called the dentist to reschedule instead of using the app like a coward. Phone calls are my weakest vector. Receptionist was neutral-friendly, call lasted ninety seconds, and the dread I carried for two days evaporated in the first five seconds of dialing.',
  },
  {
    id: 'journal-001',
    date: '08 JUL 2026',
    level: 3,
    text:
      'Sat in the middle of the food court instead of the corner wall seat. Ate the entire meal without pulling my phone out as a shield. Noticed nobody looked at me even once. The audience I perform avoidance for does not attend the show.',
  },
  {
    id: 'journal-000a',
    date: '07 JUL 2026',
    level: 3,
    text:
      'Asked a coworker to actually explain a process instead of nodding along and pretending to understand. Old me would rather struggle silently for a week than admit confusion out loud. She explained it in ninety seconds flat.',
  },
  {
    id: 'journal-000b',
    date: '06 JUL 2026',
    level: 3,
    text:
      'Voiced a scheduling conflict in the group chat instead of just going along with a time that did not work for me. Nobody pushed back or got annoyed. The confrontation I imagined in my head simply did not happen.',
  },
  {
    id: 'journal-000c',
    date: '05 JUL 2026',
    level: 2,
    text:
      'Sent a message correcting a mistake in a group plan instead of silently going along with the wrong plan. Felt like a huge confrontation in my head, read as a completely normal clarification to everyone else in the thread.',
  },
  {
    id: 'journal-000d',
    date: '04 JUL 2026',
    level: 2,
    text:
      'First day of the log. Committed to stop editing every message eleven times before sending. Sent the first draft to a group chat unedited. Nothing happened. The world did not end.',
  },
];

// Clean single-bullet format: "[Username] completed a task • [Username] completed a task".
// No "[system log]" labels, no doubled bullet/space artifacts.
const TICKER_ITEMS: string[] = [
  '@Alex_Grit completed a task',
  '@Marcus_V cleared Level 4',
  '@David_Grit reached a 21 day streak',
  '@Sam_Forge cleared Level 6',
  '@Rob_Ironside logged a new exposure rep',
];

// Daily motivation pool for the Home screen's Daily Quote card. The provider
// selects one deterministically per calendar day so the quote is dynamic
// (never a hardcoded JSX string) yet stable across a single day's session.
const QUOTE_POOL: DailyQuote[] = [
  { text: 'Growth happens outside your comfort zone.', author: 'Keep showing up' },
  { text: 'Courage is a muscle. Train it every single day.', author: 'Field Doctrine' },
  { text: 'The rep is in your head, not in the room.', author: 'Operator Log' },
  { text: 'Discomfort is just data. Move toward it.', author: 'Keep showing up' },
  { text: 'You become what you repeatedly dare to do.', author: 'Field Doctrine' },
  { text: 'Small brave acts compound into a bold life.', author: 'Operator Log' },
];

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

// Derives a human difficulty label for a quest purely from its level, so the
// Today's Challenge difficulty pill stays bound to real quest data.
function getDifficultyLabel(level: number): string {
  if (level <= 3) return 'Easy';
  if (level <= 6) return 'Medium';
  if (level <= 9) return 'Hard';
  return 'Elite';
}

// Weekly completion state for the Day Streak tracker, derived from the live
// streak count. Returns 7 entries (Mon→Sun): 'done' for days covered by the
// current streak, 'missed' for earlier days this week, 'future' for upcoming.
type DayState = 'done' | 'missed' | 'future';

function getWeekProgress(streak: number, now: Date = new Date()): DayState[] {
  const todayIndex = (now.getDay() + 6) % 7; // convert Sun=0..Sat=6 → Mon=0..Sun=6
  const week: DayState[] = [];
  for (let i = 0; i < 7; i += 1) {
    if (i > todayIndex) {
      week.push('future');
    } else {
      const daysAgo = todayIndex - i;
      week.push(daysAgo < streak ? 'done' : 'missed');
    }
  }
  return week;
}

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

function AppProvider({ children }: { children: React.ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile>({
    handle: '@Hugh_Operator',
    level: 5,
    socialScore: 450,
    supportScore: 320,
    streak: 14,
    lastCompletedDate: null,
  });

  const [activeQuestIndex, setActiveQuestIndex] = useState(0);
  const activeQuest = QUEST_POOL[activeQuestIndex];

  const [communityFeed, setCommunityFeed] = useState<FeedPost[]>(SEED_FEED);
  const [userJournals, setUserJournals] = useState<JournalEntry[]>(SEED_JOURNALS);

  // Deterministic per-calendar-day pick from the quote pool. Dynamic (rotates
  // daily) yet stable for the lifetime of a session, so the Daily Quote card
  // is never bound to a hardcoded string.
  const dailyQuote = useMemo<DailyQuote>(() => {
    const dayNumber = Math.floor(Date.now() / 86_400_000);
    return QUOTE_POOL[dayNumber % QUOTE_POOL.length];
  }, []);

  const submitVerification = useCallback(
    (text: string, broadcast: boolean) => {
      const now = new Date();
      const entry: JournalEntry = {
        id: `journal-${now.getTime()}`,
        date: formatDateStamp(now),
        level: activeQuest.level,
        text,
      };
      setUserJournals((prev) => [entry, ...prev]);

      if (broadcast) {
        setCommunityFeed((prev) => [
          {
            id: `feed-${now.getTime()}`,
            handle: userProfile.handle,
            level: userProfile.level,
            title: `Field Report: ${activeQuest.title}`,
            body: text,
            timestamp: 'Just now',
            socialScore: userProfile.socialScore + 50,
            supportScore: userProfile.supportScore,
            viewCount: 0,
            viewedBy: [],
            likeCount: 0,
            liked: false,
            replies: [],
          },
          ...prev,
        ]);
      }

      const todayKey = getDateKey(now);
      setUserProfile((prev) => {
        const alreadyCompletedToday = prev.lastCompletedDate === todayKey;
        return {
          ...prev,
          socialScore: prev.socialScore + SOCIAL_SCORE_REWARD,
          streak: alreadyCompletedToday ? prev.streak : prev.streak + 1,
          lastCompletedDate: todayKey,
        };
      });
    },
    [activeQuest, userProfile],
  );

  const loadNextChallenge = useCallback(() => {
    setActiveQuestIndex((prevIndex) => (prevIndex + 1) % QUEST_POOL.length);
  }, []);

  const addReply = useCallback(
    (postId: string, text: string) => {
      const targetPost = communityFeed.find((post) => post.id === postId);
      if (!targetPost) {
        return;
      }
      const now = new Date();
      const reply: Reply = {
        id: `reply-${now.getTime()}`,
        handle: userProfile.handle,
        text,
        timestamp: 'Just now',
        likeCount: 0,
        liked: false,
      };
      setCommunityFeed((prev) =>
        prev.map((post) =>
          post.id === postId ? { ...post, replies: [...post.replies, reply] } : post,
        ),
      );
      if (targetPost.handle !== userProfile.handle) {
        setUserProfile((prev) => ({
          ...prev,
          supportScore: prev.supportScore + SUPPORT_SCORE_REWARD,
        }));
      }
    },
    [communityFeed, userProfile.handle],
  );

  const addStandalonePost = useCallback(
    (title: string, body: string) => {
      const now = new Date();
      const post: FeedPost = {
        id: `feed-${now.getTime()}`,
        handle: userProfile.handle,
        level: userProfile.level,
        title,
        body,
        timestamp: 'Just now',
        socialScore: userProfile.socialScore,
        supportScore: userProfile.supportScore,
        viewCount: 0,
        viewedBy: [],
        likeCount: 0,
        liked: false,
        replies: [],
      };
      setCommunityFeed((prev) => [post, ...prev]);
    },
    [userProfile],
  );

  const toggleLike = useCallback((postId: string) => {
    setCommunityFeed((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              liked: !post.liked,
              likeCount: post.liked ? post.likeCount - 1 : post.likeCount + 1,
            }
          : post,
      ),
    );
  }, []);

  const toggleReplyLike = useCallback((postId: string, replyId: string) => {
    setCommunityFeed((prev) =>
      prev.map((post) => {
        if (post.id !== postId) {
          return post;
        }
        return {
          ...post,
          replies: post.replies.map((reply) =>
            reply.id === replyId
              ? {
                  ...reply,
                  liked: !reply.liked,
                  likeCount: reply.liked ? reply.likeCount - 1 : reply.likeCount + 1,
                }
              : reply,
          ),
        };
      }),
    );
  }, []);

  // Requirement (Point 2): only the first view from a given viewer increments
  // the counter — repeat opens by the same user never inflate viewCount.
  const registerPostView = useCallback((postId: string, viewerId: string) => {
    setCommunityFeed((prev) =>
      prev.map((post) => {
        if (post.id !== postId || post.viewedBy.includes(viewerId)) {
          return post;
        }
        return { ...post, viewCount: post.viewCount + 1, viewedBy: [...post.viewedBy, viewerId] };
      }),
    );
  }, []);

  const value = useMemo<AppContextShape>(
    () => ({
      userProfile,
      activeQuest,
      communityFeed,
      userJournals,
      dailyQuote,
      submitVerification,
      loadNextChallenge,
      addReply,
      addStandalonePost,
      toggleLike,
      toggleReplyLike,
      registerPostView,
    }),
    [
      userProfile,
      activeQuest,
      communityFeed,
      userJournals,
      dailyQuote,
      submitVerification,
      loadNextChallenge,
      addReply,
      addStandalonePost,
      toggleLike,
      toggleReplyLike,
      registerPostView,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ============================================================================
// SHARED UI PRIMITIVES
// ============================================================================

// Slim centered tier pill shown at the top of scrollable content on the
// Community and Profile tabs (the Challenges tab elevates this readout
// into the hero TierOrb instead).
function TierBanner({ level }: { level: number }) {
  return (
    <View style={styles.hudBar}>
      <Text style={styles.hudText} numberOfLines={1} ellipsizeMode="tail">
        {`\u25C8  TIER LEVEL ${level}`}
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
  const { userProfile, communityFeed } = useAppContext();

  // Dynamic "unread notifications" proxy: replies left by other operators on
  // the current user's own posts. Derived from live feed state — never a
  // hardcoded number.
  const notificationCount = communityFeed.reduce((total, post) => {
    if (post.handle !== userProfile.handle) {
      return total;
    }
    return total + post.replies.filter((reply) => reply.handle !== userProfile.handle).length;
  }, 0);

  return (
    <View pointerEvents="none" style={[styles.appHeader, { paddingTop: insets.top }]}>
      <View style={styles.appHeaderRow}>
        <Text style={styles.brandWordmark} numberOfLines={1}>
          <Text style={styles.brandAccent}>X</Text>TROVERT
        </Text>
        <View style={styles.headerBadgeRow}>
          <View style={styles.headerPill}>
            <Text style={styles.headerPillGlyph}>{'\uD83D\uDD25'}</Text>
            <Text style={styles.headerPillNumber}>{userProfile.streak}</Text>
          </View>
          <View style={styles.headerPill}>
            <Text style={styles.headerPillGlyph}>{'\uD83D\uDCAC'}</Text>
            <Text style={styles.headerPillNumber}>{notificationCount}</Text>
          </View>
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

function VerificationOverlay({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string, broadcast: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [entryText, setEntryText] = useState('');
  const [broadcastFeed, setBroadcastFeed] = useState(true);

  const MIN_CHARS = 60;
  const charCount = entryText.length;
  const isValid = charCount >= MIN_CHARS;

  // Whenever the overlay closes — whether via Cancel, successful submit, or
  // the Challenges tab-press interceptor — wipe the draft so the next time
  // it opens it starts from a clean slate.
  useEffect(() => {
    if (!visible) {
      setEntryText('');
      setBroadcastFeed(true);
    }
  }, [visible]);

  const handleSubmit = () => {
    if (!isValid) {
      return;
    }
    onSubmit(entryText.trim(), broadcastFeed);
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        {/* True backdrop lives as a sibling of the KAV/content below (not an
            ancestor wrapping it), so the ScrollView's own pan responder is
            never contested by the backdrop's press responder — vertical
            swipes strictly scroll content, never close the modal. */}
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
                />
                <Text style={[styles.charCounter, isValid && styles.charCounterValid]}>
                  Characters: {charCount} / {MIN_CHARS} MIN
                </Text>
              </View>

              <View style={styles.overlayCard}>
                <View style={[styles.toggleRow, styles.toggleRowLast]}>
                  <Text style={styles.toggleLabel} numberOfLines={2} ellipsizeMode="tail">
                    Broadcast to Global Feed
                  </Text>
                  <Switch
                    value={broadcastFeed}
                    onValueChange={setBroadcastFeed}
                    trackColor={{ false: COLORS.border, true: COLORS.emerald }}
                    thumbColor={broadcastFeed ? COLORS.neon : COLORS.muted}
                  />
                </View>
              </View>

              <View
                pointerEvents={isValid ? 'auto' : 'none'}
                style={{ opacity: isValid ? 1 : 0.4 }}
              >
                <Pressable
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    !isValid && styles.primaryButtonDisabled,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>{'\u25C6'}  SUBMIT RECTIFICATION</Text>
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
function QuestPreviewCard({ quest, onPress }: { quest: Quest; onPress: () => void }) {
  return (
    <SpringPressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.cardAccent, pressed && styles.cardPressed]}
    >
      <View style={styles.accordionHeaderRow}>
        <View style={styles.cardIconBadge}>
          <Text style={styles.cardIconGlyph}>{'\u25CE'}</Text>
        </View>
        <View style={styles.accordionHeaderTextBlock}>
          <Text style={styles.questTier}>LEVEL {quest.level} DIRECTIVE</Text>
          <Text style={styles.questTitle} numberOfLines={2} ellipsizeMode="tail">
            {quest.title}
          </Text>
        </View>
        <Text style={styles.accordionChevron}>{'\u203A'}</Text>
      </View>
      <Text style={styles.tapHintText}>TAP FOR FULL BRIEFING</Text>
    </SpringPressable>
  );
}

// Requirement (Point 5): standalone, centered popup for the Daily Quest —
// full instructions and the Secure Quest CTA both live here now, cleanly
// above the dimmed screen backdrop, instead of expanding in place.
function QuestDetailModal({
  visible,
  quest,
  onClose,
  onSecureQuest,
}: {
  visible: boolean;
  quest: Quest;
  onClose: () => void;
  onSecureQuest: () => void;
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
            <ScrollView
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.centeredCardScrollContent}
            >
              <Text style={styles.questTier}>LEVEL {quest.level} DIRECTIVE</Text>
              <Text style={[styles.questTitle, styles.questTitleCentered]}>{quest.title}</Text>
              <View style={styles.questDivider} />
              <Text style={styles.bodyText}>{quest.instructions}</Text>
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
// Circular growth ring (overall growth) + hero stage number/title bound to
// live level, plus Social/Support growth bars. Pressing opens the existing
// score-breakdown popup, preserving that behavior.
function GrowthStageCard({ onPressDetails }: { onPressDetails: () => void }) {
  const { userProfile } = useAppContext();
  const socialRatio = userProfile.socialScore / MAX_SOCIAL_SCORE;
  const supportRatio = userProfile.supportScore / MAX_SUPPORT_SCORE;
  const overall = (socialRatio + supportRatio) / 2;
  const stageTitle = getStageTitle(userProfile.level);

  return (
    <SpringPressable
      onPress={() => {
        triggerHaptic();
        onPressDetails();
      }}
      style={({ pressed }) => [styles.card, styles.growthCard, pressed && styles.cardPressed]}
    >
      <View style={styles.growthTopRow}>
        <ProgressRing size={76} strokeWidth={6} progress={overall}>
          <Text style={styles.growthRingGlyph}>{'\uD83C\uDF31'}</Text>
        </ProgressRing>
        <View style={styles.growthTopText}>
          <Text style={styles.growthLabel}>GROWTH STAGE</Text>
          <Text style={styles.growthNumber}>{userProfile.level}</Text>
          <Text style={styles.growthStageTitle} numberOfLines={1}>
            {stageTitle}
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
            {userProfile.socialScore}
            <Text style={styles.growthMetricMax}> / {MAX_SOCIAL_SCORE}</Text>
          </Text>
          <ProgressBar ratio={socialRatio} />
          <Text style={styles.growthMetricPct}>{Math.round(socialRatio * 100)}%</Text>
        </View>
        <View style={styles.growthMetricCol}>
          <Text style={styles.growthMetricLabel}>SUPPORT GROWTH</Text>
          <Text style={styles.growthMetricValue}>
            {userProfile.supportScore}
            <Text style={styles.growthMetricMax}> / {MAX_SUPPORT_SCORE}</Text>
          </Text>
          <ProgressBar ratio={supportRatio} />
          <Text style={styles.growthMetricPct}>{Math.round(supportRatio * 100)}%</Text>
        </View>
      </View>
    </SpringPressable>
  );
}

// ---- Home card: Today's Challenge (hero) -----------------------------------
function TodayChallengeCard({ onAccept }: { onAccept: () => void }) {
  const { activeQuest } = useAppContext();
  const difficulty = getDifficultyLabel(activeQuest.level);

  return (
    <View style={[styles.card, styles.challengeCard]}>
      <Text style={styles.challengeKicker}>{'\u26A1'}  TODAY&apos;S CHALLENGE</Text>

      <View style={styles.challengeBodyRow}>
        <View style={styles.challengeTextBlock}>
          <Text style={styles.challengeTitle} numberOfLines={3}>
            {activeQuest.title}
          </Text>
          <Text style={styles.challengeDesc} numberOfLines={3} ellipsizeMode="tail">
            {activeQuest.instructions}
          </Text>
        </View>
        <View style={styles.challengeGlowCircle}>
          <Text style={styles.challengeGlowGlyph}>{'\uD83D\uDCAC'}</Text>
        </View>
      </View>

      <View style={styles.challengeBadgeRow}>
        <View style={styles.difficultyPill}>
          <Text style={styles.difficultyPillText}>{difficulty}</Text>
        </View>
        <Text style={styles.challengeReward}>+{SOCIAL_SCORE_REWARD} Social Growth</Text>
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

// ---- Home card: Day Streak tracker -----------------------------------------
function DayStreakCard() {
  const { userProfile } = useAppContext();
  const week = getWeekProgress(userProfile.streak);

  return (
    <View style={[styles.card, styles.streakCard]}>
      <View style={styles.streakLeft}>
        <Text style={styles.streakFlame}>{'\uD83D\uDD25'}</Text>
        <View>
          <Text style={styles.streakNumber}>{userProfile.streak}</Text>
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
  const { dailyQuote } = useAppContext();

  return (
    <View style={[styles.card, styles.quoteCard]}>
      <View style={styles.quoteLeafCircle}>
        <Text style={styles.quoteLeafGlyph}>{'\uD83C\uDF31'}</Text>
      </View>
      <View style={styles.quoteTextBlock}>
        <Text style={styles.quoteText}>&ldquo;{dailyQuote.text}&rdquo;</Text>
        <Text style={styles.quoteAuthor}>&ndash; {dailyQuote.author}</Text>
      </View>
      <Text style={styles.quoteMountain}>{'\uD83C\uDFD4\uFE0F'}</Text>
    </View>
  );
}

function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList, 'Challenges'>>();
  const { userProfile, activeQuest, submitVerification, loadNextChallenge } = useAppContext();
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [questCompleted, setQuestCompleted] = useState(false);
  const [questModalVisible, setQuestModalVisible] = useState(false);
  const [vitalsModalVisible, setVitalsModalVisible] = useState(false);

  // Requirement 5: pressing the Home tab icon while the verification overlay
  // is open must abort it cleanly instead of leaving it open underneath
  // whatever the navigator does by default.
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      setOverlayVisible(false);
    });
    return unsubscribe;
  }, [navigation]);

  const handleSubmit = (text: string, broadcast: boolean) => {
    submitVerification(text, broadcast);
    setOverlayVisible(false);
    setQuestCompleted(true);
  };

  const handleLoadAnother = () => {
    loadNextChallenge();
    setQuestCompleted(false);
    setQuestModalVisible(false);
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
        <GrowthStageCard onPressDetails={() => setVitalsModalVisible(true)} />

        {questCompleted ? (
          <>
            <View style={[styles.card, styles.missionCompleteCard]}>
              <Text style={styles.challengeKicker}>{'\u2713'}  QUEST CLEARED</Text>
              <Text style={styles.challengeTitle} numberOfLines={2} ellipsizeMode="tail">
                {activeQuest.title}
              </Text>
              <View style={styles.growthDivider} />
              <Text style={styles.bodyText}>
                +{SOCIAL_SCORE_REWARD} Social Score awarded. Current streak: {userProfile.streak}{' '}
                days.
              </Text>
            </View>

            <SpringPressable
              onPress={handleLoadAnother}
              style={({ pressed }) => [
                styles.acceptButton,
                styles.acceptButtonStandalone,
                pressed && styles.acceptButtonPressed,
              ]}
            >
              <Text style={styles.acceptButtonText}>LOAD ANOTHER CHALLENGE</Text>
              <Text style={styles.acceptButtonArrow}>{'\u27F3'}</Text>
            </SpringPressable>
          </>
        ) : (
          <TodayChallengeCard onAccept={() => setQuestModalVisible(true)} />
        )}

        <DayStreakCard />

        <DailyQuoteCard />
      </Reanimated.ScrollView>

      <AppHeader />

      <VerificationOverlay
        visible={overlayVisible}
        onClose={() => setOverlayVisible(false)}
        onSubmit={handleSubmit}
      />

      <QuestDetailModal
        visible={questModalVisible}
        quest={activeQuest}
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
          Unbroken Streak counts consecutive calendar days with at least one verified quest
          completion. Completing multiple quests in the same day only counts once — current
          streak: {userProfile.streak} days.
        </Text>
        <View style={styles.questDivider} />
        <Text style={styles.bodyText}>
          Social Score accumulates via real-world social friction. Every verified quest
          submission awards +{SOCIAL_SCORE_REWARD} Social Score — current total:{' '}
          {userProfile.socialScore}.
        </Text>
        <View style={styles.questDivider} />
        <Text style={styles.bodyText}>
          Support Score accumulates via direct peer reinforcement. Replying to another
          operator&apos;s field report awards +{SUPPORT_SCORE_REWARD} Support Score — current
          total: {userProfile.supportScore}.
        </Text>
      </InfoPopupModal>
    </View>
  );
}

// ============================================================================
// TAB 2 — COMMUNITY (ACTION REPORT TIMELINE)
// ============================================================================

function FeedCard({
  post,
  onPressHandle,
  onPressPost,
  onToggleLike,
}: {
  post: FeedPost;
  onPressHandle: (post: FeedPost) => void;
  onPressPost: (post: FeedPost) => void;
  onToggleLike: (postId: string) => void;
}) {
  const replyCountLabel =
    post.replies.length === 0
      ? 'No replies yet'
      : `${post.replies.length} ${post.replies.length === 1 ? 'reply' : 'replies'}`;

  return (
    <SpringPressable
      onPress={() => onPressPost(post)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.feedTopRow}>
        <Avatar handle={post.handle} profilePictureUrl={post.profilePictureUrl} size={32} />
        <Pressable
          onPress={() => onPressHandle(post)}
          style={styles.handlePressable}
          hitSlop={8}
        >
          <Text style={styles.feedHandle} numberOfLines={1} ellipsizeMode="tail">
            {post.handle}
          </Text>
        </Pressable>
        <Text style={styles.feedLevelTag}>[LVL {post.level}]</Text>
        <Text style={styles.feedTimestamp} numberOfLines={1} ellipsizeMode="tail">
          {post.timestamp}
        </Text>
      </View>

      <Text style={styles.feedTitle} numberOfLines={2} ellipsizeMode="tail">
        {post.title}
      </Text>

      <Text style={styles.bodyText}>{post.body}</Text>

      <View style={styles.feedBottomRow}>
        <Pressable
          onPress={() => onToggleLike(post.id)}
          style={styles.likeButton}
          hitSlop={8}
        >
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

function InspectProfileModal({
  post,
  onClose,
}: {
  post: FeedPost | null;
  onClose: () => void;
}) {
  if (!post) {
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
              contentContainerStyle={styles.centeredCardScrollContentAlignCenter}
            >
              <View style={styles.inspectAvatar}>
                <Text style={styles.inspectAvatarText}>
                  {post.handle.replace('@', '').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.inspectHandle} numberOfLines={1} ellipsizeMode="tail">
                {post.handle}
              </Text>
              <Text style={styles.inspectLevel}>OPERATOR TIER — LEVEL {post.level}</Text>
              <View style={styles.inspectDivider} />
              <Text style={styles.inspectMetrics}>
                [ SOCIAL SCORE: {post.socialScore} ] | [ SUPPORT SCORE: {post.supportScore} ]
              </Text>
              <Text style={styles.inspectSubtext}>
                Performance metrics only. The grid does not rank operators against each
                other.
              </Text>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.inspectCloseButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>{'\u2713'}  CLOSE DOSSIER</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PostDetailModal({
  post,
  currentUserHandle,
  onClose,
  onSubmitReply,
  onToggleLike,
  onToggleReplyLike,
}: {
  post: FeedPost | null;
  currentUserHandle: string;
  onClose: () => void;
  onSubmitReply: (postId: string, text: string) => void;
  onToggleLike: (postId: string) => void;
  onToggleReplyLike: (postId: string, replyId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    if (!post) {
      setReplyText('');
    }
  }, [post]);

  if (!post) {
    return null;
  }

  const canSubmit = replyText.trim().length > 0;
  const isOwnPost = post.handle === currentUserHandle;

  const handleSend = () => {
    if (!canSubmit) {
      return;
    }
    onSubmitReply(post.id, replyText.trim());
    setReplyText('');
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlayFill}>
        {/* True backdrop is a sibling of the KAV/content, never an ancestor
            wrapping it, so it can't compete with the ScrollView's own pan
            responder — vertical swipes strictly scroll, never dismiss. */}
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
                  <Avatar handle={post.handle} profilePictureUrl={post.profilePictureUrl} size={32} />
                  <Text style={styles.feedHandle} numberOfLines={1} ellipsizeMode="tail">
                    {post.handle}
                  </Text>
                  <Text style={styles.feedLevelTag}>[LVL {post.level}]</Text>
                  <Text style={styles.feedTimestamp} numberOfLines={1} ellipsizeMode="tail">
                    {post.timestamp}
                  </Text>
                </View>
                <Text style={styles.feedTitle} numberOfLines={2} ellipsizeMode="tail">
                  {post.title}
                </Text>
                <Text style={styles.bodyText}>{post.body}</Text>

                <View style={styles.feedBottomRow}>
                  <Pressable
                    onPress={() => onToggleLike(post.id)}
                    style={styles.likeButton}
                    hitSlop={8}
                  >
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
              </View>

              <SectionHeader label={`REPLIES (${post.replies.length})`} />

              {post.replies.length === 0 ? (
                <View style={styles.overlayCard}>
                  <Text style={styles.bodyText}>
                    No replies yet. Be the first to reinforce this operator.
                  </Text>
                </View>
              ) : (
                post.replies.map((reply) => (
                  <View key={reply.id} style={styles.replyCard}>
                    <View style={styles.replyHeaderRow}>
                      <View style={styles.replyHandleRow}>
                        <Avatar
                          handle={reply.handle}
                          profilePictureUrl={reply.profilePictureUrl}
                          size={22}
                        />
                        <Text style={styles.replyHandle} numberOfLines={1} ellipsizeMode="tail">
                          {reply.handle}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => onToggleReplyLike(post.id, reply.id)}
                        style={styles.likeButton}
                        hitSlop={8}
                      >
                        <Text style={[styles.likeIcon, reply.liked && styles.likeIconActive]}>
                          {reply.liked ? '\u2665' : '\u2661'}
                        </Text>
                        <Text
                          style={[styles.likeCountText, reply.liked && styles.likeCountTextActive]}
                        >
                          {reply.likeCount}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.bodyText}>{reply.text}</Text>
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
                />
                {!isOwnPost && (
                  <Text style={styles.charCounter}>
                    Sending a reply awards +{SUPPORT_SCORE_REWARD} Support Score.
                  </Text>
                )}
              </View>

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
                  <Text style={styles.primaryButtonText}>{'\u27A4'}  SEND SUPPORT REPLY</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
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
  onSubmit: (title: string, body: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!visible) {
      setTitle('');
      setBody('');
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const canSubmit = title.trim().length > 0 && body.trim().length >= 10;

  const handlePost = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit(title.trim(), body.trim());
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
                />
              </View>

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
                  <Text style={styles.primaryButtonText}>{'\u27A4'}  PUBLISH TO GRID</Text>
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
  const {
    userProfile,
    communityFeed,
    addReply,
    addStandalonePost,
    toggleLike,
    toggleReplyLike,
    registerPostView,
  } = useAppContext();
  const [inspectedPost, setInspectedPost] = useState<FeedPost | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [createPostVisible, setCreatePostVisible] = useState(false);

  // Re-derive the open post from the live feed on every render so the modal
  // reflects newly added replies/likes immediately instead of a stale
  // snapshot.
  const activeOpenPost = openPostId
    ? communityFeed.find((post) => post.id === openPostId) ?? null
    : null;

  // Requirement (Point 2): register a "view" for the current user exactly
  // once per post — repeat opens by the same user never inflate the count.
  useEffect(() => {
    if (openPostId) {
      registerPostView(openPostId, userProfile.handle);
    }
  }, [openPostId, registerPostView, userProfile.handle]);

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
        contentContainerStyle={[
          styles.screenScroll,
          {
            paddingTop: insets.top + HEADER_BRAND_HEIGHT + 16,
            paddingBottom: insets.bottom + 80 + 140,
          },
        ]}
        ListHeaderComponent={
          <View>
            <TierBanner level={userProfile.level} />
            <SectionHeader label="ACTION REPORT TIMELINE" />
          </View>
        }
        renderItem={({ item }) => (
          <FeedCard
            post={item}
            onPressHandle={setInspectedPost}
            onPressPost={(post) => setOpenPostId(post.id)}
            onToggleLike={toggleLike}
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

      <InspectProfileModal post={inspectedPost} onClose={() => setInspectedPost(null)} />

      <PostDetailModal
        post={activeOpenPost}
        currentUserHandle={userProfile.handle}
        onClose={() => setOpenPostId(null)}
        onSubmitReply={addReply}
        onToggleLike={toggleLike}
        onToggleReplyLike={toggleReplyLike}
      />

      <CreatePostModal
        visible={createPostVisible}
        onClose={() => setCreatePostVisible(false)}
        onSubmit={(title, body) => {
          addStandalonePost(title, body);
          setCreatePostVisible(false);
        }}
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
  entry: JournalEntry;
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
          {entry.date}
        </Text>
        <Text style={styles.journalTier}>[ TIER: LVL {entry.level} ]</Text>
      </View>
      <View style={styles.questDivider} />
      <Text style={styles.bodyText} numberOfLines={expanded ? undefined : 3} ellipsizeMode="tail">
        {entry.text}
      </Text>
      <Text style={styles.tapHintText}>{expanded ? 'TAP TO COLLAPSE' : 'TAP TO EXPAND'}</Text>
    </Pressable>
  );
}

// Requirement (Point 6): dedicated Journal screen mirroring the clean
// layout of the Community feed — chronological entries with a true
// infinite-scroll archive loader (FlatList + onEndReached) and per-entry
// expansion — with zero social features (no likes/views/replies).
function JournalModal({
  visible,
  onClose,
  journals,
}: {
  visible: boolean;
  onClose: () => void;
  journals: JournalEntry[];
}) {
  const insets = useSafeAreaInsets();
  const [visibleCount, setVisibleCount] = useState(JOURNAL_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(new Set());
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setVisibleCount(JOURNAL_PAGE_SIZE);
      setExpandedEntryIds(new Set());
      setLoadingMore(false);
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
    </Modal>
  );
}

function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { userProfile, userJournals } = useAppContext();
  const [journalVisible, setJournalVisible] = useState(false);
  const [identityModalVisible, setIdentityModalVisible] = useState(false);
  const [socialModalVisible, setSocialModalVisible] = useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);

  const initials = userProfile.handle
    .replace('@', '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);

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
        <TierBanner level={userProfile.level} />

        {/* Requirement (Point 7): every informational section is now an
            interactive, clickable card with haptic feedback that opens a
            dedicated popup with deeper detail. */}
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
            {userProfile.handle}
          </Text>
          <View style={styles.streakBadge}>
            <Text style={styles.streakBadgeText}>
              {'\u25B2'} STREAK: {userProfile.streak} DAYS UNBROKEN
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
            <Text style={styles.gridScore}>{userProfile.socialScore}</Text>
            <Text style={styles.gridSubtext}>
              Points accumulated via real-world social friction.
            </Text>
          </SpringPressable>
          <SpringPressable
            onPress={() => {
              triggerHaptic();
              setSupportModalVisible(true);
            }}
            containerStyle={styles.gridBlockContainer}
            style={({ pressed }) => [styles.card, styles.gridBlock, pressed && styles.cardPressed]}
          >
            <Text style={styles.gridHeader} numberOfLines={2} ellipsizeMode="tail">
              COMMUNITY SUPPORT SCORE
            </Text>
            <Text style={styles.gridScore}>{userProfile.supportScore}</Text>
            <Text style={styles.gridSubtext}>
              Points accumulated via direct peer reinforcement.
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
              {userJournals.length} logged reflections — tap to review your timeline archive.
            </Text>
          </View>
          <Text style={styles.accordionChevron}>{'\u203A'}</Text>
        </SpringPressable>
      </Reanimated.ScrollView>

      <AppHeader />

      <JournalModal
        visible={journalVisible}
        onClose={() => setJournalVisible(false)}
        journals={userJournals}
      />

      <InfoPopupModal
        visible={identityModalVisible}
        onClose={() => setIdentityModalVisible(false)}
        title="ACCOUNT OVERVIEW"
      >
        <Text style={styles.bodyText}>
          Operator {userProfile.handle} is currently Level {userProfile.level} with an unbroken
          streak of {userProfile.streak} days. Every verified quest and community reply feeds
          directly into the Social and Support scores below.
        </Text>
      </InfoPopupModal>

      <InfoPopupModal
        visible={socialModalVisible}
        onClose={() => setSocialModalVisible(false)}
        title="SOCIAL SCORE BREAKDOWN"
      >
        <Text style={styles.bodyText}>
          Points accumulated via real-world social friction. Every verified quest submission
          awards +{SOCIAL_SCORE_REWARD} Social Score — current total: {userProfile.socialScore}.
        </Text>
      </InfoPopupModal>

      <InfoPopupModal
        visible={supportModalVisible}
        onClose={() => setSupportModalVisible(false)}
        title="SUPPORT SCORE BREAKDOWN"
      >
        <Text style={styles.bodyText}>
          Points accumulated via direct peer reinforcement. Replying to another operator&apos;s
          field report awards +{SUPPORT_SCORE_REWARD} Support Score — current total:{' '}
          {userProfile.supportScore}.
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
  const { userProfile, userJournals, communityFeed } = useAppContext();
  const [lockModalVisible, setLockModalVisible] = useState(false);

  const socialRatio = userProfile.socialScore / MAX_SOCIAL_SCORE;
  const supportRatio = userProfile.supportScore / MAX_SUPPORT_SCORE;
  const broadcastCount = communityFeed.filter(
    (post) => post.handle === userProfile.handle,
  ).length;

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
              {userProfile.socialScore}
              <Text style={styles.growthMetricMax}> / {MAX_SOCIAL_SCORE}</Text>
            </Text>
          </View>
          <ProgressBar ratio={socialRatio} />
          <Text style={styles.progressMetricPct}>{Math.round(socialRatio * 100)}% to next tier</Text>

          <View style={styles.progressMetricDivider} />

          <View style={styles.progressMetricHeaderRow}>
            <Text style={styles.growthMetricLabel}>SUPPORT GROWTH</Text>
            <Text style={styles.progressMetricValue}>
              {userProfile.supportScore}
              <Text style={styles.growthMetricMax}> / {MAX_SUPPORT_SCORE}</Text>
            </Text>
          </View>
          <ProgressBar ratio={supportRatio} />
          <Text style={styles.progressMetricPct}>{Math.round(supportRatio * 100)}% to next tier</Text>
        </View>

        <SectionHeader label="MILESTONES" />
        <View style={styles.card}>
          <View style={styles.vitalsRow}>
            <Text style={styles.vitalsLabel}>GROWTH STAGE</Text>
            <Text style={styles.vitalsValue}>
              {userProfile.level} — {getStageTitle(userProfile.level).toUpperCase()}
            </Text>
          </View>
          <View style={styles.vitalsRow}>
            <Text style={styles.vitalsLabel}>UNBROKEN STREAK</Text>
            <Text style={styles.vitalsValue}>{userProfile.streak} DAYS</Text>
          </View>
          <View style={styles.vitalsRow}>
            <Text style={styles.vitalsLabel}>QUESTS COMPLETED</Text>
            <Text style={styles.vitalsValue}>{userJournals.length}</Text>
          </View>
          <View style={[styles.vitalsRow, styles.vitalsRowLast]}>
            <Text style={styles.vitalsLabel}>REPORTS BROADCAST</Text>
            <Text style={styles.vitalsValue}>{broadcastCount}</Text>
          </View>
        </View>

        <SystemLockPreviewCard
          onPress={() => {
            triggerHaptic();
            setLockModalVisible(true);
          }}
        />

        <SectionHeader label="COMPLETED QUEST ARCHIVE" />
        {userJournals.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.bodyText}>
              No completed quests logged yet. Clear a challenge to start your archive.
            </Text>
          </View>
        ) : (
          userJournals.map((entry) => (
            <View key={entry.id} style={styles.card}>
              <View style={styles.journalMetaRow}>
                <Text style={styles.journalDate}>{entry.date}</Text>
                <Text style={styles.journalTier}>LEVEL {entry.level}</Text>
              </View>
              <View style={styles.growthDivider} />
              <Text style={styles.bodyText} numberOfLines={3} ellipsizeMode="tail">
                {entry.text}
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
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="light" />
            <RootTabs />
          </NavigationContainer>
        </AppProvider>
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
    fontFamily: DISPLAY,
    color: COLORS.body,
    fontSize: 14,
    fontWeight: '800',
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
    fontFamily: DISPLAY,
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
    fontFamily: DISPLAY,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  growthMetricValue: {
    fontFamily: DISPLAY,
    color: COLORS.body,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  growthMetricMax: {
    fontFamily: SANS,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  growthMetricPct: {
    fontFamily: SANS,
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
    fontFamily: DISPLAY,
    color: COLORS.body,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  streakCaption: {
    fontFamily: SANS,
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
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
  progressMetricDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 18,
  },
});
