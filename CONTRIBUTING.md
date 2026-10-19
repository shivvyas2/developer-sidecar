# Contributing to Developer Sidecar

Thanks for looking. Sidecar is small, but it sits inside other people's Claude Code sessions, so a few rules matter more here than in most projects. Each one keeps someone's session fast, private, or understandable.

## Before you start

- **Open an issue first for anything bigger than a fix.** Say what you want to change and why. It is much cheaper to agree on the idea than on a finished pull request.
- **Set up as in the README.** `pnpm install && pnpm build`, then `claude --plugin-dir ./plugin`. You do not need an Anthropic API key to work on anything except the explainer, and the tests never call a model.

## How the repo works

**One branch per change.** Never commit to `main`. Branch from it, open a pull request, and let CI run.

**Conventional commits.** `feat(ui-kit): ...`, `fix(server): ...`, `docs: ...`, `test(...)`, `refactor(...)`, `chore(...)`. The scope is the package (`shared`, `ui-kit`, `server`, `web`, `plugin`). The subject is a sentence in plain words about what changed for the person using Sidecar.

**No em dashes.** In code comments, commit messages, docs and UI strings. Use a comma, a period or a colon.

**No emoji.** Not in the interface, captions, toasts or messages. The drafting language uses text marks only (✓ ✕ ● ◢ ▲ ◆). A test fails if an emoji appears in any source under `apps/web/src`, `packages/*/src` or `plugin/src`.

**Never block Claude.** The hook scripts in `plugin/src/` must always exit 0, finish within a few hundred milliseconds, and never wait on the server, the explainer, or the network for longer than their timeout. If a change makes a hook slower or able to fail, it is a bug.

**The mod reads, it never writes.** `plugin/src/mod/` draws from the local server and never emits events; capture belongs to the classic hooks. Code there runs with no Node and no DOM, and every helper that takes `$` must be a top-level function, or the engine refuses the module.

**Scrub before anything is stored or sent.** Every value that reaches the database or a model goes through `scrubDeep` from `@sidecar/shared` first. If you add a new field that carries user data, scrub it and add a test with a fake secret in it.

**Model text is data.** Explanations are rendered as React text, never with `dangerouslySetInnerHTML`. Step data is sent to the model as JSON, and the system prompt treats it as data, never as instructions.

**Captions come from rules, not from a model.** Every step gets its category, caption and scene from `packages/server/src/rules/` instantly and for free. The explainer only adds to that. A new kind of step is a new rule with a test, not a prompt change.

**Scenes are composed, not drawn per scene.** A scene is a description, and its animator in `packages/ui-kit/src/scene/animators.ts` moves existing drafting-instrument primitives (iso blocks, the card drawer, dials, the hand) on the sheet. `render(spec, t)` must stay pure and deterministic: no `Math.random`, no `Date`, no DOM outside `react.tsx`, and colours only through `color(token)`. Add a new piece only when no existing one fits.

**Secrets never enter the repo.** Not in code, docs, fixtures or screenshots. Test fixtures that need a key use an obviously fake one. CI runs a secret scan of the full history on every pull request.

## Tests

Run these before you push. They are what CI runs.

```sh
pnpm lint          # ESLint
pnpm typecheck     # TypeScript, strict
pnpm test          # Vitest
pnpm build         # Bundles plugin/dist
pnpm smoke         # Real server, recorded session, end to end
pnpm test:mod      # Mod engine tests (needs the claude CLI; run after pnpm build)
pnpm e2e           # Browser tests in Chromium (run after pnpm build)
```

CI does not have the `claude` CLI, so `pnpm test:mod` runs locally. Run it before any pull request that touches `plugin/src/mod/`.

New logic gets a test beside its package (`packages/server/src/store.ts` and `packages/server/test/store.test.ts`). Write the failing test first when you can; it keeps the change small.

The scene renderer and the text renderer have snapshot tests. If you change how something looks, update the snapshots with `pnpm vitest run packages/ui-kit -u`, look at the result in the `#/kit` gallery, and say in the commit message that the snapshots changed on purpose.

## Adding a scene

1. Add a builder to `scenes` in `packages/ui-kit/src/catalog.ts`. It takes the caption first and returns `{ scene, cast, beats, caption }`.
2. Add one entry to `SAMPLE_SCENES` in the same file. The catalog test fails until you do.
3. Give its scene id an animator in `ANIMATORS` in `packages/ui-kit/src/scene/animators.ts`, built from the primitives in `packages/ui-kit/src/primitives/` and the sheet slots in `scene/layout.ts`. The scene test fails until every sample id has one.
4. Use it from a rule in `packages/server/src/rules/index.ts` and add a case to `packages/server/test/rules.test.ts`.
5. Record its snapshots and check it, bare and framed, in light and dark, at `http://localhost:7377/#/kit`.

## Releasing

1. Move the `Unreleased` notes in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` heading.
2. Set `version` in `plugin/.claude-plugin/plugin.json` to `X.Y.Z`.
3. Run `pnpm release:check`.
4. Open a pull request `chore: release vX.Y.Z` and merge it once the other maintainer approves.
5. Tag the merge commit on `main` as `vX.Y.Z` and push the tag. CI builds the plugin, commits it to the `release` branch and opens a GitHub Release with the changelog notes.

The `release` branch is written only by CI; never commit to it by hand.

## Pull requests

`main` only changes through pull requests, and every pull request needs an approval from a code owner who is not its author. Both maintainers own every file (see `.github/CODEOWNERS`), and GitHub never lets authors approve their own work, so each maintainer reviews the other's. CI must pass and every review conversation must be resolved. A new push dismisses earlier approvals. There are no exceptions: admins cannot bypass it, and `main` cannot be force-pushed or deleted.

The rule lives in `.github/rulesets/main.json`. A repository admin applies it once, either under Settings, Rules, Rulesets, New ruleset, Import a ruleset, or with:

```bash
gh api --method POST repos/shivvyas2/developer-sidecar/rulesets --input .github/rulesets/main.json
```

- Keep one change per pull request. A refactor and a feature are two pull requests.
- Fill in the template: what changed, why, and how you verified it. Add a screenshot or a short recording for anything visual.
- Add a line to `CHANGELOG.md` under Unreleased if a user would notice the change.

## Code of conduct

Be kind and be direct. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
