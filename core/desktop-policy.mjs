const EXPLICIT_DESKTOP_INTENT = /(?:^|\s)\/(?:desktop|computer-use)(?:\s|$)|(?:操作|控制|截图|点击|设置|打开).{0,12}(?:桌面软件|原生软件|原生应用|系统界面|系统设置|系统对话框|文件资源管理器|Finder|整个屏幕|宿主桌面)|(?:桌面软件|原生软件|原生应用|系统界面|系统设置|系统对话框|文件资源管理器|Finder|任务栏|开始菜单|外部浏览器|宿主桌面|桌面截图)|(?:Windows|macOS|Linux)\s*(?:桌面|系统设置|文件管理器)/i;

export function isExplicitDesktopTask(text) {
  return EXPLICIT_DESKTOP_INTENT.test(String(text || '').trim());
}
