param([Parameter(Mandatory=$true)][string]$PresentationPath,[Parameter(Mandatory=$true)][string]$OutputDirectory,[string]$PdfOutputPath)
$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $PresentationPath).Path
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$renderDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path
$powerPoint = New-Object -ComObject PowerPoint.Application
$openedPresentation = $null
$previousCount = $powerPoint.Presentations.Count
try {
  $openedPresentation = $powerPoint.Presentations.Open($sourcePath, -1, 0, 0)
  $records = @()
  foreach ($slideItem in $openedPresentation.Slides) {
    $slideItem.Export((Join-Path $renderDirectory ('{0:D2}.png' -f $slideItem.SlideIndex)), 'PNG', 1600, 900)
    $shapes = @()
    foreach ($shapeItem in $slideItem.Shapes) {
      $entry = [ordered]@{id=$shapeItem.Id;name=$shapeItem.Name;type=$shapeItem.Type;left=$shapeItem.Left;top=$shapeItem.Top;width=$shapeItem.Width;height=$shapeItem.Height}
      if ($shapeItem.HasTextFrame -eq -1 -and $shapeItem.TextFrame.HasText -eq -1) {
        $tr = $shapeItem.TextFrame.TextRange
        $entry.text = $tr.Text
        $entry.font = $tr.Font.Name
        $entry.fontSize = $tr.Font.Size
        $entry.boundTop = $tr.BoundTop
        $entry.boundHeight = $tr.BoundHeight
        $entry.boundLeft = $tr.BoundLeft
        $entry.boundWidth = $tr.BoundWidth
      }
      if ($shapeItem.HasTable -eq -1) {
        $cells = @()
        for ($rowIndex=1; $rowIndex -le $shapeItem.Table.Rows.Count; $rowIndex++) {
          for ($columnIndex=1; $columnIndex -le $shapeItem.Table.Columns.Count; $columnIndex++) {
            $cellShape=$shapeItem.Table.Cell($rowIndex,$columnIndex).Shape
            $cellRange=$cellShape.TextFrame.TextRange
            $cells += [pscustomobject]@{row=$rowIndex;column=$columnIndex;left=$cellShape.Left;top=$cellShape.Top;width=$cellShape.Width;height=$cellShape.Height;text=$cellRange.Text;boundTop=$cellRange.BoundTop;boundLeft=$cellRange.BoundLeft;boundWidth=$cellRange.BoundWidth;boundHeight=$cellRange.BoundHeight}
          }
        }
        $entry.cells=$cells
      }
      $shapes += [pscustomobject]$entry
    }
    $records += [pscustomobject]@{slide=$slideItem.SlideIndex;shapes=$shapes}
  }
  [pscustomobject]@{application='Microsoft PowerPoint';version=$powerPoint.Version;source=$sourcePath;width=$openedPresentation.PageSetup.SlideWidth;height=$openedPresentation.PageSetup.SlideHeight;slides=$records} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $renderDirectory 'native-layout.json') -Encoding utf8
  if ($PdfOutputPath) { $openedPresentation.SaveCopyAs([System.IO.Path]::GetFullPath($PdfOutputPath),32) }
  Write-Output ('Exported {0} slides with Microsoft PowerPoint {1}' -f $openedPresentation.Slides.Count,$powerPoint.Version)
} finally {
  if ($openedPresentation) { $openedPresentation.Close(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($openedPresentation) }
  if ($previousCount -eq 0 -and $powerPoint.Presentations.Count -eq 0) { $powerPoint.Quit() }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
}
