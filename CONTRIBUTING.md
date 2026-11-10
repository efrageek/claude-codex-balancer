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

1. Bump `version` in `.claude-plugin/plugin.json`.
2. Move the CHANGELOG entries under the new version and date.
3. Merge, then run `claude plugin tag` (creates `balancer--v<version>`) and push the tag.
4. Create a GitHub release from that tag.
