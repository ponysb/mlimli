// plugins/office/lib/ooxml.mjs —— docx / xlsx / pptx 的纯原生读写（ZIP + 字符串级 XML 操作）
import { readZipMap, writeZip } from './zip.mjs';

// ---------- XML 工具 ----------
export function escapeXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

export function decodeXml(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

const colToIndex = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const indexToCol = (i) => {
  let s = '';
  i += 1;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
};

function zipWithReplaced(map, name, newContent) {
  const out = [];
  for (const [k, v] of map) out.push({ name: k, data: k === name ? newContent : v });
  if (!map.has(name)) out.push({ name, data: newContent });
  return writeZip(out);
}

// ---------- DOCX ----------
export function docxExtractText(buf) {
  const zip = readZipMap(buf);
  const xml = zip.get('word/document.xml');
  if (!xml) throw new Error('不是有效的 docx（缺少 word/document.xml）');
  const paras = xml.toString('utf8').match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? [];
  const lines = paras.map((p) => {
    let t = '';
    for (const m of p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      t += m[1] !== undefined ? decodeXml(m[1]) : (m[0] === '<w:tab/>' ? '\t' : '\n');
    }
    return t;
  });
  return lines.join('\n');
}

/** 字面量替换（在原始 XML 上做；占位符需在同一 run 内连续输入） */
export function docxReplace(buf, replacements) {
  const zip = readZipMap(buf);
  let xml = zip.get('word/document.xml').toString('utf8');
  let count = 0;
  for (const [k, v] of Object.entries(replacements ?? {})) {
    const parts = xml.split(k);
    count += parts.length - 1;
    xml = parts.join(v);
  }
  if (count === 0) throw new Error('未找到任何待替换文本（占位符需在 Word 中连续输入，不能被拆成多个 run）');
  return { buffer: zipWithReplaced(zip, 'word/document.xml', Buffer.from(xml, 'utf8')), count };
}

export function docxAppendParagraph(buf, text) {
  const zip = readZipMap(buf);
  let xml = zip.get('word/document.xml').toString('utf8');
  const p = `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  xml = xml.replace('</w:body>', p + '</w:body>');
  return { buffer: zipWithReplaced(zip, 'word/document.xml', Buffer.from(xml, 'utf8')) };
}

// ---------- XLSX ----------
function parseSharedStrings(zip) {
  const f = zip.get('xl/sharedStrings.xml');
  if (!f) return [];
  return [...f.toString('utf8').matchAll(/<si>[\s\S]*?<\/si>|<si\/>/g)].map((m) => {
    let t = '';
    for (const tm of m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += decodeXml(tm[1]);
    return t;
  });
}

function parseSheet(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIdx = parseInt(rm[1], 10) - 1;
    const cells = [];
    for (const cm of rm[2].matchAll(/<c([^>]*?)\/>|<c([^>]*?)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1] ?? cm[2];
      const inner = cm[3] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
      const col = colToIndex(ref);
      const t = /t="(\w+)"/.exec(attrs)?.[1] ?? '';
      let value = '';
      if (t === 's') {
        const v = parseInt(/<v>(\d+)<\/v>/.exec(inner)?.[1] ?? '-1', 10);
        value = shared[v] ?? '';
      } else if (t === 'inlineStr') {
        value = decodeXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      } else if (t === 'str') {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      } else if (t === 'b') {
        value = /<v>1<\/v>/.test(inner) ? 'TRUE' : 'FALSE';
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      }
      cells[col] = value;
    }
    rows[rowIdx] = cells;
  }
  // 压实稀疏数组
  const dense = [];
  for (let i = 0; i < rows.length; i++) dense.push((rows[i] ?? []).map((c) => c ?? ''));
  return dense;
}

/** 读 xlsx → [{ name, rows: string[][] }]（值统一为字符串） */
export function xlsxRead(buf) {
  const zip = readZipMap(buf);
  const wb = zip.get('xl/workbook.xml');
  if (!wb) throw new Error('不是有效的 xlsx');
  const shared = parseSharedStrings(zip);
  const rels = zip.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const relMap = new Map();
  for (const m of rels.matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) relMap.set(m[1], m[2]);
  const sheets = [];
  for (const m of wb.toString('utf8').matchAll(/<sheet\s+([^>]*?)\/?>(?:<\/sheet>)?/g)) {
    const attrs = m[1];
    const name = /name="([^"]*)"/.exec(attrs)?.[1];
    const rid = /r:id="(rId\d+)"/.exec(attrs)?.[1];
    if (!name || !rid) continue;
    const target = relMap.get(rid) ?? '';
    const file = 'xl/' + target.replace(/^\/?(xl\/)?/, '');
    const sheetXml = zip.get(file) ?? zip.get('xl/' + target);
    if (!sheetXml) continue;
    sheets.push({ name: decodeXml(name), rows: parseSheet(sheetXml.toString('utf8'), shared) });
  }
  if (!sheets.length) sheets.push({ name: 'Sheet1', rows: parseSheet(zip.get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? '', shared) });
  return sheets;
}

function cellXml(ref, value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXmlFromRows(rows) {
  const body = rows.map((cells, r) => {
    const cs = (cells ?? []).map((v, c) => (v === '' || v == null) ? '' : cellXml(`${indexToCol(c)}${r + 1}`, v)).filter(Boolean);
    return `<row r="${r + 1}">${cs.join('')}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function parseCellRef(ref) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(String(ref).trim());
  if (!m) throw new Error(`非法单元格引用：${ref}`);
  return { c: colToIndex(m[1].toUpperCase()), r: parseInt(m[2], 10) - 1 };
}

function contentTypesXml(nSheets) {
  const sheets = Array.from({ length: nSheets }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets}
</Types>`;
}
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="1"><xf xfId="0"/></cellXfs>
</styleSheet>`;

function workbookXml(names) {
  const sheets = names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}
function workbookRels(nSheets) {
  const rels = [];
  for (let i = 0; i < nSheets; i++) rels.push(`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`);
  rels.push(`<Relationship Id="rId${nSheets + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
}

/** 从零生成 xlsx（inlineStr，不依赖 sharedStrings） */
export function xlsxWrite(sheets) {
  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml(sheets.length)) },
    { name: '_rels/.rels', data: Buffer.from(RELS) },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml(sheets.map((s) => s.name || 'Sheet1'))) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels(sheets.length)) },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXmlFromRows(s.rows ?? [])) })),
  ];
  return writeZip(entries);
}

/** 在已有 xlsx 上按 {A1: value} 设置单元格（保留其余内容） */
export function xlsxSetCells(buf, sheetName, cells) {
  const zip = readZipMap(buf);
  const sheetsInfo = xlsxRead(buf);
  const idx = sheetName ? sheetsInfo.findIndex((s) => s.name === sheetName) : 0;
  if (idx < 0) throw new Error(`找不到工作表 ${sheetName}（现有：${sheetsInfo.map((s) => s.name).join(', ')}）`);
  const file = `xl/worksheets/sheet${idx + 1}.xml`;
  let xml = (zip.get(file) ?? Buffer.from('')).toString('utf8');
  if (!xml.includes('<sheetData>')) xml = sheetXmlFromRows([]);

  // 解析已有行到 map
  const rowMap = new Map(); // rowIdx → Map(colIdx → value)
  const existing = xlsxRead(buf)[idx].rows;
  existing.forEach((cells, r) => {
    const m = new Map();
    cells.forEach((v, c) => m.set(c, v));
    rowMap.set(r, m);
  });
  for (const [ref, value] of Object.entries(cells ?? {})) {
    const { r, c } = parseCellRef(ref);
    if (!rowMap.has(r)) rowMap.set(r, new Map());
    rowMap.get(r).set(c, value);
  }
  const maxRow = rowMap.size ? Math.max(...rowMap.keys()) : -1;
  const rows = [];
  for (let r = 0; r <= maxRow; r++) {
    const m = rowMap.get(r);
    if (!m || !m.size) { rows.push([]); continue; }
    const maxCol = Math.max(...m.keys());
    const out = [];
    for (let c = 0; c <= maxCol; c++) out.push(m.get(c) ?? '');
    rows.push(out);
  }
  return { buffer: zipWithReplaced(zip, file, Buffer.from(sheetXmlFromRows(rows), 'utf8')), updated: Object.keys(cells ?? {}).length };
}

// ---------- PPTX ----------
export function pptxExtractText(buf) {
  const zip = readZipMap(buf);
  const slides = [...zip.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => {
    const n = (s) => parseInt(s.match(/(\d+)\.xml/)[1], 10);
    return n(a) - n(b);
  });
  const out = [];
  for (let i = 0; i < slides.length; i++) {
    const xml = zip.get(slides[i]).toString('utf8');
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    out.push(`## 幻灯片 ${i + 1}\n${texts.join('\n')}`);
  }
  return out.join('\n\n') || '(空演示文稿)';
}

function xmlAttr(source, name) {
  return new RegExp(`${name}="([^"]*)"`).exec(source)?.[1] ?? '';
}

function svgColor(source, fallback) {
  const rgb = /<a:srgbClr[^>]*val="([0-9a-fA-F]{6})"/.exec(source)?.[1];
  if (rgb) return `#${rgb}`;
  const scheme = /<a:schemeClr[^>]*val="([^"]+)"/.exec(source)?.[1];
  return ({ lt1: '#ffffff', dk1: '#000000', lt2: '#f8fafc', dk2: '#1f2937', accent1: '#4f46e5', accent2: '#06b6d4', accent3: '#10b981', accent4: '#f59e0b', accent5: '#ef4444', accent6: '#8b5cf6' })[scheme] || fallback;
}

