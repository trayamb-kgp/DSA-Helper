/**
 * Verifies the built extension in `dist/`. Run after `npm run build`.
 *
 * Everything here checks the *artifact*, not the source. The unit suite can be
 * entirely green while the thing Chrome actually loads is wrong — which is
 * exactly what happened: two entry modules were both named `index.ts`, CRXJS
 * resolved the service worker to the content script's chunk, and none of the
 * background listeners were ever registered (D045). Nothing in a typecheck,
 * a unit test or the build log could see it.
 *
 * Usage:  node tools/check-build.mjs
 * Exit:   0 all checks pass, 1 otherwise.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// --- budgets ---------------------------------------------------------------

/** architecture.md §7: bundled extension size. */
const TOTAL_BUDGET = 500 * 1024;

/**
 * Per-entry transitive closure budgets — what Chrome parses when that entry
 * runs. The content script's is the one that matters for the < 5 ms page-load
 * budget in architecture.md §7; the others are here to catch accidental
 * dependency growth. All are comfortably above today's sizes and far below
 * React's ~193 KB, so pulling the UI layer into a content script trips them
 * even if the name-based check below somehow misses it.
 */
const ENTRY_BUDGETS = {
  'service worker': 64 * 1024,
  'content script (problem pages)': 80 * 1024,
  'content script (MAIN world editor bridge)': 24 * 1024,
  'content script (chatgpt.com)': 32 * 1024,
};

/**
 * D012: React ships only to the popup and the options page. A content script
 * or the service worker must not reach it.
 */
const REACT_CHUNK = /(^|[/-])(react|jsx-runtime)/i;

/**
 * D010: the extension makes no network requests. Checked against first-party
 * chunks only — React's own bundle contains a `fetch(` reference for its
 * resource-preload hints, and it is reachable only from the popup and options
 * pages, never from a content script or the worker. Laundering that through a
 * blanket exclusion would make the check dishonest, so the vendor chunks are
 * named in the output instead.
 */
const NETWORK_TOKENS = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'sendBeacon',
  'EventSource',
  'importScripts',
  'navigator.connection',
];

/** spec.md §10: the permission set is deliberate and reviewed. */
const EXPECTED_PERMISSIONS = ['storage', 'activeTab', 'scripting', 'contextMenus', 'tabs'];
const FORBIDDEN_PERMISSIONS = ['clipboardWrite', 'clipboardRead', 'webRequest', 'history', 'cookies'];

// --- reporting -------------------------------------------------------------

let failures = 0;
const pass = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
};
const section = (name) => console.log(`\n${name}`);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// --- dist helpers ----------------------------------------------------------

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const posix = (path) => relative(DIST, path).split('\\').join('/');
const distPath = (rel) => join(DIST, rel);
const sizeOf = (rel) => statSync(distPath(rel)).size;
const read = (rel) => readFileSync(distPath(rel), 'utf8');

/**
 * Every other dist file this one names.
 *
 * Covers static `import ... from "./x.js"`, bare `import "./x.js"`, dynamic
 * `import("./x.js")` and CRXJS's loader form,
 * `chrome.runtime.getURL("assets/x.js")` — the last of which is why a plain
 * import-graph walk is not enough here.
 */
function referencesIn(rel) {
  const source = read(rel);
  const found = new Set();
  for (const match of source.matchAll(/["'](?:\.\/|\.\.\/|\/)?((?:assets\/)?[\w.-]+\.js)["']/g)) {
    const name = match[1].replace(/^assets\//, '');
    const candidate = `assets/${name}`;
    try {
      statSync(distPath(candidate));
      found.add(candidate);
    } catch {
      // A string that merely looks like a filename. Not a reference.
    }
  }
  return [...found];
}

/** Transitive closure of `entry`, including it. */
function closureOf(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...referencesIn(current));
  }
  return [...seen];
}

// --- checks ----------------------------------------------------------------

let manifest;
try {
  manifest = JSON.parse(read('manifest.json'));
} catch {
  console.error('dist/manifest.json is missing or unparseable. Run `npm run build` first.');
  process.exit(1);
}

console.log(`Checking dist/ for DSA Helper ${manifest.version}`);

// 1. Everything the manifest names actually exists.
section('Manifest references');
const referenced = [
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((cs) => cs.js ?? []),
  ...(manifest.web_accessible_resources ?? []).flatMap((war) => war.resources ?? []),
  manifest.action?.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons ?? {}),
].filter(Boolean);

