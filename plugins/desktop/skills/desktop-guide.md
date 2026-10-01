---
name: 桌面操作指南
description: Computer-Use 循环：UIA 优先、能走 API 就不走 GUI、每步截图验证
---

# 桌面操作守则

1. **能走 API 就不走 GUI**：操作 Word/Excel/PPT 用 `office_read` / `office_edit` / `office_convert`，不要对 Office 窗口点鼠标。桌面自动化只留给没有 API 的场景（系统对话框、第三方桌面软件）。
2. **UIA 优先于像素坐标**：先 `list_windows` 找到窗口，`focus_window` 前置，再 `read_screen` 拿控件文本与坐标；`mouse_click` 是最后手段——分辨率/DPI 一变像素坐标就废。
3. **每步动作后必须截图验证**：`screenshot` → 看图决策 → `click`/`type_text`/`key_tap` → 再 `screenshot`。不要盲操作。
4. 桌面工具属于 L3，需要用户开启「桌面会话」并逐次确认。
