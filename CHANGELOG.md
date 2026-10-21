# Changelog

All notable changes to Developer Sidecar are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Where things stand.** The Stage opens with a card that sums up the last
  thing you asked: how it ended, the parts made or changed, building blocks
  added and whether the checks pass. When a dev server is up there is an
  "Open your app" button, and when a failure is still in the way, a request
  to copy into Claude Code. It reads "So far" while Claude works.
- **The steps read as a story.** The step drawer groups steps under each
  thing you asked, with how it ended (done, done after a fix, needs a fix,
  stopped early), and a chapter never says needs a fix while the stage says
  the last checks passed. Runs of reading fold into one line like "Read 3
  files, searched once", repeat changes to a file into "Changed page.tsx 3
  times", and a check run that fixed an earlier failure is marked FIXED, even
  when Claude spells it another way (after `cd app &&`, chained with lint, or
  `npm run test` for `npm test`). A run you stopped never counts as a failure
  or a fix. Moving to a step inside a fold you closed opens it again.
- **What you're building.** The Whiteboard tab shows a map of the project
  from what Claude has looked at and changed: pages and screens, behind the
  scenes, your data (with table names), outside services, secret settings,
  checks, helpers and building blocks. Each part says whether Claude looked
  at it, made or changed it, or it needs a fix, and a tap lists its files
  and the steps that touched it, and the part Claude is working on right now
  says so while Claude works. Table names keep their casing (OrderItem reads
  Order item) and skip a schema (public.orders reads Orders). Requirement
  files, editable folders and local paths are not counted as packages,
  `pnpm add -w zod` still names zod, and a command that names two env files
  records both. The stage uses the same
  names: the service reads STRIPE, the database ORDERS, the packages how
  many were added (a failed install is not).
- **The stage says how things stand, in plain words.** The frame shows a
  status light (all good, needs a fix, needs you, working), how many files
  Claude has made, and whether the last checks passed. The light reads needs
  you whenever the banner does: while Claude waits for permission or for
  your next message. A command you stop yourself, like a dev server closed
  with Ctrl-C, is not counted as a failure. Step cards say what a step is
  (looking, new file, checks, checkpoint) instead of the tool and its
  command, which stays under "Show technical". The pane and status line
  inside Claude Code lead with the same words, followed by the command or
  file.
- **Claude is waiting for you.** When Claude Code asks for permission, the
  workstation shows a banner with Claude's own words and says to answer in the
  Claude Code window. The tab title starts with "(waiting)", the session picker
  marks the session, and the stage reads NEEDS YOU, then DONE once Claude's turn
  ends. Older databases gain the new session columns on open.
- **A next step for every failure.** A failed step now shows "What to do
  next": a request to copy into Claude Code, suggested by the explainer from
  the step's output (or a plain one naming the step when explanations are
  off), and a reminder that Esc twice or /rewind undoes Claude's changes.
- **New sessions are offered.** When a Claude Code session starts while you are
  watching another one, a banner names its project with a button to switch.
- **Clear offline state.** When the workstation loses its server for more than
  a few seconds, a banner says so, explains how Sidecar comes back, and offers
  to try again now. The last steps stay on screen and the stage reads OFFLINE.
- **A logo, and a drive-in.** Sidecar has a mark: a pixel robot waving from the
  driver's seat of a yellow cab. It sits in the workstation header, the browser
  tab, the kit gallery and the README. When the workstation opens, the cab
  drives across the page once per tab. Any key or click skips it, and it never
  plays when the system asks for reduced motion. Add `?intro=1` to the address
  to see it again.

### Changed

- **Lighter explanations.** The explainer skips steps whose caption already
  says enough: successful reads and searches, read-only shell commands like
  `ls` and `git status`, and repeat edits to a file already changed since your
  last prompt. Failed steps are always explained. What it does send is
  trimmed: file bodies go as a short preview, successful output keeps only
  its end, and steps get short labels (s1, s2, ...) instead of long ids. On the sample sessions in `bench/explainer`, that is about 68% fewer
  input and 57% fewer output tokens. A queued explanation never waits more
  than 15 seconds.
