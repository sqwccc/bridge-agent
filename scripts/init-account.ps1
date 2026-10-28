$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/LocalEnvironment.ps1"
$AccountPath = Join-Path $ProjectRoot 'runtime/local-account.json'
if (-not (Test-Path -LiteralPath $AccountPath)) {
    New-Item -ItemType Directory -Force (Split-Path $AccountPath -Parent) | Out-Null
    @{ username = 'admin'; password = 'Bm!' + [Guid]::NewGuid().ToString('N') } | ConvertTo-Json | Set-Content -LiteralPath $AccountPath -Encoding utf8
}
$Account = Get-Content -LiteralPath $AccountPath -Raw | ConvertFrom-Json
$env:INIT_USERNAME = $Account.username
$env:INIT_PASSWORD = $Account.password
$env:SPRING_PROFILES_ACTIVE = 'dev,init-account'
Set-Location (Join-Path $ProjectRoot 'backend')
try {
    .\mvnw.cmd spring-boot:run -q
    if ($LASTEXITCODE -ne 0) { throw '账号初始化失败' }
} finally {
    Remove-Item Env:INIT_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:INIT_USERNAME -ErrorAction SilentlyContinue
    Remove-Item Env:SPRING_PROFILES_ACTIVE -ErrorAction SilentlyContinue
}
Write-Host "账号保存在 $AccountPath；文件已被 Git 忽略。现有账号密码不会被重置。"
