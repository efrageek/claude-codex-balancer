<div align="center">

<img src="assets/logo.svg" width="128" alt="balancer logo: a pixel-art seesaw">

# balancer

Routes Claude Code subagent work between Claude and Codex by live quota pace.

[![License: MIT](https://img.shields.io/github/license/efrageek/claude-codex-balancer)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/efrageek/claude-codex-balancer/ci.yml?branch=main&label=CI)](https://github.com/efrageek/claude-codex-balancer/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/efrageek/claude-codex-balancer)](https://github.com/efrageek/claude-codex-balancer/releases)
![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-no%20dependencies-blue)

```
claude plugin install balancer --marketplace efrageek/claude-codex-balancer
```

</div>

## What it does

`balancer` reads both quotas (Claude's 5h/7d windows and Codex's weekly window), works out how fast each is burning, and tells the orchestrating Claude where to send each kind of task. Codex runs show up as native background tasks, and a pane renders their full transcripts.

- **Band above the prompt**: mode chips, Codex model and effort pickers, the tier button, a `transcript` button, quota bars, and the current decision and pace. See [the band, control by control](docs/band.md).
- **`mcp__balancer__codex_run`**: runs `codex exec` as a native background task in a working copy that already holds `TASK.md`. A call can pick another model or a lower effort, never a higher one.
- **Codex transcript pane**: every Codex job of the session, expandable, with messages, commands and their exit status, diffs and the final answer. A watchdog warns when a job stalls.
- **Commands**: `/balance [off|auto|light|medium|full]`, `/codex [model] [effort]`, `/codex-trust [safe|full]`, `/codex-log`.
- **Routing policy**: a fixed section in the orchestrator's system prompt only (subagents don't get it). The live mode, model and effort ride a short note on each prompt, so changing mode never busts the prompt cache.

```
balance [off] [auto] [light] [medium] [full] │ codex [gpt-6.1-sol ▾] [xhigh ▾] [tier: safe] [transcript]   ▾
Claude 5h 9% · reset 1h                    Codex 7d 14% · reset 5d
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claude 7d 67% · reset 1d                   read 8m ago · credits 62.5k
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
medium → 50/50 · pace Claude 0.8x · Codex 0.4x
```

## Quick start

1. Install: run the command above, or in a session `/plugin marketplace add efrageek/claude-codex-balancer` then `/plugin install balancer@claude-codex-balancer`.
2. Make sure the Codex CLI is installed and logged in.
3. Start a session and pick a mode in the band, or type `/balance auto`.

## Modes

| Mode | Code tasks go to | Claude models are used for |
|---|---|---|
| `light` (default) | Codex only for bounded tasks (clear spec and file list); the rest to a Claude subagent | almost everything |
| `medium` | about half Codex, half a Claude subagent | orchestration, plans, reviews, half the code |
| `full` | Codex, always (your `codeAgent` is refused unless its description starts with `[non-code]`) | orchestration, plans, reviews and critics only |
| `auto` | picks `light`, `medium` or `full` from the quota pace below | depends on the pick |
| `off` | no routing from the mod: Claude decides as it would without it | everything, unless you ask for Codex |

In every mode except `off`, exploration, scouting and data handling go to your exploration agent (forced onto Haiku), and plans, reviews and the final gate stay on Claude.

**Pace** is the share of a quota used divided by the share of its window already elapsed. At 1.0x the quota runs out exactly at reset; above 1x it runs out early. `auto` sends code to the provider with the lower pace when one burns more than 1.25x faster than the other. It falls back to `medium` while either quota has no reading, and moves away from a provider that is 95% used.

## Safety

Every Codex job runs in Codex's `workspace-write` sandbox; nothing passes `danger-full-access`.

| Tier | What Codex gets |
|---|---|
| `safe` (default) | none of your Codex plugins, MCP servers or hooks, no network, writes only in a folder inside the session's folder |
| `full` | your whole Codex config, optional network and extra writable dirs; you unlock it per session with `/codex-trust full` or the `tier:` button |

- You confirm each job in Claude Code's own dialog, unless your permission rules allow `codex_run`. A `safe` job offers "don't ask again this session"; a `full` job asks every time.
- Only the main session can start jobs, and the model cannot unlock `full`.
- Codex launched through Bash is refused. That guard is best-effort; your permission prompt is the real boundary, so keep `Bash(codex exec:*)` and `mcp__balancer__codex_run` out of `permissions.allow`.

Details: [Codex tiers and permissions](docs/codex-tiers.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Configuration

Set defaults with `/plugin configure balancer@claude-codex-balancer` in a session, or `claude plugin configure balancer@claude-codex-balancer` in a terminal. The band and commands change mode, model and effort for the current session only.

| Option | Default | Meaning |
|---|---|---|
| `mode` | `light` | Default balance mode: `off`, `auto`, `light`, `medium`, `full` |
| `codexModel` | empty | Default Codex model slug; empty = the first model your Codex account lists in `~/.codex/models_cache.json`, else Codex's own default |
| `codexEffort` | `xhigh` | Default Codex reasoning effort and the ceiling for jobs; if the model lacks it, jobs use the highest level it supports below it |
| `stallMinutes` | `15` | Warn when a running Codex job writes nothing for this long |
| `exploreAgent` | `Explore` | Subagent type for exploration, scouting, reading; the mod runs it (and the built-in Explore) on Haiku; empty = no exploration rule |
| `codeAgent` | empty | Subagent type for code that stays on Claude; when set, mode `full` refuses it for code unless its description starts with `[non-code]`; empty = "a Claude subagent", no refusal |
| `planAgent` | `Plan` | Subagent type for plans and design; empty = no rule |
| `reviewAgent` | empty | Subagent type for reviews, including the review after each Codex job; empty = the orchestrator reviews the change itself |
| `gateAgent` | empty | Subagent type for the final pre-merge gate; empty = no gate rule |
| `codexInstructions` | empty | One extra line appended to every Codex job prompt (for example a house coding-style rule) |

### Use your own agents

By default the routing policy only names Claude Code's built-in `Explore` and `Plan` agents. If you keep your own subagents in `~/.claude/agents/`, point the roles at them, for example:

```
echo '{"exploreAgent":"explorer","codeAgent":"coder","planAgent":"architect","reviewAgent":"reviewer","gateAgent":"final-reviewer","codexInstructions":"Keep diffs small and add a test for new logic."}' \
  | claude plugin configure balancer@claude-codex-balancer --values-stdin
```

## Requirements

- Claude Code with mod (hooks module) support, tested on 2.1.300.
- Codex CLI installed and logged in. Quotas are read from `~/.codex/sessions/**/*.jsonl` and models from `~/.codex/models_cache.json`.
- macOS or Linux (it calls `pgrep`, `head` and `tail`). Windows is untested.

## Troubleshooting

- **The band says Codex has no reading**: is the Codex CLI installed and logged in? Codex only records its quota while it runs, so run one Codex task, then check again. `auto` acts as `medium` until then.
- **No routing policy in an organization-managed Claude Code**: `prompt.compose` hooks don't run for user-installed plugins there, so the policy isn't injected. The Haiku override and the `full`-mode refusal still apply.
- **A job runs at a lower effort than configured**: the model does not support that level, so the job uses the highest one it supports below it. Pick another model with `/codex <model>`.
- **A Bash command is refused for mentioning Codex**: capitalize or rephrase the word, or use `codex_run`.

## Uninstall

```
claude plugin uninstall balancer@claude-codex-balancer
claude plugin marketplace remove claude-codex-balancer   # optional
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 Efrain P. Jaimes

Not affiliated with, endorsed by, or sponsored by Anthropic or OpenAI. Claude and Claude Code are trademarks of Anthropic, PBC. Codex and OpenAI are trademarks of OpenAI.
