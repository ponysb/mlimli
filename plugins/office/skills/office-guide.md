---
name: office 使用指南
description: 处理 docx/xlsx/pptx 时的操作流程与注意事项（读→改→转）
---

# Office 文件处理指南

1. **先读后写**：编辑前必须先 `office_read` 确认结构与实际内容。
2. **docx 替换**：`replace_text` 是字面量替换。占位符（如 {{客户名}}）必须是在 Word 中连续输入的，
   若被自动更正拆成多个 run 会匹配不到；找不到时改用「读全文 → 另写新文件」的策略。
3. **xlsx**：单元格引用用大写列号（A1 风格）；数字直接给数字类型，其余按字符串处理。
4. **转换**：`office_convert` 依赖本机 Word/Excel/PowerPoint 或 WPS；未安装时会报 COM 错误，
   此时可建议用户安装 Office/WPS，或改用纯文本方式产出内容。
5. 输出文件一律放在工作区内，用相对路径引用。
