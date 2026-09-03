/**
 * @vitest-environment jsdom
 *
 * The toast is the last rung of every ladder in the project (D016), and it has
 * one unusual constraint: the service worker ships it to pages with no content
 * script by handing it to `chrome.scripting.executeScript({ func })`, which
 * serialises it with `Function.prototype.toString()`.
 *
 * That means a reference to anything outside the function body — an import, a
 * module constant, a sibling helper — becomes a ReferenceError *in the page*,
 * where nobody sees it. The first test below rebuilds the function from its own
 * source, exactly as Chrome does, so that mistake fails here instead.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { toastInPage } from './toast';

/** Rebuild from source, so nothing from this module's scope is in reach. */
function serialisedToast(): (level: string, text: string) => void {
  // eslint-disable-next-line no-new-func -- this is the point of the test
  return new Function(`return (${toastInPage.toString()})`)() as (
    level: string,
    text: string,
  ) => void;
}

/** The root is closed, so it has to be captured as it is created. */
function captureShadow(): { root: () => ShadowRoot | null } {
  let captured: ShadowRoot | null = null;
  const original = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function attachShadow(init: ShadowRootInit) {
    const root = original.call(this, { ...init, mode: 'open' });
    captured = root;
    return root;
  };
  return { root: () => captured };
}

function host(): HTMLElement | null {
  return document.getElementById('dsa-helper-toast');
}

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
});

describe('survives the trip through executeScript', () => {
  it('still works when rebuilt from its own source', () => {
    const injected = serialisedToast();
    injected('info', 'hello from the worker');

    // If the function referenced anything outside itself, the ReferenceError
    // would land in its own catch and nothing would be appended.
    expect(host()).not.toBeNull();
  });

  it('references nothing but browser globals', () => {
    const source = toastInPage.toString();
    // A bundler rewrites module references to short identifiers, so the check
    // is structural: everything used must be declared inside the body.
    expect(source).toContain('dsa-helper-toast');
    expect(source).not.toMatch(/\bimport\b/);
    expect(source).not.toMatch(/\brequire\(/);
  });
});

describe('rendering', () => {
  it('puts the message in a shadow root, not in the page', () => {
    const shadow = captureShadow();
    toastInPage('info', 'Search opened');

    const root = shadow.root();
    expect(root).not.toBeNull();
    expect(root?.textContent).toContain('Search opened');
    // Nothing leaks into the page's own DOM where its CSS could reach it.
    expect(document.body.textContent).not.toContain('Search opened');
  });

  it('uses textContent, so page-controlled text cannot inject through it', () => {
    const shadow = captureShadow();
    // A problem title is page-controlled content (architecture.md section 9.2).
    toastInPage('warn', '<img src=x onerror=alert(1)> "><script>bad()</script>');

    const root = shadow.root();
    expect(root?.querySelector('img')).toBeNull();
    expect(root?.querySelector('script')).toBeNull();
    expect(root?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('replaces the previous toast rather than stacking them', () => {
    toastInPage('info', 'first');
    toastInPage('info', 'second');
    expect(document.querySelectorAll('#dsa-helper-toast')).toHaveLength(1);
  });

  it('marks an error as an alert and anything else as a status', () => {
    const first = captureShadow();
    toastInPage('error', 'broke');
    expect(first.root()?.querySelector('.toast')?.getAttribute('role')).toBe('alert');

    const second = captureShadow();
    toastInPage('info', 'fine');
    expect(second.root()?.querySelector('.toast')?.getAttribute('role')).toBe('status');
  });

  it('sits above page content and inherits none of its styling', () => {
    toastInPage('info', 'on top');
    // Read back through the browser's own normalisation, not as raw text.
    const style = host()?.style;
    expect(style?.getPropertyValue('all')).toBe('initial');
    expect(style?.getPropertyValue('position')).toBe('fixed');
    expect(style?.getPropertyValue('z-index')).toBe('2147483647');
  });

  it('does not throw when the document will not cooperate', () => {
    const original = document.documentElement.append.bind(document.documentElement);
    document.documentElement.append = () => {
      throw new Error('CSP');
    };
    expect(() => {
      toastInPage('info', 'nope');
    }).not.toThrow();
    document.documentElement.append = original;
  });
});
