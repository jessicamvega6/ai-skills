#!/usr/bin/env node
// Helper for the c4-diagrams skill. No dependencies beyond Node 18+.
//
//   node build.mjs scan  <root>               list the files to read, grouped, and pick the output folder
//   node build.mjs build <c4dir> [--no-svg]   render SVGs, prune stale files, write README.md and c4.html
//
// The skill writes <c4dir>/manifest.json and the .mmd files; this script does the rest.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MERMAID_CLI = '@mermaid-js/mermaid-cli@11.17.0';


// ---------------------------------------------------------------- scan

function scan(root) {
  const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'out', 'target', '.terraform', 'vendor', 'coverage',
    '.next', '.nuxt', '.svelte-kit', '.venv', 'venv', 'env', '__pycache__', '.idea', '.vscode',
    '.gradle', '.mvn', 'bin', 'obj', '.cache', 'tmp', '.claude', '.agents', '.pytest_cache',
  ]);
  const SECRET = [
    /(^|\/)\.env(\..*)?$/i, /\.(pem|key|p12|pfx|jks|keystore)$/i, /(^|\/)id_(rsa|ed25519|ecdsa)/i,
    /\.tfstate(\.backup)?$/i, /\.tfvars(\.json)?$/i, /(^|\/)(credentials|secrets?)(\.[a-z]+)?$/i,
    /(^|\/)\.npmrc$/i, /(^|\/)\.netrc$/i,
  ];
  const JUNK = [
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.lock|\.terraform\.lock\.hcl)$/i,
    /\.min\.(js|css)$/i, /\.map$/i, /(^|\/)\.DS_Store$/,
    /\.(png|jpe?g|gif|webp|ico|bmp|tiff?|svg|mp4|mov|webm|mp3|wav|woff2?|ttf|otf|eot|zip|gz|tar|jar|war|class|exe|dll|so|dylib|bin|sqlite|db)$/i,
    /\.(css|scss|sass|less)$/i,
  ];

  // Existing output wins, so re-runs update in place.
  const outCandidates = ['docs/c4', 'c4'];
  let outDir = outCandidates.find(d => fs.existsSync(path.join(root, d, 'manifest.json')));
  const existing = !!outDir;
  if (!outDir) outDir = fs.existsSync(path.join(root, 'docs')) ? 'docs/c4' : 'c4';

  let files = gitFiles(root) ?? walk(root, root, SKIP_DIRS);
  files = files.filter(f => !f.split('/').some(seg => SKIP_DIRS.has(seg)));
  files = files.filter(f => !(f === outDir || f.startsWith(outDir + '/')));

  const secrets = files.filter(f => SECRET.some(r => r.test(f)));
  files = files.filter(f => !SECRET.some(r => r.test(f)));
  const junkCount = files.filter(f => JUNK.some(r => r.test(f))).length;
  files = files.filter(f => !JUNK.some(r => r.test(f)));
  // Folders that hold dropped or replaced work describe nothing current.
  const OLD = /^(archive[sd]?|old|deprecated|superseded|decided-?against|rejected|obsolete|legacy-docs)$/i;
  const oldDirs = new Set();
  files = files.filter(f => {
    const segs = f.split('/').slice(0, -1);
    const i = segs.findIndex(s => OLD.test(s));
    if (i === -1) return true;
    oldDirs.add(segs.slice(0, i + 1).join('/') + '/');
    return false;
  });
  files = files.filter(f => !/^\.[^.]+$/.test(path.posix.basename(f)) || /^\.github$/.test(f.split('/')[0]));

  const groups = { docs: [], infra: [], manifests: [], code: [], pages: [], data: [], other: [] };
  for (const f of files) {
    const abs = path.join(root, f);
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (!stat.isFile()) continue;
    const g = classify(f, abs);
    if (g) groups[g].push({ f, lines: countLines(abs, stat.size), bytes: stat.size });
  }

  console.log(`ROOT ${root}`);
  console.log(`OUTPUT ${outDir} (${existing ? 'existing — update in place' : 'new'})`);
  if (existing) console.log(`MANIFEST ${path.join(outDir, 'manifest.json')}`);
  console.log(`SKIPPED ${secrets.length} possible secret file(s) — never read these${secrets.length ? ': ' + secrets.join(', ') : ''}`);
  console.log(`SKIPPED ${junkCount} lock, minified, style, media or binary file(s)`);
  if (oldDirs.size) console.log(`SKIPPED folders of dropped or replaced work: ${[...oldDirs].join(', ')}`);
  const titles = {
    docs: 'DOCS (markdown, text, PDFs, extension-less notes)',
    infra: 'INFRA (deployment, cloud, CI)',
    manifests: 'MANIFESTS (build files and package lists — name the containers and their tech)',
    code: 'CODE',
    pages: 'PAGES (HTML — often mockups or generated; read selectively)',
    data: 'DATA / CONFIG (JSON, YAML, XML, TOML)',
    other: 'OTHER TEXT',
  };
  for (const [g, list] of Object.entries(groups)) {
    if (!list.length) continue;
    console.log(`\n## ${titles[g]} — ${list.length} file(s)`);
    printGrouped(list);
  }
}

