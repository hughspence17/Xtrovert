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
| Framework | Expo SDK **57** / React Native **0.86** / React **19** |
| Language | TypeScript (strict) |
| Navigation | `@react-navigation/native` + `@react-navigation/bottom-tabs` (v7) |
| Animation | `react-native-reanimated` v4 (UI-thread animations, parallax, springs) |
| Safe area | `react-native-safe-area-context` |
| Haptics | `expo-haptics` |
| Entry point | `expo/AppEntry.js` (see `package.json` `"main"`) |

> **Important:** Expo has breaking changes between versions. Always consult the exact
> versioned docs at <https://docs.expo.dev/versions/v57.0.0/> before writing new code.
> See `AGENTS.md`.

---

## Architecture Overview

The **entire application lives in a single file: [`App.tsx`](./App.tsx)**. This is a
deliberate single-file architecture — tokens, types, seed data, the state engine,
navigation, all screens, and all modals are colocated and organized into clearly
commented sections. There is no `src/` app code in the runtime path (a legacy
`src/` folder is excluded from type-checking via `tsconfig.json`).

### File map (`App.tsx`, top to bottom)

1. **Imports** — React, React Native primitives, Reanimated, navigation, safe-area, haptics.
2. **Section 1 — Design Tokens** — the `COLORS` palette, font families (`MONO`, `SANS`),
   layout constants, and the `triggerHaptic()` helper.
3. **Types** — all TypeScript interfaces (`UserProfile`, `Quest`, `Reply`, `FeedPost`,
   `JournalEntry`, `AppContextShape`).
4. **Section 2 — Seed Mock Data** — `QUEST_POOL`, `SEED_FEED`, `SEED_JOURNALS`, `TICKER_ITEMS`.
5. **Section 3 — State Engine** — `AppContext`, `AppProvider`, and helper functions.
6. **Shared UI Primitives** — `TierBanner`, `SpringPressable`, `Starfield`, `TierOrb`,
   `AppHeader`, `SectionHeader`, `Avatar`, `InfoPopupModal`, `LiveTicker`.
7. **Tab 1 — Challenges** — `VerificationOverlay`, `QuestPreviewCard`, `QuestDetailModal`,
   `SystemLockPreviewCard`, `SystemLockModal`, `ChallengesScreen`.
8. **Tab 2 — Community** — `FeedCard`, `InspectProfileModal`, `PostDetailModal`,
   `CreatePostModal`, `CommunityScreen`.
9. **Tab 3 — Profile** — `JournalEntryCard`, `JournalModal`, `ProfileScreen`.
10. **Section 4 — Navigation Shell** — `RootTabs`, tab config, `TabIcon`, nav theme.
11. **Root App** — `export default function App()` (provider + navigation composition).
12. **Styles** — one large `StyleSheet.create` block at the bottom.

---

## State Management

All app state is held in memory via a single React Context. **There is no backend,
database, or persistence** — state resets on app restart. This is intentional for the MVP.

- **`AppContext` / `AppProvider`** wrap the whole app and expose everything through
  `useAppContext()`.
- **`AppContextShape`** is the contract. State fields:
  - `userProfile: UserProfile` — handle, level, `socialScore`, `supportScore`, `streak`,
    and `lastCompletedDate` (ISO date string used to gate streaks to once per calendar day).
  - `activeQuest: Quest` — the currently displayed quest, cycled from `QUEST_POOL`.
  - `communityFeed: FeedPost[]` — the global timeline.
  - `userJournals: JournalEntry[]` — the user's private log entries.
