# Codex tiers and permissions

Every `codex_run` job runs in Codex's `workspace-write` sandbox. Nothing ever passes `danger-full-access` or `--dangerously-*`.

| Tier | What Codex gets | Who picks it |
|---|---|---|
| `safe` (default) | `--ignore-user-config`: none of your Codex plugins, MCP servers or hooks, and no network. It writes only in `dir`, which must sit inside the session's folder (a worktree works), even after `full` is unlocked. | the default; the model can also pick it for one job while `full` is on |
| `full` | your whole Codex config (plugins, MCP servers, hooks), plus optional `network: true` and `writable_dirs`, and a `dir` outside the session's folder (within the limits below) | you, for this session only, with `/codex-trust full` or the `tier:` button in the band; then it is the default for new jobs |

While `full` is off, the model asks you for it when a task needs it and tells you why; it cannot switch it on. `/codex-trust full` only works when typed at the prompt, not when it arrives as a relayed message. The unlock is not saved, so each session starts in `safe`.

In `full`, `writable_dirs`, and a `dir` outside the session's folder, may not be `/`, your home folder (or anything holding it), or anything inside a hidden folder directly in your home (like `~/.ssh` or `~/.config`); a writable dir must also be a directory, not a file. In `safe`, `writable_dirs` and `network` are ignored, and the tool result says so.

"The session's folder" is the folder the session runs in when the job starts; if the session moves to another folder, the allowed area moves with it. If you start a session in your home folder itself, all of it counts as the session's folder, hidden folders included, so start sessions in a project folder.

What stays risky in `full`: Codex is then your whole agent. A prompt injected through `TASK.md` or repository content could use your Codex plugins (Slack, browser, computer use) or read files outside the repo. Unlock it only for tasks that need it.

## Permission rules

No permission rule is needed to install or use the plugin. It allows only the exact command it built itself (matched by the plugin's own origin, which nothing else can forge).

Keep these out of `permissions.allow`:

- `Bash(codex exec:*)` or any broad Bash rule: it would let the model run Codex with any flags (sandbox bypass, MCP commands) without asking.
- `mcp__balancer__codex_run`: leave it unlisted so you confirm each Codex job.
- Other shell tools (terminal tools, process runners, Monitor): the Bash guard only covers Bash.

## Bash guard

The plugin refuses Bash commands that look like a Codex launch (`codex` or `codex.js` as a word, or a path ending in `/codex`), including wrappers such as `timeout 20 codex`. This is a convenience, not the security boundary: a determined spelling can slip past it, and then your normal permission prompt is what stops it, so the rules above matter. It also refuses lowercase prose such as `-m "fix codex runs"`; capitalize or rephrase it.

Only the main session can start Codex jobs: `codex_run` refuses calls from subagents.

## Confirming jobs

Before each Codex job the plugin asks you in Claude Code's own dialog, showing the tier, model, effort, folder, and (for `full` jobs) any extra dirs or network. A `safe` job offers "Run, don't ask again this session", so in auto mode you confirm once; a `full` job asks every time. If your permission rules allow `codex_run` (or you run with permissions bypassed) it starts without asking; if they deny it, it never starts; with no one to ask (`claude -p`) it is refused.
