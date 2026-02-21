# Roo Code /speckit Diagnostic Script
param(
    [string]$ProjectPath = "C:\Users\Hello\OneDrive\Desktop\Tenacious-Projects\project-chimera-production"
)

Write-Host "=== Roo Code /speckit Diagnostic ===" -ForegroundColor Cyan
Write-Host "Project Path: $ProjectPath" -ForegroundColor Gray
Write-Host ""

# 1. Check experiment flag
Write-Host "1. Checking experiment flag..." -ForegroundColor Yellow
$settingsPath = "$env:APPDATA\Code\User\settings.json"
$experimentEnabled = $false

if (Test-Path $settingsPath) {
    $settingsContent = Get-Content $settingsPath -Raw -ErrorAction SilentlyContinue
    if ($null -ne $settingsContent) {
        if ($settingsContent -match '"rooCode"\s*:\s*\{[^}]*"experiments"\s*:\s*\{[^}]*"runSlashCommand"\s*:\s*true') {
            Write-Host "  [OK] Experiment flag is ENABLED" -ForegroundColor Green
            $experimentEnabled = $true
        } elseif ($settingsContent -match '"rooCode"\s*:\s*\{[^}]*"experiments"\s*:\s*\{[^}]*"runSlashCommand"\s*:\s*false') {
            Write-Host "  [FAIL] Experiment flag is DISABLED" -ForegroundColor Red
            Write-Host "    Fix: Enable 'Run Slash Command' in VS Code settings" -ForegroundColor Yellow
        } else {
            Write-Host "  [WARN] Experiment flag not set (defaults to disabled)" -ForegroundColor Yellow
            Write-Host "    Fix: Add 'rooCode.experiments.runSlashCommand: true' to settings.json" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  [WARN] Settings file not found" -ForegroundColor Yellow
}

# 2. Check command file
Write-Host ""
Write-Host "2. Checking command file..." -ForegroundColor Yellow
$commandPath = Join-Path $ProjectPath ".roo\commands\speckit.constitution.md"
if (Test-Path $commandPath) {
    Write-Host "  [OK] Command file EXISTS" -ForegroundColor Green
    Write-Host "    Location: $commandPath" -ForegroundColor Gray
} else {
    Write-Host "  [FAIL] Command file MISSING" -ForegroundColor Red
    Write-Host "    Expected: $commandPath" -ForegroundColor Yellow
}

# 3. Check intent file
Write-Host ""
Write-Host "3. Checking intent file..." -ForegroundColor Yellow
$intentPath = Join-Path $ProjectPath ".orchestration\active_intents.yaml"
if (Test-Path $intentPath) {
    Write-Host "  [OK] Intent file EXISTS" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Intent file MISSING" -ForegroundColor Red
    Write-Host "    Expected: $intentPath" -ForegroundColor Yellow
}

# 4. List available commands
Write-Host ""
Write-Host "4. Available commands:" -ForegroundColor Yellow
$commandsDir = Join-Path $ProjectPath ".roo\commands"
if (Test-Path $commandsDir) {
    $commands = Get-ChildItem "$commandsDir\*.md" -ErrorAction SilentlyContinue
    if ($commands) {
        $commands | ForEach-Object { 
            Write-Host "    [OK] $($_.Name -replace '\.md$', '')" -ForegroundColor Green
        }
    } else {
        Write-Host "    (no .md files found)" -ForegroundColor Gray
    }
} else {
    Write-Host "    (commands directory doesn't exist)" -ForegroundColor Gray
}

# 5. Summary
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
$issues = @()
if (-not $experimentEnabled) {
    $issues += "Experiment flag not enabled"
}
if (-not (Test-Path $commandPath)) {
    $issues += "Command file missing"
}
if (-not (Test-Path $intentPath)) {
    $issues += "Intent file missing"
}

if ($issues.Count -eq 0) {
    Write-Host "[SUCCESS] All checks passed!" -ForegroundColor Green
} else {
    Write-Host "[FAILED] Found $($issues.Count) issue(s):" -ForegroundColor Red
    $issues | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Quick fixes:" -ForegroundColor Yellow
    Write-Host "  1. Enable experiment: Settings -> Search 'Roo Code Experimental' -> Enable 'Run Slash Command'" -ForegroundColor White
    Write-Host "  2. Create: .roo\commands\speckit.constitution.md" -ForegroundColor White
    Write-Host "  3. Create: .orchestration\active_intents.yaml" -ForegroundColor White
}

Write-Host ""
Write-Host "=== Complete ===" -ForegroundColor Cyan
