param(
  [string]$TargetUserId = "774a8303-fbcf-43d2-b2c0-341c8416241c",
  [string]$MovieId = "",
  [int]$MaxMovies = 50,
  [decimal]$AcceptScore = 90,
  [int]$DelayMs = 250,
  [switch]$DryRun
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

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Url,
    [string[]]$Headers = @(),
    $Body = $null
  )

  $bodyFile = $null
  $methodName = $Method.ToUpperInvariant()

  try {
    $args = @(
      "-sS",
      "--globoff",
      "-X", $methodName,
      "--url", $Url
    )

    foreach ($header in $Headers) {
      $args += @("-H", $header)
    }

    if ($null -ne $Body) {
      $bodyFile = [System.IO.Path]::GetTempFileName()
      $utf8NoBom = New-Object System.Text.UTF8Encoding $false
      [System.IO.File]::WriteAllText(
        $bodyFile,
        ($Body | ConvertTo-Json -Depth 50 -Compress),
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
      throw "$methodName $Url failed with HTTP $status`: $content"
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

function Invoke-SupabaseRest {
  param(
    [string]$Method,
    [string]$Path,
    $Body = $null,
    [string[]]$ExtraHeaders = @()
  )

  $headers = @(
    "apikey: $script:ServiceRoleKey",
    "Authorization: Bearer $script:ServiceRoleKey",
    "Content-Type: application/json",
    "Prefer: return=representation"
  ) + $ExtraHeaders

  return Invoke-JsonRequest -Method $Method -Url "$script:SupabaseUrl$Path" -Headers $headers -Body $Body
}

function Invoke-Tmdb {
  param([string]$Path)

  return Invoke-JsonRequest `
    -Method Get `
    -Url "https://api.themoviedb.org/3$Path" `
    -Headers @("Authorization: Bearer $script:TmdbAccessToken", "accept: application/json")
}

function Normalize-Title {
  param([string]$Title)
  if ($null -eq $Title) {
    return ""
  }

  return $Title.Normalize([Text.NormalizationForm]::FormKC).Trim().ToLowerInvariant()
}

function Compact-Title {
  param([string]$Title)
  return (Normalize-Title $Title) -replace "[^a-z0-9\u3400-\u9fff]+", ""
}

function Get-Levenshtein {
  param([string]$A, [string]$B)

  $n = $A.Length
  $m = $B.Length
  $d = New-Object 'int[,]' ($n + 1), ($m + 1)

  for ($i = 0; $i -le $n; $i++) { $d[$i, 0] = $i }
  for ($j = 0; $j -le $m; $j++) { $d[0, $j] = $j }

  for ($i = 1; $i -le $n; $i++) {
    for ($j = 1; $j -le $m; $j++) {
      $cost = if ($A[($i - 1)] -eq $B[($j - 1)]) { 0 } else { 1 }
      $delete = $d[($i - 1), $j] + 1
      $insert = $d[$i, ($j - 1)] + 1
      $replace = $d[($i - 1), ($j - 1)] + $cost
      $d[$i, $j] = [Math]::Min([Math]::Min($delete, $insert), $replace)
    }
  }

  return $d[$n, $m]
}

function Get-TitleScore {
  param([string]$InputTitle, [string]$CandidateTitle)

  $a = Compact-Title $InputTitle
  $b = Compact-Title $CandidateTitle

  if (-not $a -or -not $b) {
    return 0
  }
  if ($a -eq $b) {
    return 100
  }

  $maxLength = [Math]::Max($a.Length, $b.Length)
  $distance = Get-Levenshtein $a $b
  $baseScore = [Math]::Max(0, (1 - ($distance / $maxLength)) * 100)

  if ($a.Contains($b) -or $b.Contains($a)) {
    $baseScore = [Math]::Max($baseScore, 82)
  }

  return [Math]::Round($baseScore, 2)
}

function Test-AutoAcceptableMatch {
  param(
    [string]$InputTitle,
    $Candidate,
    [decimal]$MinimumScore
  )

  $inputCompact = Compact-Title $InputTitle
  $titleCompact = Compact-Title $Candidate.title
  $originalCompact = Compact-Title $Candidate.original_title

  if ($Candidate.score -lt $MinimumScore) {
    return $false
  }

  if ($inputCompact.Length -lt 4) {
    return $inputCompact.Length -gt 1 -and ($inputCompact -eq $titleCompact -or $inputCompact -eq $originalCompact)
  }

  return $true
}

function Get-SearchCandidates {
  param([string]$Title)

  $encodedTitle = [System.Uri]::EscapeDataString($Title)
  $languages = @("en-US", "zh-HK", "zh-CN")
  $byId = @{}

  foreach ($language in $languages) {
    $result = Invoke-Tmdb "/search/movie?query=$encodedTitle&include_adult=false&language=$language"
    foreach ($candidate in @($result.results)) {
      if (-not $byId.ContainsKey([string]$candidate.id)) {
        $byId[[string]$candidate.id] = $candidate
      }
    }
  }

  $scored = @()
  foreach ($candidate in $byId.Values) {
    $score = [Math]::Max(
      (Get-TitleScore $Title $candidate.title),
      (Get-TitleScore $Title $candidate.original_title)
    )
    $voteCount = if ($candidate.vote_count) { [double]$candidate.vote_count } else { 0 }
    $popularityBoost = [Math]::Min(8, [Math]::Log10($voteCount + 1) * 2)

    $scored += [PSCustomObject]@{
      id = [int64]$candidate.id
      title = $candidate.title
      original_title = $candidate.original_title
      release_date = if ($candidate.release_date) { $candidate.release_date } else { $null }
      poster_path = if ($candidate.poster_path) { $candidate.poster_path } else { $null }
      original_language = if ($candidate.original_language) { $candidate.original_language } else { $null }
      overview = if ($candidate.overview) { $candidate.overview } else { $null }
      score = [Math]::Min(100, [Math]::Round($score + $popularityBoost, 2))
      vote_count = if ($candidate.vote_count) { [int64]$candidate.vote_count } else { 0 }
      popularity = if ($candidate.popularity) { [double]$candidate.popularity } else { 0 }
      payload = $candidate
    }
  }

  return @($scored | Sort-Object -Property @{ Expression = "score"; Descending = $true }, @{ Expression = "vote_count"; Descending = $true }, @{ Expression = "popularity"; Descending = $true } | Select-Object -First 8)
}

function Get-MovieDetails {
  param([int64]$TmdbId)

  $details = Invoke-Tmdb "/movie/$TmdbId`?language=en-US&append_to_response=credits"
  $directors = @($details.credits.crew | Where-Object { $_.job -eq "Director" } | ForEach-Object {
    [PSCustomObject]@{ id = $_.id; name = $_.name }
  })
  $cast = @($details.credits.cast | Sort-Object -Property order | Select-Object -First 10 | ForEach-Object {
    [PSCustomObject]@{ id = $_.id; name = $_.name; character = if ($_.character) { $_.character } else { $null } }
  })

  return [PSCustomObject]@{
    tmdb_id = [int64]$details.id
    english_title = $details.title
    original_title = $details.original_title
    tmdb_poster_path = if ($details.poster_path) { $details.poster_path } else { $null }
    tmdb_backdrop_path = if ($details.backdrop_path) { $details.backdrop_path } else { $null }
    overview = if ($details.overview) { $details.overview } else { $null }
    release_date = if ($details.release_date) { $details.release_date } else { $null }
    runtime_minutes = if ($details.runtime) { [int]$details.runtime } else { $null }
    original_language = if ($details.original_language) { $details.original_language } else { $null }
    genres = @($details.genres)
    directors = $directors
    cast_members = $cast
  }
}

$envMap = Read-EnvFile
$script:SupabaseUrl = $envMap["NEXT_PUBLIC_SUPABASE_URL"]
$script:ServiceRoleKey = $envMap["SUPABASE_SERVICE_ROLE_KEY"]
$script:TmdbAccessToken = $envMap["TMDB_ACCESS_TOKEN"]

if (-not $script:SupabaseUrl -or -not $script:ServiceRoleKey) {
  throw "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local."
}
if (-not $script:TmdbAccessToken) {
  throw "Missing TMDB_ACCESS_TOKEN in .env.local."
}

$select = "id,display_title,original_title,match_status,tmdb_id,tmdb_poster_path"
if ($MovieId) {
  $movies = Invoke-SupabaseRest -Method Get -Path "/rest/v1/movies?id=eq.$MovieId&user_id=eq.$TargetUserId&select=$select"
} else {
  $movies = Invoke-SupabaseRest -Method Get -Path "/rest/v1/movies?user_id=eq.$TargetUserId&match_status=eq.unmatched&select=$select&order=created_at.asc&limit=$MaxMovies"
}

$processed = 0
$accepted = 0
$suggested = 0
$noMatch = 0
$errors = @()
$samples = @()

foreach ($movie in @($movies)) {
  $processed += 1

  try {
    $candidates = Get-SearchCandidates $movie.display_title

    if ($candidates.Count -eq 0) {
      $noMatch += 1
      if (-not $DryRun) {
        Invoke-SupabaseRest `
          -Method Patch `
          -Path "/rest/v1/movies?id=eq.$($movie.id)&user_id=eq.$TargetUserId" `
          -Body @{
            match_status = "rejected"
            match_confidence = $null
          } `
          -ExtraHeaders @("Prefer: return=minimal") | Out-Null
      }
      $samples += [PSCustomObject]@{ title = $movie.display_title; status = "no-match"; score = $null; tmdb_title = $null }
      continue
    }

    $best = $candidates[0]
    $candidateRows = @($candidates | ForEach-Object {
      [PSCustomObject]@{
        user_id = $TargetUserId
        movie_id = $movie.id
        tmdb_id = $_.id
        title = $_.title
        original_title = $_.original_title
        release_date = $_.release_date
        poster_path = $_.poster_path
        original_language = $_.original_language
        score = $_.score
        accepted = $false
        payload = $_.payload
      }
    })

    if (-not $DryRun) {
      Invoke-SupabaseRest `
        -Method Post `
        -Path "/rest/v1/movie_match_candidates?on_conflict=movie_id,tmdb_id" `
        -Body $candidateRows `
        -ExtraHeaders @("Prefer: resolution=merge-duplicates,return=minimal") | Out-Null
    }

    if (Test-AutoAcceptableMatch $movie.display_title $best $AcceptScore) {
      $details = Get-MovieDetails $best.id
      $accepted += 1

      if (-not $DryRun) {
        Invoke-SupabaseRest `
          -Method Patch `
          -Path "/rest/v1/movies?id=eq.$($movie.id)&user_id=eq.$TargetUserId" `
          -Body @{
            english_title = $details.english_title
            original_title = $details.original_title
            tmdb_id = $details.tmdb_id
            tmdb_poster_path = $details.tmdb_poster_path
            tmdb_backdrop_path = $details.tmdb_backdrop_path
            overview = $details.overview
            release_date = $details.release_date
            runtime_minutes = $details.runtime_minutes
            original_language = $details.original_language
            genres = $details.genres
            directors = $details.directors
            cast_members = $details.cast_members
            match_status = "accepted"
            match_confidence = $best.score
          } `
          -ExtraHeaders @("Prefer: return=minimal") | Out-Null

        Invoke-SupabaseRest `
          -Method Patch `
          -Path "/rest/v1/movie_match_candidates?movie_id=eq.$($movie.id)&tmdb_id=eq.$($best.id)" `
          -Body @{ accepted = $true; payload = $details } `
          -ExtraHeaders @("Prefer: return=minimal") | Out-Null
      }

      $samples += [PSCustomObject]@{
        title = $movie.display_title
        status = "accepted"
        score = $best.score
        tmdb_title = $details.english_title
      }
    } else {
      $suggested += 1

      if (-not $DryRun) {
        Invoke-SupabaseRest `
          -Method Patch `
          -Path "/rest/v1/movies?id=eq.$($movie.id)&user_id=eq.$TargetUserId" `
          -Body @{
            english_title = $null
            original_title = $null
            tmdb_id = $null
            tmdb_poster_path = $null
            tmdb_backdrop_path = $null
            overview = $null
            release_date = $null
            runtime_minutes = $null
            original_language = $null
            genres = @()
            directors = @()
            cast_members = @()
            match_status = "suggested"
            match_confidence = $best.score
          } `
          -ExtraHeaders @("Prefer: return=minimal") | Out-Null
      }

      $samples += [PSCustomObject]@{
        title = $movie.display_title
        status = "suggested"
        score = $best.score
        tmdb_title = $best.title
      }
    }
  } catch {
    $errors += [PSCustomObject]@{ title = $movie.display_title; error = $_.Exception.Message }
  }

  if ($DelayMs -gt 0) {
    Start-Sleep -Milliseconds $DelayMs
  }
}

[PSCustomObject]@{
  mode = if ($DryRun) { "dry-run" } else { "apply" }
  processed = $processed
  accepted = $accepted
  suggested = $suggested
  no_match = $noMatch
  errors = $errors.Count
  sample_results = @($samples | Select-Object -First 12)
  sample_errors = @($errors | Select-Object -First 5)
} | ConvertTo-Json -Depth 12
