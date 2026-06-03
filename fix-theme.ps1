$files = Get-ChildItem "f:\simplesplit\src" -Recurse -Include "*.tsx" | Where-Object { $_.FullName -notmatch "node_modules" -and $_.Name -ne "globals.css" }
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    if (-not $content) { continue }
    $newContent = $content
    $newContent = $newContent -replace 'text-espresso', 'text-[var(--on-surface)]'
    $newContent = $newContent -replace 'text-warm-muted', 'text-[var(--outline)]'
    $newContent = $newContent -replace 'border-warm-border', 'border-[var(--outline-variant)]'
    $newContent = $newContent -replace 'bg-cream', 'bg-[var(--bg)]'
    $newContent = $newContent -replace 'shadow-warm', ''
    if ($content -ne $newContent) {
        Set-Content $file.FullName $newContent -Encoding UTF8 -NoNewline
        Write-Host "Updated: $($file.Name)"
    }
}
