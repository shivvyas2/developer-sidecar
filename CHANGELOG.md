# Changelog

All notable changes to Developer Sidecar are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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
- **Animated stage.** Every step plays as a cartoon scene on a persistent
  town: places appear the first time they are used, and Your App grows with
  the files created. Bursts of steps never leave the stage more than a few
  scenes behind, and reduced-motion settings show still frames.
- **Replay.** Scrub through any recorded session and play it back.
- **Cartoon kit gallery** at `#/kit`, previewing every piece and every scene.
- **Live step feed.** Claude Code hooks feed a local server that pairs tool
  calls into steps and captions them with fast, free rules. A browser
  workstation at `http://localhost:7377` shows them live, across several
  sessions at once.
