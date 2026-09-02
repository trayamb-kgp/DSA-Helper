/**
 * Stored-schema migrations.
 *
 * An ordered v(n) -> v(n+1) chain, applied on read. Two rules:
 *
 *   - Migrations run in order and each handles exactly one step, so a user
 *     returning after skipping five versions gets the same result as one who
 *     upgraded every time.
 *   - Data from a *newer* schema than this build knows about is left
 *     completely untouched. Chrome syncs settings across machines, so an
 *     older install will meet newer data; rewriting it to fit an older shape
 *     would destroy the newer install's settings.
 *
 * Pure: no `chrome.*`, no DOM.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export const SCHEMA_VERSION_KEY = 'schemaVersion';

export type StoredData = Record<string, unknown>;

type Migration = (data: StoredData) => StoredData;

/**
 * Keyed by the version being migrated *from*: `MIGRATIONS[0]` takes v0 data
 * to v1. Add a new entry -- never edit a shipped one -- and bump
 * CURRENT_SCHEMA_VERSION in the same change.
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = Object.freeze({
  /**
   * v0 -> v1: the first versioned shape. Pre-version installs are the 0.1.0
   * betas, which stored the same keys with no version stamp, so this only
   * stamps the version.
   */
  0: (data) => ({ ...data }),
});

export interface MigrationResult {
  data: StoredData;
  /** The version the data is now at. */
  version: number;
  /** True when at least one migration ran and the result needs writing back. */
  changed: boolean;
  /** True when the data came from a newer build and was deliberately skipped. */
  fromFuture: boolean;
}

function readVersion(data: StoredData): number {
  const raw = data[SCHEMA_VERSION_KEY];
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

/** Bring stored data up to CURRENT_SCHEMA_VERSION. */
export function migrate(data: StoredData): MigrationResult {
  const from = readVersion(data);

  if (from > CURRENT_SCHEMA_VERSION) {
    // Written by a newer build. Leave it exactly as found.
    return { data, version: from, changed: false, fromFuture: true };
  }
  if (from === CURRENT_SCHEMA_VERSION) {
    return { data, version: from, changed: false, fromFuture: false };
  }

  let current = data;
  for (let v = from; v < CURRENT_SCHEMA_VERSION; v += 1) {
    const step = MIGRATIONS[v];
    if (!step) {
      throw new Error(`Missing migration from schema v${v} to v${v + 1}`);
    }
    current = step(current);
  }

  return {
    data: { ...current, [SCHEMA_VERSION_KEY]: CURRENT_SCHEMA_VERSION },
    version: CURRENT_SCHEMA_VERSION,
    changed: true,
    fromFuture: false,
  };
}
