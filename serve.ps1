param([int]$Port = 8080)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host ""
Write-Host "  Aurea-web server running at http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

Start-Process "http://localhost:$Port"

$mimeMap = @{
  '.html'        = 'text/html; charset=utf-8'
  '.css'         = 'text/css; charset=utf-8'
  '.js'          = 'application/javascript; charset=utf-8'
  '.json'        = 'application/json'
  '.webmanifest' = 'application/manifest+json'
  '.jpg'         = 'image/jpeg'
  '.jpeg'        = 'image/jpeg'
  '.png'         = 'image/png'
  '.webp'        = 'image/webp'
  '.svg'         = 'image/svg+xml'
  '.ico'         = 'image/x-icon'
  '.woff2'       = 'font/woff2'
  '.woff'        = 'font/woff'
  '.ttf'         = 'font/ttf'
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req     = $context.Request
    $res     = $context.Response

    $urlPath = $req.Url.LocalPath
    if ($urlPath -eq '/') { $urlPath = '/index.html' }

    $filePath = Join-Path $root ($urlPath.TrimStart('/').Replace('/', '\'))

    if (Test-Path $filePath -PathType Leaf) {
      $ext  = [System.IO.Path]::GetExtension($filePath).ToLower()
      $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }

      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $res.ContentType     = $mime
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - Not Found: $urlPath")
      $res.ContentLength64 = $msg.Length
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }

    $res.Close()
  }
} finally {
  $listener.Stop()
}
