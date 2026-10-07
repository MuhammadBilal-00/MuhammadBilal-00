#!/usr/bin/env node
// Renders the profile visuals and the generated README sections from
//   data/evidence.json   (scripts/collect.mjs)
//   data/inventory.json  (curated)
//
//   node scripts/render.mjs
//
// Writes assets/*-{light,dark}.svg and replaces the blocks between
// <!--GENERATED:name--> ... <!--/GENERATED:name--> markers in README.md. No dependencies,
// no external services: everything the README displays is a file in this repository.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const evidence = JSON.parse(readFileSync('data/evidence.json', 'utf8'));
const inventory = JSON.parse(readFileSync('data/inventory.json', 'utf8'));
const LOGIN = evidence.login;
const TODAY = evidence.generated;

// ---------------------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------------------
const listed = inventory.projects.flatMap((p) => p.repos.map((r) => r.name));
for (const name of listed) if (!evidence.repos[name]) throw new Error(`no evidence for ${name}: run scripts/collect.mjs`);
const used = listed.map((n) => [n, evidence.repos[n]]);

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const totals = {
  repos: used.length,
  foreign: used.filter(([n]) => n.split('/')[0] !== LOGIN).length,
  commits: sum(used.map(([, r]) => r.commits)),
  prs: sum(used.map(([, r]) => r.prs.opened)),
  merged: sum(used.map(([, r]) => r.prs.merged)),
  private: used.filter(([, r]) => r.private).length,
};

const lang = {};
for (const [, r] of used) for (const [l, n] of Object.entries(r.lang)) lang[l] = (lang[l] ?? 0) + n;
const langTotal = sum(Object.values(lang));
const langs = Object.entries(lang).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n, pct: (100 * n) / langTotal }));

const days = {};
for (const [, r] of used) for (const [d, n] of Object.entries(r.days)) days[d] = (days[d] ?? 0) + n;

