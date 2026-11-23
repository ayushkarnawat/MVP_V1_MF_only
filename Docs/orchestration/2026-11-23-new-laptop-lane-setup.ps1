# Recreates the M3 round 1 lanes on a new laptop (23 Nov 2026).
#
# Run in PowerShell from anywhere, after the repository is cloned and `git fetch origin` works:
#   powershell -ExecutionPolicy Bypass -File "D:\Unifolio code\Docs\orchestration\2026-11-23-new-laptop-lane-setup.ps1"
# Optional parameters: -Repo "D:\Unifolio code" -WorktreeRoot "D:\" -CloneRoot "C:\Users\<you>"
#
# What it does (idempotent: it skips anything that already exists, and it never pushes, resets or deletes):
#   1. fetches origin;
#   2. creates the four lane worktrees for the two Codex tasks and the Antigravity bases:
#        <WorktreeRoot>\unifolio-k-search (batch/k-search)  <WorktreeRoot>\unifolio-k-be (batch/k-be)
#        <WorktreeRoot>\unifolio-e-dates  (batch/e-dates)   <WorktreeRoot>\unifolio-f-nav (batch/f-nav)
#   3. merges origin/leapswitch-redesign into each of those branches (LOCAL merge, so every packet and handoff is in the
#      workers' trees; nothing is pushed);
#   4. creates the four Antigravity clones from those worktrees, each on its own new branch:
#        ag-k1 (ag/k1-search)  ag-k2 (ag/k2-search)  ag-e3 (ag/ag-e3)  ag-f34 (ag/ag-f34)
#   5. prints the two environment variables the front-end check script needs and the exact paths the six prompts use.
param(
    [string]$Repo = "D:\Unifolio code",
    [string]$WorktreeRoot = "D:\",
    [string]$CloneRoot = $env:USERPROFILE
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param([string]$Dir, [string[]]$GitArgs)
    & git -C $Dir @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') failed in $Dir" }
}

if (-not (Test-Path (Join-Path $Repo ".git"))) { throw "Not a git repository: $Repo" }
Invoke-Git $Repo @("fetch", "origin")

$worktrees = @(
    @{ Name = "unifolio-k-search"; Branch = "batch/k-search" },
    @{ Name = "unifolio-k-be";     Branch = "batch/k-be" },
    @{ Name = "unifolio-e-dates";  Branch = "batch/e-dates" },
    @{ Name = "unifolio-f-nav";    Branch = "batch/f-nav" }
)
foreach ($w in $worktrees) {
    $path = Join-Path $WorktreeRoot $w.Name
    if (Test-Path $path) {
        Write-Host "worktree exists, kept: $path"
    } else {
        Invoke-Git $Repo @("worktree", "add", "-B", $w.Branch, $path, "origin/$($w.Branch)")
        Write-Host "worktree created: $path ($($w.Branch))"
    }
    # The packets and handoffs live on leapswitch-redesign; bring them into the lane (local merge only).
    Invoke-Git $path @("merge", "--no-edit", "origin/leapswitch-redesign")
}

$clones = @(
    @{ Name = "ag-k1";  From = "unifolio-k-search"; Branch = "ag/k1-search" },
    @{ Name = "ag-k2";  From = "unifolio-k-search"; Branch = "ag/k2-search" },
    @{ Name = "ag-e3";  From = "unifolio-e-dates";  Branch = "ag/ag-e3" },
    @{ Name = "ag-f34"; From = "unifolio-f-nav";    Branch = "ag/ag-f34" }
)
foreach ($c in $clones) {
    $dest = Join-Path $CloneRoot $c.Name
    if (Test-Path $dest) {
        Write-Host "clone exists, kept: $dest"
        continue
    }
    $source = Join-Path $WorktreeRoot $c.From
    & git clone --quiet $source $dest
    if ($LASTEXITCODE -ne 0) { throw "git clone $source failed" }
    Invoke-Git $dest @("checkout", "-b", $c.Branch)
    Write-Host "clone created: $dest ($($c.Branch))"
}

function ConvertTo-WslPath([string]$p) {
    $full = (Resolve-Path $p).Path
    $drive = $full.Substring(0, 1).ToLower()
    return "/mnt/$drive" + ($full.Substring(2) -replace "\\", "/")
}
$wtWsl = ConvertTo-WslPath $WorktreeRoot
$agWsl = ConvertTo-WslPath $CloneRoot
if ($wtWsl.EndsWith("/")) { $wtWsl = $wtWsl.TrimEnd("/") }

Write-Host ""
Write-Host "Done. For the front-end check script (wave-fe-check.sh) run this in WSL before using it, or put it in ~/.bashrc:"
Write-Host "  export UNIFOLIO_WT_ROOT=$wtWsl"
Write-Host "  export UNIFOLIO_AG_ROOT=$agWsl"
Write-Host ""
Write-Host "Paths the six prompts must name on this laptop:"
foreach ($c in $clones) { Write-Host ("  Antigravity: " + (Join-Path $CloneRoot $c.Name) + "  branch " + $c.Branch) }
Write-Host ("  Codex search-be-1: " + (Join-Path $WorktreeRoot "unifolio-k-be") + "  branch batch/k-be")
Write-Host ("  Codex F-5:         " + (Join-Path $WorktreeRoot "unifolio-f-nav") + "  branch batch/f-nav")
Write-Host "If these differ from the paths written in the packets (D:\unifolio-* and C:\Users\Ayush\ag-*), edit them in the prompt text you paste."