- Actions (all memoized callbacks):
  - `submitVerification(text, broadcast)` — logs a journal entry, optionally broadcasts a
    post, awards +50 Social Score, and increments the streak (once per calendar day).
  - `loadNextChallenge()` — cycles `activeQuest` to the next item in `QUEST_POOL`.
  - `addReply(postId, text)` — appends a reply; awards `SUPPORT_SCORE_REWARD` (+10) when
    replying to **another** user's post.
  - `addStandalonePost(title, body)` — publishes a post directly (no quest required).
  - `toggleLike(postId)` / `toggleReplyLike(postId, replyId)` — like toggles on posts/replies.
  - `registerPostView(postId, viewerId)` — increments `viewCount` **only once per unique
    viewer** (tracked via each post's `viewedBy: string[]`).

The current user is identified by `userProfile.handle` (used as the viewer ID and to detect
own-posts).

---

## Navigation

A single bottom-tab navigator (`RootTabs`) with three screens and no headers
(`headerShown: false`); each screen renders its own fixed `AppHeader` instead.

| Tab | Component | Purpose |
| --- | --- | --- |
| Challenges | `ChallengesScreen` | Active quest, verification flow, operator vitals |
| Community | `CommunityScreen` | Global feed, post detail, create post |
| Profile | `ProfileScreen` | Identity, scores, journal archive |

The tab bar is absolutely positioned; screens pad their scroll content by
`insets.bottom + 80 + 140` to clear it. The Challenges tab registers a `tabPress`
listener that aborts an open verification overlay when the tab icon is tapped.

---

## Screens & Key Flows

### Challenges (`ChallengesScreen`)
- Hero **`TierOrb`** (glowing energy sphere showing operator tier/level).
- **`QuestPreviewCard`** → opens **`QuestDetailModal`** (full briefing + "Secure Quest" CTA).
- Securing a quest opens **`VerificationOverlay`**: a mandatory ≥60-char field report with a
  "Broadcast to Global Feed" toggle. On submit → `submitVerification`, then a "Mission
  Complete" state with **"Load Another Challenge."**
- **`SystemLockPreviewCard`** → **`SystemLockModal`** (cosmetic screen-time lockout messaging).
- **Operator Vitals** card → **`InfoPopupModal`** (score breakdown).

### Community (`CommunityScreen`)
- Reanimated `FlatList` feed of **`FeedCard`**s (avatar, handle, title, body, like/reply/view counts).
- Tapping a card → **`PostDetailModal`**: full post, replies (each likeable), and a reply
  composer. Opening registers a unique view.
- Tapping a handle → **`InspectProfileModal`** (operator dossier).
- FAB → **`CreatePostModal`** (standalone title + body post).

### Profile (`ProfileScreen`)
- Every section is a clickable card with haptic feedback that opens an **`InfoPopupModal`**:
  identity/account overview, Social Score breakdown, Support Score breakdown.
- Journal nav card → **`JournalModal`**: a `FlatList` with **infinite scroll**
  (`onEndReached`, paged by `JOURNAL_PAGE_SIZE` with a simulated load delay) and per-entry
  expand/collapse via **`JournalEntryCard`**.

---

## Design System ("Tactical Green")

Defined in the `COLORS` token object:

| Token | Value | Use |
| --- | --- | --- |
| `canvas` / `headerBg` | `#080C0A` | Deep obsidian background / solid header fill |
| `surface` | `#101713` | Standard surface containers |
| `elevated` | `#16201A` | Cards, modal bodies |
| `border` | `rgba(0,230,118,0.30)` | Razor-thin neon card borders |
| `divider` | `rgba(110,231,183,0.14)` | Hairline internal dividers |
| `neon` | `#00E676` | Primary accent, active buttons, key numbers |
| `emerald` | `#10B981` | Secondary accent |
| `glow` | `rgba(0,230,118,0.22)` | Ambient box-shadow glows |
| `body` | `#F0FDF4` | Primary off-white type |
| `muted` | `#6EE7B7` | Sage-green subtitles/timestamps |
| `onNeon` | `#04150C` | Dark ink on neon-filled buttons |

**Typography:** `SANS` (Avenir Next / sans-serif-medium) for display and body copy;
`MONO` (Menlo / monospace) for telemetry-style readouts (scores, streaks, ticker).

### Motion (all Reanimated, UI-thread)
- **`Starfield`** — a fixed field of soft neon particles behind each screen that drifts on a
  slow loop and **parallax-shifts with scroll** (driven by a shared `scrollY` value from each
  screen's Reanimated scroll handler at `0.16×` speed).
- **Breathing glows** — `TierOrb` halo and header streak badge pulse on slow loops.
- **`SpringPressable`** — a drop-in `Pressable` replacement that adds a spring scale-down on
  press; used on all major cards, CTAs, and the FAB. It exposes an optional `containerStyle`
  prop for the animated wrapper (used where layout flex must live on the wrapper).

### Fixed header
`AppHeader` is absolutely positioned at the top of every screen with a solid `#080C0A` fill so
scrolled content disappears cleanly beneath it. It contains the **XTROVERT wordmark**
(top-left), the **streak badge** (top-right, glowing), and the **`LiveTicker`** marquee row.
Screens offset their scroll content by
`insets.top + HEADER_BRAND_HEIGHT + LIVE_TICKER_HEIGHT + 16`.

---

## Modals

All popups use React Native's native `Modal` (`transparent`, `animationType="fade"`,
`statusBarTranslucent`) so they always paint above everything (header, tab bar, ticker) with
no manual z-index bookkeeping. A consistent pattern is used:

- The dimming backdrop is a **sibling** `Pressable` (never an ancestor wrapping the content),
  so it can't contest the inner `ScrollView`/`FlatList` pan responder. Vertical swipes scroll
  content; only taps outside the content close the modal.
- Scroll containers use `keyboardDismissMode="on-drag"` and
  `keyboardShouldPersistTaps="handled"`; text-entry modals wrap content in
  `KeyboardAvoidingView`.
- Two layouts: **full-bleed** (`overlayInner` + scroll) for forms/detail views, and
  **centered card** (`centeredCardWrap` + `centeredCard`) for compact popups.

---

## Project Layout

```
Xtrovert/
├── App.tsx            # The entire application (single-file architecture)
├── app.json           # Expo app config (dark UI, splash, plugins)
├── package.json       # Deps; "main": "expo/AppEntry.js"
├── tsconfig.json      # Strict TS; excludes node_modules and legacy src/
├── assets/            # Icons, splash, images
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

### Verifying a build
Type-check and produce a release bundle without a device:

```bash
npx tsc --noEmit
npx expo export:embed --platform android --dev false \
  --bundle-output dist-verify/android.bundle --assets-dest dist-verify/assets
```

---

## Conventions & Constraints

- **Single-file:** keep all app code in `App.tsx`, organized under the existing section
  banners. Do not reintroduce `expo-router` (it was removed in favor of React Navigation).
- **In-memory state only:** no persistence layer exists; features should flow through
  `AppContext` actions.
- **Accents via tokens:** never hardcode hex accents — use the `COLORS` object so the theme
  stays consistent.
- **Tunable constants** live at the top of `App.tsx` / their component blocks:
  `LIVE_TICKER_HEIGHT`, `HEADER_BRAND_HEIGHT`, `SUPPORT_SCORE_REWARD`, `JOURNAL_PAGE_SIZE`,
  `JOURNAL_LOAD_DELAY_MS`, the `STARS` count, and the parallax rate (`0.16`).
