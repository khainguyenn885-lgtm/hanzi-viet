$ErrorActionPreference = 'Stop'
$SourceDir = Join-Path $PSScriptRoot '..\data\source'
New-Item -ItemType Directory -Force -Path $SourceDir | Out-Null

foreach ($Level in 1..6) {
    $Url = "https://gushichinese.com/hsk-3.0/downloads/hsk-3.0-words-$Level.json"
    $Target = Join-Path $SourceDir "hsk-3.0-words-$Level.json"
    Invoke-WebRequest -Uri $Url -OutFile $Target -UseBasicParsing
    $Data = Get-Content -LiteralPath $Target -Raw | ConvertFrom-Json
    if ($Data.level -ne $Level -or $Data.license -notlike '*CC BY-SA 4.0*') {
        throw "HSK $Level source metadata or license did not match expectations."
    }
    Write-Output "Downloaded HSK $Level ($($Data.data.Count) entries)."
}