// ---------------------------------------------------------------------------------------
// themes
// ---------------------------------------------------------------------------------------
const THEMES = {
  light: { panel: '#f6f8fa', border: '#d1d9e0', fg: '#1f2328', muted: '#59636e', accent: '#0969da', track: '#eaeef2', heat: ['#e6ebf0', '#aceebb', '#4ac26b', '#2da44e', '#116329'] },
  dark: { panel: '#151b23', border: '#3d444d', fg: '#f0f6fc', muted: '#9198a1', accent: '#4493f8', track: '#262c36', heat: ['#212830', '#033a16', '#196c2e', '#2ea043', '#56d364'] },
};
const LANG_COLOR = { TypeScript: '#3178c6', 'C#': '#178600', Razor: '#7e57c2', CSS: '#a371f7', Python: '#3572a5', HTML: '#e34c26', JavaScript: '#d4b500', SQL: '#e38c00', R: '#198ce7' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => n.toLocaleString('en-GB');

const svg = (w, h, title, body, t) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
  text{font-family:${SANS};fill:${t.fg}}
  .mono{font-family:${MONO}}
  .muted{fill:${t.muted}}
</style>
${body}
</svg>
`;
const panel = (w, h, t) => `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${t.panel}" stroke="${t.border}"/>`;

// ---------------------------------------------------------------------------------------
// hero
// ---------------------------------------------------------------------------------------
function hero(t) {
  const W = 700, H = 176;
  const dots = [];
  for (let x = 420; x < W - 12; x += 15) for (let y = 18; y < H - 10; y += 15) dots.push(`<circle cx="${x}" cy="${y}" r="1.3"/>`);
  const body = `${panel(W, H, t)}
<defs>
  <linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>
  <mask id="m"><rect x="380" y="0" width="320" height="${H}" fill="url(#fade)"/></mask>
  <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${LANG_COLOR['C#']}"/></linearGradient>
</defs>
<g fill="${t.border}" mask="url(#m)">${dots.join('')}</g>
<rect x="34" y="40" width="5" height="96" rx="2.5" fill="url(#bar)"/>
<text x="58" y="92" font-size="62" font-weight="700" letter-spacing="-1.5">Muhammad Bilal</text>
<text x="60" y="130" font-size="27" font-weight="500" class="muted">.NET, TypeScript and applied ML.</text>`;
  return svg(W, H, 'Muhammad Bilal, software engineer: .NET, TypeScript and applied ML', body, t);
}

// ---------------------------------------------------------------------------------------
// languages
// ---------------------------------------------------------------------------------------
function languages(t) {
  const W = 560, rowH = 34, top = 56;
  const H = top + langs.length * rowH + 4;
  const ribbonX = 4, ribbonW = W - 8;
  let x = ribbonX;
  const segs = langs.map((l) => {
    const w = (ribbonW * l.pct) / 100;
    const s = `<rect x="${x.toFixed(2)}" y="8" width="${Math.max(w, 1).toFixed(2)}" height="18" fill="${LANG_COLOR[l.name] ?? t.muted}"/>`;
    x += w; return s;
  }).join('');
  const max = langs[0].pct;
  const barX = 128, barW = 330;
  const rows = langs.map((l, i) => {
    const y = top + i * rowH;
    const w = Math.max((barW * l.pct) / max, 4);
    const c = LANG_COLOR[l.name] ?? t.muted;
    return `<circle cx="${ribbonX + 8}" cy="${y + 10}" r="7" fill="${c}"/>
<text x="${ribbonX + 24}" y="${y + 16}" font-size="19" font-weight="500">${esc(l.name)}</text>
<rect x="${barX}" y="${y + 2}" width="${barW}" height="16" rx="8" fill="${t.track}"/>
<rect x="${barX}" y="${y + 2}" width="${w.toFixed(1)}" height="16" rx="8" fill="${c}"/>
<text x="${W - 4}" y="${y + 16}" text-anchor="end" font-size="19" class="mono">${l.pct >= 0.1 ? l.pct.toFixed(1) : '&lt;0.1'}%</text>`;
  }).join('\n');
  const body = `<defs><clipPath id="r"><rect x="${ribbonX}" y="8" width="${ribbonW}" height="18" rx="9"/></clipPath></defs>
<g clip-path="url(#r)">${segs}</g>
${rows}`;
  return svg(W, H, `Language mix of authored code: ${langs.slice(0, 4).map((l) => `${l.name} ${l.pct.toFixed(0)}%`).join(', ')}`, body, t);
}

// ---------------------------------------------------------------------------------------
// activity heatmap (last 53 weeks, daily commit counts across all contributed repos)
// ---------------------------------------------------------------------------------------
function activity(t) {
  const pad = 0, label = 34, cell = 11, gap = 3, pitch = cell + gap;
  const end = new Date(`${TODAY}T00:00:00Z`);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 7 * 52 - end.getUTCDay());
  const gx = pad + label, gy = 30;
  const level = (n) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4);
  let cells = '', months = '', total = 0, active = 0, lastMonth = -1;
  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start); date.setUTCDate(start.getUTCDate() + w * 7 + d);
      if (date > end) continue;
      const key = date.toISOString().slice(0, 10);
      const n = days[key] ?? 0;
      total += n; if (n) active++;
      cells += `<rect x="${gx + w * pitch}" y="${gy + d * pitch}" width="${cell}" height="${cell}" rx="2.5" fill="${t.heat[level(n)]}"><title>${key}: ${n} commit${n === 1 ? '' : 's'}</title></rect>`;
      if (d === 0 && date.getUTCMonth() !== lastMonth && w < 51) {
        lastMonth = date.getUTCMonth();
        months += `<text x="${gx + w * pitch}" y="${gy - 10}" font-size="14" class="muted">${MONTHS[date.getUTCMonth()]}</text>`;
      }
    }
  }
  const dayLabels = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([d, s]) => `<text x="${pad}" y="${gy + d * pitch + 10}" font-size="13" class="muted">${s}</text>`).join('');
  const W = gx + 53 * pitch - gap;
  const ly = gy + 7 * pitch + 12, H = ly + 14;
  const sqX = W - 40 - 5 * pitch;
  const legend = t.heat.map((c, i) => `<rect x="${sqX + i * pitch}" y="${ly}" width="${cell}" height="${cell}" rx="2.5" fill="${c}"/>`).join('');
  const body = `${months}${dayLabels}${cells}
<text x="${sqX - 6}" y="${ly + 10}" text-anchor="end" font-size="13" class="muted">Less</text>${legend}<text x="${W}" y="${ly + 10}" text-anchor="end" font-size="13" class="muted">More</text>`;
  return { svg: svg(W, H, `${total} commits in the last 12 months across ${totals.repos} repositories`, body, t), total, active };
}

