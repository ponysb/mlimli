---
name: 桌面操作指南
description: 用于用户明确要求的系统界面或原生桌面软件操作；网页和应用台任务使用内置浏览器
---

# 桌面操作守则

网页操作不需要宿主桌面。已登录应用直接使用 `app_list` → `app_open` → `app_snapshot` / `app_action`，登录态保存在内置浏览器中；MCP 只读、元素引用失效、输入失败或窗口不可见都不是改用桌面的理由。重新快照并修复具体错误；缺少必要浏览器能力时说明缺口，不自行转到外部 Edge/Chrome、系统鼠标键盘或桌面剪贴板。仅当用户明确要求操作系统界面、原生桌面软件或外部浏览器时适用以下桌面循环。

1. **能走 API 就不走 GUI**：操作 Word/Excel/PPT 用 `office_read` / `office_edit` / `office_convert`，不要对 Office 窗口点鼠标。桌面自动化只留给没有 API 的场景（系统对话框、第三方桌面软件）。
2. **UIA 优先于像素坐标**：先 `list_windows` 找到窗口，`focus_window` 前置，再 `read_screen` 拿控件文本与坐标；`mouse_click` 是最后手段——分辨率/DPI 一变像素坐标就废。
3. **每步动作后必须截图验证**：`screenshot` → 看图决策 → `click`/`type_text`/`key_tap` → 再 `screenshot`。不要盲操作。
4. 桌面工具属于显式桌面能力：先开启「桌面会话」；默认权限模式逐次审批，完全访问模式通配允许已开放桌面工具。只读、工作区边界与桌面开关仍生效。
