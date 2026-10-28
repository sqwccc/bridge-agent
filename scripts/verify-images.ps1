# 仅验证已构建镜像；使用唯一名称的临时容器和网络，不修改共享数据库内容。
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/LocalEnvironment.ps1"
$Suffix = [Guid]::NewGuid().ToString('N').Substring(0,8)
$Network = "bridgemind-verify-$Suffix"
$ApiContainer = "bridgemind-verify-api-$Suffix"
$WebContainer = "bridgemind-verify-web-$Suffix"
$EnvFile = Join-Path $ProjectRoot "runtime/docker-verify-$Suffix.env"
$AppPassword = if ($env:APP_DB_PASSWORD) { $env:APP_DB_PASSWORD } else { 'bridgemind_dev_app' }
$SourcePassword = if ($env:SOURCE_DB_PASSWORD) { $env:SOURCE_DB_PASSWORD } else { 'bridgemind_dev_reader' }
@(
    'SPRING_PROFILES_ACTIVE=prod',
    'SERVER_PORT=8088',
    'APP_DB_URL=jdbc:postgresql://host.docker.internal:5432/bridgemind',
    'APP_DB_USER=bridgemind_app',
    "APP_DB_PASSWORD=$AppPassword",
    'SOURCE_DB_URL=jdbc:postgresql://host.docker.internal:5432/bridgemind_source',
    'SOURCE_DB_USER=bridgemind_reader',
    "SOURCE_DB_PASSWORD=$SourcePassword"
) | Set-Content -LiteralPath $EnvFile -Encoding ascii
try {
    docker network create $Network | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '测试网络创建失败' }
    docker run -d --rm --name $ApiContainer --network $Network --network-alias backend --add-host host.docker.internal:host-gateway --env-file $EnvFile bridgemind-backend | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '后端测试容器启动失败' }
    $Ready = $false
    for ($Attempt=0; $Attempt -lt 30; $Attempt++) {
        docker exec $ApiContainer wget -q --spider http://localhost:8088/actuator/health 2>$null
        if ($LASTEXITCODE -eq 0) { $Ready=$true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $Ready) { throw '后端生产配置健康检查失败' }
    docker run -d --rm --name $WebContainer --network $Network bridgemind-frontend | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '前端测试容器启动失败' }
    Start-Sleep -Seconds 2
    docker exec $WebContainer nginx -t
    if ($LASTEXITCODE -ne 0) { throw 'Nginx配置检查失败' }
    docker exec $WebContainer wget -q --spider http://127.0.0.1/screen
    if ($LASTEXITCODE -ne 0) { throw 'SPA刷新回退失败' }
    $Csrf = docker exec $WebContainer wget -q -O - --header 'X-Forwarded-Proto: https' http://127.0.0.1/api/v1/auth/csrf | ConvertFrom-Json
    if ($Csrf.code -ne 'OK' -or -not $Csrf.data.token) { throw 'API反向代理失败' }
    Write-Host 'PASS: 生产Profile双库连接、镜像启动、Nginx配置、SPA路由回退及API同源代理。'
} finally {
    docker rm -f $WebContainer $ApiContainer 2>$null | Out-Null
    docker network rm $Network 2>$null | Out-Null
    if (Test-Path -LiteralPath $EnvFile) { Remove-Item -LiteralPath $EnvFile }
}
