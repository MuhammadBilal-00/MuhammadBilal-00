# Profile data pipeline

The README is backed by data, not hand-typed numbers.

| File | Purpose |
| --- | --- |
| `data/inventory.json` | Curated list of projects: summary, role, stack, repositories. Edit this by hand. |
| `data/evidence.json` | Commits, PRs, active days and lines-by-language per repository. Generated. |
| `scripts/collect.mjs` | Reads GitHub (including private and collaborator repos) and writes `data/evidence.json`. |
| `scripts/render.mjs` | Writes the hero to `assets/`, the language chart and heatmap to `dist/`, and fills the `<!--GENERATED:...-->` blocks in `README.md`. |
| `.github/workflows/refresh.yml` | Weekly job that runs both scripts, publishes `dist/` to the `output` branch and commits README changes. |

## Automatic refresh

Add a repository secret `PROFILE_TOKEN` (a classic personal access token with `repo` scope, so private and collaborator repositories are visible), then run the **Refresh profile stats** workflow once. After that it runs every Monday. Without the secret the workflow skips itself.

```bash
gh secret set PROFILE_TOKEN --repo MuhammadBilal-00/MuhammadBilal-00
```

## Manual refresh

```bash
GH_TOKEN=$(gh auth token --user MuhammadBilal-00) node scripts/collect.mjs
node scripts/render.mjs
```

Needs Node 18+ and the `gh` CLI. The token needs `repo` scope to see private repositories. Only aggregates are written: no commit messages, file names or e-mail addresses.

## Rules for the inventory

- A repository belongs in the portfolio if the evidence shows authored commits or opened PRs, regardless of who owns it. `collect.mjs` prints any repository with evidence that is missing from the inventory.
- Roles are only stated when GitHub evidence supports them.
- Language shares count lines added in authored commits and skip lockfiles, migrations, vendored tooling directories and data files.

The language chart and heatmap are served from the `output` branch, so they are never committed to `main`. `data/evidence.json` and `dist/` are gitignored.