- **Read-only commands look like reading.** `ls`, `cat`, `grep`, `find`,
  `git status` and similar show the bookshelf scene with a plain caption
  instead of "Running a command".

### Fixed

- The stage keeps up with Claude. It used to fall up to about three scenes
  (some 11 seconds) behind while still reading LIVE, and could show DONE on
  an older step. Now at most one scene waits, and when Claude stops or needs
  you the stage jumps to the newest step.
- Long command output keeps its end, where test summaries and the last error
  are, instead of being cut after the first 1,000 characters.
- `cat app.test.ts` and `grep vitest` no longer show the test scene.
- Chained commands show the scene of the part that matters:
  `git add -A && git commit` is a checkpoint, not "Running a command", and
  `cd app && npm install stripe` is an install. Words inside a commit
  message, an echo or a folder name (like "test" or "vercel") no longer
  pick the scene. Only a real test runner shows the checking scene, so
  `npx playwright install` and `tsc -p tsconfig.test.json` don't, and quoted
  package names (`pip install "django>=4"`) show up in the install caption.
  The contents of a heredoc or a `$( )` don't pick the scene either. Test
  runs from .NET, Gradle, Maven, Elixir, Swift, Flutter, Rails and Laravel
  count, and `vercel env pull` or `vercel link` is no longer a deploy.

## [0.1.0] - 2026-10-15

### Changed

- **Lighter polling.** Sidecar inside Claude Code only downloads steps when
  they change, slows down while the server is away, and keeps working when
  only the explanation service fails.
- **Drafting-instrument design.** The whole interface is redrawn as a technical
  drawing: steps are index cards in a file drawer with numbered tabs, apps and
  services are isometric blocks, and progress, tokens and time sit on
  instrument dials and a readout panel. Light and dark themes follow the OS,
  with a toggle to force either. The cartoon characters are gone, replaced by
  a pointing hand and drawn tools. Decisions are spec cards, the glossary is a
  card catalog and settings use rotary selectors. Scene descriptions, stored
  sessions and the API are unchanged, so earlier sessions replay as before.

### Added

- **Marketplace install.** Tagged releases publish a ready-built plugin to the
  `release` branch, which the marketplace entry installs. Browser tests and
  linting run in CI.
- **Sidecar inside Claude Code.** A status line with the current step, a
  band above the prompt with the latest plain explanation, toasts for test
  results, new connections and deploys, and a `/sidecar` pane drawn in the
  drafting-instrument style: the scene on Claude Code Desktop, box-drawing
  cards in the terminal. `/sidecar off` quiets the band and toasts for a
  session. Capture still runs through the classic hooks, so nothing about
  how steps are recorded changes.
- **Plain-English explanations.** Each finished step gets one or two everyday
  sentences, a "why it matters" line and a glossary term. Steps are explained
  in batches with Claude Haiku 5.5 through the Anthropic API, or through your
  installed `claude` command when no API key is set. Secrets are scrubbed
  before anything is sent, and model text is only ever shown as plain text.
- **Decisions and Glossary tabs.** Architecture choices Claude makes are
  recorded with the alternatives and the reason. The terms from a session are
  collected and defined in one line each.
- **Settings.** Explanations off, quick (Haiku) or detailed (Sonnet), a running
  token counter, and buttons to delete one session or all of them. Repeated
  failures pause explanations with a banner that says why and a "Try again"
  button. `SIDECAR_EXPLAINER=off` turns them off entirely.
- **Animated stage.** Every step plays as a scene on a persistent
  town: places appear the first time they are used, and Your App grows with
  the files created. Bursts of steps never leave the stage more than a few
  scenes behind, and reduced-motion settings show still frames.
- **Replay.** Scrub through any recorded session and play it back.
- **Kit gallery** at `#/kit`, previewing every token, primitive, component and scene in light and dark.
- **Live step feed.** Claude Code hooks feed a local server that pairs tool
  calls into steps and captions them with fast, free rules. A browser
  workstation at `http://localhost:7377` shows them live, across several
  sessions at once.
