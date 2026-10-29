# Сторож автопроверок (check-overlay.mjs --abort-on-input): низкоуровневые хуки клавиатуры и мыши ловят первый
# НАСТОЯЩИЙ ввод человека — событие без флага injected (нажатия проверки идут через SendInput/uiohook и помечены
# injected). Печатает «ready», затем одну строку «REAL keyboard|mouse» и выходит. Какие клавиши нажаты, не смотрит
# и не пишет. Текст передаётся через -Command (политику выполнения .ps1 не трогаем), как foreground.ps1.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RealInput {
  delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int idHook, HookProc fn, IntPtr hMod, uint threadId);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int n, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string n);
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr h; public uint msg; public IntPtr w; public IntPtr l; public uint t; public int x; public int y; }
  [StructLayout(LayoutKind.Sequential)] struct KBD { public uint vk; public uint scan; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MS { public int x; public int y; public uint data; public uint flags; public uint time; public IntPtr extra; }
  const uint LLKHF_INJECTED = 0x10, LLMHF_INJECTED = 0x01;
  static HookProc kb, ms;
  static void Real(string kind) { Console.WriteLine("REAL " + kind); Console.Out.Flush(); Environment.Exit(0); }
  public static void Run() {
    IntPtr mod = GetModuleHandle(null);
    kb = (n, w, l) => { if (n >= 0 && (((KBD)Marshal.PtrToStructure(l, typeof(KBD))).flags & LLKHF_INJECTED) == 0) Real("keyboard"); return CallNextHookEx(IntPtr.Zero, n, w, l); };
    ms = (n, w, l) => { if (n >= 0 && (((MS)Marshal.PtrToStructure(l, typeof(MS))).flags & LLMHF_INJECTED) == 0) Real("mouse"); return CallNextHookEx(IntPtr.Zero, n, w, l); };
    SetWindowsHookEx(13, kb, mod, 0); // WH_KEYBOARD_LL
    SetWindowsHookEx(14, ms, mod, 0); // WH_MOUSE_LL
    Console.WriteLine("ready"); Console.Out.Flush();
    MSG m;
    while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
  }
}
'@
[RealInput]::Run()
