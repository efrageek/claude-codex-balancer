# Contributing

Issues and small pull requests are welcome.

## Dev loop

```
claude --plugin-dir .      # run Claude Code with the local plugin
claude plugin validate .
claude plugin test .       # no login needed, about 1 s
```

Typecheck: the engine writes `.claude-plugin/types/` (gitignored) when it loads the mod from your folder. After that, `tsc -p .` works.

`hooks/policy.ts` (quota pace, mode decision, policy text) and `hooks/rollout.ts` (transcript rendering) are pure and tested. `hooks/register.tsx` wires the hooks, the band, the pane and the tool.

## Conventions

- All mod text (prompts, band, errors, docs) is in English.
- Commit subjects are imperative ("Add a watchdog", not "Added").
- New logic comes with a test.
- Keep PRs small and focused, and add a line to `CHANGELOG.md` under Unreleased.

## Release

1. In one PR, bump `version` in `.claude-plugin/plugin.json`, rename `## [Unreleased]` in `CHANGELOG.md` to `## [X.Y.Z] - YYYY-MM-DD` with that version and its release date, and add a fresh empty `## [Unreleased]` above it. Release notes must be nonempty.
2. Merge the PR into `main`. The Release workflow validates and tests the plugin, then creates the tag `balancer--vX.Y.Z` and a GitHub Release using that CHANGELOG section as notes. Versions with a pre-release suffix (such as `-rc.1`) are marked as prereleases.

If that release already exists, the workflow does nothing, so reruns and `plugin.json` edits that keep the version are safe. If it fails (for example the CHANGELOG section is missing or still says Unreleased), fix it in a PR, then run the Release workflow by hand on `main` (Actions → Release → Run workflow): a CHANGELOG-only change doesn't trigger it. Release one version at a time; bumps merged back to back can skip a release, which the same manual run recovers.
