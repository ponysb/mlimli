export function expandComposerReferences(text, { skills = [], plugins = [] } = {}) {
  const references = [...String(text).matchAll(/@(file|folder|skill|plugin)\(("(?:[^"\\]|\\.)*")\)/g)].slice(0, 20);
  const instructions = [], seen = new Set();
  for (const [, kind, encoded] of references) {
    let name;
    try { name = JSON.parse(encoded); } catch { continue; }
    if (name.length > 2000 || seen.has(`${kind}:${name}`)) continue;
    seen.add(`${kind}:${name}`);
    if (kind === 'file' || kind === 'folder') instructions.push(`用户引用了工作区${kind === 'file' ? '文件' : '文件夹'} ${JSON.stringify(name)}。根据任务按需通过文件工具读取；引用不扩大工作区或沙箱权限。`);
    if (kind === 'skill') {
      const skill = skills.find(item => item.name === name);
      instructions.push(skill ? `用户明确选择 Skill ${JSON.stringify(skill.name)}，先调用 read_skill 读取该技能，再按指南完成任务。` : `用户引用的 Skill ${JSON.stringify(name)} 当前未加载，请说明缺失，不要假定该能力可用。`);
    }
    if (kind === 'plugin') {
      const plugin = plugins.find(item => item.name === name || (name === 'desktop' && item.name === 'computer-use'));
      instructions.push(plugin ? `用户明确选择插件 ${JSON.stringify(plugin.name)}；使用其已注册且适用于任务的工具：${(plugin.tools || []).join(', ')}。如需该插件的 Skill，请按需调用 read_skill。` : `用户引用的插件 ${JSON.stringify(name)} 当前未加载，请说明缺失。`);
    }
  }
  return instructions.length ? `${text}\n\n[本轮显式引用]\n${instructions.join('\n')}` : text;
}
