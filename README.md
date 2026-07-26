# XTROVERT

A cross-platform (Android-first, iOS-ready) mobile MVP built with Expo. XTROVERT is a
tactical social-exposure app: users complete real-world social "quests," verify them
with a written field report, and share progress to a community feed. The visual identity
is a dark, masculine **"Tactical Green"** system (deep obsidian canvas, neon-green
accents, ambient glows, and a parallax cosmos background).

---

## Tech Stack

| Concern | Choice |
| --- | --- |
| Framework | Expo SDK **54** / React Native **0.81** / React **19** |
| Language | TypeScript (strict) |
| Navigation | `@react-navigation/native` + `@react-navigation/bottom-tabs` (v7) |
| Backend / Auth | **Supabase** (`@supabase/supabase-js`) with AsyncStorage session persistence |
| Animation | `react-native-reanimated` v4 (UI-thread animations, parallax, springs) |
| Safe area | `react-native-safe-area-context` |
| Haptics | `expo-haptics` |
| Typography | **DM Sans** (`@expo-google-fonts/dm-sans` + `expo-font`) on dynamic profile nodes |
| Entry point | `expo/AppEntry.js` (see `package.json` `"main"`) |

> **Important:** Expo has breaking changes between versions. Always consult the exact
> versioned docs at <https://docs.expo.dev/versions/v57.0.0/> before writing new code.
> See `AGENTS.md`.

---

## Architecture Overview

The UI and local MVP state engine still live in a single file — **[`App.tsx`](./App.tsx)** —
organized into clearly commented sections (tokens, types, seed data, screens, modals,
styles). **Supabase auth and live profile data** are extracted into the `lib/` folder so
session management and database reads stay isolated from the visual layer.

There is no `src/` app code in the runtime path (a legacy `src/` folder is excluded from
type-checking via `tsconfig.json`).

### Provider tree (outer → inner)

```
SafeAreaProvider
└── AuthProvider          # lib/AuthProvider.tsx — Supabase session bootstrap
    └── ProfileProvider   # lib/ProfileProvider.tsx — daily login RPC + live profile
        └── AppProvider   # App.tsx — in-memory MVP state (quests, feed, journals)
            └── NavigationContainer → RootTabs
```

### `lib/` modules

| File | Responsibility |
| --- | --- |
| [`lib/supabase.js`](./lib/supabase.js) | Initializes the Supabase client with `AsyncStorage` session persistence and `react-native-url-polyfill`. |
| [`lib/AuthProvider.tsx`](./lib/AuthProvider.tsx) | Production auth wrapper: restores session on boot, subscribes to `onAuthStateChange`, calls `signInAnonymously()` only when no session exists. Exposes `useAuth()` with `authStatus`, `user`, `session`, `isAnonymous`, `isPermanent`. Designed to support upgrading anonymous users to permanent accounts later (email/OAuth) without blocking `updateUser` / `linkIdentity`. |
| [`lib/ProfileProvider.tsx`](./lib/ProfileProvider.tsx) | Waits for auth confirmation, then runs `register_daily_login` **once per active session** (ref-guarded), fetches the live `profiles` row, and exposes `useProfile()`. Network/RPC failures are logged silently; the UI never crashes. |

### File map (`App.tsx`, top to bottom)

