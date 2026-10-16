param([switch]$InspectOnly)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$source = Get-Content -LiteralPath (Join-Path $projectDir 'app.js') -Raw
$seedSource = $source.Substring(0, $source.IndexOf('const importedProducts'))
$articles = [regex]::Matches($seedSource, '(?:makeProduct\("[^"\r\n]+",\s*"[^"\r\n]+",\s*|\["[^"\r\n]+",\s*)(\d+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$response = Invoke-WebRequest -Uri 'https://outmaxshop.com/yml/all.yml' -TimeoutSec 90
$xmlText = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
$settings = [Xml.XmlReaderSettings]::new()
$settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = $null
$reader = [Xml.XmlReader]::Create([IO.StringReader]::new($xmlText), $settings)
$document = [Xml.XmlDocument]::new()
$document.XmlResolver = $null
try { $document.Load($reader) } finally { $reader.Dispose() }
$photos = [ordered]@{}
$missing = @()
foreach ($article in $articles) {
  $offer = $document.SelectSingleNode("/yml_catalog/shop/offers/offer[@id='$article']")
  if ($null -eq $offer) { $missing += $article; continue }
  $pictures = @($offer.SelectNodes('picture') | ForEach-Object { $_.InnerText.Trim() } | Where-Object { $_ -match '^https://outmaxshop\.(com|ru)/' } | Select-Object -Unique)
  if ($pictures.Count) { $photos[$article] = $pictures } else { $missing += $article }
}
if ($InspectOnly) {
  @{ matched = $photos.Count; missing = $missing; photos = $photos } | ConvertTo-Json -Depth 5
  exit
}
if (!$photos.Count) { throw 'No matching galleries found; existing snapshot was not changed.' }
if ($missing.Count) { Write-Warning "Feed has no photos for: $($missing -join ', '). Those products keep their existing photos." }
$json = $photos | ConvertTo-Json -Depth 5
$output = "// Generated from https://outmaxshop.com/yml/all.yml by scripts/sync-product-photos.ps1`nwindow.OUTMAX_PRODUCT_PHOTOS = $json;`n"
$target = Join-Path $projectDir 'product-photos.js'
[IO.File]::WriteAllText($target, $output, [Text.UTF8Encoding]::new($false))
Write-Output "Updated $($photos.Count) product galleries in product-photos.js."
