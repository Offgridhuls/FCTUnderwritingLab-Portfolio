import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCodexBinary } from '../server/codexBinary.js';

test('finds the newest installed executable without Codex on PATH and respects overrides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fct-codex-'));
  try {
    const base = join(dir, 'OpenAI', 'Codex', 'bin');
    for (const version of ['old', 'new']) {
      mkdirSync(join(base, version), { recursive: true });
      writeFileSync(join(base, version, 'codex.exe'), 'fixture');
    }
    const old = join(base, 'old', 'codex.exe');
    const current = join(base, 'new', 'codex.exe');
    utimesSync(old, 1, 1);
    const env = { PATH: '', LOCALAPPDATA: dir };
    expect(resolveCodexBinary(env, 'win32')).toBe(current);
    expect(resolveCodexBinary({ ...env, CODEX_BIN: old }, 'win32')).toBe(old);
    expect(resolveCodexBinary({ ...env, PATH: join(base, 'old') }, 'win32')).toBe(old);
    expect(() => resolveCodexBinary({ ...env, CODEX_BIN: join(dir, 'missing') }, 'win32')).toThrow(
      'CODEX_BIN',
    );
    expect(() => resolveCodexBinary({ PATH: '' }, 'win32')).toThrow('Codex executable not found');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
