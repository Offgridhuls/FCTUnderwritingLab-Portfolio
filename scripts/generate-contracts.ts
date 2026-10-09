import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dotnetExecutable } from './dotnet';

const dotnet = dotnetExecutable();
async function run(args: string[]) {
  const child = spawn(dotnet, args, { stdio: 'inherit', windowsHide: true });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`dotnet exited ${code}`)),
    );
  });
}
await run(['build', 'backend/Underwriting.Api', '--verbosity', 'quiet']);
await run(['tool', 'restore']);
const directory = await mkdtemp(join(tmpdir(), 'fct-contracts-'));
const port = 4323;
const server = spawn(dotnet, ['backend/Underwriting.Api/bin/Debug/net10.0/Underwriting.Api.dll'], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    PORT: String(port),
    FCT_DOTNET_DATA_DIR: directory,
    FCT_ACCESS_CODE: 'contract-generation-only',
  },
});
try {
  let schema: unknown;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/openapi.json`);
      if (response.ok) {
        schema = await response.json();
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!schema) throw new Error('Contract server did not start.');
  await mkdir('contracts', { recursive: true });
  await mkdir('src/generated', { recursive: true });
  await writeFile('contracts/openapi.json', JSON.stringify(schema, null, 2) + '\n');
  await run([
    'tool',
    'run',
    'nswag',
    'openapi2tsclient',
    '/input:contracts/openapi.json',
    '/output:src/generated/api-contracts.ts',
    '/GenerateClientClasses:false',
    '/TypeStyle:Interface',
    '/DateTimeType:string',
    '/MarkOptionalProperties:true',
    '/GenerateDtoTypes:true',
  ]);
} finally {
  server.kill();
}
