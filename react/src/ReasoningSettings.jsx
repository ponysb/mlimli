import React from 'react';
import { reasoningChoices } from '../../core/reasoning.mjs';

export default function ReasoningSettings({ model, onChange }) {
  const choices = reasoningChoices(model);
  const setting = model.reasoningSettings || {};
  const value = Object.hasOwn(setting, 'value') ? setting.value
    : setting.mode === 'effort' ? setting.effort : setting.mode === 'budget' ? setting.budget
      : setting.mode === 'enabled' ? 'auto' : setting.mode === 'disabled' ? 'none' : undefined;
  const selected = choices.findIndex(item => item.value === value);
  const legacy = value !== undefined && selected < 0;
  if (!choices.length && value === undefined) return null;
  return <label className="model-reasoning-settings">思考深度
    <select value={legacy ? 'saved' : selected < 0 ? 'default' : String(selected)} onChange={event => onChange(event.target.value === 'default' ? { mode: 'default' } : { value: choices[Number(event.target.value)].value })}>
      <option value="default">模型默认</option>
      {choices.map((item, index) => <option key={index} value={String(index)}>{item.label || String(item.value)}</option>)}
      {legacy && <option value="saved" disabled>{String(value)}（已保存）</option>}
    </select>
  </label>;
}
