# Profile data pipeline

The README is backed by data, not hand-typed numbers.

| File | Purpose |
| --- | --- |
| `data/inventory.json` | Curated list of projects: summary, role, stack, repositories. Edit this by hand. |
| `data/evidence.json` | Commits, PRs, active days and lines-by-language per repository. Generated. |
| `scripts/collect.mjs` | Reads GitHub (including private and collaborator repos) and writes `data/evidence.json`. |
| `scripts/render.mjs` | Writes `assets/*.svg` and fills the `<!--GENERATED:...-->` blocks in `README.md`. |

## Refresh

```bash
GH_TOKEN=$(gh auth token --user MuhammadBilal-00) node scripts/collect.mjs
node scripts/render.mjs
```

Needs Node 18+ and the `gh` CLI. The token needs `repo` scope to see private repositories. Only aggregates are written: no commit messages, file names or e-mail addresses.

## Rules for the inventory

- A repository belongs in the portfolio if the evidence shows authored commits or opened PRs, regardless of who owns it. `collect.mjs` prints any repository with evidence that is missing from the inventory.
- Roles are only stated when GitHub evidence supports them.
- Language shares count lines added in authored commits and skip lockfiles, migrations, vendored tooling directories and data files.

This is deliberately a manual refresh rather than a scheduled workflow: it needs a token with private-repository access, and a stable README matters more than live numbers.