function renderPptxShape(shape, scale) {
  const xfrm = /<a:xfrm[\s\S]*?<a:off\s+([^>]+)\/>[\s\S]*?<a:ext\s+([^>]+)\/>[\s\S]*?<\/a:xfrm>/.exec(shape);
  if (!xfrm) return '';
  const x = Number(xmlAttr(xfrm[1], 'x')) * scale, y = Number(xmlAttr(xfrm[1], 'y')) * scale;
  const width = Number(xmlAttr(xfrm[2], 'cx')) * scale, height = Number(xmlAttr(xfrm[2], 'cy')) * scale;
  const spPr = /<p:spPr>([\s\S]*?)<\/p:spPr>/.exec(shape)?.[1] || '';
  const fillXml = /<a:solidFill>[\s\S]*?<\/a:solidFill>/.exec(spPr)?.[0] || '';
  const lineXml = /<a:ln[\s\S]*?<\/a:ln>/.exec(spPr)?.[0] || '';
  const fill = fillXml ? svgColor(fillXml, 'none') : 'none';
  const line = lineXml && !/<a:noFill\s*\/>/.test(lineXml) ? svgColor(lineXml, 'none') : 'none';
  const radius = /prstGeom\s+prst="roundRect"/.test(spPr) ? Math.min(width, height) * .08 : 0;
  const background = fill === 'none' && line === 'none' ? '' : `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${line}" stroke-width="${line === 'none' ? 0 : .8}"/>`;
  const txBody = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(shape)?.[1];
  if (!txBody) return background;
  const bodyPr = /<a:bodyPr([^>]*)\/>/.exec(txBody)?.[1] || '';
  const left = Number(xmlAttr(bodyPr, 'lIns') || 91440) * scale, right = Number(xmlAttr(bodyPr, 'rIns') || 91440) * scale;
  const top = Number(xmlAttr(bodyPr, 'tIns') || 45720) * scale, bottom = Number(xmlAttr(bodyPr, 'bIns') || 45720) * scale;
  const paragraphs = [...txBody.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map((match) => {
    const body = match[1]; const pPr = /<a:pPr([^>]*)\/>/.exec(body)?.[1] || '';
    const align = xmlAttr(pPr, 'algn') || 'l';
    const runs = [...body.matchAll(/<a:r(?:\s[^>]*)?>([\s\S]*?)<\/a:r>/g)].map((run) => {
      const rPr = /<a:rPr([^>]*)>([\s\S]*?)<\/a:rPr>|<a:rPr([^>]*)\/>/.exec(run[1]);
      const attrs = rPr?.[1] || rPr?.[3] || ''; const style = rPr?.[2] || '';
      return { text: [...run[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((item) => decodeXml(item[1])).join(''), size: Number(xmlAttr(attrs, 'sz') || 1800) / 100 * 96 / 72, color: svgColor(style, '#1f2937'), bold: xmlAttr(attrs, 'b') === '1', family: xmlAttr(/<a:latin([^>]*)\/>/.exec(style)?.[1] || '', 'typeface') || 'Microsoft YaHei' };
    });
    return { align, runs: runs.filter((run) => run.text), size: runs[0]?.size || 18 };
  }).filter((paragraph) => paragraph.runs.length);
  if (!paragraphs.length) return background;
  const lineHeight = Math.max(...paragraphs.map((paragraph) => paragraph.size)) * 1.35;
  const blockHeight = paragraphs.length * lineHeight;
  const anchor = xmlAttr(bodyPr, 'anchor') || 't';
  const startY = anchor === 'ctr' ? y + (height - blockHeight) / 2 : anchor === 'b' ? y + height - bottom - blockHeight : y + top;
  const textNodes = paragraphs.map((paragraph, index) => {
    const first = paragraph.runs[0];
    const anchorValue = paragraph.align === 'ctr' ? 'middle' : paragraph.align === 'r' ? 'end' : 'start';
    const textX = paragraph.align === 'ctr' ? x + width / 2 : paragraph.align === 'r' ? x + width - right : x + left;
    const tspans = paragraph.runs.map((run) => `<tspan fill="${run.color}" font-family="${escapeXml(run.family)}" font-weight="${run.bold ? 700 : 400}" font-size="${run.size}">${escapeXml(run.text)}</tspan>`).join('');
    return `<text x="${textX}" y="${startY + (index + 1) * lineHeight}" text-anchor="${anchorValue}" dominant-baseline="alphabetic">${tspans || escapeXml(first.text)}</text>`;
  }).join('');
  return background + textNodes;
}

/** 将 PPTX 的基本文本框和形状渲染为按幻灯片分页的 SVG 预览。 */
export function pptxRenderSlides(buf) {
  const zip = readZipMap(buf);
  const presentation = zip.get('ppt/presentation.xml')?.toString('utf8') || '';
  const size = /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(presentation);
  const width = Number(size?.[1] || 12191695), height = Number(size?.[2] || 6858000), scale = 1 / 10000;
  const slideFiles = [...zip.keys()].filter((key) => /^ppt\/slides\/slide\d+\.xml$/.test(key)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  return slideFiles.map((file) => {
    const xml = zip.get(file).toString('utf8');
    const shapes = [...xml.matchAll(/<p:sp(?:\s[^>]*)?>([\s\S]*?)<\/p:sp>/g)].map((match) => renderPptxShape(match[0], scale)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width * scale} ${height * scale}" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="#ffffff"/>${shapes}</svg>`;
  });
}
