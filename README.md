<p align="center"><img src="apps/web/src/brand/sidecar.svg" width="160" height="160" alt="The Sidecar mark: a pixel robot waving from the driver's seat of a yellow cab"></p>

<h1 align="center">Developer Sidecar</h1>

<p align="center">A Claude Code plugin that shows what Claude is doing as live technical-drawing scenes and plain-English recaps, so people who build with AI can understand what is being built and why.</p>

<p align="center"><a href="#quick-start">Quick start</a> · <a href="#how-it-works">How it works</a> · <a href="CONTRIBUTING.md">Contribute</a> · <a href="SECURITY.md">Security</a></p>

<p align="center">
  <a href="https://github.com/shivvyas2/developer-sidecar/actions/workflows/ci.yml"><img src="https://github.com/shivvyas2/developer-sidecar/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-22.13%2B-339933.svg" alt="Node.js 22.13+">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6.svg" alt="TypeScript 5.9">
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg" alt="Claude Code plugin">
</p>

People who "vibecode" with Claude Code often have no idea what is happening while Claude works. Commands, file edits, API connections and MCP setup scroll past as jargon, and apps get shipped that nobody involved really understands.

Developer Sidecar sits next to your Claude Code session and narrates it. Every step Claude takes becomes a short scene drawn like a drafting instrument, on a little "town" of isometric blocks that grows as your app grows, a caption in plain words. A map shows the parts of the app being built, the steps read as a story, and each time Claude finishes, a short recap says where things stand and what it means for a real app. Architecture choices are collected as decisions, and the technical terms Claude uses are collected into a glossary.

Everything runs on your machine. The only thing that ever leaves it is the optional recap call to Anthropic, one short request each time Claude finishes, with secrets scrubbed out first, and you can turn that off.

## Features

- **Live step feed.** Every prompt and tool call in your Claude Code session shows up as a step with a plain-English caption, a status, and a "Show technical" toggle with the raw command or output.
- **Animated stage.** The design is a drafting instrument, in light and dark. Steps are a file drawer of index cards with numbered tabs, Your App and its services are isometric app blocks, and progress, tokens and time are read off instrument dials and a readout panel. Each step plays as a scene: a hand plugs a cable into an outside service, sets a brick onto Your App, or sends a package up to the cloud. Places appear the first time they are used, and Your App gains a floor for every few files created. Bursts of steps never put the stage more than a few scenes behind.
- **Replay.** Scrub through any recorded session and watch it play back.
- **Where things stand.** The Stage opens with a card about the last thing you asked: how it ended, the parts made or changed, whether the checks pass, an "Open your app" button when a dev server is up, and a request to copy into Claude Code when something still fails. These facts come from the steps, at no cost.
- **AI recaps.** When Claude finishes a turn, one short request to Claude Haiku adds a plain summary, what it means for your app, and any decisions and terms worth knowing. One call per turn, however many steps it took, so it costs a fraction of explaining each step.
- **What you're building.** The Whiteboard maps the project from what Claude has looked at and changed: pages and screens, behind the scenes, your data, outside services, secret settings, checks and building blocks. The stage town uses the same names.
- **A first look.** Before your first session, the Stage plays a sample session marked SAMPLE. Tap anything on the stage to see what it is, or open "What am I looking at?" for the whole key.
- **The steps as a story.** The step drawer groups steps under each thing you asked, folds runs of reading and repeat changes to one file, and marks the check run that fixed an earlier failure.
- **Decisions.** When Claude picks a library, service, database or approach, the choice, the alternatives and the reason are recorded in the Decisions tab.
- **Glossary.** The terms from your session, defined in one line each, sorted A to Z.
- **Settings.** AI recaps off, quick (Claude Haiku) or detailed (Claude Sonnet). A running token counter in the header. Delete one session or all of them.
- **Inside Claude Code.** You can follow along without leaving Claude Code:
  - The status line shows the current step, like `◢ 042 INSTALL · STRIPE ●`.
  - A band above the prompt shows the latest step in plain words, an `[OPEN WORKSTATION]` link and a Hide button.
  - Toasts mark milestones: tests failing, tests passing again, a first connection to a service, and a deploy.
  - `/sidecar` opens a pane. On Claude Code Desktop it shows the drawn scene above the cards. In the terminal it shows the same cards drawn in box-drawing characters (the pane needs a window about 110 columns wide).
  - `/sidecar web` gives the workstation link, and `/sidecar off` and `/sidecar on` hide or show the band and toasts for the session.
  - The VS Code extension has no in-editor surface yet. Its steps still reach the browser workstation.