1. **Imports** — React, RN primitives, Reanimated, navigation, safe-area, haptics, fonts, `lib/` providers.
2. **Section 1 — Design Tokens** — `COLORS`, font families (`SANS`, `DISPLAY`, `DM_SANS_*`), layout constants, `triggerHaptic()`.
3. **Types** — `UserProfile`, `Quest`, `Reply`, `FeedPost`, `JournalEntry`, `AppContextShape`.
4. **Section 2 — Seed Mock Data** — `QUEST_POOL`, `SEED_FEED`, `SEED_JOURNALS`, `QUOTE_POOL`, `STAGE_TITLES`, `TICKER_ITEMS`.
5. **Section 3 — State Engine** — `AppContext`, `AppProvider`, helper functions.
6. **Shared UI Primitives** — `SpringPressable`, `Starfield`, `ProgressRing`, `ProgressBar`, `AppHeader`, `SectionHeader`, `Avatar`, `InfoPopupModal`, etc.
7. **Tab 1 — Home (`ChallengesScreen`)** — `IdentitySlot`, `GrowthStageCard`, `TodayChallengeCard`, `DayStreakCard`, `DailyQuoteCard`, verification/quest modals.
8. **Tab 2 — Progress (`ProgressScreen`)** — growth analytics, milestones, quest archive, System Lock card/modal.
9. **Tab 3 — Community** — feed cards, post detail, create post, inspect profile modals.
10. **Tab 4 — Profile** — identity card, Social Score grid, journal archive.
11. **Section 4 — Navigation Shell** — `RootTabs` (4 tabs), tab icons/labels, nav theme.
12. **Root App** — `useFonts` gate + provider composition.
13. **Styles** — one large `StyleSheet.create` block.

---

## Dual State Model

The app currently runs **two parallel state layers** during the Supabase migration:

### 1. Supabase live state (`useAuth()` + `useProfile()`)

Source of truth for identity and progression metrics displayed in the header streak pill,
Home dashboard cards, Progress tab, and Profile Social Score grid:

| Field | Supabase column | Bound in UI |
| --- | --- | --- |
| Username | `profiles.username` | `IdentitySlot` (Home body) |
| Bio | `profiles.bio` | `IdentitySlot` (Home body) |
| Rank | `profiles.rank_title` | `GrowthStageCard` stage title |
| Social Score | `profiles.social_score` | Growth card, Progress tab, Profile grid |
| Streak | `profiles.streak_count` | Header 🔥 pill, `DayStreakCard` |

While profile data is loading, bound UI nodes render `---` placeholders — never
`undefined`, `NaN`, or a red screen.

### 2. In-memory MVP state (`useAppContext()`)

Local React Context that still powers quest flow, community feed, journals, likes/replies,
and modal interactions. State resets on app restart for features not yet persisted to
Supabase.

- **`userProfile`** — local handle, level, `socialScore`, `streak`, `lastCompletedDate`.
- **`activeQuest`** — current quest from `QUEST_POOL`.
- **`communityFeed`** / **`userJournals`** — seed + runtime mutations.

**Progression metric:** The app has consolidated to a **single `social_score`** metric.
Support Growth / Support Score UI has been removed everywhere. Replying to another
operator's post awards `REPLY_SCORE_REWARD` (+10) to local `socialScore`; verified
quests award `SOCIAL_SCORE_REWARD` (+50). The legacy `supportScore` field remains in
types/seed data but is no longer displayed.

---

## Authentication (Phase 1)

Boot sequence in `AuthProvider`:

1. Register `supabase.auth.onAuthStateChange()` first (login, logout, token refresh).
2. Call `supabase.auth.getSession()` to restore any persisted session.
3. **Only if no session exists**, call `supabase.auth.signInAnonymously()`.

`authStatus` values: `loading` | `anonymous` | `authenticated` | `signed_out` | `error`.

**Supabase Dashboard requirement:** enable **Anonymous sign-ins** under
Authentication → Providers.

Anonymous users can later be upgraded to permanent accounts via standard Supabase
`updateUser()` / `linkIdentity()` flows — the provider does not block those APIs.

---

## Profile & Daily Login (Phase 2)

On auth confirmation, `ProfileProvider`:

1. Calls `supabase.rpc('register_daily_login')` **once per active user session**
   (tracked via `useRef(userId)` — safe against re-renders).
2. Uses the returned `profiles` row as the profile source.
3. Falls back to a plain `profiles` select if the RPC fails.

### Daily login vs. streak (important distinction)

`register_daily_login()` is **login-only** — it just records `last_login_date` and never
touches `streak_count` or `social_score`. The streak is entirely **challenge-driven**:

