/**
 * @vitest-environment jsdom
 *
 * The isolated half of the MAIN-world bridge (D020).
 *
 * The bridge lives on the far side of a trust boundary, so what is being
 * tested here is mostly refusal: a reply with the wrong nonce, the wrong
 * origin, the wrong source window or an implausible size must not become the
 * user's code. Silence must not hang the action either -- it falls through to
 * the next capture layer.
 */

import { describe, expect, it } from 'vitest';
import { readEditorViaBridge } from './bridgeClient';
import { MAX_CODE_CHARS, REQUEST_KIND, RESPONSE_KIND } from '../mainworld/protocol';

const ORIGIN = 'https://leetcode.com';

interface FakeWindow {
  target: Window;
  posted: unknown[];
  listenerCount: () => number;
  deliver: (data: unknown, overrides?: { origin?: string; source?: unknown }) => void;
}

function fakeWindow(): FakeWindow {
  const listeners = new Set<(event: MessageEvent) => void>();
  const posted: unknown[] = [];

  const target = {
    location: { origin: ORIGIN },
    addEventListener: (_type: string, fn: (event: MessageEvent) => void) => {
      listeners.add(fn);
    },
    removeEventListener: (_type: string, fn: (event: MessageEvent) => void) => {
      listeners.delete(fn);
    },
    postMessage: (data: unknown) => {
      posted.push(data);
    },
  };

  return {
    target: target as unknown as Window,
    posted,
    listenerCount: () => listeners.size,
    deliver: (data, overrides = {}) => {
      const event = {
        data,
        source: 'source' in overrides ? overrides.source : target,
        origin: overrides.origin ?? ORIGIN,
      } as unknown as MessageEvent;
      for (const fn of [...listeners]) fn(event);
    },
  };
}

function requestFrom(posted: unknown[]): { nonce: string; id: string } {
  const request = posted[0] as { kind: string; nonce: string; id: string };
  expect(request.kind).toBe(REQUEST_KIND);
  return { nonce: request.nonce, id: request.id };
}

function reply(nonce: string, id: string, extra: Record<string, unknown> = {}): unknown {
  return {
    kind: RESPONSE_KIND,
    nonce,
    id,
    code: 'class Solution {}',
    language: 'cpp',
    editor: 'monaco',
    truncated: false,
    ...extra,
  };
}

describe('readEditorViaBridge', () => {
  it('posts a nonce-tagged request and resolves with the matching reply', async () => {
    const win = fakeWindow();
    const pending = readEditorViaBridge({ target: win.target, timeoutMs: 200 });

    const { nonce, id } = requestFrom(win.posted);
    win.deliver(reply(nonce, id));

    await expect(pending).resolves.toEqual({
      code: 'class Solution {}',
      language: 'cpp',
      editor: 'monaco',
      truncated: false,
    });
  });

  it('removes its listener once settled', async () => {
    const win = fakeWindow();
    const pending = readEditorViaBridge({ target: win.target, timeoutMs: 200 });
    expect(win.listenerCount()).toBe(1);

    const { nonce, id } = requestFrom(win.posted);
    win.deliver(reply(nonce, id));
    await pending;

    expect(win.listenerCount()).toBe(0);
  });

  it('ignores a reply carrying the wrong nonce', async () => {
    const win = fakeWindow();
    const pending = readEditorViaBridge({ target: win.target, timeoutMs: 30 });

    const { id } = requestFrom(win.posted);
    win.deliver(reply('a-nonce-we-never-issued', id));

    await expect(pending).resolves.toBeNull();
  });

  it('ignores a reply from another origin', async () => {
    const win = fakeWindow();
    const pending = readEditorViaBridge({ target: win.target, timeoutMs: 30 });

    const { nonce, id } = requestFrom(win.posted);
    win.deliver(reply(nonce, id), { origin: 'https://evil.example' });

    await expect(pending).resolves.toBeNull();
  });

  it('ignores a reply that did not come from this window', async () => {
    const win = fakeWindow();
    const pending = readEditorViaBridge({ target: win.target, timeoutMs: 30 });

    const { nonce, id } = requestFrom(win.posted);
    win.deliver(reply(nonce, id), { source: { not: 'our window' } });

    await expect(pending).resolves.toBeNull();
  });

  it('ignores traffic that is not a bridge reply at all', async () => {
    const win = fakeWindow();
    const pending = readEditorViaBridge({ target: win.target, timeoutMs: 30 });

    win.deliver('a string');
    win.deliver(null);
    win.deliver({ kind: 'some-other-extension' });

    await expect(pending).resolves.toBeNull();
  });

  it('caps an implausibly large buffer and says so', async () => {
    const win = fakeWindow();
    const pending = readEditorViaBridge({ target: win.target, timeoutMs: 200 });

    const { nonce, id } = requestFrom(win.posted);
    win.deliver(reply(nonce, id, { code: 'x'.repeat(MAX_CODE_CHARS + 500) }));

    const result = await pending;
    expect(result?.code).toHaveLength(MAX_CODE_CHARS);
    expect(result?.truncated).toBe(true);
  });

  it('rejects a non-string code field rather than passing it on', async () => {
    const win = fakeWindow();
    const pending = readEditorViaBridge({ target: win.target, timeoutMs: 200 });

    const { nonce, id } = requestFrom(win.posted);
    win.deliver(reply(nonce, id, { code: { toString: 'not a string' }, language: 42 }));

    await expect(pending).resolves.toEqual({
      code: null,
      language: null,
      editor: 'monaco',
      truncated: false,
    });
  });

  it('resolves null on silence instead of hanging the action', async () => {
    const win = fakeWindow();
    await expect(
      readEditorViaBridge({ target: win.target, timeoutMs: 20 }),
    ).resolves.toBeNull();
  });

  it('gives each request its own id, so a stale reply cannot answer a new question', async () => {
    const win = fakeWindow();
    const first = readEditorViaBridge({ target: win.target, timeoutMs: 30 });
    const firstRequest = requestFrom(win.posted);
    win.deliver(reply(firstRequest.nonce, firstRequest.id));
    await first;

    const second = readEditorViaBridge({ target: win.target, timeoutMs: 30 });
    const secondRequest = win.posted[1] as { id: string };
    expect(secondRequest.id).not.toBe(firstRequest.id);

    // The first request's reply, arriving late, must not answer the second.
    win.deliver(reply(firstRequest.nonce, firstRequest.id));
    await expect(second).resolves.toBeNull();
  });
});
