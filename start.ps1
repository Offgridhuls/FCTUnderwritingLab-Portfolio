$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (!(Test-Path -LiteralPath 'node_modules')) { npm ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm start
