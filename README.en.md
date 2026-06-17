# VM 2026

🇸🇪 Svensk version: [README.md](README.md)

A polished, installable PWA for following the 2026 FIFA World Cup together with friends:
a shared live tracker (fixtures, group tables, a dynamic knockout bracket, official result
entry) and a full prediction game on top (match tips, group tips, champion tips, leaderboard,
badges, reactions and comments). Built and run live for real friends during the tournament.

> A note on language: the app ships in Swedish, that is its real audience (friends in Sweden),
> so the screenshots and in-app copy below are Swedish by design. This README is in English to
> make the work easy to share; a Swedish version is at [README.md](README.md).

> Engineering note: this project was built task by task with a strict quality pipeline,
> planning, tests, independent code review and a CI gate on every change. The architecture,
> design decisions and verification below reflect that process.

---

## Screenshots

| Home (dark) | Home (light) |
| --- | --- |
| ![Home, dark theme](docs/screenshots/02-hero-daily-dark.png) | ![Home, light theme](docs/screenshots/03-hero-daily-light.png) |

| Group tables | Team profile |
| --- | --- |
| ![Group stage tables](docs/screenshots/04-group-stage.png) | ![Team profile modal](docs/screenshots/05-team-profile.png) |

| Mobile (the primary surface) | Today tab |
| --- | --- |
| ![Mobile home](docs/screenshots/06-mobile-home-dark.png) | ![Today tab](docs/screenshots/01-home-full-dark.png) |

Screenshots are generated from the real built app in fixtures mode (no backend) via a
Playwright capture script, see [Regenerating the screenshots](#regenerating-the-screenshots).

---

## What it is, and what it was used for

VM 2026 is an installable web app (PWA) with five tabs: **Today, Tips, Leaderboard,
Tournament** and **More**. It was shared with friends and classmates as a link, added to
their phone home screens, and used actively through the 2026 World Cup: people followed the
daily matches, entered tips before kickoff, watched the group tables and bracket update live,
and competed on the leaderboard in their own mini-league.

The app is a client-side SPA with hash-based tab navigation (no server router): each tab is
deep-linkable via URL hash, the layout is mobile-first because the app lives on a phone in a
group chat (tab bar at the bottom on mobile, top app-bar with tabs on desktop), and it works
offline once installed.

---

## Feature tour (every screen)

The app has two layers: a **live tracker** that everyone shares, and a **prediction game**
on top of it. Plus a set of information screens around both.

### Live tracker

- **Daily matches (Today tab).** Today's matches with kickoff time (shown in Swedish local
  time), the Swedish TV channel, the stage, and the venue. Browse day by day through the whole
  tournament. A "match of the day" hero and a countdown to the next kickoff. The day's accent
  theme shifts with the teams playing.
- **Match cards** compress the information visually instead of a text row: team emblems, the
  TV channel as a badge, the stage, and on each card the **venue (arena, city, country) with
  its capacity** and the **FIFA ranking** of the teams.
- **Live scores directly on the card.** During live matches, each card gains a live panel: a
  gently ticking match clock (status-driven and safe across breaks, showing "Half time" during
  intervals, "45+" or "90+" at the half-time boundary, "Full time" when the match ends, never
  an invented minute), a live scoreline, goalscorers with assists, yellow and red cards, and
  substitutions. All visible immediately, no tap required. When the scoreline changes it is
  announced to screen readers via a polite aria-live region, so a new goal is read out without
  moving focus.
- **"Show more" (expandable stats and line-ups).** A clear expand button unfolds full match
  statistics (possession, shots, corners, offsides and more shown as comparison bars) and the
  starting line-ups with formations for each team, behind an honest promise: the button only
  appears when there is actually data to show.
- **Browsable history.** Live data is stored permanently and frozen when a match ends. You can
  scroll back days later and see the stats and goalscorers, not just for ongoing matches.
