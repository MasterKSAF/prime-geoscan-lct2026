param([string]$EvidenceDirectory = 'output/planner-verification')
$ErrorActionPreference = 'Stop'
$evidence = Get-Content -Raw -LiteralPath (Join-Path $EvidenceDirectory 'evidence.json') | ConvertFrom-Json -Depth 100
$settings = [System.Xml.XmlReaderSettings]::new()
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = $null
$reader = [System.Xml.XmlReader]::Create((Join-Path $EvidenceDirectory 'plan.kml'), $settings)
$xml = [System.Xml.XmlDocument]::new()
$xml.XmlResolver = $null
try { $xml.Load($reader) } finally { $reader.Dispose() }
$ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
$ns.AddNamespace('k', 'http://www.opengis.net/kml/2.2')
$folders = $xml.SelectNodes('//k:Folder', $ns)
if ($folders.Count -ne $evidence.plan.missions.Count) { throw 'KML mission count mismatch' }
$segmentsChecked = 0
for ($m = 0; $m -lt $folders.Count; $m++) {
  $placemarks = $folders[$m].SelectNodes('k:Placemark', $ns)
  $mission = $evidence.plan.missions[$m]
  if ($placemarks.Count -ne $mission.segments.Count) { throw 'KML segment count mismatch' }
  for ($i = 0; $i -lt $placemarks.Count; $i++) {
    $fields = @{}
    foreach ($entry in $placemarks[$i].SelectNodes('k:ExtendedData/k:Data', $ns)) { $fields[$entry.GetAttribute('name')] = $entry.SelectSingleNode('k:value', $ns).InnerText }
    $segment = $mission.segments[$i]
    if ($fields.phase -ne $segment.phase -or [int]$fields.sequence -ne ($i + 1) -or $fields.vehicleId -ne $mission.vehicleId) { throw 'KML phase/order mismatch' }
    foreach ($pair in @(@('relativeAltitudeFromM','altitudeFromM'),@('relativeAltitudeToM','altitudeToM'),@('airspeedMps','airspeedMps'),@('groundSpeedMps','groundSpeedMps'),@('startSec','startSec'),@('endSec','endSec'))) {
      $actual = [double]::Parse($fields[$pair[0]], [Globalization.CultureInfo]::InvariantCulture)
      $expected = [double]$segment.($pair[1])
      if ([math]::Abs($actual - $expected) -gt 0.000001) { throw "KML attribute mismatch: $($pair[0])" }
    }
    $coordinates = $placemarks[$i].SelectSingleNode('k:LineString/k:coordinates', $ns).InnerText.Split(' ')
    for ($p = 0; $p -lt 2; $p++) {
      $numbers = $coordinates[$p].Split(',')
      $expectedPoint = if ($p -eq 0) { $segment.from } else { $segment.to }
      for ($axis = 0; $axis -lt 2; $axis++) {
        if ([math]::Abs([double]::Parse($numbers[$axis], [Globalization.CultureInfo]::InvariantCulture) - $expectedPoint[$axis]) -gt 0.000000001) { throw 'KML coordinate mismatch' }
      }
    }
    $segmentsChecked++
  }
}
[pscustomobject]@{status='pass'; missions=$folders.Count; segments=$segmentsChecked; verification='XML parse and attribute/coordinate round trip'; source='model calculation, not a flight log'} | ConvertTo-Json
