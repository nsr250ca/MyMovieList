param(
  [string]$PayloadPath = "tmp-workbook-import.json",
  [string]$TargetEmail = "demo.moviejournal@example.com",
  [string]$TargetUserId = "774a8303-fbcf-43d2-b2c0-341c8416241c"
)

$ErrorActionPreference = "Stop"

function Read-EnvFile {
  $map = @{}
  Get-Content ".env.local" | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
      $map[$matches[1]] = $matches[2].Trim('"', "'")
    }
  }
  return $map
}

function Invoke-SupabaseRest {
  param(
    [string]$Method,
    [string]$Path,
    $Body = $null,
    [string[]]$ExtraHeaders = @()
  )

  $uri = "$script:SupabaseUrl$Path"
  $bodyFile = $null
  $methodName = $Method.ToUpperInvariant()

  try {
    $args = @(
      "-sS",
      "--globoff",
      "-X", $methodName,
      "--url", $uri,
      "-H", "apikey: $script:ServiceRoleKey",
      "-H", "Authorization: Bearer $script:ServiceRoleKey",
      "-H", "Content-Type: application/json",
      "-H", "Prefer: return=representation"
    )

    foreach ($header in $ExtraHeaders) {
      $args += @("-H", $header)
    }

    if ($null -ne $Body) {
      $bodyFile = [System.IO.Path]::GetTempFileName()
      $utf8NoBom = New-Object System.Text.UTF8Encoding $false
      [System.IO.File]::WriteAllText(
        $bodyFile,
        ($Body | ConvertTo-Json -Depth 30 -Compress),
        $utf8NoBom
      )
      $args += @("--data-binary", "@$bodyFile")
    }

    $args += @("-w", "`nHTTP_STATUS:%{http_code}")
    $raw = & curl.exe @args
    $text = ($raw -join "`n")
    $statusMatch = [regex]::Match($text, "HTTP_STATUS:(\d+)\s*$")
    $status = if ($statusMatch.Success) { [int]$statusMatch.Groups[1].Value } else { 0 }
    $content = [regex]::Replace($text, "\s*HTTP_STATUS:\d+\s*$", "")

    if ($status -lt 200 -or $status -ge 300) {
      throw "Supabase REST $methodName $Path failed with HTTP $status`: $content"
    }

    if ([string]::IsNullOrWhiteSpace($content)) {
      return @()
    }

    return $content | ConvertFrom-Json
  }
  finally {
    if ($null -ne $bodyFile -and (Test-Path $bodyFile)) {
      Remove-Item -LiteralPath $bodyFile -Force
    }
  }
}

function Chunk-Array {
  param(
    [array]$Items,
    [int]$Size
  )

  for ($i = 0; $i -lt $Items.Count; $i += $Size) {
    ,($Items[$i..([Math]::Min($i + $Size - 1, $Items.Count - 1))])
  }
}

$envMap = Read-EnvFile
$script:SupabaseUrl = $envMap["NEXT_PUBLIC_SUPABASE_URL"]
$script:ServiceRoleKey = $envMap["SUPABASE_SERVICE_ROLE_KEY"]

if (-not $script:SupabaseUrl -or -not $script:ServiceRoleKey) {
  throw "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local."
}

$payload = Get-Content $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$userId = $TargetUserId

$existing = Invoke-SupabaseRest -Method Get -Path "/rest/v1/watch_entries?user_id=eq.$userId&select=id&limit=1"
if ($existing.Count -gt 0) {
  throw "User already has watch entries. Refusing to import duplicates."
}

$existingBatches = Invoke-SupabaseRest -Method Get -Path "/rest/v1/import_batches?user_id=eq.$userId&source_name=eq.$($payload.sourceName)&status=eq.parsed&select=id,created_at&order=created_at.desc&limit=1"
if ($existingBatches.Count -gt 0) {
  $batchId = $existingBatches[0].id
} else {
  $batch = Invoke-SupabaseRest -Method Post -Path "/rest/v1/import_batches?select=id" -Body @{
    user_id = $userId
    source_name = $payload.sourceName
    parsed_count = $payload.entries.Count
    warning_count = $payload.warnings.Count
    warnings = @($payload.warnings)
  }
  $batchId = $batch[0].id
}

$movieRows = @($payload.movies | ForEach-Object {
  @{
    user_id = $userId
    display_title = $_.displayTitle
    normalized_title = $_.normalizedTitle
    match_status = "unmatched"
  }
})

foreach ($chunk in Chunk-Array -Items $movieRows -Size 500) {
  Invoke-SupabaseRest `
    -Method Post `
    -Path "/rest/v1/movies?on_conflict=user_id,normalized_title" `
    -Body $chunk `
    -ExtraHeaders @("Prefer: resolution=merge-duplicates,return=minimal") | Out-Null
}

$movieIdByTitle = @{}
$offset = 0
$pageSize = 1000
while ($true) {
  $end = $offset + $pageSize - 1
  $movies = Invoke-SupabaseRest `
    -Method Get `
    -Path "/rest/v1/movies?user_id=eq.$userId&select=id,normalized_title&order=normalized_title.asc" `
    -ExtraHeaders @("Range: $offset-$end")

  foreach ($movie in $movies) {
    $movieIdByTitle[$movie.normalized_title] = $movie.id
  }

  if ($movies.Count -lt $pageSize) {
    break
  }

  $offset += $pageSize
}

$watchCounts = @{}
$watchRows = @($payload.entries | ForEach-Object {
  $movieId = $movieIdByTitle[$_.normalizedTitle]
  if (-not $movieId) {
    throw "Missing movie id for $($_.sourceTitle)."
  }

  $prior = 0
  if ($watchCounts.ContainsKey($movieId)) {
    $prior = $watchCounts[$movieId]
  }
  $watchCounts[$movieId] = $prior + 1

  @{
    user_id = $userId
    movie_id = $movieId
    watched_on = $_.watchedOn
    source_title = $_.sourceTitle
    source_sheet = $_.sheet
    source_row = $_.row
    source_slot = $_.slot
    import_batch_id = $batchId
    is_rewatch = ($prior -gt 0)
  }
})

foreach ($chunk in Chunk-Array -Items $watchRows -Size 500) {
  Invoke-SupabaseRest `
    -Method Post `
    -Path "/rest/v1/watch_entries" `
    -Body $chunk `
    -ExtraHeaders @("Prefer: return=minimal") | Out-Null
}

Invoke-SupabaseRest -Method Patch -Path "/rest/v1/import_batches?id=eq.$batchId" -Body @{
  status = "committed"
  committed_count = $watchRows.Count
  committed_at = (Get-Date).ToUniversalTime().ToString("o")
} -ExtraHeaders @("Prefer: return=minimal") | Out-Null

[PSCustomObject]@{
  ImportedFor = $TargetEmail
  UserId = $userId
  ImportBatchId = $batchId
  UniqueMovies = $movieRows.Count
  WatchEntries = $watchRows.Count
  Warnings = $payload.warnings.Count
} | ConvertTo-Json -Depth 5