| Event | Behavior |
| --- | --- |
| Log in (any number of times) | No streak/XP change at all |
| First challenge completed on a calendar day | `streak_count += 1` (or reset to `1` after a missed day) + XP awarded |
| Additional challenges same day | XP awarded only; streak unchanged |

This logic lives entirely in `complete_challenge()` (see below) using a client-supplied
*local* calendar date bounded to ±1 day of true server time — this avoids a timezone bug
where server-UTC-only date math could silently misalign with a user's actual local day
near midnight. Each first-of-day completion also writes a row to `streak_days`, which is
what actually powers the weekly Mon–Sun dot tracker (real history, not a synthetic guess
from the streak number). The database trigger `evaluate_rank_on_score_change`
auto-updates `rank_title` whenever `social_score` changes.

---

## Supabase Database

Full schema lives in [`supabase/schema.sql`](./supabase/schema.sql). Run it in the
Supabase SQL Editor to create tables, functions, triggers, and RLS policies.

### Tables

| Table | Purpose |
| --- | --- |
| `ranks` | Progression milestones (`title`, `xp_required`, `emblem_url`). Public read-only. |
| `profiles` | 1:1 with `auth.users` — `username`, `bio`, `rank_title`, `social_score`, `streak_count`, `last_login_date`, `last_streak_date`, `last_username_change_at`, `last_bio_change_at`. `username`/`bio` are only writable via `update_username()`/`update_bio()` (cooldown-enforced), never a direct client `UPDATE`. |
| `challenges` | Challenge pool (`title`, `description`, `difficulty`, `xp_reward`, `required_rank`, `is_active`). Read-only for clients; ~50+ seeded placeholder challenges across all 5 ranks. |
| `user_completed_challenges` | Per-user challenge completion history (`challenge_id`, `xp_awarded`, `completed_at`). |
| `journal_entries` | Private reflections (`content`, `is_broadcasted`), either linked to a challenge or free-form (`challenge_id IS NULL`) via `add_journal_entry()`. |
| `streak_days` | One row per user per calendar day a challenge was first completed that day — real history backing the weekly dot tracker. Read-only for clients; only `complete_challenge()` writes to it. |
| `daily_quotes` | Motivational quote pool for the Home quote card. **Zero client grants at all** (not even `SELECT`) — the only access path is `get_daily_quote()`, which deterministically returns one quote per calendar day. |
| `community_posts` | Broadcasted / standalone posts (`title`, `content`, `tag`, `view_count`, `journal_entry_id`). `tag` is optional and constrained to a fixed set (`Success Stories`, `Struggling`, `Motivation`, `Advice`, `Question`, `Milestone`, `Accountability`, `Mental Health`) by a `CHECK` constraint. |
| `post_likes` / `post_replies` / `post_views` | Community engagement + per-user view dedup. |
| `blocked_users` / `content_reports` | Safety & moderation. |
| `conversations` / `conversation_members` / `messages` | 1:1 **and group** real-time messaging (`conversations.is_group`, `conversations.title`). |

### Key server functions

- **`handle_new_user`** (trigger) — auto-creates a `profiles` row on signup (including anonymous).
- **`register_daily_login()`** — login-only; records `last_login_date`. Streak/XP are challenge-driven (see below).
- **`complete_challenge()`** — atomic challenge completion: records completion + journal (+ optional broadcast), awards XP, and increments the streak once per calendar day using a client-local date bounded to ±1 day of true server time.
- **`add_journal_entry()`** — free-form private journal entry with no challenge required; same 60-char anti-spam floor.
- **`update_username()` / `update_bio()`** — server-validated, cooldown-enforced (7 days / 1 day) self-edits. A resubmitted unchanged value is a true no-op (no write, no cooldown reset).
- **`get_my_profile()`** — the only way a user can read their own full profile row (score/streak/cooldowns), since direct `SELECT` on `profiles` is column-restricted.
- **`get_daily_quote()`** — deterministic, no-input rotation over `daily_quotes`; the table itself has no client grants.
- **`increment_post_view()`** — dedup-safe view counter.
- **`find_or_create_direct_conversation()`** — starts/opens a 1:1 chat.
- **`create_group_conversation(p_member_ids, p_title)`** — creates a group chat (2-20 members incl. caller); validates every target id is a real profile, caps membership, de-dupes. `is_conversation_member()`/RLS need no changes for groups — they already generalize to N members.
- **`is_conversation_member()`** — SECURITY DEFINER helper used by messaging RLS to avoid recursion.
- **`evaluate_rank_on_score_change`** (trigger) — promotes `rank_title` when `social_score` crosses a rank threshold.

