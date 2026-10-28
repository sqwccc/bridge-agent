$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/LocalEnvironment.ps1"
$env:SPRING_PROFILES_ACTIVE = 'dev'
Set-Location (Join-Path $ProjectRoot 'backend')
.\mvnw.cmd spring-boot:run
