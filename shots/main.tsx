/**
 * Screenshot harness — NOT shipped. Renders the extension's real popup/options
 * React components (from src/, with chrome.* mocked + fixtures) so we can
 * capture Chrome Web Store screenshots at exactly 1280x800 from the actual UI
 * code rather than hand-drawn mocks.
 *
 * Scene is chosen by ?scene=popup|options (default popup).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// ---- fixture: LeetCode 912, the README's own example ----------------------
const CODE = `class Solution {
public:
    vector<int> sortArray(vector<int>& nums) {
        mergeSort(nums, 0, nums.size() - 1);
        return nums;
    }
    void mergeSort(vector<int>& a, int lo, int hi) {
        if (lo >= hi) return;
        int mid = lo + (hi - lo) / 2;
        mergeSort(a, lo, mid);
        mergeSort(a, mid + 1, hi);
        merge(a, lo, mid, hi);
    }
};`;

const context = {
  platform: 'leetcode',
  platformLabel: 'LeetCode',
  url: 'https://leetcode.com/problems/sort-an-array/',
  slug: 'sort-an-array',
  number: '912',
  title: 'Sort an Array',
  difficulty: 'Medium',
  tags: ['Array', 'Divide and Conquer', 'Sorting'],
  statementMd: 'Given an array of integers `nums`, sort the array in ascending order and return it.',
  examplesMd: 'Input: nums = [5,2,3,1]\nOutput: [1,2,3,5]',
  constraintsMd: '1 <= nums.length <= 5 * 10^4',
  language: 'C++',
  code: CODE,
  codeSource: 'editorApi',
  isContest: false,
  isLocked: false,
  extractedAt: Date.now(),
  warnings: [],
};

// ---- chrome.* mock --------------------------------------------------------
const chromeMock = {
  runtime: {
    lastError: undefined,
    sendMessage: async () => ({ type: 'PROMPT_RESULT', prompt: 'prompt' }),
    openOptionsPage: () => {},
    getManifest: () => ({ version: '0.1.0' }),
  },
  tabs: {
    query: async () => [{ id: 1, active: true, currentWindow: true }],
    sendMessage: async (_id: number, msg: { type?: string }) =>
      msg?.type === 'EXTRACT_CONTEXT' ? { type: 'CONTEXT_RESULT', context } : null,
    create: async () => {},
  },
  storage: {
    // theme:'light' so the capture is deterministic regardless of OS/browser.
    sync: { get: async () => ({ settings: { theme: 'light' } }) },
    local: { get: async () => ({}) },
    session: { get: async () => ({}) },
  },
};
(globalThis as unknown as { chrome: unknown }).chrome = chromeMock;

const scene = new URLSearchParams(location.search).get('scene') ?? 'popup';
const shot = document.getElementById('shot')!;

function baseStyle(extra: string) {
  const style = document.createElement('style');
  style.textContent = `
    html, body { margin: 0; padding: 0; }
    body { width: 1280px !important; height: 800px; overflow: hidden;
           background: #fff; font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
    ${extra}`;
  document.head.appendChild(style);
}

if (scene === 'popup') {
  const { Popup } = await import('../src/popup/Popup');
  await import('../src/popup/popup.css');

  shot.innerHTML = `
    <div class="frame">
      <div class="copy">
        <div class="kbd"><span>Alt</span><span>Shift</span><span>Y</span></div>
        <h1>From problem page to answer,<br/>in one keystroke.</h1>
        <p>DSA Helper reads the problem and your code, then opens a YouTube search
           or a ready-to-send ChatGPT review &mdash; on LeetCode, Codeforces,
           CodeChef and GeeksforGeeks.</p>
      </div>
      <div class="device">
        <div class="bar">
          <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
          <span class="url">leetcode.com/problems/sort-an-array</span>
        </div>
        <div id="popup-root" class="popup-host"></div>
      </div>
    </div>`;

  baseStyle(`
    .frame { width: 1280px; height: 800px; box-sizing: border-box;
             display: flex; align-items: center; gap: 72px; padding: 0 84px;
             background: radial-gradient(1200px 600px at 15% -10%, #eef0ff 0%, #f7f8ff 45%, #ffffff 100%); }
    .copy { flex: 1; max-width: 560px; color: #18181b; }
    .copy .kbd { display: inline-flex; gap: 6px; margin-bottom: 28px; }
    .copy .kbd span { padding: 6px 12px; border-radius: 8px; background: #fff;
             border: 1px solid #e4e4e7; box-shadow: 0 2px 0 #e4e4e7;
             font-size: 14px; font-weight: 600; color: #4f46e5; }
    .copy h1 { margin: 0 0 20px; font-size: 40px; line-height: 1.15;
             letter-spacing: -0.02em; font-weight: 800; }
    .copy p { margin: 0; font-size: 18px; line-height: 1.6; color: #52525b; max-width: 480px; }
    .device { width: 380px; flex: none; border-radius: 16px; overflow: hidden;
             background: #fff; border: 1px solid #e4e4e7;
             box-shadow: 0 30px 70px -20px rgba(30, 27, 75, 0.35); }
    .device .bar { display: flex; align-items: center; gap: 7px; padding: 12px 16px;
             background: #fafafa; border-bottom: 1px solid #eee; }
    .device .dot { width: 11px; height: 11px; border-radius: 50%; }
    .device .dot.r { background: #ff5f57; } .device .dot.y { background: #febc2e; }
    .device .dot.g { background: #28c840; }
    .device .url { margin-left: 12px; padding: 4px 12px; flex: 1; border-radius: 7px;
             background: #fff; border: 1px solid #ececf0; color: #71717a; font-size: 12px; }
    .popup-host { width: 380px; box-sizing: border-box; }
    .popup-host .popup { padding: 20px 20px 22px; }
  `);

  createRoot(document.getElementById('popup-root')!).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
} else if (scene === 'options') {
  const { Options } = await import('../src/options/Options');
  await import('../src/options/options.css');

  shot.innerHTML = `
    <div class="win">
      <div class="bar">
        <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
        <span class="url">DSA Helper — Settings</span>
      </div>
      <div id="options-root" class="options-host"></div>
    </div>`;

  baseStyle(`
    .win { width: 1280px; height: 800px; box-sizing: border-box; overflow: hidden;
           background: #fff; }
    .win .bar { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 18px;
           background: #f3f3f5; border-bottom: 1px solid #e4e4e7; }
    .win .dot { width: 12px; height: 12px; border-radius: 50%; }
    .win .dot.r { background: #ff5f57; } .win .dot.y { background: #febc2e; }
    .win .dot.g { background: #28c840; }
    .win .url { margin-left: 14px; padding: 5px 16px; border-radius: 8px; background: #fff;
           border: 1px solid #e4e4e7; color: #52525b; font-size: 13px; font-weight: 500; }
    /* scrollable so we can capture the tall page in several 1280x800 frames;
       scrollbar hidden so it doesn't show up in the shots. */
    .options-host { height: 756px; overflow-y: auto; background: #fff;
           scrollbar-width: none; }
    .options-host::-webkit-scrollbar { display: none; }
    .options-host .options { padding-top: 20px; }
  `);

  createRoot(document.getElementById('options-root')!).render(
    <StrictMode>
      <Options />
    </StrictMode>,
  );

  // Framing-only tweak: the real ChatGPT-prompt editor is 16 rows tall, which
  // pushes the section past a single 1280x800 frame. Shrink it for the capture
  // so the whole Templates section lands in one shot — the editor is unchanged
  // in the shipped extension.
  setTimeout(() => {
    const prompt = document.getElementById('prompt') as HTMLTextAreaElement | null;
    if (prompt) prompt.rows = 7;
  }, 50);
} else if (scene === 'chatgpt') {
  const { buildPrompt } = await import('../src/core/prompt');
  const { DEFAULT_SETTINGS } = await import('../src/core/storage');
  const prompt = buildPrompt(context as never, DEFAULT_SETTINGS).prompt;

  shot.innerHTML = `
    <div class="frame">
      <div class="copy">
        <div class="kbd"><span>Alt</span><span>Shift</span><span>G</span></div>
        <h1>The whole review prompt,<br/>already typed in.</h1>
        <p>Ask ChatGPT builds the problem, examples, constraints and your code into
           a review request and types it into the message box &mdash; then stops.
           <b>You read it and press Enter yourself.</b></p>
      </div>
      <div class="composer">
        <div class="banner">Prompt inserted &mdash; review it, then press Enter &crarr;</div>
        <div class="box"><div id="prompt-text" class="ptext"></div></div>
        <div class="row"><span class="hint">Ready to send</span><span class="send">&uarr;</span></div>
      </div>
    </div>`;

  baseStyle(`
    .frame { width:1280px; height:800px; box-sizing:border-box; display:flex; align-items:center;
             gap:64px; padding:0 84px;
             background: radial-gradient(1200px 600px at 15% -10%, #eef7f0 0%, #f6faf7 45%, #ffffff 100%); }
    .copy { flex:1; max-width:520px; color:#18181b; }
    .copy .kbd { display:inline-flex; gap:6px; margin-bottom:28px; }
    .copy .kbd span { padding:6px 12px; border-radius:8px; background:#fff; border:1px solid #e4e4e7;
             box-shadow:0 2px 0 #e4e4e7; font-size:14px; font-weight:600; color:#0d9488; }
    .copy h1 { margin:0 0 20px; font-size:40px; line-height:1.15; letter-spacing:-0.02em; font-weight:800; }
    .copy p { margin:0; font-size:18px; line-height:1.6; color:#52525b; }
    .copy p b { color:#18181b; }
    .composer { width:560px; flex:none; border-radius:16px; overflow:hidden; background:#fff;
             border:1px solid #e4e4e7; box-shadow:0 30px 70px -20px rgba(15,60,45,.3); }
    .banner { padding:11px 18px; background:#ecfdf5; border-bottom:1px solid #d1fae5;
             color:#047857; font-size:13px; font-weight:600; }
    .box { height:520px; overflow:hidden; padding:18px 20px; }
    .ptext { font:13px/1.7 ui-monospace,'Cascadia Code',Consolas,monospace; color:#27272a;
             white-space:pre-wrap; word-break:break-word; }
    .row { display:flex; align-items:center; justify-content:space-between; padding:12px 18px;
             border-top:1px solid #f0f0f2; }
    .row .hint { color:#a1a1aa; font-size:13px; }
    .row .send { width:32px; height:32px; border-radius:9px; background:#0d9488; color:#fff;
             display:flex; align-items:center; justify-content:center; font-size:17px; font-weight:700; }
  `);

  document.getElementById('prompt-text')!.textContent = prompt;
} else if (scene === 'promo-small' || scene === 'promo-marquee') {
  const marquee = scene === 'promo-marquee';
  const iconUrl = (await import('../public/icons/icon128.png')).default;
  const W = marquee ? 1400 : 440;
  const H = marquee ? 560 : 280;

  if (marquee) {
    shot.innerHTML = `
      <div class="promo m">
        <div class="left">
          <div class="brand"><img src="${iconUrl}" alt=""/><span>DSA Helper</span></div>
          <h1>From the problem you're on to an<br/>answer &mdash; in one keystroke.</h1>
          <p>YouTube search or a ready-to-send ChatGPT review, on LeetCode,
             Codeforces, CodeChef and GeeksforGeeks.</p>
          <div class="kbd"><span>Alt</span><span>Shift</span><span>Y</span>
            <em>or</em><span>Alt</span><span>Shift</span><span>G</span></div>
        </div>
      </div>`;
  } else {
    shot.innerHTML = `
      <div class="promo s">
        <div class="brand"><img src="${iconUrl}" alt=""/></div>
        <h1>DSA Helper</h1>
        <p>Problem page &rarr; YouTube or ChatGPT,<br/>in one keystroke.</p>
        <div class="kbd"><span>Alt</span><span>Shift</span><span>Y</span></div>
      </div>`;
  }

  const style = document.createElement('style');
  style.textContent = `
    html, body { margin:0; padding:0; }
    body { width:${W}px !important; height:${H}px; overflow:hidden;
           font: 14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif; }
    .promo { width:${W}px; height:${H}px; box-sizing:border-box; color:#fff;
             background: radial-gradient(900px 500px at 12% -20%, #6366f1 0%, #4f46e5 42%, #4338ca 100%); }
    .promo .kbd { display:inline-flex; align-items:center; gap:6px; }
    .promo .kbd span { padding:5px 11px; border-radius:8px; background:rgba(255,255,255,.16);
             border:1px solid rgba(255,255,255,.28); font-weight:600; font-size:13px; color:#fff; }
    .promo .kbd em { font-style:normal; opacity:.75; margin:0 4px; font-size:13px; }
    .promo .brand img { display:block; }

    /* small 440x280 */
    .promo.s { display:flex; flex-direction:column; align-items:center; justify-content:center;
             text-align:center; padding:26px; }
    .promo.s .brand img { width:60px; height:60px; border-radius:14px;
             box-shadow:0 8px 24px -6px rgba(0,0,0,.4); margin-bottom:16px; }
    .promo.s h1 { margin:0 0 10px; font-size:30px; font-weight:800; letter-spacing:-0.02em; }
    .promo.s p { margin:0 0 18px; font-size:14px; line-height:1.5; color:#e0e7ff; }

    /* marquee 1400x560 */
    .promo.m { display:flex; align-items:center; padding:0 96px; }
    .promo.m .left { max-width:900px; }
    .promo.m .brand { display:flex; align-items:center; gap:16px; margin-bottom:26px; }
    .promo.m .brand img { width:56px; height:56px; border-radius:13px;
             box-shadow:0 8px 24px -6px rgba(0,0,0,.4); }
    .promo.m .brand span { font-size:26px; font-weight:700; letter-spacing:-0.01em; }
    .promo.m h1 { margin:0 0 20px; font-size:56px; line-height:1.1; font-weight:800;
             letter-spacing:-0.025em; }
    .promo.m p { margin:0 0 30px; font-size:21px; line-height:1.55; color:#dbe0ff; max-width:760px; }
  `;
  document.head.appendChild(style);
} else if (scene === 'menu') {
  // The native Chrome right-click menu can't be rendered here, and we must not
  // impersonate a real site — so this is a GENERIC problem page (invented
  // problem, no real branding) with a faithful mock of the context menu. The
  // three submenu items are the extension's actual menu titles
  // (src/background/contextMenus.ts).
  shot.innerHTML = `
    <div class="win">
      <div class="bar">
        <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
        <span class="url">codeforces.com/problemset/problem/…</span>
      </div>
      <div class="page">
        <div class="statement">
          <div class="tag">Div. 2 · D</div>
          <h2>Distinct Split Sums</h2>
          <p>You are given an array <i>a</i> of <i>n</i> positive integers. Split it into two
             contiguous parts so that the number of distinct values in the left part plus the
             number of distinct values in the right part is as large as possible.</p>
          <div class="ph" style="width:92%"></div>
          <div class="ph" style="width:80%"></div>
          <div class="ph" style="width:88%"></div>
          <div class="io">
            <div class="io-h">Input</div>
            <div class="ph mono" style="width:40%"></div>
            <div class="ph mono" style="width:60%"></div>
            <div class="io-h">Output</div>
            <div class="ph mono" style="width:24%"></div>
          </div>
        </div>
        <div class="editor">
          <div class="ed-tabs"><span class="ed-tab">solution.cpp</span><span class="ed-lang">GNU G++17</span></div>
          <pre class="code"><span class="ln">1</span><span class="kw">#include</span> &lt;bits/stdc++.h&gt;
<span class="ln">2</span><span class="kw">using</span> <span class="kw">namespace</span> std;
<span class="ln">3</span>
<span class="ln">4</span><span class="kw">int</span> main() {
<span class="ln">5</span>    <span class="kw">int</span> n; cin &gt;&gt; n;
<span class="ln">6</span>    vector&lt;<span class="kw">int</span>&gt; a(n);
<span class="ln">7</span>    <span class="kw">for</span> (<span class="kw">auto</span>&amp; x : a) cin &gt;&gt; x;
<span class="ln">8</span>    <span class="cm">// prefix / suffix distinct counts…</span>
<span class="ln">9</span>}</pre>
        </div>
      </div>

      <!-- mock Chrome context menu -->
      <div class="ctx" style="left:452px; top:300px;">
        <div class="ci muted">Back</div>
        <div class="ci muted">Reload</div>
        <div class="sep"></div>
        <div class="ci muted">Save as…</div>
        <div class="ci muted">Print…</div>
        <div class="sep"></div>
        <div class="ci parent">DSA Helper<span class="caret">▸</span></div>
        <div class="sep"></div>
        <div class="ci muted">Inspect</div>
      </div>
      <div class="ctx sub" style="left:668px; top:390px;">
        <div class="ci hot">Search YouTube for this problem</div>
        <div class="ci">Ask ChatGPT to review my solution</div>
        <div class="ci">Copy the review prompt</div>
      </div>
    </div>`;

  baseStyle(`
    .win { width:1280px; height:800px; box-sizing:border-box; overflow:hidden; position:relative;
           background:#fff; }
    .win .bar { display:flex; align-items:center; gap:8px; height:44px; padding:0 18px;
           background:#f3f3f5; border-bottom:1px solid #e4e4e7; }
    .win .dot { width:12px; height:12px; border-radius:50%; }
    .win .dot.r{background:#ff5f57;} .win .dot.y{background:#febc2e;} .win .dot.g{background:#28c840;}
    .win .url { margin-left:14px; padding:5px 16px; border-radius:8px; background:#fff;
           border:1px solid #e4e4e7; color:#52525b; font-size:13px; }
    .page { display:flex; gap:0; height:756px; }
    .statement { flex:1; padding:40px 44px; color:#1f2937; }
    .statement .tag { display:inline-block; padding:3px 10px; border-radius:6px; background:#eef2ff;
           color:#4f46e5; font-size:12px; font-weight:700; margin-bottom:14px; }
    .statement h2 { margin:0 0 16px; font-size:26px; letter-spacing:-0.01em; }
    .statement p { margin:0 0 18px; font-size:15px; line-height:1.7; color:#374151; max-width:520px; }
    .statement .ph { height:11px; border-radius:6px; background:#eceef2; margin:9px 0; }
    .statement .ph.mono { background:#e7eefb; }
    .statement .io { margin-top:26px; max-width:420px; }
    .statement .io-h { font-size:12px; font-weight:700; color:#6b7280; text-transform:uppercase;
           letter-spacing:.05em; margin:16px 0 8px; }
    .editor { width:520px; flex:none; background:#0f172a; color:#e2e8f0; }
    .ed-tabs { display:flex; align-items:center; justify-content:space-between; height:40px;
           padding:0 16px; background:#111827; border-bottom:1px solid #1f2937; }
    .ed-tab { font-size:13px; color:#cbd5e1; }
    .ed-lang { font-size:12px; color:#64748b; }
    .code { margin:0; padding:18px 16px; font:13px/1.85 'Cascadia Code',Consolas,monospace;
           white-space:pre; }
    .code .ln { display:inline-block; width:26px; color:#475569; user-select:none; }
    .code .kw { color:#93c5fd; } .code .cm { color:#64748b; font-style:italic; }

    /* mock context menus */
    .ctx { position:absolute; background:#ffffff; border:1px solid #e2e2e6; border-radius:10px;
           box-shadow:0 12px 34px -8px rgba(15,23,42,.35); padding:6px; min-width:210px;
           font-size:13px; color:#1f2937; z-index:10; }
    .ctx.sub { min-width:262px; }
    .ci { padding:7px 12px; border-radius:6px; display:flex; align-items:center; justify-content:space-between; }
    .ci.muted { color:#9aa1ac; }
    .ci.parent { font-weight:600; color:#111827; background:#f3f4f6; }
    .ci .caret { color:#6b7280; }
    .ci.hot { background:#4f46e5; color:#fff; }
    .sep { height:1px; background:#eceef1; margin:5px 8px; }
  `);
}