- **Works with any Claude Code session.** Terminal, the desktop app, and IDE terminals all feed the same local workstation. Several sessions at once share one server.
- **Never slows Claude down.** Hooks hand events off in a few milliseconds and always succeed, even when the sidecar is not running.

## Quick start

You need Node.js 22.13 or newer and Claude Code. In Claude Code, run:

```
/plugin marketplace add shivvyas2/developer-sidecar
/plugin install developer-sidecar@developer-sidecar
```

On Claude Code 2.1.275 or later, `/plugin install developer-sidecar --marketplace shivvyas2/developer-sidecar` does both in one step. Restart Claude Code, then start working as usual. The first session prints the workstation address, normally:

```
http://localhost:7377
```

Open it in a browser and keep it beside your terminal. Inside Claude Code, `/sidecar` opens the pane. The gallery of every token, primitive, component and scene, in light and dark side by side, is at `http://localhost:7377/#/kit`.

To update, run `/plugin marketplace update developer-sidecar`, or turn on auto-update for the marketplace under `/plugin`.

### From source

```bash
git clone https://github.com/shivvyas2/developer-sidecar.git
cd developer-sidecar
pnpm install
pnpm build
claude --plugin-dir ./plugin
```

### AI recaps

AI recaps work out of the box if either of these is true:

- `ANTHROPIC_API_KEY` is set in the environment Claude Code runs in. Sidecar calls the Anthropic API directly (Claude Haiku 5.5 by default).
- The `claude` command is installed. Sidecar runs it once each time Claude finishes a turn, with no tools and no plugins, using your existing Claude Code login (so it counts toward your subscription).

If neither is available, everything else still works, including the map, the story and where things stand; only the AI summary, decisions and glossary stay empty.

## How it works

```
 Claude Code session (terminal, desktop app, IDE)
   │  plugin hooks: SessionStart, UserPromptSubmit, Pre/PostToolUse,
   │                SubagentStop, Notification, Stop
   ▼
 emit.cjs ── scrub secrets, cap size, POST with a 300 ms timeout, always exit 0
   │
   ▼
 Sidecar server  127.0.0.1:7377   (Node, Hono, node:sqlite)
   ├─ pair tool start/end events into steps
   ├─ rules engine → category, caption and scene   (instant, free)
   ├─ recapper → one AI recap per finished turn            (async, optional)
   ├─ store: ~/.developer-sidecar/sidecar.db
   └─ WebSocket + REST, token and Origin checked
        │
        ▼
 Workstation in the browser (React)
   stage · feed · replay · Decisions · Glossary · Settings
```

- **Capture.** The plugin registers classic command hooks. Each one runs a small bundled script that reads the hook payload, scrubs secrets, trims large outputs, and posts it to the local server. It always exits successfully and never blocks Claude.
- **Steps.** The server pairs each tool's start and end into one step, and marks steps that never finish as interrupted.
- **Rules.** An ordered list of matchers turns each step into a category (read, create, edit, install, test, run, external service, MCP, git, data, deploy, helper, prompt), a caption, and a scene description. No model is involved, so captions and animations are instant and free.
- **Scenes.** The `@sidecar/ui-kit` package renders a scene description at any moment in time as an SVG string. It is pure and deterministic, so the same scene looks the same everywhere and is easy to test.
- **Recaps.** When Claude's turn ends (the Stop hook), the turn goes to the model as a few plain lines: reads folded into one, repeat edits counted, only the end of failed output, never file bodies, at most 4,500 characters however long the turn. One request at a time; no request for a turn that only read files or was already recapped. Answers are validated, clipped, stored, and pushed to the browser. Repeated failures pause recaps with a banner that says why. `pnpm bench:tokens` measures the cost on sample sessions, and a CI test keeps it under budget.

