$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/LocalEnvironment.ps1"
if ($env:APP_DB_URL -and $env:APP_DB_URL -notmatch '^jdbc:postgresql://(localhost|127\.0\.0\.1):5432/bridgemind(?:\?|$)') {
    throw '当前配置并非本机业务库，禁止执行本地建库/导入。已配置的测试环境请直接运行 start-backend.ps1。'
}
Set-Location $ProjectRoot
# 使用既有共享容器，不创建或清理容器及其数据卷。
docker inspect shared_postgres --format '{{.Name}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'shared_postgres 不存在或 Docker 未启动，请先恢复已有容器。' }
docker start shared_postgres | Out-Null
python -m pip install -r scripts/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Python 依赖安装失败' }
python scripts/init-local.py
if ($LASTEXITCODE -ne 0) { throw '数据库初始化失败，非空来源表不会被覆盖。' }
Write-Host '双库已就绪。接下来运行 scripts/init-account.ps1 初始化独立账号。'
