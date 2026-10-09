# Run the demo on another Windows laptop

The repository contains application source, the dependency lockfile, synthetic demo documents, and tests. Local case databases, uploaded working files, credentials, temporary renders, and installed dependencies are excluded. The laptop starts with a fresh session; existing investigations are not transferred.

## Prerequisites

- Git.
- Node.js 24 or newer, including npm.
- .NET 10 SDK (not just the runtime). `npm run build` compiles the C# backend.
- Codex installed and signed in on the laptop with an account that can use the configured reviewer model (`gpt-5.6-terra`). Installing Codex does not install this app's Node dependencies.
- Internet access for installing dependencies and calling the model service.

## Clone from GitHub

Clone the public portfolio:

```powershell
cd $env:USERPROFILE\Documents
git clone https://github.com/Offgridhuls/FCTUnderwritingLab-Portfolio.git FCTUnderwritingLab
cd FCTUnderwritingLab
npm ci
npm run build
npm start
```

## Open the app

Visit http://127.0.0.1:4317 and enter the access code printed in the server terminal. Keep that terminal running. On later starts, double-click `start.cmd`; it installs dependencies when absent, builds the frontend and C# backend, and starts the backend. The C# app uses fresh `.data-dotnet` storage; old `.data` cases remain with the original implementation. See [operations](OPERATIONS.md) for SDK discovery, configuration, and recovery.

Install and sign into Codex separately on the laptop. Do not copy the original computer's authentication files. The backend launches a Codex app-server process; the desktop app window is not the application's web server.

If a review reports that the Codex executable cannot be found, set the full path of the installed native executable in the same PowerShell terminal before starting:

```powershell
$env:CODEX_BIN = 'C:\full\path\to\codex.exe'
npm start
```

The executable must support `app-server`. The adapter also checks PATH and the Windows desktop installation's versioned binary directories. The configured model must be available to the laptop's signed-in account; there is no silent fallback.

## Demo material and verification

Synthetic document packs are in `output/pdf`. Upload the desired pack into a new case. Your old browser session, case history, and review results are not part of the repository.

Before travelling, run `npm test`, start the app, and complete one live team review on the laptop. Live review consumes subscription usage. Browser automation is optional: `npx playwright install chromium`, then `npm run test:ui`.

The web app and document viewing run locally. Live reviewers require access to the model service. Office firewall restrictions can prevent model calls even when the interface loads; test the actual connection or arrange an authorized alternative connection before presenting.

## Keep the checkout current

Use `git pull` on main, then run `npm ci` and `npm run build`. Never commit local data, environment files, or Codex credentials.

