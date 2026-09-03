/**
 * @vitest-environment jsdom
 *
 * These tests come first by design. The LaTeX and figure rules (D026) are the
 * decisions most likely to be undone by accident during a refactor, so they
 * are pinned here before the implementation exists.
 */
import { describe, expect, it } from 'vitest';
import { html2md } from './html2md';

/** Parse a fragment and hand back its container element. */
function el(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

const md = (html: string): string => html2md(el(html));

describe('D026 — LaTeX passes through verbatim', () => {
  it('leaves inline dollar-delimited maths untouched', () => {
    expect(md('<p>Given $n \\le 10^5$ and $a_i \\ge 0$.</p>')).toBe(
      'Given $n \\le 10^5$ and $a_i \\ge 0$.',
    );
  });

  it('leaves Codeforces triple-dollar maths untouched', () => {
    expect(md('<p>It is guaranteed that $$$1 \\le k \\le n$$$.</p>')).toBe(
      'It is guaranteed that $$$1 \\le k \\le n$$$.',
    );
  });

  it('does not escape underscores or asterisks that belong to TeX', () => {
    const out = md('<p>$a_1 \\cdot a_2 \\cdot \\ldots \\cdot a_n$</p>');
    expect(out).toBe('$a_1 \\cdot a_2 \\cdot \\ldots \\cdot a_n$');
    expect(out).not.toContain('\\_');
  });

  it('recovers the TeX source from a rendered KaTeX span, not the glyphs', () => {
    const out = md(`
      <p>Let <span class="katex">
        <span class="katex-mathml"><math><semantics>
          <annotation encoding="application/x-tex">n \\bmod 2 = 0</annotation>
        </semantics></math></span>
        <span class="katex-html" aria-hidden="true"><span>n</span><span>mod</span><span>2</span></span>
      </span> hold.</p>`);
    expect(out).toBe('Let $n \\bmod 2 = 0$ hold.');
    expect(out).not.toContain('mod2');
  });

  it('renders display KaTeX as a display block', () => {
    const out = md(`
      <span class="katex-display"><span class="katex">
        <span class="katex-mathml"><math><semantics>
          <annotation encoding="application/x-tex">\\sum_{i=1}^{n} a_i</annotation>
        </semantics></math></span>
      </span></span>`);
    expect(out).toBe('$$\\sum_{i=1}^{n} a_i$$');
  });

  it('recovers the TeX source from a MathJax v2 script tag', () => {
    const out = md(
      '<p>Bound: <span class="MathJax_Preview">[math]</span>' +
        '<script type="math/tex">10^{18}</script>.</p>',
    );
    expect(out).toBe('Bound: $10^{18}$.');
    expect(out).not.toContain('[math]');
  });

  it('recovers the TeX source from a MathJax v3 container', () => {
    const out = md(`
      <p>Then <mjx-container class="MathJax">
        <mjx-math aria-hidden="true"><mjx-mi>x</mjx-mi></mjx-math>
        <mjx-assistive-mml><math><semantics>
          <annotation encoding="application/x-tex">x^2 + y^2</annotation>
        </semantics></math></mjx-assistive-mml>
      </mjx-container> follows.</p>`);
    expect(out).toBe('Then $x^2 + y^2$ follows.');
  });
});

describe('D026 — exponents and indices survive the conversion', () => {
  it('renders a superscript as an exponent rather than dropping it', () => {
    // The failure this pins down: `5 * 104` is not a rounder version of
    // `5 * 10^4`, it is a different constraint by a factor of 500.
    expect(md('<p>1 &lt;= n &lt;= 5 * 10<sup>4</sup></p>')).toBe('1 <= n <= 5 * 10^4');
  });

  it('renders a subscript as an index', () => {
    expect(md('<p>a<sub>1</sub> + a<sub>2</sub></p>')).toBe('a_1 + a_2');
  });

  it('braces anything longer than a single character', () => {
    expect(md('<p>2<sup>31</sup> - 1</p>')).toBe('2^{31} - 1');
    expect(md('<p>x<sub>i+1</sub></p>')).toBe('x_{i+1}');
  });

  it('survives inside inline code, which is where the bounds actually live', () => {
    // The shape LeetCode ships every constraint in.
    expect(md('<li><code>1 &lt;= n &lt;= 5 * 10<sup>4</sup></code></li>')).toBe(
      '- `1 <= n <= 5 * 10^4`',
    );
  });

  it('leaves an empty one out entirely', () => {
    expect(md('<p>n<sup></sup></p>')).toBe('n');
  });
});

describe('non-breaking spaces', () => {
  it('treats a non-breaking space as a space', () => {
    expect(md('<p>a&nbsp;b</p>')).toBe('a b');
  });

  it('does not leave a stray space before a standalone image', () => {
    // How every Codeforces figure arrives: an <img> on its own source line,
    // preceded by the newline and indentation between two block elements.
    const out = md('<div><p>Before.</p>\n        <img alt="A diagram">\n</div>');
    expect(out).toContain('\n[Figure: A diagram');
    expect(out).not.toContain('\n [Figure:');
  });

  it('leaves no whitespace-only lines between blocks', () => {
    // The newlines and indentation between two block elements become a text
    // node, and a line holding just that reads as blank but is not — it
    // survives blank-line collapsing and litters the prompt.
    const out = md('<p>First.</p>\n\n  <pre>code</pre>\n\n  <p>Second.</p>');
    expect(out.split('\n').every((line) => line === '' || line.trim() !== '')).toBe(true);
    expect(out).not.toMatch(/\n \n/);
  });

  it('drops the spacer paragraphs sites use for layout', () => {
    // LeetCode separates every statement section with <p>&nbsp;</p>.
    expect(md('<p>First.</p><p>&nbsp;</p><p>Second.</p>')).toBe('First.\n\nSecond.');
  });
});

describe('D026 — figures are named, never dropped', () => {
  it('replaces an image with a labelled placeholder carrying its alt text', () => {
    expect(md('<p><img src="https://x/y.png" alt="a binary tree"></p>')).toBe(
      '[Figure: a binary tree — not included]',
    );
  });

  it('still emits a placeholder when there is no alt text', () => {
    expect(md('<p><img src="https://x/y.png"></p>')).toBe('[Figure — not included]');
  });

  it('never embeds the image URL', () => {
    expect(md('<img src="https://example.com/tree.png" alt="tree">')).not.toContain(
      'example.com',
    );
  });

  it('prefers a figcaption over alt text', () => {
    const out = md(
      '<figure><img src="x.png" alt="alt text"><figcaption>Sample grid</figcaption></figure>',
    );
    expect(out).toBe('[Figure: Sample grid — not included]');
  });

  it('names an inline svg diagram', () => {
    expect(md('<p>See <svg viewBox="0 0 10 10"><circle r="5"/></svg></p>')).toBe(
      'See [Figure — not included]',
    );
  });

  it('does not drop a figure just because it is aria-hidden', () => {
    expect(md('<div aria-hidden="true"><img src="x.png" alt="grid"></div>')).toBe(
      '[Figure: grid — not included]',
    );
  });
});

describe('architecture §9.2 — extracted content cannot close our fence', () => {
  it('escapes a backtick fence appearing in statement prose', () => {
    const out = md('<p>Then write ``` and continue.</p>');
    expect(out).not.toMatch(/(^|[^\\])```/);
    expect(out).toContain('\\`\\`\\`');
  });

  it('escapes a tilde fence appearing in statement prose', () => {
    expect(md('<p>Delimit with ~~~ here.</p>')).not.toMatch(/(^|[^\\])~~~/);
  });

  it('leaves one or two backticks alone', () => {
    expect(md('<p>Use `x` twice.</p>')).toBe('Use `x` twice.');
  });

  it('lengthens its own fence when the code block contains backticks', () => {
    const out = md('<pre><code>console.log("```")</code></pre>');
    expect(out).toBe('````\nconsole.log("```")\n````');
  });
});

describe('block structure', () => {
  it('converts headings', () => {
    expect(md('<h2>Constraints</h2>')).toBe('## Constraints');
    expect(md('<h4>Note</h4>')).toBe('#### Note');
  });

  it('separates paragraphs with a blank line', () => {
    expect(md('<p>One.</p><p>Two.</p>')).toBe('One.\n\nTwo.');
  });

  it('converts emphasis', () => {
    expect(md('<p><strong>bold</strong> and <em>italic</em></p>')).toBe(
      '**bold** and *italic*',
    );
  });

  it('converts unordered lists', () => {
    expect(md('<ul><li>alpha</li><li>beta</li></ul>')).toBe('- alpha\n- beta');
  });

  it('converts ordered lists and honours a start attribute', () => {
    expect(md('<ol start="3"><li>third</li><li>fourth</li></ol>')).toBe(
      '3. third\n4. fourth',
    );
  });

  it('indents nested lists', () => {
    expect(md('<ul><li>outer<ul><li>inner</li></ul></li></ul>')).toBe(
      '- outer\n  - inner',
    );
  });

  it('converts a fenced code block with its language', () => {
    expect(md('<pre><code class="language-python">x = 1\ny = 2</code></pre>')).toBe(
      '```python\nx = 1\ny = 2\n```',
    );
  });

  it('preserves whitespace inside pre', () => {
    expect(md('<pre>  indented\n    more</pre>')).toBe('```\n  indented\n    more\n```');
  });

  it('converts inline code', () => {
    expect(md('<p>Call <code>solve()</code> once.</p>')).toBe('Call `solve()` once.');
  });

  it('converts a table', () => {
    const out = md(
      '<table><thead><tr><th>Input</th><th>Output</th></tr></thead>' +
        '<tbody><tr><td>1</td><td>one</td></tr></tbody></table>',
    );
    expect(out).toBe('| Input | Output |\n| --- | --- |\n| 1 | one |');
  });

  it('escapes pipes inside table cells', () => {
    const out = md('<table><tr><th>a</th></tr><tr><td>x|y</td></tr></table>');
    expect(out).toContain('x\\|y');
  });

  it('converts a blockquote', () => {
    expect(md('<blockquote><p>quoted</p></blockquote>')).toBe('> quoted');
  });

  it('renders links with their target', () => {
    expect(md('<p>See <a href="https://x.test/a">docs</a>.</p>')).toBe(
      'See [docs](https://x.test/a).',
    );
  });

  it('drops the href for javascript and relative links, keeping the text', () => {
    expect(md('<p><a href="javascript:void(0)">click</a></p>')).toBe('click');
  });

  it('turns br into a line break', () => {
    expect(md('<p>one<br>two</p>')).toBe('one\ntwo');
  });

  it('drops script and style content', () => {
    expect(
      md('<div><style>p{color:red}</style><p>text</p><script>x=1</script></div>'),
    ).toBe('text');
  });

  it('collapses HTML whitespace in prose', () => {
    expect(md('<p>a   b\n\n   c</p>')).toBe('a b c');
  });

  it('returns an empty string for empty or missing input', () => {
    expect(md('')).toBe('');
    expect(html2md(null)).toBe('');
  });

  it('collapses runs of blank lines left by wrapper divs', () => {
    expect(md('<div><div><p>a</p></div><div></div><div><p>b</p></div></div>')).toBe(
      'a\n\nb',
    );
  });
});
