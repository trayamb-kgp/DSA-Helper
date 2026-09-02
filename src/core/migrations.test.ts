import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSION_KEY, migrate } from './migrations';

describe('migrate', () => {
  it('stamps unversioned data with the current version', () => {
    const result = migrate({ settings: { historyLimit: 5 } });
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.data[SCHEMA_VERSION_KEY]).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.changed).toBe(true);
    expect(result.fromFuture).toBe(false);
  });

  it('preserves the data it migrates', () => {
    const result = migrate({ settings: { historyLimit: 5 }, promptTemplate: 'hi' });
    expect(result.data['settings']).toEqual({ historyLimit: 5 });
    expect(result.data['promptTemplate']).toBe('hi');
  });

  it('is a no-op for data already at the current version', () => {
    const data = { [SCHEMA_VERSION_KEY]: CURRENT_SCHEMA_VERSION, settings: {} };
    const result = migrate(data);
    expect(result.changed).toBe(false);
    expect(result.data).toBe(data);
  });

  it('leaves data from a newer build completely untouched', () => {
    const future = { [SCHEMA_VERSION_KEY]: CURRENT_SCHEMA_VERSION + 7, mystery: 'keep me' };
    const result = migrate(future);
    expect(result.fromFuture).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.data).toBe(future);
    expect(result.data['mystery']).toBe('keep me');
  });

  it('treats a malformed version stamp as unversioned', () => {
    for (const bad of ['2', null, -1, 1.5, undefined, {}]) {
      const result = migrate({ [SCHEMA_VERSION_KEY]: bad });
      expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    }
  });

  it('is idempotent', () => {
    const once = migrate({ settings: {} });
    const twice = migrate(once.data);
    expect(twice.data).toEqual(once.data);
    expect(twice.changed).toBe(false);
  });

  it('does not mutate its input', () => {
    const input = { settings: { a: 1 } };
    const before = JSON.stringify(input);
    migrate(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