### Anti-spam / rate limiting

RLS controls *who* can write a row; these `BEFORE INSERT` triggers/checks control *what* and *how often*, and they run inside Postgres itself — a script calling the raw Supabase REST/JS API directly is bound by them exactly the same as the app is:

| Surface | Minimum length | Cooldown |
| --- | --- | --- |
| `community_posts` (`enforce_post_rules`) | title ≥ 3 chars, content ≥ 20 chars | 15s per user |
| `post_replies` (`enforce_reply_rules`) | content ≥ 10 chars | 8s per user (incl. replying to your own post) |
| `messages` (`enforce_message_rules`) | non-empty, ≤ 2000 chars | 2s per user, across every conversation (1:1 + group) |
| `add_journal_entry()` | 60-4000 chars | 15s per user (shared with `complete_challenge()`'s journal writes) |
| `complete_challenge()` | journal 60-4000 chars | 20s per user between completions |

The 15s post cooldown is deliberately shorter than `complete_challenge()`'s own 20s cooldown so a normal challenge broadcast can never be blocked by it. A too-short broadcast title falls back to `'Field Report'` rather than raising, so it can never abort an otherwise-valid challenge completion.

### Row Level Security

- `ranks` — public read-only.
- All per-user tables (`profiles`, `journal_entries`, `user_completed_challenges`, likes/replies/views, blocks/reports, conversations/members/messages) enforce ownership/membership via `auth.uid()`.

> Legacy prototype tables `completed_challenges` and `community_support_log` were removed. The full production schema, RLS policies, grants, and server-side functions are consolidated in `supabase/schema.sql` (ranks + profiles) and `supabase/integration.sql` (everything else) — both idempotent and safe to re-run, and both regenerated directly from the live database.

---

## Navigation

A single bottom-tab navigator (`RootTabs`) with **four screens** and no native headers
(`headerShown: false`). Each screen renders its own fixed `AppHeader`.

| Tab label | Route name | Component | Purpose |
| --- | --- | --- | --- |
| Home | `Challenges` | `ChallengesScreen` | Dashboard: identity, growth, today's challenge, streak, daily quote |
| Progress | `Progress` | `ProgressScreen` | Growth analytics, milestones, quest archive, System Lock |
| Community | `Community` | `CommunityScreen` | Global feed, post detail, create post |
| Profile | `Profile` | `ProfileScreen` | Identity card, Social Score, journal archive |

The tab bar is absolutely positioned; screens pad scroll content by
`insets.bottom + 80 + 140` to clear it. The Home tab registers a `tabPress` listener
that aborts an open verification overlay when the tab icon is tapped.

---

## Screens & Key Flows

### Home (`ChallengesScreen`)

Vertical card order:

1. **`IdentitySlot`** — `@username` + `bio` from Supabase (dashboard body, not the header).
2. **`GrowthStageCard`** — growth ring + rank title (`rank_title`) + Social Growth bar (`social_score`). Tapping opens score-breakdown modal.
3. **`TodayChallengeCard`** — active quest hero with difficulty pill and "Accept Challenge" CTA → `QuestDetailModal` → `VerificationOverlay`.
4. **`DayStreakCard`** — streak count (`streak_count`) + M–S day pills from real per-day history (`streak_days`), so gaps render correctly.
5. **`DailyQuoteCard`** — live daily quote from Supabase (`get_daily_quote()`), rotates automatically once per calendar day.
6. **Journal nav card** — mirrors the Profile tab's Journal button; opens the shared `JournalModal`, which also has a "+ New Journal Entry" action for free-form logs.

Quest verification requires a ≥60-char field report. On submit → `submitVerification`,
then a "Quest Cleared" state with **"Load Another Challenge."**

### Progress (`ProgressScreen`)

- **Growth Analytics** — single Social Growth metric from Supabase `social_score`.
- **Milestones** — growth stage, streak, quests completed, reports broadcast.
- **System Lock** card/modal (cosmetic screen-time lockout messaging).
- **Completed Quest Archive** — reads from `userJournals` (local, pending Supabase sync).

### Community (`CommunityScreen`)

- Reanimated `FlatList` feed of **`FeedCard`**s.
- Tapping a card → **`PostDetailModal`** (replies, likes, reply composer). Replying to
  another operator awards +10 Social Score locally.
- Tapping a handle → **`InspectProfileModal`** (shows Social Score only).
- FAB → **`CreatePostModal`**.

### Profile (`ProfileScreen`)

- Identity card with avatar, handle, streak badge → account overview modal.
- Single **Social Fitness Score** grid card (live `social_score` from Supabase).
- Journal nav card → **`JournalModal`** with infinite scroll.

---

## Fixed Header (`AppHeader`)

Absolutely positioned at the top of every screen with a solid `headerBg` fill.

**Layout boundary (do not violate):**

- **Left:** XTROVERT wordmark (`X` in neon green) — brand identity, never replaced by user data.
- **Right:** status pills only:
  - 🔥 **Streak** — bound to Supabase `profiles.streak_count` (`---` while loading).
  - 💬 **Notifications** — derived from local community feed (replies on own posts).

Username, bio, and rank text belong in the **Home dashboard body** (`IdentitySlot`,
`GrowthStageCard`), not in the header banner.

Screens offset scroll content by `insets.top + HEADER_BRAND_HEIGHT + 16`.

---

## Design System ("Tactical Green")

Defined in the `COLORS` token object:

| Token | Value | Use |
| --- | --- | --- |
| `canvas` / `headerBg` | `#0B0E0D` | Deep obsidian background / header fill |
| `surface` / `elevated` | `#131A16` | Card and container surfaces |
| `border` | `#1E2C24` | 1px structural card borders |
| `divider` | `rgba(142,175,157,0.16)` | Hairline internal dividers |
| `neon` | `#00FF66` | Primary accent — logo, buttons, progress fills, active days |
| `emerald` | `#10B981` | Secondary accent / pressed states |
| `glow` | `rgba(0,255,102,0.22)` | Ambient box-shadow glows |
| `body` | `#F3F4F6` | Primary off-white type |
| `muted` | `#8EAF9D` | Sage-green subtitles and descriptions |
| `onNeon` | `#04150C` | Dark ink on neon-filled buttons |

**Typography:**

- **DM Sans** (`DMSans_400Regular` … `DMSans_800ExtraBold`) — loaded via `useFonts` at
  app root; applied to all dynamic profile text nodes (header streak pill, identity slot,
  growth card, streak card, Progress/Profile score displays).
- **SF Pro** (`SANS` / `DISPLAY`) — system stack for remaining UI chrome.
- **`MONO`** — Menlo / monospace for telemetry-style readouts.

### Motion (all Reanimated, UI-thread)

- **`Starfield`** — parallax neon particle field behind each screen (`scrollY × 0.16`).
- **`SpringPressable`** — spring scale-down on press for cards and CTAs.
- **`ProgressRing`** / **`ProgressBar`** — dependency-free determinate progress primitives.

### Modals

All popups use React Native's native `Modal` (`transparent`, `animationType="fade"`,
`statusBarTranslucent`). The dimming backdrop is always a **sibling** `Pressable` (never
an ancestor of scroll content) so vertical swipes scroll content cleanly.

