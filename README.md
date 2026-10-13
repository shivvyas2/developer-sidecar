# developer-sidecar

A companion for vibecoders. Developer Sidecar is a Claude Code plugin that turns what Claude is doing into live, cartoon-style animations and plain-English explanations, so anyone can understand what's being built and why.

> **Status:** early design. See [`docs/superpowers/specs`](docs/superpowers/specs) for the current spec.

## What it will do

- **Watch** your Claude Code session through plugin hooks. Everything stays local.
- **Translate** each technical step, like installing a library, connecting to an API or adding an MCP tool, into a cartoon scene and a plain-English caption.
- **Explain** why each step matters for a production app, and keep track of architecture decisions.
- **Show** it all inside Claude Code (a pane, the status line and toasts) and as a full workstation at `http://localhost:7377`.

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
