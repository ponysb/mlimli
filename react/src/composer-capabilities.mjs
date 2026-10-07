export function composerTrigger(text, caret = text.length) {
  const prefix = text.slice(0, caret);
  const match = /(?:^|\s)([@/])([^\s@/()]*)$/.exec(prefix);
  if (!match) return null;
  return { symbol: match[1], query: match[2], start: caret - match[2].length - 1, end: caret };
}

export function capabilityItems(info = {}) {
  info ||= {};
  const skills = [...(info.localSkills || []), ...(info.plugins?.skills || [])];
  return [
    ...(info.commands || []).map(item => ({ ...item, key: `command:${item.name}`, kind: 'command', group: '命令', name: item.name.startsWith('/') ? item.name : `/${item.name}` })),
    ...(info.plugins?.plugins || []).map(item => ({ ...item, key: `plugin:${item.name}`, kind: 'plugin', group: '插件' })),
    ...skills.filter((item, index) => skills.findIndex(other => other.name === item.name) === index).map(item => ({ ...item, key: `skill:${item.name}`, kind: 'skill', group: 'Skill' })),
    ...(info.experts || []).map(item => ({ ...item, key: `expert:${item.id}`, kind: 'expert', group: '专家' })),
  ];
}

export function referenceToken(item) {
  if (item.kind === 'command') return item.name;
  return `@${item.kind}(${JSON.stringify(['file', 'folder'].includes(item.kind) ? item.path : item.name)})`;
}

export function insertCapability(text, trigger, item) {
  const insertion = ['expert', 'browse', 'upload', 'board', 'compact'].includes(item.kind) ? '' : referenceToken(item) + ' ';
  return { text: text.slice(0, trigger.start) + insertion + text.slice(trigger.end), caret: trigger.start + insertion.length };
}

export function splitComposerReferences(serialized) {
  const references = [], seen = new Set();
  const text = String(serialized || '').replace(/@(file|folder|skill|plugin)\(("(?:[^"\\]|\\.)*")\)/g, (token, kind, encoded) => {
    let target;
    try { target = JSON.parse(encoded); } catch { return token; }
    if (!seen.has(token)) {
      seen.add(token);
      references.push({ key: token, kind, name: ['file', 'folder'].includes(kind) ? target.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) || '工作目录' : target, ...(['file', 'folder'].includes(kind) ? { path: target } : {}) });
    }
    return '';
  });
  return { text: references.length ? text.replace(/^[ \t]*\r?\n/, '').replace(/^[ \t]+$/, '') : text, references };
}

export function joinComposerReferences(text, references = []) {
  const tokens = [...new Set(references.map(referenceToken))];
  return tokens.length ? tokens.join(' ') + (text ? '\n' + text : '') : text;
}