function gitFiles(root) {
  const r = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return r.stdout.split('\n').filter(Boolean).filter(f => fs.existsSync(path.join(root, f)));
}

function walk(dir, root, skip, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!skip.has(e.name)) walk(path.join(dir, e.name), root, skip, out); }
    else if (e.isFile()) out.push(path.relative(root, path.join(dir, e.name)).split(path.sep).join('/'));
  }
  return out;
}

function classify(f, abs) {
  const base = path.basename(f).toLowerCase();
  const ext = path.extname(base);
  if (/^(dockerfile|containerfile|procfile|makefile|jenkinsfile|vagrantfile)$/.test(base) || base.startsWith('dockerfile.')) return 'infra';
  if (/^(docker-)?compose.*\.ya?ml$/.test(base) || /^(serverless|template|samconfig|cdk|skaffold|chart|values|netlify|vercel|fly|app)\.(ya?ml|json|toml)$/.test(base)) return 'infra';
  if (f.startsWith('.github/workflows/') || f.includes('/k8s/') || f.includes('/helm/') || f.startsWith('k8s/') || f.startsWith('helm/')) return 'infra';
  if (['.tf', '.hcl', '.bicep', '.cfn'].includes(ext)) return 'infra';
  if (/^(package\.json|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|requirements.*\.txt|pyproject\.toml|setup\.py|setup\.cfg|go\.mod|cargo\.toml|gemfile|composer\.json|.*\.csproj|.*\.sln|deno\.json|bunfig\.toml)$/.test(base)) return 'manifests';
  if (['.md', '.markdown', '.mdx', '.txt', '.rst', '.adoc', '.org', '.pdf', '.docx'].includes(ext)) return 'docs';
  if (['.java', '.kt', '.kts', '.scala', '.groovy', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.py', '.go', '.rs', '.cs', '.fs', '.rb', '.php', '.swift', '.m', '.c', '.h', '.cc', '.cpp', '.hpp', '.ex', '.exs', '.erl', '.clj', '.dart', '.lua', '.sql', '.graphql', '.gql', '.proto', '.sh', '.bash', '.zsh', '.ps1', '.mmd', '.puml', '.dsl'].includes(ext)) return 'code';
  if (['.html', '.htm'].includes(ext)) return 'pages';
  if (['.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.properties', '.conf', '.cfg', '.env.example'].includes(ext)) return 'data';
  if (!ext || ext.length > 6 || /\s/.test(ext)) return isText(abs) ? 'docs' : null; // notes saved without an extension
  return isText(abs) ? 'other' : null;
}

function isText(abs) {
  try {
    const fd = fs.openSync(abs, 'r');
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    return !buf.subarray(0, n).includes(0);
  } catch { return false; }
}

function countLines(abs, size) {
  if (size > 5 * 1024 * 1024 || abs.toLowerCase().endsWith('.pdf') || abs.toLowerCase().endsWith('.docx')) return null;
  try { return fs.readFileSync(abs, 'utf8').split('\n').length; } catch { return null; }
}

// Big folders of similar files collapse to one line so the list stays readable.
function printGrouped(list) {
  const byDir = new Map();
  for (const item of list) {
    const d = path.posix.dirname(item.f);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(item);
  }
  for (const [d, items] of [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (items.length > 20) {
      const lines = items.reduce((s, i) => s + (i.lines || 0), 0);
      const exts = [...new Set(items.map(i => path.extname(i.f) || '(none)'))].join(', ');
      console.log(`  ${d}/  — ${items.length} files (${exts}), ~${lines} lines; e.g. ${items.slice(0, 3).map(i => path.basename(i.f)).join(', ')}`);
    } else {
      for (const i of items) console.log(`  ${i.f}${i.lines != null ? `  (${i.lines} lines)` : `  (${Math.round(i.bytes / 1024)} KB)`}`);
    }
  }
}

// ---------------------------------------------------------------- build

function build(dir, flags) {
  const noSvg = flags.includes('--no-svg');
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) fail(`No manifest.json in ${dir}`);
  let m;
  try { m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { fail(`manifest.json is not valid JSON: ${e.message}`); }

  const problems = [];
  if (!m.system) problems.push('manifest.system is missing');
  if (!Array.isArray(m.diagrams) || !m.diagrams.length) problems.push('manifest.diagrams is empty');
  const seen = new Set();
  for (const d of m.diagrams || []) {
    if (!/^[a-z0-9][a-z0-9-]*\.mmd$/.test(d.file || '')) problems.push(`bad file name "${d.file}" (use lowercase-with-dashes.mmd)`);
    else if (!fs.existsSync(path.join(dir, d.file))) problems.push(`${d.file} is listed but doesn't exist`);
    if (![1, 2, 3, 4].includes(d.level)) problems.push(`${d.file}: level must be 1–4`);
    if (!d.title) problems.push(`${d.file}: title is missing`);
    if (seen.has(d.file)) problems.push(`${d.file} is listed twice`);
    seen.add(d.file);
  }
  if (problems.length) fail('Manifest problems:\n  - ' + problems.join('\n  - '));

  m.diagrams.sort((a, b) => a.level - b.level);
  for (const d of m.diagrams) {
    d.id = d.file.replace(/\.mmd$/, '');
    d.mermaid = fs.readFileSync(path.join(dir, d.file), 'utf8').trim();
  }
  checkMismatches(m);

  // Prune what an earlier run made that this run no longer lists.
  const keep = new Set(m.diagrams.map(d => d.id));
  const removed = [];
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.mmd') && !keep.has(f.slice(0, -4))) { fs.unlinkSync(path.join(dir, f)); removed.push(f); }
  }
  const svgDir = path.join(dir, 'svg');
  if (fs.existsSync(svgDir)) {
    for (const f of fs.readdirSync(svgDir)) {
      if (f.endsWith('.svg') && !keep.has(f.slice(0, -4))) { fs.unlinkSync(path.join(svgDir, f)); removed.push('svg/' + f); }
    }
  }

  let svgNote = null;
  if (noSvg) {
    svgNote = 'SVGs were not rendered on this run.';
  } else {
    fs.mkdirSync(svgDir, { recursive: true });
    const diagramErrors = [];
    let toolError = null;
    for (const d of m.diagrams) {
      const out = path.join(svgDir, d.id + '.svg');
      const r = spawnSync('npx', ['-y', MERMAID_CLI, '-i', path.join(dir, d.file), '-o', out, '-b', 'white', '-q'], { encoding: 'utf8', timeout: 180000 });
      const text = `${r.stdout || ''}\n${r.stderr || ''}`;
      const svg = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
      const parseFailed = /Parse error|Lexical error|Syntax error|UnknownDiagramError|No diagram type detected/i.test(text) || svg.includes('Syntax error in text');
      if (parseFailed) diagramErrors.push(`${d.file}:\n${text.trim().split('\n').filter(l => l.trim() && !/ExperimentalWarning|--trace-warnings|^\s+at /.test(l)).slice(0, 8).join('\n')}`);
      else if (r.error || r.status !== 0 || !svg) { toolError = (r.error?.message || text.trim()).split('\n').slice(0, 15).join('\n'); break; }
    }
    if (diagramErrors.length) fail('Mermaid could not parse these diagrams. Fix them and run build again:\n\n' + diagramErrors.join('\n\n'));
    if (toolError) fail(`The Mermaid renderer itself failed (not a diagram problem). Run build again with --no-svg to skip the SVGs:\n${toolError}`, 3);
  }

  fs.writeFileSync(path.join(dir, 'README.md'), readme(m, noSvg, svgNote));
  fs.writeFileSync(path.join(dir, 'c4.html'), page(m));

  console.log(`Built ${m.diagrams.length} diagram(s) in ${dir}`);
  console.log(noSvg ? 'SVGs: skipped (--no-svg)' : `SVGs: ${path.join(dir, 'svg')}`);
  if (removed.length) console.log(`Removed stale files: ${removed.join(', ')}`);
  if (m.mismatches.length) console.log(`Code and documents disagree: ${m.mismatches.map(x => `${x.id} ${x.feature}`).join('; ')}`);
  console.log(`Page to publish: ${path.join(dir, 'c4.html')}`);
}

// Code-vs-docs mismatches must name the feature, its docs and ADRs, the code, and the diagrams
// that show it, and each named diagram must actually carry the red flag for it.
function checkMismatches(m) {
  m.mismatches = m.mismatches || [];
  const byId = new Map(m.diagrams.map(d => [d.id, d]));
  const problems = [];
  const ids = new Set();
  for (const [i, x] of m.mismatches.entries()) {
    const where = `mismatches[${i}]${x.id ? ` (${x.id})` : ''}`;
    if (!/^M\d+$/.test(x.id || '')) problems.push(`${where}: id must be M1, M2, ...`);
    else if (ids.has(x.id)) problems.push(`${where}: id is used twice`);
    ids.add(x.id);
    for (const k of ['feature', 'docsSay', 'codeDoes']) if (!x[k]) problems.push(`${where}: ${k} is missing`);
    for (const k of ['featureDocs', 'adrs', 'code', 'diagrams']) if (!Array.isArray(x[k])) problems.push(`${where}: ${k} must be a list (use [] when there are none)`);
    if (Array.isArray(x.featureDocs) && Array.isArray(x.adrs) && !x.featureDocs.length && !x.adrs.length) problems.push(`${where}: name at least one feature doc or ADR`);
    if (Array.isArray(x.code) && !x.code.length) problems.push(`${where}: name the code file(s)`);
    if (Array.isArray(x.diagrams)) {
      if (!x.diagrams.length) problems.push(`${where}: name the diagram(s) that show it`);
      for (const did of x.diagrams) {
        const d = byId.get(did);
        if (!d) { problems.push(`${where}: diagram "${did}" isn't in the manifest (use the file name without .mmd)`); continue; }
        if (!d.mermaid.includes(x.id)) problems.push(`${where}: ${d.file} doesn't flag ${x.id} (see "Code and documents disagree" in conventions.md)`);
      }
    }
  }
  if (problems.length) fail('Mismatch problems:\n  - ' + problems.join('\n  - '));
}

function fail(msg, code = 1) { console.error(msg); process.exit(code); }

const LEVEL_NAMES = { 1: 'System context', 2: 'Containers', 3: 'Components', 4: 'Code' };

function readme(m, noSvg, svgNote) {
  const L = [];
  L.push(`# ${m.system} — C4 model`, '');
  L.push(`*Generated by the \`/c4-diagrams\` skill on ${m.asOf || 'an unknown date'} from the documents and code in this folder. ` +
    `Running it again rewrites this folder, so make lasting changes in the source documents.*`, '');
  if (m.artifactUrl) L.push(`**Viewing page:** ${m.artifactUrl}`, '');
  L.push('Each diagram is a Mermaid file (`.mmd`) with an SVG copy in `svg/`. To edit one in Lucidchart or draw.io, ' +
    'import the `.mmd` text with their Mermaid import, or place the SVG as a picture.', '');
  L.push('**Key:** dark blue = person · blue = this system · mid blue = container · light blue = component · ' +
    'grey = outside system · dashed orange outline or dotted arrow = assumed (see *Assumptions*) · ' +
    'thick red outline or thick arrow marked ⚠ = the code and the documents disagree (see below).', '');
  if (m.mismatches.length) {
    L.push('## ⚠ Code and documents disagree', '',
      'The code that exists doesn\'t match what the documents say. The diagrams show what the code does. ' +
      'Each needs a decision: change the code, or update the feature docs and ADRs.', '');
    for (const x of m.mismatches) {
      L.push(`### ${x.id} — ${x.feature}`, '');
      L.push(`- **The documents say:** ${x.docsSay}`);
      L.push(`- **The code does:** ${x.codeDoes}`);
      L.push(`- **Feature docs:** ${x.featureDocs.length ? x.featureDocs.map(f => `\`${f}\``).join(', ') : 'none found'}`);
      L.push(`- **ADRs responsible:** ${x.adrs.length ? x.adrs.map(f => `\`${f}\``).join(', ') : 'none found — no ADR covers this'}`);
      L.push(`- **Code:** ${x.code.map(f => `\`${f}\``).join(', ')}`);
      L.push(`- **Diagrams:** ${x.diagrams.map(did => `[${titleOf(m, did)}](${did}.mmd)`).join(', ')}`);
      if (x.drawnAs) L.push(`- **Drawn as:** ${x.drawnAs}`);
      L.push('');
    }
  }
  for (const lvl of [1, 2, 3, 4]) {
    const ds = m.diagrams.filter(d => d.level === lvl);
    const skips = (m.skipped || []).filter(s => s.level === lvl);
    if (!ds.length && !skips.length) continue;
    L.push(`## Level ${lvl} — ${LEVEL_NAMES[lvl]}`, '');
    for (const d of ds) {
      L.push(`### ${d.title}`, '');
      if (d.summary) L.push(d.summary, '');
      const mm = m.mismatches.filter(x => x.diagrams.includes(d.id));
      if (mm.length) L.push(`> ⚠ **Code and documents disagree here:** ${mm.map(x => `${x.id} ${x.feature}`).join('; ')}`, '');
      L.push('```mermaid', d.mermaid, '```', '');
      const bits = [`Source: [\`${d.file}\`](${d.file})`];
      if (!noSvg) bits.push(`SVG: [\`svg/${d.id}.svg\`](svg/${d.id}.svg)`);
      if (d.sources?.length) bits.push(`From: ${d.sources.map(s => `\`${s}\``).join(', ')}`);
      L.push(bits.join(' · '), '');
    }
    for (const s of skips) L.push(`*Not drawn${s.subject ? ` for ${s.subject}` : ''}: ${s.reason}*`, '');
  }
  if (m.assumptions?.length) {
    L.push('## Assumptions', '', 'Drawn dashed or dotted. Each is the most likely reading of the documents, not a settled fact.', '');
    for (const a of m.assumptions) L.push(`- **${a.diagram || 'All'}:** ${a.text}${a.source ? ` *(${a.source})*` : ''}`);
    L.push('');
  }
  if (m.conflicts?.length) {
    L.push('## Where the documents disagree', '');
    for (const c of m.conflicts) L.push(`- ${c.text}${c.chosen ? ` **Drawn as:** ${c.chosen}` : ''}${c.sources?.length ? ` *(${c.sources.join('; ')})*` : ''}`);
    L.push('');
  }
  if (m.later?.length) {
    L.push('## Planned for later, not drawn', '');
    for (const x of m.later) L.push(`- ${x.text}${x.source ? ` *(${x.source})*` : ''}`);
    L.push('');
  }
  if (svgNote) L.push(`*${svgNote}*`, '');
  if (m.sources?.length) {
    L.push('## Main sources', '');
    for (const s of m.sources) L.push(`- \`${s}\``);
    L.push('');
  }
  return L.join('\n');
}

const titleOf = (m, did) => m.diagrams.find(d => d.id === did)?.title || did;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(m) {
  const tpl = fs.readFileSync(path.join(HERE, 'viewer-template.html'), 'utf8');
  const levels = [1, 2, 3, 4];
  const counts = Object.fromEntries(levels.map(l => [l, m.diagrams.filter(d => d.level === l).length]));

  const nav = levels.map(l => counts[l]
    ? `<a class="lvl" href="#level-${l}"><span class="lvl-n">${l}</span><span class="lvl-name">${LEVEL_NAMES[l]}</span><span class="lvl-count">${counts[l]} diagram${counts[l] > 1 ? 's' : ''}</span></a>`
    : `<span class="lvl off"><span class="lvl-n">${l}</span><span class="lvl-name">${LEVEL_NAMES[l]}</span><span class="lvl-count">Not drawn</span></span>`).join('\n');

  const sections = levels.map(l => {
    const ds = m.diagrams.filter(d => d.level === l);
    const skips = (m.skipped || []).filter(s => s.level === l);
    if (!ds.length && !skips.length) return '';
    const arts = ds.map(d => `
      <article class="diagram" id="${esc(d.id)}">
        <header class="d-head">
          <h3>${esc(d.title)}</h3>
          <button type="button" class="copy" data-id="${esc(d.id)}" id="copy-${esc(d.id)}">Copy Mermaid</button>
        </header>
        ${d.summary ? `<p class="d-sum">${esc(d.summary)}</p>` : ''}
        ${(() => { const mm = m.mismatches.filter(x => x.diagrams.includes(d.id)); return mm.length
          ? `<p class="flag">Code and documents disagree here: ${mm.map(x => `<a href="#mismatch-${esc(x.id)}">${esc(x.id)} ${esc(x.feature)}</a>`).join(', ')}</p>` : ''; })()}
        <div class="canvas"><pre class="mermaid">${esc(d.mermaid)}</pre></div>
        <textarea class="fallback" id="text-${esc(d.id)}" readonly hidden aria-label="Mermaid text for ${esc(d.title)}">${esc(d.mermaid)}</textarea>
        ${d.sources?.length ? `<p class="d-src">From ${d.sources.map(s => `<code>${esc(s)}</code>`).join(', ')}</p>` : ''}
      </article>`).join('\n');
    const notes = skips.map(s => `<p class="skip">Not drawn${s.subject ? ` for <strong>${esc(s.subject)}</strong>` : ''}: ${esc(s.reason)}</p>`).join('\n');
    return `
    <section class="level" id="level-${l}">
      <h2><span class="eyebrow">Level ${l}</span>${LEVEL_NAMES[l]}</h2>
      ${arts}
      ${notes}
    </section>`;
  }).join('\n');

  const list = (items, fmt) => `<ul class="notes">${items.map(fmt).join('')}</ul>`;
  let notes = '';
  if (m.assumptions?.length) notes += `<section class="aside" id="assumptions"><h2>Assumptions</h2><p class="lede">Drawn with a dashed orange outline or a dotted arrow. Each is the likeliest reading of the documents, not a settled fact.</p>${list(m.assumptions, a => `<li><span class="tag">${esc(a.diagram || 'All')}</span> ${esc(a.text)}${a.source ? ` <code>${esc(a.source)}</code>` : ''}</li>`)}</section>`;
  if (m.conflicts?.length) notes += `<section class="aside" id="conflicts"><h2>Where the documents disagree</h2>${list(m.conflicts, c => `<li>${esc(c.text)}${c.chosen ? ` <strong>Drawn as:</strong> ${esc(c.chosen)}` : ''}${c.sources?.length ? ` ${c.sources.map(s => `<code>${esc(s)}</code>`).join(' ')}` : ''}</li>`)}</section>`;
  if (m.later?.length) notes += `<section class="aside" id="later"><h2>Planned for later, not drawn</h2>${list(m.later, x => `<li>${esc(x.text)}${x.source ? ` <code>${esc(x.source)}</code>` : ''}</li>`)}</section>`;
  if (m.sources?.length) notes += `<section class="aside" id="sources"><h2>Main sources</h2>${list(m.sources, s => `<li><code>${esc(s)}</code></li>`)}</section>`;

  const files = (arr, none) => arr.length ? arr.map(f => `<code>${esc(f)}</code>`).join(' ') : `<span class="none">${none}</span>`;
  const mismatches = m.mismatches.length ? `
  <section class="mismatch" id="mismatches" aria-labelledby="mismatch-h">
    <h2 id="mismatch-h">Code and documents disagree <span class="count">${m.mismatches.length}</span></h2>
    <p class="lede">The code that exists doesn't match what the documents say. The diagrams show what the code does. Each needs a decision: change the code, or update the feature docs and ADRs.</p>
    ${m.mismatches.map(x => `
    <article class="mm" id="mismatch-${esc(x.id)}">
      <h3><span class="mm-id">${esc(x.id)}</span>${esc(x.feature)}</h3>
      <dl>
        <dt>The documents say</dt><dd>${esc(x.docsSay)}</dd>
        <dt>The code does</dt><dd>${esc(x.codeDoes)}</dd>
        <dt>Feature docs</dt><dd>${files(x.featureDocs, 'None found')}</dd>
        <dt>ADRs responsible</dt><dd>${files(x.adrs, 'None found. No ADR covers this.')}</dd>
        <dt>Code</dt><dd>${files(x.code, '')}</dd>
        <dt>Diagrams</dt><dd>${x.diagrams.map(did => `<a href="#${esc(did)}">${esc(titleOf(m, did))}</a>`).join(', ')}</dd>
        ${x.drawnAs ? `<dt>Drawn as</dt><dd>${esc(x.drawnAs)}</dd>` : ''}
      </dl>
    </article>`).join('')}
  </section>` : '';

  const total = m.diagrams.length;
  const subtitle = `${total} diagram${total > 1 ? 's' : ''} · as of ${esc(m.asOf || 'unknown date')}${m.mismatches.length ? ` · <a href="#mismatches" class="warn">${m.mismatches.length} code mismatch${m.mismatches.length > 1 ? 'es' : ''}</a>` : ''}${m.assumptions?.length ? ` · ${m.assumptions.length} assumption${m.assumptions.length > 1 ? 's' : ''}` : ''}`;
  const data = JSON.stringify(Object.fromEntries(m.diagrams.map(d => [d.id, d.mermaid]))).replace(/</g, '\\u003c');

  // Function replacements, so a "$" in a diagram is never read as a replacement pattern.
  return tpl
    .replaceAll('__TITLE__', () => esc(`${m.system} C4 Model`))
    .replaceAll('__SYSTEM__', () => esc(m.system))
    .replaceAll('__SUBTITLE__', () => subtitle)
    .replace('__NAV__', () => nav)
    .replace('__MISMATCHES__', () => mismatches)
    .replace('__SECTIONS__', () => sections)
    .replace('__NOTES__', () => notes)
    .replace('__DATA__', () => data);
}

// ---------------------------------------------------------------- main (last, so every constant above exists)

const [cmd, target, ...flags] = process.argv.slice(2);
if (cmd === 'scan' && target) scan(path.resolve(target));
else if (cmd === 'build' && target) build(path.resolve(target), flags);
else {
  console.error('usage: node build.mjs scan <root> | build <c4dir> [--no-svg]');
  process.exit(2);
}
