/**
 * Per-tab, one-shot, session-scoped prompt handoff (D017). The prompt holds
 * the user's code, so it never touches disk.
 *
 * Keyed by the id of the ChatGPT tab we created, not stored globally: a solver
 * with several problem tabs fires the action twice in quick succession all the
 * time, and a single slot would let the second prompt overwrite the first or
 * the wrong tab claim it (architecture.md section 5.3).
 *
 * Deleted the moment it is claimed, so opening ChatGPT by hand an hour later
 * never resurrects an old prompt, and swept on a timer so an abandoned tab
 * cannot leave the user's code sitting in session memory.
 *
 * `chrome.storage.session` only. Never `local`, never `sync` (D018).
 */

/** Beyond this, a prompt is stale rather than pending. */
export const PROMPT_TTL_MS = 5 * 60 * 1000;

const KEY_PREFIX = 'pendingPrompt:';

interface PendingEntry {
  prompt: string;
  createdAt: number;
}

function keyFor(tabId: number): string {
  return `${KEY_PREFIX}${tabId}`;
}

/**
 * Read off `globalThis` at call time rather than at module load: the service
 * worker is restarted cold, and a captured reference would be to the wrong
 * global. Throwing here is right -- a missing session area is a manifest bug,
 * not a runtime condition to paper over.
 */
function sessionArea(): chrome.storage.StorageArea {
  const api = (globalThis as { chrome?: typeof chrome }).chrome;
  const area = api?.storage?.session;
  if (!area) throw new Error('chrome.storage.session is unavailable');
  return area;
}

function isEntry(value: unknown): value is PendingEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as { prompt?: unknown; createdAt?: unknown };
  return typeof entry.prompt === 'string' && typeof entry.createdAt === 'number';
}

export async function putPendingPrompt(
  tabId: number,
  prompt: string,
  now = Date.now(),
): Promise<void> {
  const entry: PendingEntry = { prompt, createdAt: now };
  await sessionArea().set({ [keyFor(tabId)]: entry });
}

/**
 * Hand over the prompt for a tab and delete it in the same breath.
 *
 * The delete happens whether or not the entry was still fresh: a claim is the
 * end of that prompt's life either way, and leaving an expired one behind for
 * the sweeper to find later is a way for it to be claimed twice.
 */
export async function claimPendingPrompt(
  tabId: number,
  now = Date.now(),
): Promise<string | null> {
  const key = keyFor(tabId);
  const area = sessionArea();

  const stored = await area.get(key);
  const entry: unknown = stored[key];
  await area.remove(key);

  if (!isEntry(entry)) return null;
  if (now - entry.createdAt > PROMPT_TTL_MS) return null;
  return entry.prompt;
}

/** Called when a tab closes, so a prompt nobody claimed does not linger. */
export async function dropPendingPrompt(tabId: number): Promise<void> {
  try {
    await sessionArea().remove(keyFor(tabId));
  } catch {
    // The session area is gone with the worker. Nothing was persisted anyway.
  }
}

/**
 * Remove every prompt past its TTL.
 *
 * Cheap enough to run on each claim: session storage holds only these keys and
 * there is one per unclaimed ChatGPT tab, which is a number in the low single
 * digits in any realistic session.
 */
export async function sweepExpired(now = Date.now()): Promise<number> {
  const area = sessionArea();
  const all = await area.get(null);

  const stale = Object.entries(all)
    .filter(([key, value]) => {
      if (!key.startsWith(KEY_PREFIX)) return false;
      // An unreadable entry is swept too: it can never be claimed.
      if (!isEntry(value)) return true;
      return now - value.createdAt > PROMPT_TTL_MS;
    })
    .map(([key]) => key);

  if (stale.length > 0) await area.remove(stale);
  return stale.length;
}
