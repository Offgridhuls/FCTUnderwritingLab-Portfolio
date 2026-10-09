import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const local = join(process.env.LOCALAPPDATA || '', 'Microsoft', 'dotnet', 'dotnet.exe');
const dotnet = process.env.DOTNET_BIN || (existsSync(local) ? local : 'dotnet');
const directory = await mkdtemp(join(tmpdir(), 'fct-dotnet-ui-'));
await mkdir('artifacts', { recursive: true });
const log = createWriteStream('artifacts/fixture-server.log');
const child = spawn(
  dotnet,
  ['run', '--no-build', '--project', 'backend/Underwriting.FixtureHost'],
  {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      PORT: '4318',
      FCT_ACCESS_CODE: 'ui-test-only',
      FCT_DOTNET_DATA_DIR: directory,
    },
  },
);
child.stdout!.pipe(log);
child.on('exit', (code) => process.exit(code ?? 1));
process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
