# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - Unreleased

### Added

- Config options `exploreAgent`, `codeAgent`, `planAgent`, `reviewAgent`, `gateAgent` and `codexInstructions`, so the routing policy uses your own agents.
- Plugin metadata: author, homepage, repository, license and keywords.
- MIT license, security policy, contributing guide, code of conduct, issue and PR templates, and CI.
- The band hints "is the Codex CLI installed and logged in?" when Codex has no reading and no model list.

### Changed

- The routing policy no longer names the author's personal agents (`scout`, `coder`, `designer`, `critic`, `gate-critic`) or the "Apply Ponytail (full)" line; those are now config.
- `codexModel` defaults to empty: the first model your Codex account lists in `~/.codex/models_cache.json`, else Codex's own default.
- When the configured effort is not supported by the model, a job uses the highest supported level below it instead of failing.
- The confirmation dialog lists extra writable dirs only for `full` jobs.
- The transcript pane also strips C1 control and bidi-override characters.
- The routing system prompt stays fixed, so changing mode never busts the prompt cache.
- A Codex job's effort is capped at the band's effort; the tool result says so when it caps a request.
- `safe` jobs say so when they ignore `writable_dirs` or `network`, which apply only in `full`.

### Fixed

- `safe` jobs must stay inside the session folder even after `full` is unlocked.
- `full` `writable_dirs` refuse your home, its ancestors, hidden folders directly in it (like `~/.ssh`) and plain files; so does `dir` when a `full` job runs outside the session folder.
- The prompt note and `codex_run` hooks fail safe on errors.

## [0.1.1] - 2026-10-18

### Added

- An `off` mode in the balance chips and `/balance off`.

## [0.1.0] - 2026-10-17

### Added

- Quota pace, mode decision (`auto`, `light`, `medium`, `full`) and routing policy text.
- Band above the prompt with mode chips, Codex model and effort pickers, quota bars and the current decision.
- `mcp__balancer__codex_run`, which runs Codex as a native background task through `safe` and `full` tiers, and a Bash guard that refuses direct Codex launches.
- Codex transcript pane and `/codex-log`; the pane strips control characters.
- Confirmation dialog before each Codex job.
- Watchdog that warns when a Codex job stalls (`stallMinutes`).
- Commands `/balance`, `/codex` and `/codex-trust`.
- Marketplace manifest and README.