## Configuration

| Setting | Where | Default | Purpose |
| --- | --- | --- | --- |
| Recap level | Settings tab | Quick (Haiku) | Off, Quick (Claude Haiku 5.5) or Detailed (Claude Sonnet 5.5) |
| `ANTHROPIC_API_KEY` | environment | unset | Use the Anthropic API for AI recaps |
| `SIDECAR_EXPLAINER=off` | environment | unset | Turn AI recaps off entirely, regardless of the setting. Read when the sidecar server starts, so stop a running server first |
| `SIDECAR_HOME` | environment | `~/.developer-sidecar` | Where the database, token, port and logs live |
| `SIDECAR_PORT` | environment | `7377` | The first port the server tries. Tests use it to stay clear of a running sidecar |

The server listens on port 7377 (or `SIDECAR_PORT`). If that port is taken it tries the next ten and records the one it chose in `$SIDECAR_HOME/port`. It shuts itself down after two hours with no activity and no open browser tabs.

## Privacy and security

- The server binds to `127.0.0.1` only.
- Every API and WebSocket request needs a random per-install token, stored in `$SIDECAR_HOME/token` with file mode 600. The `Host` and `Origin` headers are checked, so other websites cannot reach it.
- Secrets are scrubbed twice, in the hook and again on the server, before anything is stored or sent anywhere. Scrubbing is pattern based and covers API keys and tokens in common formats, `Authorization` and `Cookie` headers, `password=` style pairs, PEM blocks, and values read from your `.env` files.
- AI recaps send a short summary of each finished turn (a line per step and the end of any failed output, never file contents), with known secret patterns and `.env` values removed, to Anthropic directly or through your Claude Code login (which uses whatever backend your `claude` command is configured for). Nothing else leaves your machine, and there is no telemetry.
- Text from the model is always shown as plain text, never as HTML.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Project layout

```
developer-sidecar/
├── .claude-plugin/marketplace.json   Marketplace entry for the plugin
├── plugin/                           The Claude Code plugin
│   ├── .claude-plugin/plugin.json    Plugin manifest
│   ├── hooks/hooks.json              Hook registrations
│   ├── src/                          emit, start-server and locate sources
│   ├── src/mod/                      The in-Claude-Code mod: pane, status line, band, toasts, /sidecar
│   ├── mod-test/                     Engine tests for the mod (claude plugin test)
│   └── dist/                         Built bundles (generated, not committed)
├── packages/
│   ├── shared/                       Event, step, scene, story, project map and recap types, zod schemas, secret scrubbing
│   ├── ui-kit/                       Scene renderer: tokens, primitives, animators, timeline, render(), text renderer, React <Scene>
│   └── server/                       Hono server: store, step pairing, rules, AI recaps, REST and WebSocket
├── apps/web/                         The React workstation (stage, feed, tabs, settings, #/kit gallery)
└── scripts/                          Build and end-to-end smoke scripts
```

## Development

```bash
pnpm install
pnpm lint           # ESLint
pnpm typecheck      # TypeScript, strict
pnpm test           # Vitest: shared, ui-kit, server, plugin and web
pnpm build          # Bundles the plugin scripts, the server and the web app into plugin/dist
pnpm smoke          # Starts a real server, replays a recorded session, checks the result
pnpm test:mod       # Runs the mod's engine tests with the claude CLI (after pnpm build)
pnpm e2e            # Playwright: replays a recorded session in Chromium (after pnpm build)
pnpm release:check  # Builds the release folder and validates it with the claude CLI
```

Run Claude Code against your working copy with `claude --plugin-dir ./plugin` after `pnpm build`. Tests and the smoke scripts never call a real model.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## Roadmap

- **Releases.** Prebuilt bundles on tagged releases so the plugin installs straight from the marketplace.
- **Whiteboard.** A live diagram of how your app fits together, built from steps and decisions.
- **Recap videos.** Export a session as a short animated recap.

## License

[MIT](LICENSE)
