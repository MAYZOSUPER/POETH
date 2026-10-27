# Помощник автопроверки оверлея (check-overlay.mjs): узнать заголовок окна на переднем
# плане и вывести нужное окно вперёд (AttachThreadInput — иначе Windows не отдаёт фокус
# окну фонового процесса). Команды построчно в stdin, ответ — одна строка в stdout:
#   fg                 → заголовок окна на переднем плане
#   activate <title>   → ok | notfound | fail (окно с точным заголовком)
#   cursor             → x,y курсора (физические пиксели)
#   click <x> <y>      → переместить курсор и кликнуть левой кнопкой
#   move <x> <y>       → переместить курсор
#   shot <x> <y> <w> <h> <file.png> → снимок области экрана (физические пиксели)
#   idle               → сколько мс не было ввода с клавиатуры/мыши (за ПК кто-то работает?)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint IdleMs() { var li = new LASTINPUTINFO(); li.cbSize = (uint)Marshal.SizeOf(li); GetLastInputInfo(ref li); return unchecked((uint)Environment.TickCount - li.dwTime); }
  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }
  public static string Activate(string title) {
    IntPtr h = FindWindow(null, title);
    if (h == IntPtr.Zero) return "notfound";
    uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint me = GetCurrentThreadId();
    AttachThreadInput(me, fgThread, true);
    ShowWindow(h, 9);
    BringWindowToTop(h);
    SetForegroundWindow(h);
    AttachThreadInput(me, fgThread, false);
    return GetForegroundWindow() == h ? "ok" : "fail";
  }
}
'@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$stdin = [Console]::In
while ($true) {
  $line = $stdin.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Split(' ', 2)
  switch ($parts[0]) {
    'fg' { [Console]::Out.WriteLine([Fg]::Title([Fg]::GetForegroundWindow())) }
    'idle' { [Console]::Out.WriteLine([Fg]::IdleMs()) }
    'activate' { [Console]::Out.WriteLine([Fg]::Activate($parts[1])) }
    'cursor' { $p = New-Object Fg+POINT; [void][Fg]::GetCursorPos([ref]$p); [Console]::Out.WriteLine("$($p.X),$($p.Y)") }
    'move' { $xy = $parts[1].Split(' '); [void][Fg]::SetCursorPos([int]$xy[0], [int]$xy[1]); [Console]::Out.WriteLine('ok') }
    'click' {
      $xy = $parts[1].Split(' ')
      [void][Fg]::SetCursorPos([int]$xy[0], [int]$xy[1])
      Start-Sleep -Milliseconds 250
      [Fg]::mouse_event(2, 0, 0, 0, 0); Start-Sleep -Milliseconds 40; [Fg]::mouse_event(4, 0, 0, 0, 0)
      [Console]::Out.WriteLine('ok')
    }
    'shot' {
      $a = $parts[1].Split(' ', 5)
      $bmp = New-Object System.Drawing.Bitmap ([int]$a[2]), ([int]$a[3])
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen([int]$a[0], [int]$a[1], 0, 0, $bmp.Size)
      $bmp.Save($a[4], [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
      [Console]::Out.WriteLine('ok')
    }
    default { [Console]::Out.WriteLine('?') }
  }
  [Console]::Out.Flush()
}