---

## Project Layout

```
Xtrovert/
├── App.tsx                 # Entire UI + local MVP state engine (single-file architecture)
├── lib/
│   ├── supabase.js         # Supabase client initialization
│   ├── AuthProvider.tsx    # Session bootstrap + anonymous auth
│   └── ProfileProvider.tsx # Daily login RPC + live profile fetch
├── supabase/
│   └── schema.sql          # Database tables, functions, triggers, RLS
├── app.json                # Expo app config
├── package.json            # Deps; "main": "expo/AppEntry.js"
├── tsconfig.json           # Strict TS; excludes node_modules and legacy src/
├── assets/                 # Icons, splash, images
└── README.md
```

---

## Getting Started

```bash
npm install
npx expo start        # then press 'a' for Android, or scan the QR in Expo Go
```

Other scripts (`package.json`): `npm run android`, `npm run ios`, `npm run web`,
`npm run lint`.

### Supabase setup

1. Create a Supabase project and copy the **Project URL** and **Anon Key** into
   [`lib/supabase.js`](./lib/supabase.js).
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor.
3. Enable **Anonymous sign-ins** under Authentication → Providers.

### Verifying a build

```bash
npx tsc --noEmit
npx expo export:embed --platform android --dev false \
  --bundle-output dist-verify/android.bundle --assets-dest dist-verify/assets
```

