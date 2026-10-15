## What changed

<!-- One or two sentences in plain words. What does someone using Sidecar get? -->

## Why

<!-- Link the issue. -->

## How I verified it

- [ ] `pnpm typecheck` and `pnpm test`
- [ ] `pnpm build` and `pnpm smoke`
- [ ] Ran Claude Code with `claude --plugin-dir ./plugin` and watched the change in the workstation

<!-- Screenshot or recording for anything visual. For cartoon changes, a before and after from #/kit. -->

## Checklist

- [ ] One change per pull request
- [ ] Conventional commit messages, no em dashes
- [ ] Hooks still exit 0 and stay fast, whatever happens
- [ ] Anything new that reaches the model or the database is scrubbed first
- [ ] Model text is rendered as plain text, never as HTML
- [ ] Snapshots updated only for an intentional visual change, and said so in the commit
- [ ] No secrets, and nothing personal in fixtures or screenshots
- [ ] `CHANGELOG.md` updated if a user would notice the change
