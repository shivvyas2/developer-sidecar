# developer-sidecar

A companion for vibecoders. Developer Sidecar is a Claude Code plugin that turns what Claude is doing into live, cartoon-style animations and plain-English explanations, so anyone can understand what's being built and why.

> **Status:** in development. The live feed, the animated cartoon stage with replay, and plain-English explanations with Decisions and Glossary work today. The in-Claude-Code pane comes next. See [`docs/superpowers`](docs/superpowers) for the spec and plans.

## What it will do

- **Watch** your Claude Code session through plugin hooks. Everything stays local.
- **Translate** each technical step, like installing a library, connecting to an API or adding an MCP tool, into a cartoon scene and a plain-English caption.
- **Explain** why each step matters for a production app, and keep track of architecture decisions.
- **Show** it all inside Claude Code (a pane, the status line and toasts) and as a full workstation at `http://localhost:7377`.

## Plain-English explanations

Sidecar explains each finished step in everyday words, says why it matters for a real app, and collects a glossary and a list of architecture decisions.

- It uses the Anthropic API when `ANTHROPIC_API_KEY` is set (Claude Haiku 5.5 by default), otherwise your installed `claude` command.
- Before anything is sent, secrets are scrubbed from the step details. Nothing else leaves your computer.
- Turn explanations off, or switch to Sonnet for more detail, in the **Settings** tab. You can also set `SIDECAR_EXPLAINER=off` before starting Claude Code.
- The header shows how many tokens explanations have used.

## License

MIT

## Try it locally (development)

Requires Node 22.13+ and pnpm.

```bash
pnpm install
pnpm build
claude --plugin-dir ./plugin
```

Then open http://localhost:7377. Data lives in `~/.developer-sidecar/` (override with `SIDECAR_HOME`).

Every cartoon piece and rule scene is previewed at http://localhost:7377/#/kit.
