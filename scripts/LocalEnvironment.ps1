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
# Branch-owned apps override only Dify keys; the original .env.local stays intact.
$DifyBranch = (& git -C $ProjectRoot -c "safe.directory=$($ProjectRoot.Replace('\','/'))" branch --show-current 2>$null)
if ($DifyBranch) {
    $DifyHash = [System.Security.Cryptography.SHA256]::Create()
    try {
        $DifySuffix = ([BitConverter]::ToString($DifyHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($DifyBranch.Trim())))).Replace('-', '').ToLower().Substring(0,16)
    } finally { $DifyHash.Dispose() }
    $DifyMappingPath = Join-Path $ProjectRoot "runtime/dify-branch-$DifySuffix.json"
    if (Test-Path -LiteralPath $DifyMappingPath) {
        $DifyMapping = Get-Content -LiteralPath $DifyMappingPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($DifyMapping.branch -ne $DifyBranch.Trim() -or !$DifyMapping.app_api_key -or !$DifyMapping.classifier_api_key) {
            throw 'Incomplete Dify branch mapping; refusing to use original applications.'
        }
        $env:DIFY_API_KEY = $DifyMapping.app_api_key
        $env:DIFY_CLASSIFIER_API_KEY = $DifyMapping.classifier_api_key
    }
}