- **Live-updated leaderboard (Leaderboard tab).** Rankings update in real time as matches play
  out - when a goal is confirmed the points recalculate and rows slide to their new positions
  (preliminary, flagged; the official results are never touched).
- **Group stage, 12 groups (A to L) (Tournament tab).** Live-computed standings (points,
  played, GD, goals for/against) that update the instant a result is entered. Tables are
  derived, never stored twice.
- **Dynamic knockout bracket.** The Round of 32 to final tree is built and adjusted during
  the group stage (who can meet whom), locks once the groups are decided, and animates the
  advancing teams as knockout results come in. The seeding of the 8 best third-placed teams
  follows FIFA's fixed, source-verified table, never guessed (this was its own dedicated,
  reviewed data task).
- **"What it takes" scenarios.** Live final-round scenarios: what a team needs to advance,
  "if X wins, Y goes through", the most exciting minutes of a group stage.
- **What-if simulator.** Play out hypothetical results and watch the tables and bracket
  change, clearly badged as a simulation so nobody confuses the lab with real data.
- **Rich tournament statistics (Tournament tab).** Top scorers and assists, card table
  (players and teams), fastest goals, goal distribution over match time, most goals per team,
  goals per match, clean sheets, biggest upsets (ranking-based), and suspended players
  (derived from card data). Near-live from real match data.
