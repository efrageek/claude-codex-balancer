# Security policy

## Supported versions

Only the latest 0.x release gets fixes.

## Reporting

Report privately with [GitHub private vulnerability reporting](https://github.com/efrageek/claude-codex-balancer/security/advisories/new). Do not open a public issue for a vulnerability. This is a solo-maintained project: expect a best-effort response, not an SLA.

## In scope

- The `codex_run` guard: sandbox flags, `dir` and `writable_dirs` checks, subagent refusal.
- The `safe` and `full` tiers and how `full` is unlocked.
- The confirmation dialog shown before each Codex job.
- The Bash guard that refuses Codex launches.
- Transcript rendering (control and bidi characters in Codex output).

## Known limit

The Bash guard is best-effort: a determined spelling of a Codex command can slip past it. Your Claude Code permission prompt is the real boundary, so keep broad rules such as `Bash(codex exec:*)` out of `permissions.allow`. See [docs/codex-tiers.md](docs/codex-tiers.md).