// ---------------------------------------------------------------------------------------
// write assets
// ---------------------------------------------------------------------------------------
mkdirSync('assets', { recursive: true });
let act;
for (const [mode, t] of Object.entries(THEMES)) {
  writeFileSync(`assets/hero-${mode}.svg`, hero(t));
  writeFileSync(`assets/languages-${mode}.svg`, languages(t));
  act = activity(t);
  writeFileSync(`assets/activity-${mode}.svg`, act.svg);
}

// ---------------------------------------------------------------------------------------
// README sections
// ---------------------------------------------------------------------------------------
const span = (a, b) => {
  const f = (d) => `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
  return f(a) === f(b) ? f(a) : `${f(a)} to ${f(b)}`;
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function projectEvidence(p) {
  const rs = p.repos.map((r) => evidence.repos[r.name]);
  const commits = sum(rs.map((r) => r.commits));
  const opened = sum(rs.map((r) => r.prs.opened));
  const merged = sum(rs.map((r) => r.prs.merged));
  const dates = rs.flatMap((r) => [r.first, r.last]).filter(Boolean).sort();
  const parts = [];
  if (commits) parts.push(plural(commits, 'commit'));
  if (opened) parts.push(`${plural(opened, 'PR')}${merged === opened ? ' merged' : ` (${merged} merged)`}`);
  return { text: parts.join(', '), when: dates.length ? span(dates[0], dates.at(-1)) : '' };
}
const repoLink = (name) => {
  const r = evidence.repos[name];
  return r.private ? `\`${name}\` (private)` : `[${name}](https://github.com/${name})`;
};
const chips = (xs) => xs.map((s) => `\`${s}\``).join(' ');

function featured() {
  return inventory.projects.filter((p) => p.featured).map((p) => {
    const ev = projectEvidence(p);
    const pub = p.repos.find((r) => !evidence.repos[r.name].private);
    const title = pub ? `[${p.name}](https://github.com/${pub.name})` : p.name;
    const live = p.live ? `**Live** [${p.live.replace('https://', '')}](${p.live})  
` : '';
    const repoLines = p.repos.map((r) => `${repoLink(r.name)}${r.note ? `: ${r.note}` : ''}`);
    return [
      `### ${title}`,
      `> ${p.summary}`,
      '',
      `**Role** ${p.role}  `,
      `**Evidence** ${ev.text}${ev.when ? `, ${ev.when}` : ''}  `,
      `**Stack** ${chips(p.stack)}  `,
      `${live}**Repositories** ${repoLines.join(' · ')}`,
      '',
      ...(p.highlights ?? []).map((h) => `- ${h}`),
    ].join('\n');
  }).join('\n\n');
}