---

## Conventions & Constraints

- **Single-file UI:** keep screens, modals, and styles in `App.tsx` under existing section
  banners. Extract only auth/database concerns into `lib/`.
- **Do not reintroduce `expo-router`** — navigation uses React Navigation bottom tabs.
- **Accents via tokens:** never hardcode hex accents; use the `COLORS` object.
- **Header layout boundary:** the XTROVERT wordmark stays in the header; user identity
  (`username`, `bio`, `rank_title`) renders in dashboard body cards only.
- **Single progression metric:** `social_score` is the only displayed score. Do not
  re-add Support Growth / Support Score UI.
- **Loading safety:** bound Supabase values must use `---` placeholders while
  `useProfile().isLoading` is true; never render raw `undefined`/`NaN`.
- **RPC once per session:** `register_daily_login` must be ref-guarded — never call on
  every re-render.
- **Tunable constants** at the top of `App.tsx`:
  `HEADER_BRAND_HEIGHT`, `SOCIAL_SCORE_REWARD`, `REPLY_SCORE_REWARD`, `MAX_SOCIAL_SCORE`,
  `JOURNAL_PAGE_SIZE`, `JOURNAL_LOAD_DELAY_MS`, parallax rate (`0.16`).

---

## Testing with multiple identities (messaging, groups, community)

Real users are always anonymous by default — there is no email/password UI in the
production app on purpose. To exercise 1:1 messaging, group chats, and the community
feed as *different* people, this repo ships a **`__DEV__`-only test panel** (compiled
out of production builds entirely) inside **Profile → Account Overview**:

- It calls the same `supabase.auth.signInWithPassword()` / `signOut()` APIs the real
  Supabase Auth SDK exposes — nothing custom, nothing that bypasses RLS.
- It lets you sign in as a **permanent** test account (email + password), created once
  via the Supabase Dashboard (Authentication → Users → Add user). This never touches
  `auth.users` directly from application code.
- Signing out drops the current session; the app does **not** auto-mint a new anonymous
  session until you fully restart it (so you don't lose your own anonymous progress by
  accident mid-test — reload only when you're done testing).

Group chats (`create_group_conversation` RPC) reuse the exact same RLS the 1:1 flow
already had — `is_conversation_member()` never assumed exactly 2 members, so no policy
changes were needed, only the creation path and a UI member-picker (drawn only from
users you're already allowed to see: your own DMs and anyone who has posted/replied in
Community — never a full user directory).
