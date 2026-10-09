import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Inventory locked packages without downloading or executing their code.
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, { version?: string; license?: string }>;
};
const npm = new Map<string, string>();
for (const [path, dependency] of Object.entries(lock.packages)) {
  if (!path || !dependency.version) continue;
  const name = path.split('node_modules/').at(-1)!;
  npm.set(`${name}@${dependency.version}`, dependency.license ?? 'See installed package LICENSE');
}
const nuget = new Map<string, string>();
for (const project of readdirSync('backend')) {
  const file = join('backend', project, 'packages.lock.json');
  if (!existsSync(file)) continue;
  const versions = JSON.parse(readFileSync(file, 'utf8')).dependencies as Record<
    string,
    Record<string, { resolved?: string }>
  >;
  for (const dependencies of Object.values(versions))
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (!dependency.resolved) continue;
      const nuspec = join(
        process.env.NUGET_PACKAGES ?? join(homedir(), '.nuget', 'packages'),
        name.toLowerCase(),
        dependency.resolved,
        `${name.toLowerCase()}.nuspec`,
      );
      const xml = existsSync(nuspec) ? readFileSync(nuspec, 'utf8') : '';
      const license =
        /<license\b[^>]*>([^<]+)<\/license>/.exec(xml)?.[1] ??
        /<licenseUrl>([^<]+)<\/licenseUrl>/.exec(xml)?.[1] ??
        'See NuGet package license';
      nuget.set(`${name}@${dependency.resolved}`, license);
    }
}
const table = (entries: Map<string, string>) =>
  [...entries]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, license]) => `| ${name} | ${license.replaceAll('|', '\\|')} |`)
    .join('\n');
writeFileSync(
  'docs/THIRD-PARTY.md',
  `# Third-party dependency inventory

Generated from the committed npm/NuGet lockfiles and locally restored NuGet metadata by \`npx tsx scripts/dependency-notices.ts\`. Entries include development and retained TypeScript-baseline dependencies. The SPDX expressions/URLs below identify upstream terms; original package LICENSE/NOTICE files remain authoritative and are retained by package installation. A license filename means consult that file inside the NuGet package. This inventory does not relicense upstream code.

Runtime/framework distributions also retain their own notices: .NET/ASP.NET Core (Microsoft), Node.js, Chromium used only by Playwright tests, and the externally installed Codex CLI. Docker pins Codex 0.155.1; its package notices accompany the installed package. NSwag.ConsoleCore 14.6.3 is locked separately in dotnet-tools.json and distributes its own tool dependency notices. Synthetic presentation materials are project assets, not third-party underwriting documents.

## NuGet packages

| Locked package | License metadata |
|---|---|
${table(nuget)}

## npm packages

| Locked package | License metadata |
|---|---|
${table(npm)}
`,
);