const missing = referenced.filter((rel) => {
  try {
    statSync(distPath(rel));
    return false;
  } catch {
    return true;
  }
});
if (missing.length === 0) pass(`all ${referenced.length} referenced files present`);
else for (const rel of missing) fail(`manifest names a file that was not emitted: ${rel}`);

// 2. No two script entries share a basename (D045).
section('Entry-point names are unique (D045)');
const entrySources = [
  ['service worker', 'src/background/serviceWorker.ts'],
  ['content script (problem pages)', 'src/content/platform/contentScript.ts'],
  ['content script (MAIN world editor bridge)', 'src/content/mainworld/editorBridge.ts'],
  ['content script (chatgpt.com)', 'src/content/chatgpt/inject.ts'],
];
const byBase = new Map();
for (const [, source] of entrySources) {
  const base = basename(source);
  byBase.set(base, (byBase.get(base) ?? 0) + 1);
}
const collisions = [...byBase].filter(([, count]) => count > 1);
if (collisions.length === 0) pass(`${entrySources.length} entry points, all distinctly named`);
else
  for (const [base] of collisions)
    fail(`two entry points are both named ${base} — CRXJS resolves chunks by basename`);

// 3. The emitted service worker really is the background code (D045).
section('Service worker identity (D045)');
const swLoader = manifest.background?.service_worker;
if (!swLoader) {
  fail('manifest declares no background service worker');
} else {
  const swChunks = referencesIn(swLoader);
  const swEntry = swChunks.find((rel) => basename(rel).startsWith('serviceWorker.ts-'));
  if (!swEntry) {
    fail(
      `${swLoader} imports [${swChunks.join(', ')}] — none of which is the ` +
        'background entry chunk. The worker is loading the wrong module.',
    );
  } else {
    pass(`${swLoader} -> ${swEntry}`);
    // Name checks catch the collision; these catch a worker that is the right
    // file but has lost its listeners. Property access on the `chrome` global
    // survives minification, so these markers are stable.
    const body = closureOf(swEntry)
      .map(read)
      .join('');
    for (const marker of ['onInstalled', 'contextMenus', 'onCommand', 'onMessage']) {
      if (body.includes(marker)) pass(`worker registers ${marker}`);
      else fail(`worker never mentions ${marker} — a listener is not being registered`);
    }
  }
}

// 4. No React outside the popup and options page (D012).
section('React boundary (D012)');
const entryFiles = {
  'service worker': swLoader,
  'content script (problem pages)': manifest.content_scripts?.[0]?.js?.[0],
  'content script (MAIN world editor bridge)': manifest.content_scripts?.[1]?.js?.[0],
  'content script (chatgpt.com)': manifest.content_scripts?.[2]?.js?.[0],
};

const closures = {};
for (const [label, entry] of Object.entries(entryFiles)) {
  if (!entry) {
    fail(`${label}: no entry file in the manifest`);
    continue;
  }
  closures[label] = closureOf(entry);
  const reactChunks = closures[label].filter((rel) => REACT_CHUNK.test(basename(rel)));
  if (reactChunks.length === 0) pass(`${label}: no React`);
  else fail(`${label}: pulls in ${reactChunks.join(', ')}`);
}

