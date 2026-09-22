# Downloads public files only. Never executes the supplied installer.
$ErrorActionPreference = 'Stop'
$materialRoot = Join-Path $PSScriptRoot '../docs/planner/expert-materials/2026-09-22'
$materialRoot = [IO.Path]::GetFullPath($materialRoot)
New-Item -ItemType Directory -Path (Join-Path $materialRoot 'originals') -Force | Out-Null
$sources = @(
    @{ Url = 'https://disk.360.yandex.ru/d/HjUEBhOJAzMAaw'; Folder = $true; Target = (Join-Path $materialRoot 'originals/primorsky-obstacles.kml') },
    @{ Url = 'https://disk.yandex.ru/i/BRotk294jvzFKw'; Folder = $false; Target = (Join-Path $materialRoot 'originals/sourcecraft-ai-code-analysis.pdf') },
    @{ Url = 'https://disk.360.yandex.ru/d/2WJiEc2xiXcsvw'; Folder = $false; Target = 'C:/Users/Misha/Downloads/GeoScanPlanner_2.5.2017.09.15955_x64-from-experts.exe' }
)
$records = @()
foreach ($entry in $sources) {
    $uri = 'https://cloud-api.yandex.net/v1/disk/public/resources?limit=100&public_key=' + [uri]::EscapeDataString($entry.Url)
    $resource = Invoke-RestMethod -Uri $uri -TimeoutSec 30
    if ($entry.Folder) {
        if ($resource._embedded.total -ne 1 -or $resource._embedded.items[0].type -ne 'file') { throw 'Source folder changed; inspect before downloading.' }
        $resource = $resource._embedded.items[0]
    }
    if ($resource.size -gt 250MB -or $resource.type -ne 'file') { throw 'Unexpected source size or type.' }
    if (-not (Test-Path -LiteralPath $entry.Target)) {
        Invoke-WebRequest -Uri $resource.file -OutFile $entry.Target -TimeoutSec 180
    }
    $actual = Get-FileHash -LiteralPath $entry.Target -Algorithm SHA256
    if ($actual.Hash -ne $resource.sha256 -or (Get-Item -LiteralPath $entry.Target).Length -ne $resource.size) { throw "Checksum/size mismatch: $($entry.Target)" }
    $record = [ordered]@{
        source = $entry.Url
        originalName = $resource.name
        localPath = [IO.Path]::GetFullPath($entry.Target)
        bytes = $resource.size
        sha256 = $actual.Hash.ToLowerInvariant()
        sourceModifiedAt = $resource.modified
        downloadedAt = [DateTimeOffset]::UtcNow.ToString('o')
        executed = $false
    }
    if ($entry.Target.EndsWith('.exe')) {
        $sig = Get-AuthenticodeSignature -LiteralPath $entry.Target
        $record.signatureStatus = [string]$sig.Status
        $record.signatureMessage = $sig.StatusMessage
        $record.signer = $sig.SignerCertificate.Subject
        $record.version = (Get-Item -LiteralPath $entry.Target).VersionInfo.FileVersion
    }
    $records += [pscustomobject]$record
    # Generated metadata; excludes temporary download URLs and unrelated account data.
    $records | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $materialRoot 'download-manifest.json') -Encoding utf8NoBOM
    [pscustomobject]$record | ConvertTo-Json -Depth 8
}
