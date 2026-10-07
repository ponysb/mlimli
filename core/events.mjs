// core/events.mjs —— 全局事件总线：循环、服务端 SSE、权限引擎都挂在它上面
import { EventEmitter } from 'node:events';
import { getRunContext } from './run-context.mjs';

export const bus = new EventEmitter();
bus.setMaxListeners(100);
let sequence = 0;
export function eventSequence() { return sequence; }

/** 发出一个事件：{type, ts, ...data}，返回该事件对象 */
export function emit(type, data = {}) {
  const context = getRunContext();
  const identity = data.sessionId && data.sessionId === context?.agentId ? { rootSessionId: context.rootSessionId, agentId: context.agentId, taskId: context.taskId, isSubagent: Boolean(context.taskId) } : {};
  const evt = { ...identity, type, ts: Date.now(), ...data, seq: ++sequence };
  bus.emit('event', evt);
  return evt;
}

/** 订阅所有事件，返回取消订阅函数 */
export function onEvent(fn) {
  bus.on('event', fn);
  return () => bus.off('event', fn);
}
