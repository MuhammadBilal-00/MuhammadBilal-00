#!/usr/bin/env node
// Collects contribution evidence for the profile from the GitHub API.
//
//   GH_TOKEN=$(gh auth token --user MuhammadBilal-00) node scripts/collect.mjs
//
// Needs the `gh` CLI and a token with `repo` scope (private repos are included in the counts,
// but only aggregates are written out: no commit messages, file names or e-mail addresses).
// Output: data/evidence.json
//
// Discovery is contribution-based, not ownership-based: every repository the account can see
// (owned, collaborator, organisation) plus every repo it has opened a pull request in is
// checked, and any repo with authored commits or PRs is recorded.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const LOGIN = process.env.PROFILE_LOGIN || 'MuhammadBilal-00';
const CACHE = '.cache/commits';
mkdirSync(CACHE, { recursive: true });

const gh = (args) => JSON.parse(execFileSync('gh', args, { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }).toString());
const tryGh = (args) => { try { return gh(args); } catch { return null; } };
const gql = (query) => gh(['api', 'graphql', '-f', `query=${query}`]).data;

// --- language attribution: lines added in authored commits, hand-written source only ---------
const EXT = {
  cs: 'C#', cshtml: 'Razor', ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  mjs: 'JavaScript', py: 'Python', sql: 'SQL', css: 'CSS', scss: 'CSS', html: 'HTML', r: 'R', rmd: 'R',
};
// hidden tool directories (.claude, .agents, ...) hold vendored tooling, not project code
const GENERATED = /(^|\/)\.[^/]+\/|(^|\/)(node_modules|bin|obj|migrations|wwwroot\/lib|\.next|dist|build|vendor)\/|\.designer\.cs$|modelsnapshot\.cs$|\.min\.(js|css)$|package-lock|\.lock$|\.map$/i;
const langOf = (file) => (GENERATED.test(file) ? null : EXT[file.split('.').pop().toLowerCase()] ?? null);

// --- repository discovery -----------------------------------------------------------------
const listed = [];
for (let page = 1; ; page++) {
  const batch = gh(['api', `user/repos?per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`]);
  listed.push(...batch.map((r) => ({ name: r.full_name, private: r.private })));
  if (batch.length < 100) break;
}
const viewer = gql(`{ user(login:"${LOGIN}") {
  id
  repositoriesContributedTo(first:100, includeUserRepositories:true){ nodes{ nameWithOwner isPrivate } }
  pullRequests(first:100){ totalCount nodes{ state repository{ nameWithOwner isPrivate } } }
} }`).user;
const known = new Map(listed.map((r) => [r.name, r.private]));
for (const r of viewer.repositoriesContributedTo.nodes) known.set(r.nameWithOwner, r.isPrivate);
for (const p of viewer.pullRequests.nodes) known.set(p.repository.nameWithOwner, p.repository.isPrivate);
if (viewer.pullRequests.totalCount > 100) console.warn('warning: more than 100 PRs, only the first 100 are counted');

const prs = {};
for (const p of viewer.pullRequests.nodes) {
  const e = (prs[p.repository.nameWithOwner] ??= { opened: 0, merged: 0, open: 0 });
  e.opened++; if (p.state === 'MERGED') e.merged++; if (p.state === 'OPEN') e.open++;
}

// --- per-repository evidence --------------------------------------------------------------
const repos = {};
for (const [name, isPrivate] of [...known].sort()) {
  const shas = [];
  for (let page = 1; ; page++) {
    const batch = tryGh(['api', `repos/${name}/commits?author=${LOGIN}&per_page=100&page=${page}`]);
    if (!batch?.length) break;
    shas.push(...batch.map((c) => c.sha));
    if (batch.length < 100) break;
  }
  if (!shas.length && !prs[name]) continue;

  const days = {}, lang = {};
  let additions = 0, deletions = 0;
  for (const sha of shas) {
    const file = `${CACHE}/${name.replace('/', '__')}__${sha}.json`;
    let c;
    if (existsSync(file)) c = JSON.parse(readFileSync(file, 'utf8'));
    else {
      const d = gh(['api', `repos/${name}/commits/${sha}`]);
      c = { date: d.commit.author.date, add: d.stats.additions, del: d.stats.deletions,
        lang: {} };
      for (const f of d.files ?? []) { const l = langOf(f.filename); if (l) c.lang[l] = (c.lang[l] ?? 0) + f.additions; }
      writeFileSync(file, JSON.stringify(c));
    }
    additions += c.add; deletions += c.del;
    const day = c.date.slice(0, 10); days[day] = (days[day] ?? 0) + 1;
    for (const [l, n] of Object.entries(c.lang)) lang[l] = (lang[l] ?? 0) + n;
  }
  const dates = Object.keys(days).sort();
  const total = tryGh(['api', `repos/${name}/contributors?per_page=100`])?.reduce((s, x) => s + x.contributions, 0) ?? null;
  repos[name] = {
    private: isPrivate, owner: name.split('/')[0],
    commits: shas.length, repoCommits: total, additions, deletions,
    first: dates[0] ?? null, last: dates.at(-1) ?? null,
    prs: prs[name] ?? { opened: 0, merged: 0, open: 0 },
    days, lang,
  };
  console.error(`${name.padEnd(60)} commits=${shas.length} prs=${prs[name]?.opened ?? 0}`);
}

mkdirSync('data', { recursive: true });
mkdirSync('.private', { recursive: true });
const out = (r) => JSON.stringify({ login: LOGIN, generated: new Date().toISOString().slice(0, 10), repos: r }, null, 1);

// Everything discovered stays local; only repositories curated in data/inventory.json are published.
writeFileSync('.private/evidence-all.json', out(repos));
const listed_ = new Set(JSON.parse(readFileSync('data/inventory.json', 'utf8')).projects.flatMap((p) => p.repos.map((r) => r.name)));
writeFileSync('data/evidence.json', out(Object.fromEntries(Object.entries(repos).filter(([n]) => listed_.has(n)))));
const missing = Object.keys(repos).filter((n) => !listed_.has(n));
console.error(`\nwrote data/evidence.json (${listed_.size} inventory repositories)`);
if (missing.length) console.error(`evidence found for repositories not in data/inventory.json (add them or ignore):\n  ${missing.join('\n  ')}`);
