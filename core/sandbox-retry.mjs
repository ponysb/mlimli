import crypto from 'node:crypto';
import { emit } from './events.mjs';
import { getTool, executeTool } from './plugins.mjs';
import { getSandboxPolicy, normalizeSandboxPolicy } from './sandbox-policy.mjs';
import { withRunContext } from './run-context.mjs';
import { prepareToolOutput } from './tool-output.mjs';

const activeRetries = new Set();

function reject(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function unsandboxedRetryCandidate(session, callId) {
  const entries = session.entries();
  const start = entries.find(entry => entry.type === 'tool_start' && entry.callId === callId);
  const end = entries.findLast(entry => entry.type === 'tool_end' && entry.callId === callId);
  if (!start || start.name !== 'bash') reject('只能重试当前会话中失败的 Bash 命令', 404);
  if (!end || end.name !== 'bash' || end.status !== 'error') reject('该 Bash 调用不是失败状态');
  // Launch failures, a busy native sandbox, and commands the sandbox denied
  // access to; never an ordinary non-zero exit.
  const sandboxFailure = end.canRetryWithoutSandbox === true && ['SANDBOX_UNAVAILABLE', 'SANDBOX_BUSY', 'SANDBOX_DENIED'].includes(end.errorDetails?.code);
  if (!sandboxFailure) reject('该失败不是沙箱故障或沙箱拒绝访问，不能绕过沙箱重试');
  if (entries.some(entry => entry.type === 'tool_end' && entry.retryOfCallId === callId)) reject('该命令已经执行过无沙箱重试');
  const command = String(start.args?.command || '');
  if (!command || end.command && end.command !== command) reject('原始命令记录不完整或已不一致');
  return { start, end, command };
}

export async function retryBashWithoutSandbox(session, callId, { confirmed, context }) {
  if (confirmed !== true) reject('必须明确确认以当前系统用户权限执行原命令', 400);
  if (activeRetries.has(session.id)) reject('该会话已有无沙箱重试正在运行');
  const candidate = unsandboxedRetryCandidate(session, callId);
  const tool = getTool('bash');
  if (!tool || tool.plugin !== 'core') reject('核心 Bash 工具不可用', 503);
  const retryCallId = `host_retry_${crypto.randomUUID()}`;
  const startedAt = Date.now();
  const audit = { sandboxBypassed: true, requestedByUser: true, retryOfCallId: callId, permissionLevel: 'L3', decision: 'user-confirmed' };
  const args = structuredClone(candidate.start.args || { command: candidate.command });
  const start = session.append({ type: 'tool_start', turnId: candidate.start.turnId, step: candidate.start.step, callId: retryCallId, name: 'bash', args, startedAt, ...audit });
  session.touchIndex();
  emit('unsandboxed_retry_started', { sessionId: session.id, callId: retryCallId, ...audit });
  activeRetries.add(session.id);
  let result;
  try {
    const policy = normalizeSandboxPolicy({ ...getSandboxPolicy(), mode: 'off' });
    result = await withRunContext(Object.freeze({ ...context, sandboxPolicy: policy }), () => executeTool(tool, args, { session, timeoutMs: context?.config?.agent?.toolTimeoutMs ?? 60000 }));
  } catch (error) {
    result = { content: `[工具异常] ${error.message}`, status: 'error', errorDetails: { stage: 'unsandboxed_retry', name: error.name || 'Error', code: error.code || '', message: error.message } };
  } finally { activeRetries.delete(session.id); }
  const prepared = prepareToolOutput(session, result, { turnId: candidate.start.turnId, maxChars: context?.config?.agent?.runControl?.maxToolOutputChars });
  const finishedAt = Date.now();
  const sandbox = { ...(result.sandbox || {}), backend: 'none', mode: 'off' };
  const end = session.append({
    type: 'tool_end', turnId: candidate.start.turnId, step: candidate.start.step, callId: retryCallId, name: 'bash', args,
    status: result.status || 'ok', content: prepared.content, output: prepared.output, toolState: prepared.state,
    errorDetails: result.errorDetails, exitCode: result.exitCode, command: result.command || candidate.command,
    testEvidence: result.testEvidence, verification: result.verification, sandbox,
    startedAt, finishedAt, durationMs: finishedAt - startedAt, ...audit,
  });
  session.touchIndex();
  emit('unsandboxed_retry_finished', { sessionId: session.id, callId: retryCallId, status: end.status, entry: end, ...audit });
  emit('session_updated', { sessionId: session.id });
  return { start, result: end };
}
