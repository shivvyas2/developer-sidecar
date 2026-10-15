# Changelog

All notable changes to Developer Sidecar are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
