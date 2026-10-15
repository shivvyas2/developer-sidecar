# Security

Developer Sidecar sees everything Claude Code does in your projects: commands, file paths, file contents and tool output. If you find a vulnerability, please report it privately.

## Reporting

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Do not open a public issue for security problems.

Include what you found, how to reproduce it, and what data it could expose. You will get an acknowledgement within a few days and a fix or a plan within two weeks for anything that exposes user data.

## What counts

- Any way for another website, another local user, or another machine to read from or write to the Sidecar server. It binds to `127.0.0.1`, requires the per-install token, and checks `Host` and `Origin`; a gap in any of those is a vulnerability.
- A secret (API key, token, password, `.env` value, `Authorization` or `Cookie` header) that reaches the database, the logs, the browser, or the explanation model unscrubbed.
- Model output or step data that ends up rendered as HTML or executed in the workstation.
- Prompt injection through step data that makes Sidecar do anything other than display text.
- A way to make the plugin's hooks hang, fail, or slow Claude Code down.
- The explainer's `claude` child process running with tools, plugins, or hooks that feed back into Sidecar.

## What is out of scope

- Anything that requires an attacker who can already read files in your home directory.
- Findings in Claude Code, Anthropic's API, or other third-party services that are not caused by this code.
- The content of explanations themselves being wrong or unhelpful. Please open a normal issue for that.

## Supported versions

Only the latest release on `main` receives security fixes.
