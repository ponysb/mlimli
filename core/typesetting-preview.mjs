import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rawWorkspaceFile } from './workspace-files.mjs';
import { getWorkspaceRoot, resolveInWorkspace } from './paths.mjs';

const execute = promisify(execFile);
// Finder-launched apps do not inherit the interactive shell's Homebrew PATH.
export function typesettingEnvironment(env = process.env, platform = process.platform) {
  const extra = platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin', '/Library/TeX/texbin'] : [];
  return { ...env, PATH: [...new Set([...(env.PATH || '').split(path.delimiter).filter(Boolean), ...extra])].join(path.delimiter),
    openin_any: 'p', openout_any: 'p', TECTONIC_UNTRUSTED: '1' };
}
const missingCompiler = '未找到排版编译器。Typst 请安装 typst；LaTeX 请安装 XeLaTeX（推荐中文文档）、Tectonic 或 pdfLaTeX，并加入 PATH。';

// The runner is injectable so process failures and cleanup can be tested without a TeX installation.
export async function compileTypesetting(relativePath, content, { run = execute } = {}) {
  const file = rawWorkspaceFile(relativePath);
  const ext = path.extname(file.abs).toLowerCase();
  if (!['.tex', '.latex', '.typ'].includes(ext)) throw new Error('仅支持 LaTeX 和 Typst 文件');
  if (file.kind !== 'text' || file.stat.size > 5 * 1024 * 1024) throw new Error('源码必须是 5 MB 以内的文本文件');
  if (content !== undefined && (typeof content !== 'string' || Buffer.byteLength(content) > 5 * 1024 * 1024)) throw new Error('源码必须是 5 MB 以内的文本');
  const root = getWorkspaceRoot();
  const source = resolveInWorkspace(path.join(path.dirname(file.abs), `.mli-preview-${randomUUID()}${ext}`), { write: true });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mli-typesetting-'));
  const output = path.join(directory, 'preview.pdf');
  try {
    await fs.writeFile(source, content ?? await fs.readFile(file.abs, 'utf8'), { flag: 'wx' });
    const engines = ext === '.typ' ? ['typst'] : ['xelatex', 'tectonic', 'pdflatex'];
    for (const engine of engines) {
      const args = engine === 'typst'
        ? ['compile', '--root', root, source, output]
        : engine === 'tectonic'
          ? ['--untrusted', '--outdir', directory, path.basename(source)]
          : ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-jobname=preview', `-output-directory=${directory}`, path.basename(source)];
      try {
        // Repeat TeX passes for ordinary references and tables of contents.
        for (let pass = 0; pass < (['xelatex', 'pdflatex'].includes(engine) ? 2 : 1); pass++) {
          await run(engine, args, { cwd: path.dirname(file.abs), timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true,
            env: typesettingEnvironment() });
        }
        const pdf = engine === 'tectonic' ? path.join(directory, `${path.basename(source, ext)}.pdf`) : output;
        const stat = await fs.stat(pdf);
        if (stat.size > 50 * 1024 * 1024) throw new Error('预览 PDF 超过 50 MB 上限');
        const bytes = await fs.readFile(pdf);
        if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('编译器未生成有效的 PDF');
        return bytes;
      } catch (error) {
        if (error.code === 'ENOENT' && error.syscall?.startsWith('spawn')) continue;
        const diagnostics = [error.stderr, error.stdout].filter(Boolean).join('\n').slice(-16000);
        throw new Error(`${engine} ${error.killed ? '编译超时（60 秒）' : '编译失败'}${diagnostics ? `\n${diagnostics}` : `：${error.message}`}`);
      }
    }
    throw new Error(missingCompiler);
  } finally {
    await fs.rm(source, { force: true });
    await fs.rm(directory, { recursive: true, force: true });
  }
}
