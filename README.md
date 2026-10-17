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

- **Band above the prompt**: mode chips, the Codex model and effort pickers, the Codex tier button, a `transcript` button, quota bars, and the current decision and pace. Each control is explained in [The band, control by control](#the-band-control-by-control).
- **`mcp__balancer__codex_run`**: a tool that runs `codex exec` as a native background task in a working copy that already holds `TASK.md`. It defaults to the session's model and effort, which can be overridden per call.
- **Codex transcript pane**: lists every Codex job of the session, each one expandable, with messages, commands with their exit status and the last lines of output, diffs, and the final answer.
- **Commands**: `/balance [auto|light|medium|full]`, `/codex [model] [effort]`, `/codex-trust [safe|full]`, `/codex-log`.
- **Routing policy**: injected into the orchestrator's system prompt only (subagents don't get it). It holds no live figures, so the prompt cache survives.

## The band, control by control

```
balance [auto] [light] [medium] [full] │ codex [gpt-6.1-sol ▾] [xhigh ▾] [tier: safe] [transcript]   ▾
Claude 5h 9% · reset 1h                    Codex 7d 14% · reset 5d
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claude 7d 67% · reset 1d                   read 8m ago · credits 62.5k
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
medium → 50/50 · pace Claude 0.8x · Codex 0.4x
```

Everything you pick in the band applies to this session only. Defaults for the next session come from the plugin's config menu.

### `balance` chips: the mode

The highlighted chip is the active mode. Picking one changes how the orchestrating Claude routes work from its next request on; `/balance <mode>` does the same.

- **`light`**: Claude does almost everything. Codex gets only bounded code tasks: a clear spec, a known file list, implement plus tests, a refactor, a script. Pick it when Claude has quota to spare or the work needs Claude's context (MCP tools, live systems, client copy).
- **`medium`**: code is split about half and half, alternating between Codex and the `coder` subagent. Pick it to spend both quotas evenly.
- **`full`**: every code task (implementation, fixes, refactors, tests, scripts) goes to Codex. Claude only orchestrates, plans, reviews and criticizes. Launching `coder` is refused unless its description starts with `[non-code]` (client copy, tasks that need MCP or live context). Pick it when Claude's quota is the tight one.
- **`auto`**: the mod picks `light`, `medium` or `full` for you from the pace of each quota, and the last line of the band shows what it picked and why (`auto → codex (Claude is burning faster)`). It is `medium` while either quota has no reading, `full` when Claude is 95% used, `light` when Codex is 95% used, and otherwise moves code to whichever side burns more than 1.25x slower.

Whatever the mode, exploration, scouting and data handling go to `scout` on Haiku, and plans, reviews and the final gate stay on Claude.

### `codex` pickers: model and effort

- **Model** (`gpt-6.1-sol ▾`): the Codex model every `codex_run` job uses by default. The list comes from the models your Codex account can see (`~/.codex/models_cache.json`).
- **Effort** (`xhigh ▾`): Codex's reasoning effort, from `low` to `ultra`. Only the levels the chosen model supports are offered. Higher effort thinks longer and spends more Codex quota per job.

The orchestrator can still override model or effort for a single job when a task clearly needs it (a trivial edit at `low`, a hard one at `max`). The pickers only set the default. `/codex [model] [effort]` does the same as the pickers; `/codex high` changes only the effort.

### `tier:` button: what Codex may touch

