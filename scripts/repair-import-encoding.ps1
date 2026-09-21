param(
  [string]$PayloadPath = "tmp-workbook-import.json",
  [string]$TargetUserId = "774a8303-fbcf-43d2-b2c0-341c8416241c",
  [switch]$Apply
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

function Get-AllRows {
  param(
    [string]$Path,
    [int]$PageSize = 1000
  )

  $rows = @()
  $offset = 0

  while ($true) {
    $end = $offset + $PageSize - 1
    $page = Invoke-SupabaseRest -Method Get -Path $Path -ExtraHeaders @("Range: $offset-$end")
    $rows += @($page)

    if (@($page).Count -lt $PageSize) {
      break
    }

    $offset += $PageSize
  }

  return $rows
}

function Entry-Key {
  param($Sheet, $Row, $Slot)
  return "$Sheet|$Row|$Slot"
}

$envMap = Read-EnvFile
$script:SupabaseUrl = $envMap["NEXT_PUBLIC_SUPABASE_URL"]
$script:ServiceRoleKey = $envMap["SUPABASE_SERVICE_ROLE_KEY"]

if (-not $script:SupabaseUrl -or -not $script:ServiceRoleKey) {
  throw "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local."
}

$payload = Get-Content $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cleanByKey = @{}

foreach ($entry in $payload.entries) {
  $cleanByKey[(Entry-Key $entry.sheet $entry.row $entry.slot)] = $entry
}

$watchEntries = Get-AllRows -Path "/rest/v1/watch_entries?user_id=eq.$TargetUserId&select=id,movie_id,source_sheet,source_row,source_slot,source_title&order=source_sheet.asc,source_row.asc,source_slot.asc"
$movies = Get-AllRows -Path "/rest/v1/movies?user_id=eq.$TargetUserId&select=id,display_title,normalized_title&order=display_title.asc"

$watchRepairs = @()
$desiredMovieById = @{}
$movieConflicts = @()

foreach ($row in $watchEntries) {
  $key = Entry-Key $row.source_sheet $row.source_row $row.source_slot
  $clean = $cleanByKey[$key]

  if ($null -eq $clean) {
    continue
  }

  if ($row.source_title -ne $clean.sourceTitle) {
    $watchRepairs += [PSCustomObject]@{
      id = $row.id
      source_title = $clean.sourceTitle
    }
  }

  if (-not $desiredMovieById.ContainsKey($row.movie_id)) {
    $desiredMovieById[$row.movie_id] = [PSCustomObject]@{
      display_title = $clean.sourceTitle
      normalized_title = $clean.normalizedTitle
    }
  } elseif ($desiredMovieById[$row.movie_id].normalized_title -ne $clean.normalizedTitle) {
    $movieConflicts += [PSCustomObject]@{
      movie_id = $row.movie_id
      existing = $desiredMovieById[$row.movie_id].normalized_title
      incoming = $clean.normalizedTitle
      entry_key = $key
    }
  }
}

if ($movieConflicts.Count -gt 0) {
  $movieConflicts | Select-Object -First 10 | ConvertTo-Json -Depth 5
  throw "Found conflicting clean titles for the same movie id. Aborting repair."
}

$movieRepairs = @()
foreach ($movie in $movies) {
  $desired = $desiredMovieById[$movie.id]
  if ($null -eq $desired) {
    continue
  }

  if ($movie.display_title -ne $desired.display_title -or $movie.normalized_title -ne $desired.normalized_title) {
    $movieRepairs += [PSCustomObject]@{
      id = $movie.id
      display_title = $desired.display_title
      normalized_title = $desired.normalized_title
    }
  }
}

$summary = [PSCustomObject]@{
  mode = if ($Apply) { "apply" } else { "dry-run" }
  clean_entries = @($payload.entries).Count
  db_watch_entries = @($watchEntries).Count
  db_movies = @($movies).Count
  watch_entries_to_repair = @($watchRepairs).Count
  movies_to_repair = @($movieRepairs).Count
  sample_watch_repairs = @($watchRepairs | Select-Object -First 8)
  sample_movie_repairs = @($movieRepairs | Select-Object -First 8)
}

if (-not $Apply) {
  $summary | ConvertTo-Json -Depth 8
  exit 0
}

foreach ($repair in $watchRepairs) {
  Invoke-SupabaseRest `
    -Method Patch `
    -Path "/rest/v1/watch_entries?id=eq.$($repair.id)" `
    -Body @{ source_title = $repair.source_title } `
    -ExtraHeaders @("Prefer: return=minimal") | Out-Null
}

foreach ($repair in $movieRepairs) {
  Invoke-SupabaseRest `
    -Method Patch `
    -Path "/rest/v1/movies?id=eq.$($repair.id)" `
    -Body @{
      display_title = $repair.display_title
      normalized_title = $repair.normalized_title
    } `
    -ExtraHeaders @("Prefer: return=minimal") | Out-Null
}

$summary | ConvertTo-Json -Depth 8