function allProjects() {
  return inventory.groups.map((g) => {
    const ps = inventory.projects.filter((p) => p.group === g.id);
    if (!ps.length) return '';
    const rows = ps.map((p) => {
      const ev = projectEvidence(p);
      const repos = p.repos.map((r) => repoLink(r.name)).join('<br>');
      return `| **${p.name}**<br>${p.short ?? p.summary} | ${p.role}<br>${ev.text}${ev.when ? `<br>${ev.when}` : ''} | ${chips(p.stack.slice(0, 5))} | ${repos} |`;
    });
    return [`#### ${g.title}`, '', '| Project | Contribution | Stack | Repository |', '| --- | --- | --- | --- |', ...rows].join('\n');
  }).filter(Boolean).join('\n\n');
}

function collaboration() {
  const owners = {};
  for (const p of inventory.projects) for (const r of p.repos) {
    const o = r.name.split('/')[0];
    if (o === LOGIN) continue;
    (owners[o] ??= { projects: new Set(), repos: [] }).projects.add(p.name);
    owners[o].repos.push(r.name);
  }
  const rows = Object.entries(owners).map(([o, v]) => {
    const rs = v.repos.map((n) => evidence.repos[n]);
    const commits = sum(rs.map((r) => r.commits));
    const prs = sum(rs.map((r) => r.prs.opened));
    const merged = sum(rs.map((r) => r.prs.merged));
    const bits = [plural(commits, 'commit')];
    if (prs) bits.push(`${plural(prs, 'PR')}${merged === prs ? ' merged' : ` (${merged} merged)`}`);
    return `| [@${o}](https://github.com/${o}) | ${[...v.projects].join(', ')} | ${plural(rs.length, 'repository').replace('repositorys', 'repositories')} | ${bits.join(', ')} |`;
  });
  const co = inventory.projects.filter((p) => p.coDevelopedWith?.length).map((p) => `[@${p.coDevelopedWith[0]}](https://github.com/${p.coDevelopedWith[0]}) on **${p.name}**`);
  const table = ['| Owner | Projects | Where the code lives | My contribution |', '| --- | --- | --- | --- |', ...rows].join('\n');
  return `${table}\n\nIn repositories I own, I co-developed with ${co.join(' and ')}, who also have commits there.`;
}

const INLINE = new Set(['updated']);
let readme = readFileSync('README.md', 'utf8');
const blocks = {
  updated: TODAY, featured: featured(), projects: allProjects(), collab: collaboration(),
  metrics: `**${totals.repos}** repositories &nbsp;·&nbsp; **${fmt(totals.commits)}** commits &nbsp;·&nbsp; **${totals.prs}** pull requests &nbsp;·&nbsp; **${totals.foreign}** repositories owned by others`,
  activitynote: `**${fmt(act.total)} commits** in the last 12 months across ${totals.repos} repositories, on ${act.active} active days.`,
  langnote: `**${langs[0].name} ${langs[0].pct.toFixed(0)}%**, **C# ${(lang['C#'] / langTotal * 100).toFixed(0)}%**, **Razor ${(lang.Razor / langTotal * 100).toFixed(0)}%**: C# and Razor together are ${((lang['C#'] + lang.Razor) / langTotal * 100).toFixed(0)}% of the code I have authored (${fmt(langTotal)} lines added across ${totals.repos} repositories).`,
  metricsnote: `Counts cover the ${totals.repos} repositories listed below (${totals.private} private) and are taken from the GitHub API: commits authored under this account on each default branch, and pull requests opened by it (${totals.merged} merged).`,
};
for (const [name, text] of Object.entries(blocks)) {
  const re = new RegExp(`(<!--GENERATED:${name}-->)[\\s\\S]*?(<!--/GENERATED:${name}-->)`);
  if (!re.test(readme)) throw new Error(`README.md is missing the ${name} markers`);
  const sep = INLINE.has(name) ? '' : '\n';
  readme = readme.replace(re, (_, open, close) => `${open}${sep}${text}${sep}${close}`);
}
writeFileSync('README.md', readme);
console.log(`rendered: ${totals.repos} repos, ${totals.commits} commits, ${totals.prs} PRs, ${act.total} commits in the last 12 months`);
