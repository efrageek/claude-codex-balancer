# balancer

A Claude Code mod that balances subagent work between Claude models and the Codex CLI by quota.

It reads both quotas (Claude's 5h/7d windows and Codex's weekly window), works out how fast each is burning, and tells the orchestrating Claude where to send each kind of task. Codex runs show up as native background tasks, and a pane renders their full transcripts.

## Modes

| Mode | Code tasks go to | Claude models are used for |
|---|---|---|
| `light` (default) | Codex only for bounded tasks (clear spec and file list); the rest to `coder` | almost everything |
| `medium` | about half Codex, half `coder` | orchestration, plans, reviews, half the code |
| `full` | Codex, always (`coder` is refused unless its description starts with `[non-code]`) | orchestration, plans, reviews and critics only |
| `auto` | picks `light`, `medium` or `full` from the quota pace below | depends on the pick |

In every mode, exploration, scouting and data handling go to `scout` (forced onto Haiku), and `designer`, `critic` and `gate-critic` stay on Claude.

**Pace** is the share of a quota used divided by the share of its window already elapsed. At 1.0x the quota runs out exactly at reset; above 1x it runs out early. `auto` sends code to the provider with the lower pace when one burns more than 1.25x faster than the other. It falls back to `medium` while either quota has no reading, and moves away from a provider that is 95% used.

## What it adds

- **Band above the prompt**: mode chips, the Codex model and effort pickers, a `transcript` button, quota bars for each window, the age of the last Codex reading, credits, and the current pace. `▾` collapses it to the control row and `▴` expands it again; the choice is remembered.
- **`mcp__balancer__codex_run`**: a tool that runs `codex exec` as a native background task in a working copy that already holds `TASK.md`. It defaults to the session's model and effort, which can be overridden per call.
- **Codex transcript pane**: lists every Codex job of the session, each one expandable, with messages, commands with their exit status and the last lines of output, diffs, and the final answer.
- **Commands**: `/balance [auto|light|medium|full]`, `/codex [model] [effort]`, `/codex-log`.
- **Routing policy**: injected into the orchestrator's system prompt only (subagents don't get it). It holds no live figures, so the prompt cache survives.

## Install

```
/plugin install balancer --marketplace efrageek/claude-codex-balancer
```

This is a private repository: installing needs GitHub access to it on your machine.

Then allow the Codex command, so auto mode doesn't block the background task the tool starts. Add this to `permissions.allow` in `~/.claude/settings.json`:

```json
"Bash(codex exec:*)"
```

Defaults (mode, Codex model, Codex effort) are set in the plugin's config menu. The band and the commands change them for the current session only.

## Requirements

- Claude Code with mod (hooks module) support.
- Codex CLI logged in. Quotas are read from `~/.codex/sessions/**/*.jsonl` and models from `~/.codex/models_cache.json`.
- Where an organization manages Claude Code, `prompt.compose` hooks don't run for user-installed plugins. The routing policy is then not injected, but the Haiku override and the `coder` refusal in `full` still apply.

## Develop

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```

`hooks/policy.ts` (quota pace, mode decision, policy text) and `hooks/rollout.ts` (transcript rendering) are pure and tested. `hooks/register.tsx` wires the hooks, the band, the pane and the tool.