// 5. Per-entry closure sizes.
section('Load cost per entry (architecture.md §7)');
for (const [label, files] of Object.entries(closures)) {
  const bytes = files.reduce((sum, rel) => sum + sizeOf(rel), 0);
  const budget = ENTRY_BUDGETS[label];
  const detail = `${label}: ${kb(bytes)} across ${files.length} files (budget ${kb(budget)})`;
  if (bytes <= budget) pass(detail);
  else fail(detail);
}

// 6. Total size.
section('Bundle size (architecture.md §7)');
const allFiles = walk(DIST);
const total = allFiles.reduce((sum, path) => sum + statSync(path).size, 0);
if (total <= TOTAL_BUDGET) pass(`dist/ is ${kb(total)} of ${kb(TOTAL_BUDGET)}`);
else fail(`dist/ is ${kb(total)}, over the ${kb(TOTAL_BUDGET)} budget`);

// 7. Orphans — emitted but reachable from nothing. A stale chunk is usually
//    the visible symptom of a wiring bug like the one D045 records.
section('Unreachable output');
const reachable = new Set();
for (const rel of referenced) {
  if (rel.endsWith('.js')) for (const file of closureOf(rel)) reachable.add(file);
  else reachable.add(rel);
}
for (const rel of referenced.filter((r) => r.endsWith('.html'))) {
  for (const match of read(rel).matchAll(/["']\/?((?:assets\/)?[\w.-]+\.(?:js|css))["']/g)) {
    const candidate = match[1].startsWith('assets/') ? match[1] : `assets/${match[1]}`;
    try {
      statSync(distPath(candidate));
      for (const file of closureOf(candidate)) reachable.add(file);
    } catch {
      /* not a real file */
    }
  }
}
const orphans = allFiles
  .map(posix)
  .filter((rel) => rel.endsWith('.js') && !reachable.has(rel) && !referenced.includes(rel));
if (orphans.length === 0) pass('every emitted script is reachable');
else for (const rel of orphans) fail(`emitted but nothing loads it: ${rel}`);

// 8. No network calls from our own code (D010).
section('No network requests (D010)');
const firstParty = allFiles
  .map(posix)
  .filter((rel) => rel.endsWith('.js') && !REACT_CHUNK.test(basename(rel)));
const vendor = allFiles
  .map(posix)
  .filter((rel) => rel.endsWith('.js') && REACT_CHUNK.test(basename(rel)));

let networkHits = 0;
for (const rel of firstParty) {
  const body = read(rel);
  for (const token of NETWORK_TOKENS) {
    if (body.includes(token)) {
      fail(`${rel} contains ${token}`);
      networkHits += 1;
    }
  }
}
if (networkHits === 0) pass(`${firstParty.length} first-party chunks, no network API used`);
if (vendor.length > 0) {
  console.log(
    `  note  not scanned: ${vendor.join(', ')} — React's own bundle, reachable\n` +
      '        only from the popup and options page, never from a content script.',
  );
}

// 9. Permission posture (spec.md §10, D021).
section('Permissions (spec.md §10)');
const permissions = manifest.permissions ?? [];
const unexpected = permissions.filter((p) => !EXPECTED_PERMISSIONS.includes(p));
const absent = EXPECTED_PERMISSIONS.filter((p) => !permissions.includes(p));
if (unexpected.length === 0 && absent.length === 0) pass(`exactly [${permissions.join(', ')}]`);
if (unexpected.length > 0) fail(`undeclared permission requested: ${unexpected.join(', ')}`);
if (absent.length > 0) fail(`expected permission missing: ${absent.join(', ')}`);

for (const forbidden of FORBIDDEN_PERMISSIONS) {
  if (permissions.includes(forbidden)) fail(`${forbidden} must not be requested`);
}

const hosts = manifest.host_permissions ?? [];
const broad = hosts.filter((h) => h.includes('<all_urls>') || h === '*://*/*');
if (broad.length === 0) pass(`${hosts.length} host permissions, none broad`);
else fail(`broad host permission: ${broad.join(', ')}`);

// --- result ----------------------------------------------------------------

console.log('');
if (failures > 0) {
  console.log(`${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('All build checks passed.');
