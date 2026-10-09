import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function dotnetExecutable() {
  const local = join(process.env.LOCALAPPDATA || '', 'Microsoft', 'dotnet', 'dotnet.exe');
  return process.env.DOTNET_BIN || (existsSync(local) ? local : 'dotnet');
}
