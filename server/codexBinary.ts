import { readdirSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

// Desktop-launched terminals do not necessarily inherit Codex's PATH additions.
export function resolveCodexBinary(env = process.env, platform = process.platform): string {
  const file = (path: string) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  };
  if (env.CODEX_BIN) {
    const path = resolve(env.CODEX_BIN);
    if (!file(path))
      throw new Error(
        'CODEX_BIN points to a missing executable. Update it to the installed Codex executable and restart the server.',
      );
    return path;
  }
  const name = platform === 'win32' ? 'codex.exe' : 'codex';
  for (const entry of (env.PATH || env.Path || '').split(delimiter)) {
    const directory = entry.replace(/^"|"$/g, '');
    if (isAbsolute(directory) && file(join(directory, name))) return join(directory, name);
  }
  if (platform === 'win32' && env.LOCALAPPDATA) {
    const root = join(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    try {
      const candidates = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name, 'codex.exe'))
        .filter(file)
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      if (candidates[0]) return candidates[0];
    } catch {}
  }
  throw new Error(
    'Codex executable not found. Install Codex or set CODEX_BIN to its full executable path, then restart the server.',
  );
}
