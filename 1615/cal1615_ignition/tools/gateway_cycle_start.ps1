# Starts tools/gateway_cycle.sh as a hidden process that keeps running after the terminal that started it closes. It is created through
# the Windows process service (WMI), so it does not belong to the caller's job and is not killed with it.
#   powershell -NoProfile -ExecutionPolicy Bypass -File gateway_cycle_start.ps1 [--interval 90] [--cycles 5] [--first-now]
# Progress: tools/logs/gateway_cycle.log.  Stop it: create the file tools/logs/STOP.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$bash = "C:\Program Files\Git\usr\bin\bash.exe"
$argsText = ($args -join " ")
$dir = $here -replace "\\", "/"
New-Item -ItemType Directory -Force -Path (Join-Path $here "logs") | Out-Null
Remove-Item -ErrorAction SilentlyContinue (Join-Path $here "logs\STOP")
$inner = "cd '$dir' && ./gateway_cycle.sh $argsText >> logs/gateway_cycle.out 2>&1"
$cmdline = "`"$bash`" -lc `"$inner`""
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmdline; CurrentDirectory = $here }
Write-Output ("return code " + $r.ReturnValue + ", process id " + $r.ProcessId)
