import { spawn } from 'node:child_process';
import { dotnetExecutable } from './dotnet';
const child = spawn(dotnetExecutable(), process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: true,
});
child.once('error', (error) => {
  console.error('Unable to start .NET 10. Install the SDK or set DOTNET_BIN. ' + error.message);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
