/**
 * HTML -> markdown, for problem statements.
 *
 * Two rules that are not negotiable (D026):
 *   - LaTeX passes through verbatim. Where a page ships rendered maths
 *     (KaTeX, MathJax) the original TeX is recovered from the source
 *     annotation rather than scraped off the glyphs.
 *   - Figures become [Figure: <alt> — not included], never dropped silently.
 *
 * And one security rule (architecture.md §9.2): markdown fences inside
 * extracted content are escaped so a statement cannot close our code block
 * and inject sibling instructions into the prompt.
 *
 * Takes a DOM element rather than an HTML string: every caller is an adapter
 * that already has one, and re-parsing a serialized subtree would be both
 * wasted work and a second chance to get the parse wrong. Nothing here
 * imports `document` or `chrome.*`; `Element` is an ambient DOM type.
 */

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;

/** Placeholder emitted for any figure we cannot carry into a text prompt. */
export function figurePlaceholder(label: string | null): string {
  const trimmed = label?.trim();
  return trimmed ? `[Figure: ${trimmed} — not included]` : '[Figure — not included]';
}

/** Tags whose content is invisible or meaningless once flattened to text. */
const DROPPED = new Set(['STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'BUTTON', 'SELECT']);

/** Non-semantic containers: recurse, but force a block break around them. */
const BLOCK_CONTAINERS = new Set([
  'DIV',
  'SECTION',
  'ARTICLE',
  'MAIN',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'NAV',
  'FORM',
  'DL',
  'DT',
  'DD',
  'ADDRESS',
  'FIELDSET',
]);

interface Ctx {
  /** Verbatim chunks (code fences, maths) held out of whitespace normalization. */
  readonly protected: string[];
}

const SENTINEL = '\u0000';

/** Park a chunk that must survive normalization byte-for-byte. */
function protect(ctx: Ctx, value: string): string {
  ctx.protected.push(value);
  return `${SENTINEL}${ctx.protected.length - 1}${SENTINEL}`;
}

function isElement(node: Node): node is Element {
  return node.nodeType === NODE_ELEMENT;
}

function isText(node: Node): boolean {
  return node.nodeType === NODE_TEXT;
}

/** Wrap in block separators; normalization squeezes the surplus later. */
function block(md: string): string {
  return md.trim() ? `\n\n${md}\n\n` : '';
}

/**
 * Escape only what could close a fence. Deliberately *not* a general markdown
 * escaper: `_`, `*`, `^` and `\` are load-bearing in LaTeX, and escaping them
 * would violate D026.
 */
function escapeText(text: string): string {
  return text.replace(/`{3,}|~{3,}/g, (run) =>
    run
      .split('')
      .map((ch) => `\\${ch}`)
      .join(''),
  );
}

function collapseWs(text: string): string {
  // A non-breaking space is a space here. Sites use `&nbsp;` for layout --
  // LeetCode spaces its statements with `<p>&nbsp;</p>` -- and keeping it as
  // its own character litters the prompt with lines that look blank but are
  // not. Code and maths are protected before this runs, so their spacing is
  // untouched.
  return text.replace(/\u00a0/g, ' ').replace(/[\t\r\n ]+/g, ' ');
}

function longestRun(text: string, ch: string): number {
  let longest = 0;
  let current = 0;
  for (const c of text) {
    current = c === ch ? current + 1 : 0;
    if (current > longest) longest = current;
  }
  return longest;
}

// --- maths -----------------------------------------------------------------

/** Pull the TeX source a renderer stashed alongside its rendered output. */
function texSource(el: Element): string | null {
  const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
  if (annotation?.textContent?.trim()) return annotation.textContent.trim();

  const script = el.querySelector('script[type^="math/tex"]');
  if (script?.textContent?.trim()) return script.textContent.trim();

  for (const attr of ['data-original', 'alttext', 'data-tex']) {
    const value = el.getAttribute(attr)?.trim();
    if (value) return value;
  }
  return null;
}

function classList(el: Element): string {
  // `className` is an SVGAnimatedString on SVG elements, so read the attribute.
  return el.getAttribute('class') ?? '';
}

function isMathContainer(el: Element): boolean {
  const cls = classList(el);
  const tag = el.tagName.toUpperCase();
  return (
    tag === 'MJX-CONTAINER' ||
    tag === 'MATH' ||
    /\bkatex\b/.test(cls) ||
    /\bkatex-display\b/.test(cls) ||
    /\bMathJax(_Display)?\b/.test(cls)
  );
}

function isDisplayMath(el: Element): boolean {
  return (
    /\bkatex-display\b/.test(classList(el)) ||
    /\bMathJax_Display\b/.test(classList(el)) ||
    el.getAttribute('display') === 'block' ||
    el.getAttribute('mode') === 'display' ||
    el.querySelector('script[type="math/tex; mode=display"]') !== null
  );
}

function renderMath(el: Element, ctx: Ctx): string {
  const tex = texSource(el);
  if (tex === null) {
    // No source available; fall back to the accessible text rather than the
    // glyph soup in the visual layer.
    const assistive = el.querySelector('mjx-assistive-mml, .katex-mathml');
    const fallback = (assistive ?? el).textContent ?? '';
    return collapseWs(fallback).trim();
  }
  return protect(ctx, isDisplayMath(el) ? `$$${tex}$$` : `$${tex}$`);
}

// --- structured blocks -----------------------------------------------------

function detectLang(el: Element): string {
  const source = `${classList(el)} ${el.getAttribute('data-language') ?? ''}`;
  const match = source.match(/(?:language|lang|highlight)[-–]([a-z0-9+#]+)/i);
  return match?.[1]?.toLowerCase() ?? '';
}

function renderPre(el: Element, ctx: Ctx): string {
  const codeEl = el.querySelector('code');
  const text = ((codeEl ?? el).textContent ?? '').replace(/\n+$/, '');
  if (!text.trim()) return '';
  const lang = detectLang(codeEl ?? el);
  // A fence must be longer than any backtick run it contains, or the block
  // ends early and the rest of the statement escapes into the prompt.
  const fence = '`'.repeat(Math.max(3, longestRun(text, '`') + 1));
  return protect(ctx, `${fence}${lang}\n${text}\n${fence}`);
}

/**
 * Plain text, except that a nested `<sup>`/`<sub>` keeps its meaning.
 *
 * Inline code is where LeetCode puts its bounds -- `1 <= n <= 5 * 10<sup>4</sup>`
 * -- so reading it as textContent would silently rewrite the constraint (D026).
 */
function inlineText(el: Element): string {
  let out = '';
  for (const child of Array.from(el.childNodes)) {
    if (isText(child)) {
      out += child.nodeValue ?? '';
      continue;
    }
    if (!isElement(child)) continue;
    const tag = child.tagName.toUpperCase();
    if (tag === 'SUP' || tag === 'SUB') {
      const inner = inlineText(child).trim();
      if (!inner) continue;
      const marker = tag === 'SUP' ? '^' : '_';
      out += /^[A-Za-z0-9]$/.test(inner) ? `${marker}${inner}` : `${marker}{${inner}}`;
      continue;
    }
    out += inlineText(child);
  }
  return out;
}

function renderInlineCode(el: Element, ctx: Ctx): string {
  const text = collapseWs(inlineText(el));
  if (!text.trim()) return '';
  const ticks = '`'.repeat(longestRun(text, '`') + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return protect(ctx, `${ticks}${pad}${text}${pad}${ticks}`);
}

function childElements(el: Element, tags: string[]): Element[] {
  return Array.from(el.children).filter((c) => tags.includes(c.tagName.toUpperCase()));
}

function renderList(el: Element, ctx: Ctx): string {
  const ordered = el.tagName.toUpperCase() === 'OL';
  const start = Number.parseInt(el.getAttribute('start') ?? '1', 10) || 1;
  const items = childElements(el, ['LI']);

  return items
    .map((li, i) => {
      const marker = ordered ? `${start + i}.` : '-';
      const body = normalize(convertChildren(li, ctx), ctx, { restore: false })
        .trim()
        // A nested list continues its parent item; a blank line before it
        // would render the whole list loose.
        .replace(/\n{2,}(?=(?:[-*]|\d+\.) )/g, '\n');
      const indent = ' '.repeat(marker.length + 1);
      const [first = '', ...rest] = body.split('\n');
      const tail = rest.map((line) => (line ? indent + line : line));
      return [`${marker} ${first}`, ...tail].join('\n');
    })
    .filter((line) => line.trim() !== '-')
    .join('\n');
}

function renderTable(el: Element, ctx: Ctx): string {
  const sections = childElements(el, ['THEAD', 'TBODY', 'TFOOT']);
  const rows: Element[] = sections.length
    ? sections.flatMap((s) => childElements(s, ['TR']))
    : childElements(el, ['TR']);
  if (rows.length === 0) return '';

  const cellsOf = (row: Element): string[] =>
    childElements(row, ['TH', 'TD']).map((cell) =>
      convertChildren(cell, ctx).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim(),
    );

  const [headRow, ...restRows] = rows;
  const header = cellsOf(headRow as Element);
  const width = Math.max(header.length, ...restRows.map((r) => cellsOf(r).length), 1);
  const pad = (cells: string[]): string[] =>
    Array.from({ length: width }, (_, i) => cells[i] ?? '');

  const lines = [
    `| ${pad(header).join(' | ')} |`,
    `| ${pad([]).map(() => '---').join(' | ')} |`,
    ...restRows.map((row) => `| ${pad(cellsOf(row)).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function renderFigure(el: Element): string {
  const caption = el.querySelector('figcaption')?.textContent ?? null;
  const alt = el.querySelector('img')?.getAttribute('alt') ?? null;
  return figurePlaceholder(caption ?? alt);
}

function renderLink(el: Element, ctx: Ctx): string {
  const text = convertChildren(el, ctx).trim();
  const href = el.getAttribute('href') ?? '';
  // Relative and javascript: hrefs are useless once the text leaves the page.
  if (!text || !/^https?:\/\//i.test(href)) return text;
  return `[${text}](${href})`;
}

// --- the walker ------------------------------------------------------------

function convertChildren(el: Element, ctx: Ctx): string {
  let out = '';
  for (const child of Array.from(el.childNodes)) out += convertNode(child, ctx);
  return out;
}

function convertNode(node: Node, ctx: Ctx): string {
  if (isText(node)) return escapeText(collapseWs(node.nodeValue ?? ''));
  if (!isElement(node)) return '';

  const el = node;
  const tag = el.tagName.toUpperCase();

  // Figures first: D026 says they are never dropped, so no later guard --
  // aria-hidden included -- gets the chance to discard one.
  if (tag === 'IMG') return figurePlaceholder(el.getAttribute('alt'));
  if (tag === 'SVG') return figurePlaceholder(el.getAttribute('aria-label'));
  if (tag === 'FIGURE') return block(renderFigure(el));

  if (tag === 'SCRIPT') {
    const type = el.getAttribute('type') ?? '';
    if (!type.startsWith('math/tex')) return '';
    const tex = (el.textContent ?? '').trim();
    if (!tex) return '';
    return protect(ctx, type.includes('mode=display') ? `$$${tex}$$` : `$${tex}$`);
  }
  if (DROPPED.has(tag)) return '';

  if (isMathContainer(el)) return renderMath(el, ctx);

  // Decorative layers -- KaTeX's glyph spans, MathJax's visual tree -- unless
  // they carry a figure, which outranks the guard.
  if (el.getAttribute('aria-hidden') === 'true' && !el.querySelector('img, svg')) {
    return '';
  }
  // MathJax v2 renders a plain-text preview beside the real maths.
  if (/\bMathJax_Preview\b/.test(classList(el))) return '';

  switch (tag) {
    case 'BR':
      return '\n';
    case 'HR':
      return block('---');
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      return block(`${'#'.repeat(Number(tag[1]))} ${convertChildren(el, ctx).trim()}`);
    case 'P':
      return block(convertChildren(el, ctx).trim());
    case 'BLOCKQUOTE': {
      const body = normalize(convertChildren(el, ctx), ctx, { restore: false }).trim();
      if (!body) return '';
      return block(
        body
          .split('\n')
          .map((line) => (line ? `> ${line}` : '>'))
          .join('\n'),
      );
    }
    case 'PRE':
      return block(renderPre(el, ctx));
    case 'CODE':
    case 'KBD':
    case 'SAMP':
      return renderInlineCode(el, ctx);
    case 'STRONG':
    case 'B': {
      const inner = convertChildren(el, ctx).trim();
      return inner ? `**${inner}**` : '';
    }
    case 'EM':
    case 'I': {
      const inner = convertChildren(el, ctx).trim();
      return inner ? `*${inner}*` : '';
    }
    case 'DEL':
    case 'S':
    case 'STRIKE': {
      const inner = convertChildren(el, ctx).trim();
      return inner ? `~~${inner}~~` : '';
    }
    // Exponents and indices: the markup is the only record of them, so
    // dropping it turns `5 * 10<sup>4</sup>` into `5 * 104` -- not a rounder
    // number but a wrong one, in the constraints, which is the part of a
    // statement a review must not get wrong (D026). Written the way TeX
    // writes them, since that is the notation the reader on the other end
    // already understands, and it sits beside real LaTeX without clashing.
    case 'SUP':
    case 'SUB': {
      const inner = convertChildren(el, ctx).trim();
      if (!inner) return '';
      const marker = tag === 'SUP' ? '^' : '_';
      return /^[A-Za-z0-9]$/.test(inner) ? `${marker}${inner}` : `${marker}{${inner}}`;
    }
    case 'UL':
    case 'OL':
      return block(renderList(el, ctx));
    case 'LI':
      // Only reached for a stray <li> outside a list.
      return block(`- ${convertChildren(el, ctx).trim()}`);
    case 'TABLE':
      return block(renderTable(el, ctx));
    case 'A':
      return renderLink(el, ctx);
    default:
      return BLOCK_CONTAINERS.has(tag)
        ? block(convertChildren(el, ctx).trim())
        : convertChildren(el, ctx);
  }
}

// --- normalization ---------------------------------------------------------

function normalize(md: string, ctx: Ctx, opts: { restore: boolean }): string {
  const squeezed = md
    .split('\n')
    .map((line) => {
      // Preserve leading indentation -- it carries list nesting.
      const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
      return indent + line.slice(indent.length).replace(/[ \t]+/g, ' ').trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!opts.restore) return squeezed;
  return squeezed.replace(
    new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g'),
    (_m, i: string) => ctx.protected[Number(i)] ?? '',
  );
}

/**
 * Convert a statement subtree to markdown. Returns `''` for a missing or
 * empty element -- callers decide whether that means "absent section" and
 * render the explicit note (spec.md §8) themselves.
 */
export function html2md(root: Element | null | undefined): string {
  if (!root) return '';
  const ctx: Ctx = { protected: [] };
  return normalize(convertChildren(root, ctx), ctx, { restore: true });
}
