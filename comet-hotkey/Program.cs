using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

internal static class Program
{
    private const int WhKeyboardLl = 13;
    private const int WmKeyDown = 0x0100;
    private const int WmKeyUp = 0x0101;
    private const int WmSysKeyDown = 0x0104;
    private const int WmSysKeyUp = 0x0105;
    private const int VkControl = 0x11;
    private const int VkTab = 0x09;
    private const ushort VkQ = 0x51;
    private const uint KeyeventfKeyup = 0x0002;

    private static HookProc callback;
    private static IntPtr hook;
    private static bool tabIsDown;
    private static readonly string LogPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "CometTabHotkey.log");

    [STAThread]
    private static void Main()
    {
        bool firstInstance;
        using (var mutex = new Mutex(true, "Local\\CometTabHotkey", out firstInstance))
        {
            if (!firstInstance) return;
            Log("Starting");
            callback = KeyboardHook;
            using (var process = Process.GetCurrentProcess())
            using (var module = process.MainModule)
            {
                hook = SetWindowsHookEx(WhKeyboardLl, callback, GetModuleHandle(module.ModuleName), 0);
            }
            if (hook == IntPtr.Zero)
            {
                Log("SetWindowsHookEx failed: " + Marshal.GetLastWin32Error());
                return;
            }
            Log("Keyboard hook installed");

            try
            {
                Message message;
                while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0)
                {
                    TranslateMessage(ref message);
                    DispatchMessage(ref message);
                }
            }
            finally
            {
                UnhookWindowsHookEx(hook);
                Log("Stopped");
            }
        }
    }

    private static IntPtr KeyboardHook(int code, IntPtr wParam, IntPtr lParam)
    {
        try
        {
            if (code >= 0)
            {
                var data = Marshal.PtrToStructure<KbdLlHookStruct>(lParam);
                var message = wParam.ToInt32();
                var isDown = message == WmKeyDown || message == WmSysKeyDown;
                var isUp = message == WmKeyUp || message == WmSysKeyUp;

                if (data.vkCode == VkTab && (isDown || isUp) && IsControlDown() && IsCometForeground())
                {
                    if (isDown && !tabIsDown) { tabIsDown = true; SendQ(); }
                    else if (isUp) { tabIsDown = false; }
                    return (IntPtr)1;
                }

                if (data.vkCode == VkTab && isUp) tabIsDown = false;
            }
        }
        catch (Exception error) { Log("Hook error: " + error); }

        return CallNextHookEx(hook, code, wParam, lParam);
    }

    private static bool IsControlDown() { return (GetAsyncKeyState(VkControl) & 0x8000) != 0; }

    private static bool IsCometForeground()
    {
        var window = GetForegroundWindow();
        if (window == IntPtr.Zero) return false;
        uint processId;
        GetWindowThreadProcessId(window, out processId);
        try
        {
            using (var process = Process.GetProcessById((int)processId))
            {
                return process.ProcessName.Equals("comet", StringComparison.OrdinalIgnoreCase);
            }
        }
        catch { return false; }
    }

    private static void SendQ()
    {
        var inputs = new[]
        {
            new Input { type = 1, data = new InputUnion { keyboard = new KeyboardInput { virtualKey = VkQ } } },
            new Input { type = 1, data = new InputUnion { keyboard = new KeyboardInput { virtualKey = VkQ, flags = KeyeventfKeyup } } }
        };
        var sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
        if (sent != inputs.Length) Log("SendInput failed: " + Marshal.GetLastWin32Error());
    }

    private static void Log(string message)
    {
        try { File.AppendAllText(LogPath, DateTime.Now.ToString("s") + " " + message + Environment.NewLine); }
        catch { }
    }

    private delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] private struct KbdLlHookStruct { public int vkCode; public int scanCode; public int flags; public int time; public IntPtr extraInfo; }
    [StructLayout(LayoutKind.Sequential)] private struct Input { public uint type; public InputUnion data; }
    [StructLayout(LayoutKind.Explicit, Size = 32)] private struct InputUnion { [FieldOffset(0)] public KeyboardInput keyboard; }
    [StructLayout(LayoutKind.Sequential)] private struct KeyboardInput { public ushort virtualKey; public ushort scanCode; public uint flags; public uint time; public IntPtr extraInfo; }
    [StructLayout(LayoutKind.Sequential)] private struct Message { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }

    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int idHook, HookProc callback, IntPtr module, uint threadId);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string moduleName);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("user32.dll")] private static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref Message message);
}
