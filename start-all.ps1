$ErrorActionPreference = 'Stop'
$env:PORT = '3000'
Write-Host "Starting backend+frontend on http://localhost:$env:PORT ..."
Start-Process -FilePath node -ArgumentList 'index.js' -WorkingDirectory "database(sql)"
Start-Sleep -Seconds 1
try {
  Start-Process "http://localhost:$env:PORT/index.html"
} catch {
  Write-Host "Open in browser: http://localhost:$env:PORT/index.html"
}