Pressing it toggles between `safe` and `full` for this session; `/codex-trust safe|full` does the same. See [Codex tiers](#codex-tiers) below for what each one allows. Switching to `full` is your call: the model is told to ask you and say why, and `codex_run` refuses `full` until the switch is on.

### `transcript` button

It appears once the session has run a Codex job, and opens the **Codex transcript** pane (also `/codex-log`):

- One row per job, newest first: `▸ 12:23 smoke · gpt-6.1-sol/low · ✓ 15s`. The status reads `● running`, `✓` with its duration when done, or `… waiting` before Codex opens its session.
- Press a row to unfold or fold it. Several can be open at once; a new job opens on its own.
- An unfolded job shows the task Codex got, its comments, each command with `✓` or `✗ exit N` and the last 12 lines of its output, file changes as short diffs, and the final answer.
- It refreshes every few seconds while a job runs. On a very long run the oldest steps are hidden and the newest kept.

Codex jobs also show up in Claude Code's own **Background tasks** list, next to subagents. That list shows Codex's raw output; the pane is the readable version.

### Quota bars

- **Left column, Claude**: one bar per window Claude reports, 5 hours and 7 days. The label gives the share used and when that window resets. The first reading arrives with Claude's first reply in the session.
- **Right column, Codex**: the weekly window, read from Codex's own session logs. `read 8m ago` says how old that reading is, because Codex only records it while it runs; `credits` is your remaining Codex credit balance.

### Last line: decision and pace

`medium → 50/50` is where code goes now: `codex`, `claude` or `50/50`. In `auto` it adds the reason. **Pace** is the share of a quota used divided by the share of its window already elapsed. At 1.0x it runs out exactly at reset; below 1x you will finish the window with quota left; above 1x it runs out early, and the line turns to a warning color. The worse window of each side is shown.

### `▾` / `▴`

`▾` collapses the band to its control row and `▴` expands it again. This one choice is remembered across sessions.

## Codex tiers

Every `codex_run` job runs in Codex's `workspace-write` sandbox. Nothing ever passes `danger-full-access` or `--dangerously-*`.

| Tier | What Codex gets | Who picks it |
|---|---|---|
| `safe` (default) | `--ignore-user-config`: none of your Codex plugins, MCP servers or hooks, and no network. It writes only in `dir`, which must sit inside the session's folder (a worktree works). | always on |
| `full` | your whole Codex config (plugins, MCP servers, hooks), plus optional `network: true` and `writable_dirs`, and any `dir` | you, for this session only, with `/codex-trust full` or the `tier:` button in the band |

The model asks for `full` when a task needs it and tells you why; it cannot unlock it. `/codex-trust full` only works when typed at the prompt, not when it arrives as a relayed message. The unlock is not saved, so each session starts in `safe`. In `full`, `writable_dirs` may not be `/` or your home folder (or anything holding it).

"The session's folder" is the folder the session runs in when the job starts; if the session moves to another folder, the allowed area moves with it.

What stays risky in `full`: Codex is then your whole agent. A prompt injected through `TASK.md` or repository content could use your Codex plugins (Slack, browser, computer use) or read files outside the repo. Unlock it only for tasks that need it.

## Install

```
/plugin install balancer --marketplace efrageek/claude-codex-balancer
```

This is a private repository: installing needs GitHub access to it on your machine.

No permission rule is needed. The plugin allows only the exact command it built itself (matched by the plugin's own origin, which nothing else can forge).

Keep these out of `permissions.allow`:

- `Bash(codex exec:*)` or any broad Bash rule: it would let the model run Codex with any flags (sandbox bypass, MCP commands) without asking.
- `mcp__balancer__codex_run`: leave it unlisted so you confirm each Codex job (see below).
- Other shell tools (desktop-commander `start_process`, terminal tools, Monitor): the Codex guard only covers Bash.

The plugin also refuses Bash commands that look like a Codex launch (`codex` or `codex.js` as a word, or a path ending in `/codex`), including wrappers such as `timeout 20 codex`. This is a convenience, not the security boundary: a determined spelling can slip past it, and then your normal permission prompt is what stops it, so the rules above matter. It also refuses lowercase prose such as `-m "fix codex runs"`; capitalize or rephrase it.

Only the main session can start Codex jobs: `codex_run` refuses calls from subagents.

**Confirming jobs.** Before each Codex job the plugin asks you in Claude Code's own dialog, showing the tier, model, effort, folder, and any extra dirs or network. A `safe` job offers "Run, don't ask again this session", so in auto mode you confirm once; a `full` job asks every time. If your permission rules allow `codex_run` (or you run with permissions bypassed) it starts without asking; if they deny it, it never starts; with no one to ask (`claude -p`) it is refused.

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
