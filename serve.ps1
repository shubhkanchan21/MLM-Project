$prefix = 'http://localhost:8000/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "Serving on $prefix"
while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    $path = $req.Url.LocalPath.TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }
    $fs = Join-Path (Get-Location) $path
    if (-not (Test-Path $fs)) {
        $res.StatusCode = 404
        $buf = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        $res.ContentLength64 = $buf.Length
        $res.OutputStream.Write($buf,0,$buf.Length)
        $res.Close()
        continue
    }
    $bytes = [System.IO.File]::ReadAllBytes($fs)
    $ext = [System.IO.Path]::GetExtension($fs).ToLower()
    switch ($ext) {
        '.html' { $ctype='text/html' }
        '.js'   { $ctype='application/javascript' }
        '.css'  { $ctype='text/css' }
        '.svg'  { $ctype='image/svg+xml' }
        '.json' { $ctype='application/json' }
        '.png'  { $ctype='image/png' }
        '.jpg'  { $ctype='image/jpeg' }
        default { $ctype='application/octet-stream' }
    }
    $res.ContentType = $ctype
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes,0,$bytes.Length)
    $res.Close()
}
