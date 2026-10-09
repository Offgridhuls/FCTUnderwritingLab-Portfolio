import { buildApp } from './app.js';
const { app, accessCode } = await buildApp();
await app.listen({
  host: process.env.FCT_CONTAINER === '1' ? '0.0.0.0' : '127.0.0.1',
  port: Number(process.env.PORT || 4317),
});
console.log(
  `\nTHE UNDERWRITING ROOM\nLocal API: http://127.0.0.1:${process.env.PORT || 4317}\nAccess code: ${accessCode}\nDevelopment UI: http://127.0.0.1:5173\nAPI documentation: http://127.0.0.1:${process.env.PORT || 4317}/api/docs\n`,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void app.close().then(() => process.exit(0)));
