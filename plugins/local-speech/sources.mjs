import { URL } from 'node:url';

const PYPI_INDEXES = [
  { id: 'aliyun-pypi', name: '阿里云 PyPI', base: 'https://mirrors.aliyun.com/pypi/simple/' },
  { id: 'tencent-pypi', name: '腾讯云 PyPI', base: 'https://mirrors.cloud.tencent.com/pypi/simple/' },
  { id: 'huawei-pypi', name: '华为云 PyPI', base: 'https://repo.huaweicloud.com/repository/pypi/simple/' },
  { id: 'pypi', name: 'PyPI 官方', base: 'https://pypi.org/simple/' },
];

const HF_SOURCES = [
  { id: 'hf-mirror', name: 'HF 国内镜像', base: 'https://hf-mirror.com' },
  { id: 'huggingface', name: 'Hugging Face 官方', base: 'https://huggingface.co' },
];

const GITHUB_SOURCES = [
  { id: 'ghfast', name: 'GitHub 国内加速', prefix: 'https://ghfast.top/' },
  { id: 'ghproxy', name: 'GitHub 国内代理', prefix: 'https://gh-proxy.com/' },
  { id: 'github', name: 'GitHub 官方', prefix: '' },
];

const PYTHON_SOURCES = GITHUB_SOURCES;
const wheelSourceCache = new Map();

function unique(items) {
  return [...new Map(items.filter(Boolean).map(item => [item.url, item])).values()];
}

function githubURLs(url) {
  return GITHUB_SOURCES.map(source => ({ id: source.id, name: source.name, url: source.prefix + url }));
}

function hfURLs(url) {
  const parsed = new URL(url);
  const path = `${parsed.pathname}${parsed.search}`;
  return HF_SOURCES.map(source => ({ id: source.id, name: source.name, url: `${source.base}${path}` }));
}

function projectFromWheel(filename) {
  const match = String(filename).match(/^([A-Za-z0-9][A-Za-z0-9_.-]*)-(?:\d|v\d)/);
  return (match?.[1] || String(filename).split('-')[0]).replace(/_/g, '-').toLowerCase();
}

function exactHref(html, filename, base) {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(html).match(new RegExp(`href=["']([^"']*${escaped}[^"']*)["']`, 'i'));
  if (!match) return '';
  return new URL(match[1], base).href.split('#')[0];
}

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
}

export async function resolveWheelSources(filename, { accelerator = 'cpu', platform = process.platform } = {}) {
  const name = String(filename);
  const cacheKey = `${name}|${accelerator}|${platform}`;
  if (wheelSourceCache.has(cacheKey)) return wheelSourceCache.get(cacheKey);
  const pending = resolveWheelSourcesUncached(name, { accelerator, platform });
  wheelSourceCache.set(cacheKey, pending);
  return pending;
}

async function resolveWheelSourcesUncached(name, { accelerator = 'cpu', platform = process.platform } = {}) {
  const sources = [];
  if (/^torch[-+]/i.test(name)) {
    const channel = accelerator === 'cuda' ? 'cu128' : 'cpu';
    const index = `https://download.pytorch.org/whl/${channel}/torch/`;
    try {
      const response = await fetchWithTimeout(index, {}, 8000);
      if (response.ok) {
        const url = exactHref(await response.text(), name, index);
        if (url) sources.push({ id: `pytorch-${channel}`, name: `PyTorch ${channel} 官方`, url });
      }
    } catch {}
    if (platform === 'darwin' || !sources.length) {
      await Promise.all(PYPI_INDEXES.map(async index => { try { const base = `${index.base}${projectFromWheel(name)}/`; const response = await fetchWithTimeout(base, {}, 8000); if (response.ok) { const url = exactHref(await response.text(), name, base); if (url) sources.push({ id: index.id, name: index.name, url }); } } catch {} }));
    }
  } else {
    await Promise.all(PYPI_INDEXES.map(async index => { try { const base = `${index.base}${projectFromWheel(name)}/`; const response = await fetchWithTimeout(base, {}, 8000); if (response.ok) { const url = exactHref(await response.text(), name, base); if (url) sources.push({ id: index.id, name: index.name, url }); } } catch {} }));
  }
  return unique(sources);
}

export async function assetSources(file, options = {}) {
  if (file.sourceURL?.startsWith('https://')) {
    if (file.sourceURL.includes('huggingface.co/')) return hfURLs(file.sourceURL);
    if (file.sourceURL.includes('github.com/') || file.sourceURL.includes('raw.githubusercontent.com/')) return githubURLs(file.sourceURL);
    if (file.sourceURL.includes('python.org/')) {
      const parsed = new URL(file.sourceURL);
      const mirrorPath = parsed.pathname.replace(/^\/ftp\/python\//, '/-/binary/python/');
      return [{ id: 'npmmirror-python', name: '淘宝 NPM 镜像 Python', url: `https://registry.npmmirror.com${mirrorPath}` }, { id: 'python-official', name: 'Python 官方', url: file.sourceURL }];
    }
    return [{ id: 'official', name: '官方源', url: file.sourceURL }];
  }
  return resolveWheelSources(file.filename, options);
}

export async function checkSourceReachability(assets, report = () => {}) {
  const checks = [];
  const seen = new Set();
  for (const asset of assets) {
    for (const source of asset.sources || []) {
      const origin = new URL(source.url).origin;
      if (seen.has(origin)) continue;
      seen.add(origin);
      const started = Date.now();
      const item = { id: source.id, name: source.name, url: origin, state: 'checking', latencyMs: null, status: null, error: '', suggestion: '' };
      checks.push(item); report([...checks]);
      try {
        const response = await fetchWithTimeout(source.url, { method: 'HEAD' });
        item.status = response.status; item.latencyMs = Date.now() - started;
        if (response.ok || response.status === 206 || response.status === 302 || response.status === 405) item.state = 'available';
        else { item.state = 'unavailable'; item.error = `HTTP ${response.status}`; item.suggestion = '切换备用源后重试'; }
      } catch (error) {
        item.state = 'unavailable'; item.latencyMs = Date.now() - started; item.error = error?.cause?.code || error?.message || '连接失败'; item.suggestion = '检查 DNS、代理或防火墙后重试';
      }
      report([...checks]);
    }
  }
  return checks;
}

export function pickAvailableSource(sources, checks) {
  const available = new Set((checks || []).filter(item => item.state === 'available').map(item => item.url));
  return (sources || []).filter(source => available.size === 0 || available.has(new URL(source.url).origin));
}

export const sourcePolicy = {
  pypi: PYPI_INDEXES.map(({ id, name, base }) => ({ id, name, url: base })),
  huggingface: HF_SOURCES.map(({ id, name, base }) => ({ id, name, url: base })),
  github: GITHUB_SOURCES.map(({ id, name, prefix }) => ({ id, name, url: prefix || 'https://github.com' })),
  python: [{ id: 'npmmirror-python', name: '淘宝 NPM 镜像 Python', url: 'https://registry.npmmirror.com/-/binary/python/' }, { id: 'python-official', name: 'Python 官方', url: 'https://www.python.org/ftp/python/' }],
};
