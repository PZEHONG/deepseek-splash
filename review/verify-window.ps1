param([ValidateSet('Intro','Application')][string]$Mode = 'Intro')
$ErrorActionPreference = 'Stop'
$env:TEMP = 'D:\deepseek开屏\temp'
$env:TMP = $env:TEMP
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HarnessWindowCheck {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int metric);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
}
'@
[HarnessWindowCheck]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$width = [HarnessWindowCheck]::GetSystemMetrics(0)
$height = [HarnessWindowCheck]::GetSystemMetrics(1)
if ($Mode -eq 'Intro') {
  $shown = $false
  for ($attempt = 0; $attempt -lt 100; $attempt++) {
    try {
      $events = (Get-Content -Raw -LiteralPath 'D:\deepseek开屏\review\native-timing.json' | ConvertFrom-Json).events
      $shown = @($events | Where-Object name -eq 'intro-shown').Count -gt 0
      if ($shown) { break }
    } catch {}
    Start-Sleep -Milliseconds 100
  }
  if (!$shown) { throw 'No visible intro was recorded' }
  Start-Sleep -Milliseconds 350
  $handle = [HarnessWindowCheck]::GetForegroundWindow()
  [uint32]$windowProcessId = 0
  [HarnessWindowCheck]::GetWindowThreadProcessId($handle, [ref]$windowProcessId) | Out-Null
  if ((Get-Process -Id $windowProcessId).ProcessName -ne 'DeepSeek Harness') { throw 'The foreground window is not the intro' }
  $rect = New-Object HarnessWindowCheck+Rect
  [HarnessWindowCheck]::GetWindowRect($handle, [ref]$rect) | Out-Null
  $clientRect = New-Object HarnessWindowCheck+Rect
  [HarnessWindowCheck]::GetClientRect($handle, [ref]$clientRect) | Out-Null
  $introEvent = $events | Where-Object name -eq 'intro-shown' | Select-Object -First 1
  $expectedWidth = [Math]::Round($introEvent.expectedBounds.width * $introEvent.scaleFactor)
  $expectedHeight = [Math]::Round($introEvent.expectedBounds.height * $introEvent.scaleFactor)
  $ordinaryWindow = ![HarnessWindowCheck]::IsZoomed($handle) -and [Math]::Abs(($clientRect.Right - $clientRect.Left) - $expectedWidth) -le 2 -and [Math]::Abs(($clientRect.Bottom - $clientRect.Top) - $expectedHeight) -le 2
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size)
    $bitmap.Save('D:\deepseek开屏\review\native-windowed-desktop.png', [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
  $result = @{ ok=$ordinaryWindow; screen=@{width=$width;height=$height}; window=$rect; client=$clientRect; expectedPixels=@{width=$expectedWidth;height=$expectedHeight}; mode=$Mode }
  $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'D:\deepseek开屏\review\native-screen-geometry.json' -Encoding UTF8
  if (!$ordinaryWindow) { throw 'The intro did not restore its initial window size' }
} else {
  $process = Get-Process -Name 'DeepSeek Harness' | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (!$process) { throw 'Application window was not found' }
  $handle = $process.MainWindowHandle
  $maximizedBefore = [HarnessWindowCheck]::IsZoomed($handle)
  $initialRect = New-Object HarnessWindowCheck+Rect
  [HarnessWindowCheck]::GetWindowRect($handle, [ref]$initialRect) | Out-Null
  [HarnessWindowCheck]::SendMessage($handle, 0x112, [IntPtr]0xF030, [IntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 350
  $maximizedDuring = [HarnessWindowCheck]::IsZoomed($handle)
  [HarnessWindowCheck]::SendMessage($handle, 0x112, [IntPtr]0xF120, [IntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 350
  $restored = ![HarnessWindowCheck]::IsZoomed($handle)
  $restoredRect = New-Object HarnessWindowCheck+Rect
  [HarnessWindowCheck]::GetWindowRect($handle, [ref]$restoredRect) | Out-Null
  $result = @{ok=(!$maximizedBefore -and $maximizedDuring -and $restored);maximizedBefore=$maximizedBefore;initialRect=$initialRect;maximizedDuring=$maximizedDuring;restored=$restored;restoredRect=$restoredRect;mode=$Mode}
  $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'D:\deepseek开屏\review\native-restore-result.json' -Encoding UTF8
  if (!$result.ok) { throw 'Native maximize/restore verification failed' }
}
$result | ConvertTo-Json -Depth 6
