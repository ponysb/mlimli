// core/events.mjs —— 全局事件总线：循环、服务端 SSE、权限引擎都挂在它上面
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

/** 发出一个事件：{type, ts, ...data}，返回该事件对象 */
export function emit(type, data = {}) {
  const evt = { type, ts: Date.now(), ...data };
  bus.emit('event', evt);
  return evt;
}

/** 订阅所有事件，返回取消订阅函数 */
export function onEvent(fn) {
  bus.on('event', fn);
  return () => bus.off('event', fn);
}
