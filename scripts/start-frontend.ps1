$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/LocalEnvironment.ps1"
Set-Location (Join-Path $ProjectRoot 'frontend')
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw '前端依赖安装失败' }
pnpm dev