- **Section menu in Tournament.** A section menu that jumps directly to the right section
  (Groups, What's needed, Knockout, Top scorers, Statistics, Suspended).
- **Team profiles.** Tap any team to see its FIFA ranking, star player, trivia, and the
  team's path through the group, in a polished accessible modal.
- **Official result entry (admin only).** The real, global tournament results (the source of
  truth that the tables, bracket and scoring read from) can only be written by the admin.
  This is enforced server-side by Postgres Row Level Security, not just hidden in the UI, and
  it is proven with real sessions in integration tests.
- **Automatic results with manual override.** When a match ends, the final score is written
  automatically as the official result in the competition. But a manual entry by the admin
  always has the last word: the automatic process only fills empty slots and updates its own
  automatic rows. A manually entered result is never touched by the automation (every result
  carries a source, and manual always wins). This is a declarative SQL rule, not just a
  promise in the code.

### Prediction game

- **Match tips (Tips tab).** Each friend predicts the scoreline before kickoff. The per-match
  points are shown for every match in the tips view, with a breakdown of why.
- **Group tips.** Predict the group winners and runners-up before the group stage, for bonus
  points.
- **Champion / bracket tips.** Predict who advances each knockout round, and the World Cup
  winner (20 points), for bonus points.
- **Leaderboard (Leaderboard tab).** Who is tipping best, with a summary at the top (total
  points and placing) and the per-match points underneath.
- **Global leaderboard (all rooms).** Beyond your own mini-league, there is a combined
  leaderboard across everyone playing, in every room, so you can see where you stand in the
  whole field and not just your own circle. Only safe, public fields are shown (name and points,
  never anyone's predictions or private data), computed server-side across the whole competition.
- **Tips reveal.** After the kickoff deadline locks, everyone sees what each person predicted.
- **Badges.** Achievements (streaks, "called the upset", "perfect round" and more).
- **Reactions.** A curated set of emoji on matches, one reaction per person per match, and
  you can see who reacted with what.
- **Per-match comments.** A short comment thread per match inside a room.
- **Favorite team and personal stats.** Pin a favorite team (a per-device preference) so its
  matches float to the top, and see your own prediction accuracy over time.

### Rooms, profile and onboarding

- **Mini-leagues (rooms).** Several friend groups, each its own room with its own room code,
  members and leaderboard. Friends join via a link or a code.
- **Persistent room selector.** See which room you are in and switch rooms (or create/join)
  from any tab, via the room selector in the app bar.
- **"My page" (More tab).** A personal profile hub with avatar and name, your ranking in the
  active room, accuracy stats, your rooms and favorite teams.
- **Push notifications (goal push).** PWA push when a goal is scored in a match you follow
  ("GOAL! Spain 2-1"), opt-in in the More tab, with night mode (silent at night) and scope
  selection. Works even when the app is closed.
- **Get started / install / PWA.** An onboarding tour on first visit, an honest "add to home
  screen" guide that adapts to the browser (never a dead button), and offline support once
  installed.

---

## Run it locally (important)

The live site is deployed during the tournament; it will not stay up long after. So this
section is the durable way to see the app: clone and run it. It has been verified against the
actual code (the data-source gate in `src/data/data-source.ts`, the env typing in
`src/vite-env.d.ts`, `vite.config.ts` and `package.json`).

### Prerequisites

- Node.js 22 or newer, and npm.
- Git.

### Mode A, run with fixtures (no backend, default)

The app is **fixtures-first**: all the static tournament data (teams, groups, the full match
schedule) is bundled in the app and source-verified. With no Supabase environment variables
set, the data layer falls to fixtures automatically (with a visible console warning so the
mode is never silent), and all social features (rooms, tips, leaderboard, admin) stay
dormant. So the whole tracker runs with zero configuration:

```bash
git clone <repo-url> vm-2026
cd vm-2026
npm install
npm run dev
```

Open the printed local URL (Vite, typically `http://localhost:5173`). You get the full
tracker: daily matches, group tables, the dynamic bracket, "what it takes", the what-if
simulator, team profiles, install/offline, all on bundled fixtures data, no account, no
network.

What the code does here: `getDataSource()` checks two conditions. (1) Are both
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set and non-empty? (2) Is the live client
built (`LIVE_READY`)? Live is chosen only when both are true; otherwise it returns the
fixture data source. With no `.env`, condition 1 is false, so you get fixtures.

### Mode B, connect your own Supabase (full social features)

To run the prediction game, rooms, leaderboard, reactions, comments and admin result entry,
point the app at your own Supabase project. The two environment variables are read via
`import.meta.env` and must use Vite's `VITE_` prefix:

| Variable | What it is |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase publishable (anon) key, public by design, protected by Row Level Security |

There is no committed `.env` template (env files are gitignored, no secrets in the repo), so
create the local file yourself:

```bash
# .env.local  (gitignored)
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Apply the database schema from `supabase/migrations/` to your project (tables, RLS policies,
RPCs and realtime publication) using the Supabase CLI or dashboard, see
[`supabase/README.md`](supabase/README.md). Then:

```bash
npm install
npm run dev
```

With both variables set and non-empty, `getDataSource()` selects the live client: an anonymous
session is created (a stable per-device identity, so "join a room" persists across reloads),
and the social layer (`src/data/rooms/`, predictions, official results) talks to your Supabase
project under RLS.

Notes:
- A half-configuration (URL but no key, or only whitespace) counts as not configured and
  safely falls back to fixtures, rather than a silently broken live mode.
- The static tracker data (teams, groups, schedule) stays bundled even in live mode; only the
  shared, mutable state (rooms, tips, results, reactions, comments) goes through Supabase.

### Build and preview the production bundle

```bash
npm run build      # type-check (tsc -b) + Vite production build into dist/
npm run preview    # serve the built dist/ locally
```

---

## Tech and architecture

**Stack**

- **Frontend:** React + TypeScript + Vite.
- **Styling and motion:** Tailwind CSS + Motion (the `motion` package, formerly Framer Motion);
  the animations are what makes it feel alive.
- **PWA:** vite-plugin-pwa (installable, offline app shell, manifest, icons, auto-update
  service worker that actively checks for new versions so users get updates without manually
  restarting).
- **Cloud:** Supabase (Postgres + Auth + Realtime + Row Level Security).
- **Push notifications:** web-push (VAPID) via Supabase Edge Functions - server-side
  goal-detection that reacts to live data without touching the poller, idempotent (no
  double-notifications), gated by each user's own opt-in.
- **Hosting:** Cloudflare Pages (git integration, no secrets in the repo). Production deploys
  from `develop`; every pull request gets its own preview URL.

**Architecture**

- **Derived state from one source of truth.** Tables, the bracket, points and leaderboards
  are never stored twice. They are computed by small, pure, heavily tested functions from the
  match results plus predictions. This is the backbone that makes the tricky FIFA
  third-place seeding testable and safe.
- **Source-anchored data (gold source, regenerate-and-diff).** The static tournament data
  (schedule, team profiles, venue capacities, third-place table) is generated from committed
  source extracts (with URLs and fetch dates) by pure parsers, then value-locked and verified
  by a regenerate-and-diff test, so the data in the app provably matches its source and cannot
  drift.
- **Fixtures-first environment gating.** All code is built and tested against typed fixtures;
  a single gate switches to live Supabase via environment variables without changing any
  call-site. That is what let the entire app be built and tested before, and independently of,
  any backend account. The live card renders against bundled sample data in fixtures mode; in
  live mode, data is read from Supabase (public read, updated in real time) fed by a
  budget-aware scheduled edge function against a paid Pro-plan for football data (richer data:
  events, statistics and lineups) polled near-live.
- **5-tab client-side SPA.** Five tabs (Today, Tips, Leaderboard, Tournament, More) with
  hash-based navigation; each tab is deep-linkable. Vendor code-splitting (React, Motion,
  Supabase) keeps the initial load lean.

---

## Quality

| What | Command |
| --- | --- |
| Build (type-check + bundle) | `npm run build` |
| Unit / component tests (Vitest) | `npm test` |
| End-to-end (Playwright) | `npm run test:e2e` |
| Lint | `npm run lint` |
| Format check | `npm run format:check` |

- **2926 passing tests** across 276 test files (Vitest) on a fresh clone, with 56 tests
  skipped by design (the live Supabase RLS integration tests, which only run when Supabase
  env is configured, see below). Verified by running `npm test`.
- **Security proven, not assumed.** The Row Level Security model (only the admin can write
  official results; only room members can read a room; nobody can forge another user's data)
  is proven with real anonymous Supabase sessions in `*-rls.integration.test.ts`. These tests
  run against a live project only when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set
  in the environment, and skip cleanly otherwise, so the unit suite is green on a fresh clone
  with no secrets in the repo. A mock cannot prove RLS, which lives in the database, so these
  use real sessions on purpose.
- **End-to-end (Playwright).** Critical user flows plus an axe-core WCAG AA accessibility pass
  in both light and dark themes, run against the built `dist/` (the artifact that deploys) in
  fixtures mode, so E2E needs no secrets and is deterministic. First run needs Chromium:
  `npx playwright install chromium`.
- **Green CI gates.** GitHub Actions runs build, test and lint on every pull request targeting
  `develop`. Hosting builds straight from the repo on Cloudflare Pages, so no deploy tokens live
  in the codebase.

---

## Regenerating the screenshots

The README screenshots in `docs/screenshots/` are generated from the real built app in
fixtures mode (no backend), using the same setup as the E2E suite:

```bash
npx playwright test scripts/capture-screenshots.spec.ts --config scripts/screenshots.config.ts
```

This builds the app, serves the built `dist/` with `vite preview`, and writes the PNGs to
`docs/screenshots/`. It is a manual, one-off script (it is not part of CI).

---

## Repository map

- App code: `src/` (features in `src/features/`, data layer in `src/data/`, domain logic in
  `src/domain/`).
- Database: `supabase/migrations/` + [`supabase/README.md`](supabase/README.md).
- Design and decisions: [`docs/SPEC.md`](docs/SPEC.md), [`docs/decisions.md`](docs/decisions.md),
  [`docs/deploy.md`](docs/deploy.md).
