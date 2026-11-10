# The band, control by control

```
balance [off] [auto] [light] [medium] [full] │ codex [gpt-6.1-sol ▾] [xhigh ▾] [tier: safe] [transcript]   ▾
Claude 5h 9% · reset 1h                    Codex 7d 14% · reset 5d
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claude 7d 67% · reset 1d                   read 8m ago · credits 62.5k
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
medium → 50/50 · pace Claude 0.8x · Codex 0.4x
```

Everything you pick in the band applies to this session only. Defaults for the next session come from the plugin's config (`claude plugin configure balancer@claude-codex-balancer`).

Agent roles below (exploration, code, plan, review, gate) are the subagent types you set in the [configuration](../README.md#configuration).

## `balance` chips: the mode

The highlighted chip is the active mode. Picking one changes how the orchestrating Claude routes work from its next request on; `/balance <mode>` does the same.

- **`off`**: the mod stops steering. Its only note to Claude is that balancing is off (use Claude subagents, Codex only when you ask); it doesn't force the exploration agent onto Haiku and doesn't refuse the code agent. The band, the quota bars, the transcript pane, the watchdog and `codex_run` keep working, and Codex launched through Bash is still refused: those are tools and safety, not routing. Pick it when you want plain Claude Code for a while.
- **`light`**: Claude does almost everything. Codex gets only bounded code tasks: a clear spec, a known file list, implement plus tests, a refactor, a script. Pick it when Claude has quota to spare or the work needs Claude's context (MCP tools, live systems, client copy).
- **`medium`**: code is split about half and half, alternating between Codex and a Claude subagent. Pick it to spend both quotas evenly.
- **`full`**: every code task (implementation, fixes, refactors, tests, scripts) goes to Codex. Claude only orchestrates, plans, reviews and criticizes. If you set `codeAgent`, launching it is refused unless its description starts with `[non-code]` (client copy, tasks that need MCP or live context). Pick it when Claude's quota is the tight one.
- **`auto`**: the mod picks `light`, `medium` or `full` for you from the pace of each quota, and the last line of the band shows what it picked and why (`auto → codex (Claude is burning faster)`). It is `medium` while either quota has no reading, `full` when Claude is 95% used, `light` when Codex is 95% used, and otherwise moves code to whichever side burns more than 1.25x slower.

In every mode except `off`, exploration, scouting and data handling go to your `exploreAgent` on Haiku, and plans, reviews and the final gate stay on Claude.

## `codex` pickers: model and effort

- **Model** (`gpt-6.1-sol ▾`): the Codex model every `codex_run` job uses by default. The list comes from the models your Codex account can see (`~/.codex/models_cache.json`).
- **Effort** (`xhigh ▾`): Codex's reasoning effort, from `low` to `ultra`. Only the levels the chosen model supports are offered. Higher effort thinks longer and spends more Codex quota per job.

The orchestrator can still pick another model for a single job when a task clearly needs it. Effort is different: the band's effort is a ceiling. The orchestrator may lower it for a small job (a trivial edit at `low`), but a higher request is capped to the band's level and the tool result says so. If the model does not support the band's effort, the job uses the highest level the model supports below it. `/codex [model] [effort]` does the same as the pickers; `/codex high` changes only the effort.

## `tier:` button: what Codex may touch

Pressing it toggles between `safe` and `full` for this session; `/codex-trust safe|full` does the same. It is the tier new Codex jobs run in: with `full` on, jobs get your whole Codex unless the model asks for `safe` on a job that doesn't need it. See [Codex tiers](codex-tiers.md) for what each one allows. Switching to `full` is your call: while it is off, the model is told to ask you and say why, and `codex_run` refuses `full`. Each `full` job still asks you to confirm before it starts.

## `transcript` button

It appears once the session has run a Codex job, and opens the **Codex transcript** pane (also `/codex-log`):

- One row per job, newest first: `▸ 12:23 smoke · gpt-6.1-sol/low · ✓ 15s`. The status reads `● running`, `✓` with its duration when done, `… waiting` before Codex opens its session, `⚠ stalled` or `■ stopped` (see the watchdog below).
- Press a row to unfold or fold it. Several can be open at once; a new job opens on its own.
- An unfolded job shows the task Codex got, its comments, each command with `✓` or `✗ exit N` and the last 12 lines of its output, file changes as short diffs, and the final answer.
- It refreshes every few seconds while a job runs. On a very long run the oldest steps are hidden and the newest kept.

**Watchdog.** Once a minute the plugin checks every running job. When one has written nothing to its rollout for the stall time (15 minutes by default, `stallMinutes` in the plugin config), or has not opened a Codex session after that long, it shows a toast, marks the row `⚠ stalled`, and wakes the session once with the reason, so the orchestrator can look or stop it. If the job moves again, the warning re-arms. A job whose process is gone without finishing shows `■ stopped`; finishing and dying are already reported by the background task's own notification, so the watchdog stays quiet about those. Raise `stallMinutes` if your jobs run long silent test suites.

Codex jobs also show up in Claude Code's own **Background tasks** list, next to subagents. That list shows Codex's raw output; the pane is the readable version.

## Quota bars

- **Left column, Claude**: one bar per window Claude reports, 5 hours and 7 days. The label gives the share used and when that window resets. The first reading arrives with Claude's first reply in the session.
- **Right column, Codex**: the weekly window, read from Codex's own session logs. `read 8m ago` says how old that reading is, because Codex only records it while it runs; `credits` is your remaining Codex credit balance. With no reading and no model list, the band hints "is the Codex CLI installed and logged in?".

## Last line: decision and pace

`medium → 50/50` is where code goes now: `codex`, `claude` or `50/50`. In `auto` it adds the reason. **Pace** is the share of a quota used divided by the share of its window already elapsed. At 1.0x it runs out exactly at reset; below 1x you will finish the window with quota left; above 1x it runs out early, and the line turns to a warning color. The worse window of each side is shown.

## `▾` / `▴`

`▾` collapses the band to its control row and `▴` expands it again. This one choice is remembered across sessions.
