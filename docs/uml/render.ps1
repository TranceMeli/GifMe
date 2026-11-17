# Renders every .puml file in this folder to SVG (or PNG) in docs/uml/rendered.
# Usage: powershell -File docs/uml/render.ps1 [-Format svg|png]
param([ValidateSet('svg', 'png')][string]$Format = 'svg')

$ErrorActionPreference = 'Stop'
$Version = '1.2026.10'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$Jar = Join-Path $Root 'tools\plantuml.jar'
$Out = Join-Path $PSScriptRoot 'rendered'

# Java from PATH, or the default Temurin install location.
$java = (Get-Command java -ErrorAction SilentlyContinue).Source
if (-not $java) {
    $java = Get-ChildItem 'C:\Program Files\Eclipse Adoptium\*\bin\java.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $java) { throw 'Java not found. Install it with: winget install EclipseAdoptium.Temurin.21.JRE' }

if (-not (Test-Path $Jar)) {
    New-Item -ItemType Directory -Force (Split-Path $Jar) | Out-Null
    $url = "https://github.com/plantuml/plantuml/releases/download/v$Version/plantuml-$Version.jar"
    Write-Host "Downloading PlantUML $Version from $url"
    Invoke-WebRequest $url -OutFile $Jar
}

New-Item -ItemType Directory -Force $Out | Out-Null
& $java -jar $Jar "-t$Format" -charset UTF-8 -o $Out (Join-Path $PSScriptRoot '*.puml')
if ($LASTEXITCODE -ne 0) { throw "PlantUML failed with exit code $LASTEXITCODE" }

# A single page with every rendered SVG, handy for a quick look (SVG format only).
if ($Format -eq 'svg') {
    $sections = Get-ChildItem $Out -Filter *.svg | Sort-Object Name | ForEach-Object {
        $svg = Get-Content $_.FullName -Raw -Encoding UTF8
        "<section><h2>$($_.BaseName)</h2><div class=`"scroll`">$svg</div></section>"
    }
    $page = @"
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>PlantUML output</title>
<style>
body{margin:0;padding:24px 16px;font-family:'Segoe UI',sans-serif;background:#ffe9a9;color:#2e2418}
section{max-width:1300px;margin:0 auto 24px;padding:16px 20px;background:#fff6df;border:2px solid #ff933e;border-radius:28px}
h1,h2{margin:0 0 10px}h1{max-width:1300px;margin:0 auto 20px}
.scroll{overflow-x:auto}.scroll svg{max-width:100%;height:auto}
</style></head><body><h1>PlantUML $Version, rendered diagrams</h1>
$($sections -join "`n")
</body></html>
"@
    Set-Content -Path (Join-Path $Out 'index.html') -Value $page -Encoding UTF8
}

Write-Host "Rendered to $Out"
