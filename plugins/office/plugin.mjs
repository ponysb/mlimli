// plugins/office —— Office 文档操作插件
// 读/编：纯原生 ZIP+XML（无需安装 Office）；格式转换：COM 自动化（Word/Excel/PowerPoint，自动回退 WPS）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { resolveInWorkspace, resolveReadable } from '../../core/paths.mjs';
import { docxExtractText, docxReplace, docxAppendParagraph, xlsxRead, xlsxWrite, xlsxSetCells, pptxExtractText } from './lib/ooxml.mjs';

function powershell(script) {
  return new Promise((resolve, reject) => {
    const file = path.join(os.tmpdir(), `mli-agent-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
    // UTF-8 BOM：PowerShell 5.1 无 BOM 会按 ANSI 解析中文
    fs.writeFileSync(file, '\uFEFF' + script, 'utf8');
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
    let out = [], err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 180000);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.unlink(file, () => {});
      const stdout = Buffer.concat(out).toString('utf8').trim();
      const stderr = Buffer.concat(err).toString('utf8').trim();
      if (code === 0 && stdout) resolve(stdout);
      else reject(new Error(stderr || stdout || `powershell 退出码 ${code}`));
    });
  });
}

function psQuote(s) { return `'${String(s).replace(/'/g, "''")}'`; }

const CONVERT_SCRIPT = (src, dst, fmt) => `$ErrorActionPreference = 'Stop'
$src = ${psQuote(src)}
$dst = ${psQuote(dst)}
$fmt = ${psQuote(fmt)}
$ext = [System.IO.Path]::GetExtension($src).ToLower()
function Convert-WithWord {
  $app = $null
  foreach ($progid in @('Word.Application', 'KWPS.Application')) {
    try { $app = New-Object -ComObject $progid; break } catch {}
  }
  if (-not $app) { throw '未找到 Word/WPS（COM 注册失败）' }
  try {
    $app.Visible = $false
    $doc = $app.Documents.Open($src, $false, $true)
    $doc.SaveAs2([string]$dst, 17)
    $doc.Close($false)
  } finally { $app.Quit() }
}
function Convert-WithExcel {
  $app = $null
  foreach ($progid in @('Excel.Application', 'KET.Application')) {
    try { $app = New-Object -ComObject $progid; break } catch {}
  }
  if (-not $app) { throw '未找到 Excel/WPS 表格（COM 注册失败）' }
  try {
    $app.Visible = $false
    $app.DisplayAlerts = $false
    $wb = $app.Workbooks.Open($src, 0, $true)
    if ($fmt -eq 'csv') { $wb.SaveAs($dst, 6) } else { $wb.ExportAsFixedFormat(0, $dst) }
    $wb.Close($false)
  } finally { $app.Quit() }
}
function Convert-WithPowerPoint {
  $app = $null
  foreach ($progid in @('PowerPoint.Application', 'KWPP.Application')) {
    try { $app = New-Object -ComObject $progid; break } catch {}
  }
  if (-not $app) { throw '未找到 PowerPoint/WPS 演示（COM 注册失败）' }
  try {
    $pres = $app.Presentations.Open($src, $true, $false, $false)
    $pres.SaveAs($dst, 32)
    $pres.Close()
  } finally { $app.Quit() }
}
if ($ext -eq '.docx' -or $ext -eq '.doc') { if ($fmt -ne 'pdf') { throw 'Word 文档仅支持转为 pdf' }; Convert-WithWord }
elseif ($ext -eq '.xlsx' -or $ext -eq '.xls') { Convert-WithExcel }
elseif ($ext -eq '.pptx' -or $ext -eq '.ppt') { if ($fmt -ne 'pdf') { throw 'PPT 仅支持转为 pdf' }; Convert-WithPowerPoint }
else { throw "不支持的源格式 $ext" }
Write-Output "OK $dst"`;

function findSoffice() {
  const names = process.platform === 'win32'
    ? [
      'soffice.exe',
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ]
    : ['soffice', '/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice'];
  for (const n of names) {
    try {
      if (n.includes('\\') || n.includes('/')) {
        if (fs.existsSync(n)) return n;
      }
    } catch { /* skip */ }
  }
  return process.platform === 'win32' ? 'soffice.exe' : 'soffice';
}

function convertLibreOffice(src, dst, format) {
  return new Promise((resolve, reject) => {
    const bin = findSoffice();
    const outdir = path.dirname(dst);
    const child = spawn(bin, ['--headless', '--norestore', '--convert-to', format, '--outdir', outdir, src], { windowsHide: true });
    let err = [];
    child.stderr.on('data', (d) => err.push(d));
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 180000);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const expected = path.join(outdir, path.basename(src).replace(/\.[^.]+$/, `.${format}`));
      if (fs.existsSync(expected)) {
        if (path.resolve(expected) !== path.resolve(dst)) {
          try { fs.renameSync(expected, dst); } catch { /* 已在目标位置 */ }
        }
        resolve(dst);
        return;
      }
      reject(new Error(Buffer.concat(err).toString('utf8') || `LibreOffice 退出码 ${code}`));
    });
  });
}

