# Load KEY=value without evaluating config or logging credentials (Windows PowerShell 5 compatible).
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$LocalConfig = Join-Path $ProjectRoot '.env.local'
if (Test-Path -LiteralPath $LocalConfig) {
    foreach ($Line in Get-Content -LiteralPath $LocalConfig) {
        if ($Line -match '^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$') {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"').Trim("'"), 'Process')
        }
    }
}
