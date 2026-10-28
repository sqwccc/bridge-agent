$ErrorActionPreference = 'Stop'
$difyRoot = '/opt/bridgemind-dify-1.18.0'
docker desktop start
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop could not start' }
wsl -d Ubuntu -- docker compose --project-directory $difyRoot -p bridgemind-dify -f "$difyRoot/docker-compose.yaml" -f "$difyRoot/compose.override.yaml" up -d
if ($LASTEXITCODE -ne 0) { throw 'Dify startup failed' }
Write-Host 'Dify: http://127.0.0.1:8090'