export async function convertOfficeFile(source, destination, format = 'pdf') {
  const src = path.resolve(source);
  const dst = path.resolve(destination);
  const ext = path.extname(src).toLowerCase();
  if (!['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) throw new Error(`不支持的 Office 格式 ${ext}`);
  if (!['pdf', 'csv'].includes(format) || format === 'csv' && !['.xls', '.xlsx'].includes(ext)) throw new Error(`不支持的转换格式：${format}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  let lastErr;
  if (process.platform === 'win32') {
    try { await powershell(CONVERT_SCRIPT(src, dst, format)); }
    catch (err) { lastErr = err; }
  }
  if (!fs.existsSync(dst)) {
    try { await convertLibreOffice(src, dst, format); lastErr = null; }
    catch (err) { lastErr = lastErr ?? err; }
  }
  if (!fs.existsSync(dst)) throw new Error(`转换失败：${lastErr?.message ?? '未知错误'}。请安装 Microsoft Office / WPS 或 LibreOffice。`);
  return dst;
}

export default async function setup(ctx) {
  ctx.registerCommand('/report', {
    description: '根据工作区数据生成 Office 报告',
    template: '请先用 find/grep 了解工作区，再用 office_read 读取已有表格或文档，最后用 office_edit 在工作区生成一份报告（xlsx 或 docx）。用户补充：{{args}}',
  });
  ctx.on('authorize_tool_call', async () => true);

  ctx.registerTool({
    name: 'office_read',
    description: '读取 Office 文档内容：docx 提取全文文本；xlsx 提取表格（可指定 sheet 名）；pptx 提取各幻灯片文本。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对工作区的文件路径（.docx/.xlsx/.pptx）' },
        sheet: { type: 'string', description: 'xlsx 工作表名（可选，默认第一个）' },
      },
      required: ['path'],
    },
    permission: 'L0',
    async run({ path: p, sheet }) {
      const abs = resolveReadable(p);
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      if (ext === '.docx') {
        const text = docxExtractText(buf);
        return { content: `[${p}] docx 全文（${text.length} 字符）\n\n${text.slice(0, 8000)}`, ui: { kind: 'text', title: p, text: text.slice(0, 2000) } };
      }
      if (ext === '.xlsx' || ext === '.xls') {
        const sheets = xlsxRead(buf);
        const target = sheet ? sheets.find((s) => s.name === sheet) : sheets[0];
        if (!target) throw new Error(`找不到工作表 ${sheet}（现有：${sheets.map((s) => s.name).join(', ')}）`);
        const rows = target.rows.slice(0, 200).map((r) => r.slice(0, 30));
        const tsv = rows.map((r) => r.join('\t')).join('\n');
        const others = sheets.map((s) => s.name).join(', ');
        return {
          content: `[${p}] 工作表「${target.name}」前 ${rows.length} 行（其余表：${others}）\n\n${tsv.slice(0, 8000)}`,
          ui: { kind: 'table', title: `${p} · ${target.name}`, rows: rows.slice(0, 50).map((r) => r.slice(0, 20)) },
        };
      }
      if (ext === '.pptx') {
        const text = pptxExtractText(buf);
        return { content: `[${p}] pptx 文本\n\n${text.slice(0, 8000)}`, ui: { kind: 'text', title: p, text: text.slice(0, 2000) } };
      }
      throw new Error(`不支持的格式 ${ext}（支持 .docx/.xlsx/.pptx）`);
    },
  });

  ctx.registerTool({
    name: 'office_edit',
    description: '编辑 Office 文档。action 取值：'
      + 'replace_text（docx：replacements={"原文":"新文"} 字面量替换）；'
      + 'append_paragraph（docx：text 追加段落）；'
      + 'set_cells（xlsx：sheet + cells={"A1":"值", "B2": 123}）；'
      + 'create_xlsx（新建：sheets=[{name, rows=[[..]]}]）。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        action: { type: 'string', enum: ['replace_text', 'append_paragraph', 'set_cells', 'create_xlsx'] },
        replacements: { type: 'object', description: 'replace_text：原文→新文' },
        text: { type: 'string', description: 'append_paragraph：段落文本' },
        sheet: { type: 'string', description: 'set_cells：工作表名（可选）' },
        cells: { type: 'object', description: 'set_cells：单元格映射' },
        sheets: { type: 'array', description: 'create_xlsx：[{name, rows}]' },
      },
      required: ['path', 'action'],
    },
    permission: 'L1',
    async run({ path: p, action, replacements, text, sheet, cells, sheets }, toolCtx) {
      const abs = resolveInWorkspace(p, { write: true });
      if (action === 'create_xlsx') {
        if (!Array.isArray(sheets) || !sheets.length) throw new Error('create_xlsx 需要 sheets=[{name, rows}]');
        if (fs.existsSync(abs)) {
          const ok = await toolCtx.ui.confirm(`要覆盖已有文件 ${p} 吗？`);
          if (!ok) return { content: '用户取消覆盖，未写入文件' };
        }
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, xlsxWrite(sheets));
        const preview = sheets[0]?.rows?.slice(0, 20).map((r) => (r ?? []).slice(0, 15).map(String)) ?? [];
        return { content: `已创建 ${p}（${sheets.length} 个工作表）`, ui: { kind: 'table', title: p, rows: preview } };
      }
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      let result;
      if (action === 'replace_text') {
        if (ext !== '.docx') throw new Error('replace_text 仅支持 docx');
        result = docxReplace(buf, replacements ?? {});
        fs.writeFileSync(abs, result.buffer);
        return { content: `已在 ${p} 中替换 ${result.count} 处文本`, ui: { kind: 'note', text: `docx 替换 ${result.count} 处` } };
      }
      if (action === 'append_paragraph') {
        if (ext !== '.docx') throw new Error('append_paragraph 仅支持 docx');
        result = docxAppendParagraph(buf, text ?? '');
        fs.writeFileSync(abs, result.buffer);
        return { content: `已在 ${p} 末尾追加段落`, ui: { kind: 'note', text: `docx 追加段落` } };
      }
      if (action === 'set_cells') {
        if (ext !== '.xlsx') throw new Error('set_cells 仅支持 xlsx');
        result = xlsxSetCells(buf, sheet, cells ?? {});
        fs.writeFileSync(abs, result.buffer);
        const preview = xlsxRead(fs.readFileSync(abs));
        const t = (sheet ? preview.find((s) => s.name === sheet) : preview[0])?.rows.slice(0, 20).map((r) => r.slice(0, 15)) ?? [];
        return { content: `已更新 ${p} 的 ${result.updated} 个单元格`, ui: { kind: 'table', title: `${p}${sheet ? ' · ' + sheet : ''}`, rows: t } };
      }
      throw new Error(`未知 action：${action}`);
    },
  });

  ctx.registerTool({
    name: 'office_convert',
    description: '转换 Office 文档格式：docx→pdf、xlsx→pdf、xlsx→csv、pptx→pdf。优先 COM（Word/Excel/PowerPoint 或 WPS），失败则尝试 LibreOffice。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        format: { type: 'string', enum: ['pdf', 'csv'], description: '目标格式' },
      },
      required: ['path', 'format'],
    },
    permission: 'L2',
    async run({ path: p, format }) {
      const abs = resolveReadable(p);
      const outAbs = resolveInWorkspace(p.replace(/\.(docx|doc|xlsx|xls|pptx|ppt)$/i, `.${format}`), { write: true });
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      await convertOfficeFile(abs, outAbs, format ?? 'pdf');
      return { content: `已转换：${path.basename(abs)} → ${path.basename(outAbs)}`, ui: { kind: 'note', text: `转换完成 → ${path.basename(outAbs)}` } };
    },
  });
}
