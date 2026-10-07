// plugins/computer-use —— 桌面操作插件（仅 Windows，L3 敏感操作）
// Node 不直接碰 GUI：全部通过 PowerShell 脚本桥接（System.Drawing 截图 / user32 鼠标键盘 / UIA 控件树）
// 使用守则：能走 API 就不走 GUI；UIA 文本定位优先于像素坐标；每步操作后截图验证。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { agentDataDir, resolveInWorkspace } from '../../core/paths.mjs';

function powershell(script) {
  return new Promise((resolve, reject) => {
    const file = path.join(os.tmpdir(), `mli-agent-dt-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
    fs.writeFileSync(file, '\uFEFF[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false\n' + script, 'utf8');
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
    let out = [], err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch {} }, 60000);
    child.on('error', error => { clearTimeout(timer); fs.unlink(file, () => {}); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.unlink(file, () => {});
      const stdout = Buffer.concat(out).toString('utf8').trim();
      const stderr = Buffer.concat(err).toString('utf8').trim();
      if (timedOut) reject(new Error('computer use 操作超时（60 秒）'));
      else if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `powershell 退出码 ${code}`));
    });
  });
}

const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;

const DPI = `[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();`;
const WINDOWS = `using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class DesktopWindow { public IntPtr Handle; public uint Pid; public string Title; }
public class W {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command);
  public static List<DesktopWindow> Visible() {
    var windows = new List<DesktopWindow>();
    EnumWindows((h, p) => { var text = new StringBuilder(4096); uint pid;
      if (IsWindowVisible(h) && GetWindowText(h, text, text.Capacity) > 0) {
        GetWindowThreadProcessId(h, out pid); windows.Add(new DesktopWindow { Handle=h, Pid=pid, Title=text.ToString() });
      } return true; }, IntPtr.Zero);
    return windows;
  }
}`;

const SCRIPTS = {
  screenshot: (out) => `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { ${DPI} }'
[W]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$bmp.Save(${psq(out)}, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ('OK ' + $b.Width + 'x' + $b.Height)`,

  list_windows: () => `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition ${psq(WINDOWS)}
[W]::Visible() | ForEach-Object {
  $process = Get-Process -Id $_.Pid -ErrorAction SilentlyContinue
  '{0}|{1}|{2}' -f $_.Pid, $process.ProcessName, $_.Title.Replace('|','/')
}`,

  focus_window: (title, pid) => `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition ${psq(WINDOWS)}
$p = [W]::Visible() | Where-Object { ${pid ? `$_.Pid -eq ${pid}` : `$_.Title.IndexOf(${psq(title)}, [StringComparison]::OrdinalIgnoreCase) -ge 0`} } | Select-Object -First 1
if (-not $p) { throw '未找到目标窗口' }
[W]::ShowWindow($p.Handle, 9) | Out-Null
Start-Sleep -Milliseconds 120
[W]::SetForegroundWindow($p.Handle) | Out-Null
Start-Sleep -Milliseconds 120
if ([W]::GetForegroundWindow() -ne $p.Handle) { throw '目标窗口未能获得焦点，请手动切换到该窗口后重试' }
Write-Output ('OK 已聚焦：' + $p.Title)`,

  mouse_click: (x, y, dbl) => `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { ${DPI} [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e); }'
[W]::SetProcessDPIAware() | Out-Null
[W]::SetCursorPos(${x}, ${y}) | Out-Null
Start-Sleep -Milliseconds 100
[W]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [W]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
${dbl ? 'Start-Sleep -Milliseconds 90\n[W]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [W]::mouse_event(4,0,0,0,[UIntPtr]::Zero)' : ''}
Write-Output "OK 点击 (${x}, ${y})${dbl ? ' 双击' : ''}"`,

  type_text: (text) => `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait(${psq(text)})
Write-Output 'OK 已输入文本'`,

  read_screen: (depth) => `$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$f = $null
try { $f = [System.Windows.Automation.AutomationElement]::FocusedElement } catch {}
if (-not $f) { $f = [System.Windows.Automation.AutomationElement]::RootElement }
else {
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $current = $f
  while ($current -and $current.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window) {
    $parent = $walker.GetParent($current)
    if (-not $parent -or $parent -eq [System.Windows.Automation.AutomationElement]::RootElement) { break }
    $current = $parent
  }
  if ($current) { $f = $current }
}
function Walk($e, $d) {
  try {
    $n = $e.Current.Name
    $t = $e.Current.ControlType.ProgrammaticName -replace 'ControlType.', ''
    $rect = $e.Current.BoundingRectangle
    $pos = ''
    if ($rect -and $rect.Width -gt 0) { $pos = ' @' + [int]$rect.X + ',' + [int]$rect.Y }
    if (-not $n) { $n = '(无名称)' }
    Write-Output (('  ' * $d) + '[' + $t + '] ' + $n + $pos)
    if ($d -lt ${depth}) {
      $kids = $e.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
      foreach ($k in $kids) { Walk $k ($d + 1) }
    }
  } catch {}
}
Walk $f 0`,

  key_tap: (key) => `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait(${psq(key)})
Write-Output 'OK 已发送按键'`,
};

/** SendKeys 特殊字符转义（+^%~(){}[] 有控制含义） */
function escapeSendKeys(text) {
  return String(text).replace(/([+^%~(){}[\]])/g, '{$1}');
}

export default async function setup(ctx) {
  if (process.platform !== 'win32') {
    ctx.log('非 Windows 平台，computer use 插件工具不可用（跳过注册）');
    return;
  }

  const command = {
    description: '进入桌面操作循环（截图→决策→点击/输入→再截图）',
    template: '请按桌面操作技能执行：先 screenshot 与 read_screen，能走 API/office_* 就不要点 GUI。用户目标：{{args}}。每步动作后必须再截图验证。',
  };
  ctx.registerCommand('/computer-use', command);
  ctx.registerCommand('/desktop', { ...command, description: 'computer use 桌面操作（兼容旧命令）' });

  ctx.registerTool({
    name: 'screenshot',
    description: '截取整个屏幕为 PNG。返回图片（多模态模型可直接看图）。坐标体系与 mouse_click 一致（物理像素）。',
    parameters: { type: 'object', properties: {} },
    permission: 'L3',
    capability: 'desktop',
    async run(args, ctx) {
      const dir = path.join(agentDataDir(), 'screenshots');
      fs.mkdirSync(dir, { recursive: true });
      const out = path.join(dir, `shot-${Date.now()}.png`);
      const info = await powershell(SCRIPTS.screenshot(out));
      const b64 = fs.readFileSync(out).toString('base64');
      const dataUrl = `data:image/png;base64,${b64}`;
      return { content: `截图完成（${info}），已保存 ${path.relative(process.cwd(), out)}`, image: dataUrl, ui: { kind: 'image', dataUrl, title: '屏幕截图' } };
    },
  });

  ctx.registerTool({
    name: 'list_windows',
    description: '列出当前所有可见顶层窗口：PID、进程名、窗口标题（只读）。',
    parameters: { type: 'object', properties: {} },
    permission: 'L0',
    async run() {
      const out = await powershell(SCRIPTS.list_windows());
      return { content: out || '(没有可见窗口)' };
    },
  });

  ctx.registerTool({
    name: 'read_screen',
    description: '读取当前聚焦窗口的 UI 控件树（UIA）：控件类型+文本。用于精确定位按钮/输入框，优先于像素坐标点击。',
    parameters: {
      type: 'object',
      properties: { depth: { type: 'number', description: '遍历深度（默认 5，最大 8）' } },
    },
    permission: 'L3',
    capability: 'desktop',
    async run({ depth }) {
      const out = await powershell(SCRIPTS.read_screen(Math.min(Math.max(depth ?? 5, 1), 8)));
      return { content: out ? out.split('\n').slice(0, 300).join('\n') : '(窗口无文本控件)' };
    },
  });

  ctx.registerTool({
    name: 'focus_window',
    description: '把指定窗口带到前台并聚焦。用 title 子串模糊匹配，或给 pid。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '窗口标题（子串匹配）' },
        pid: { type: 'number' },
      },
    },
    permission: 'L3',
    capability: 'desktop',
    async run({ title, pid }) {
      if (!title && !pid) throw new Error('需要 title 或 pid');
      return { content: await powershell(SCRIPTS.focus_window(title ?? '', pid)) };
    },
  });

  ctx.registerTool({
    name: 'mouse_click',
    description: '移动鼠标并单击（x,y 为截图中的物理像素坐标；double=true 双击）。坐标必须来自最新 screenshot。',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' }, y: { type: 'number' },
        double: { type: 'boolean' },
      },
      required: ['x', 'y'],
    },
    permission: 'L3',
    capability: 'desktop',
    async run({ x, y, double: dbl }) {
      return { content: await powershell(SCRIPTS.mouse_click(Math.round(x), Math.round(y), !!dbl)) };
    },
  });

  ctx.registerTool({
    name: 'type_text',
    description: '向当前聚焦窗口键入文本（自动转义 SendKeys 特殊字符；raw=true 时按控制序列原样发送，如 {ENTER}^c）。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        raw: { type: 'boolean' },
      },
      required: ['text'],
    },
    permission: 'L3',
    capability: 'desktop',
    async run({ text, raw }) {
      return { content: await powershell(SCRIPTS.type_text(raw ? text : escapeSendKeys(text))) };
    },
  });

  ctx.registerTool({
    name: 'key_tap',
    description: '发送单个按键/组合键到聚焦窗口（SendKeys 语法：{ENTER}、{TAB}、^c、%{F4} 等）。',
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    permission: 'L3',
    capability: 'desktop',
    async run({ key }) {
      return { content: await powershell(SCRIPTS.key_tap(key)) };
    },
  });
}
