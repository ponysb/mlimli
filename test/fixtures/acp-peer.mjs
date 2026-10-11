import fs from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { agent, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

const mode = process.argv[2] || 'normal';
let cwd;
const app = agent({ name: 'fixture' })
  .onRequest('initialize', () => {
    if (mode === 'exit') process.exit(3);
    return { protocolVersion: mode === 'version' ? 999 : PROTOCOL_VERSION, agentCapabilities: {} };
  })
  .onRequest('session/new', ({ params }) => { cwd = params.cwd; return { sessionId: 'external-session' }; })
  .onRequest('session/prompt', async ({ params, client }) => {
    if (mode === 'hang') await new Promise(() => {});
    if (mode === 'permission') {
      const response = await client.request('session/request_permission', {
        sessionId: params.sessionId,
        toolCall: { toolCallId: 'write', title: 'write proof', kind: 'edit', status: 'pending' },
        options: [{ optionId: 'yes', name: 'Allow once', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }],
      });
      if (response.outcome.outcome === 'selected' && response.outcome.optionId === 'yes') fs.writeFileSync(path.join(cwd, 'external-proof.txt'), 'approved');
    }
    await client.notify('session/update', { sessionId: 'foreign', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'foreign-secret' } } });
    await client.notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: mode === 'env' ? String(process.env.MLI_ACCOUNT_APP_SECRET || 'not-inherited') : 'External result' } } });
    return { stopReason: mode === 'refuse' ? 'refusal' : 'end_turn' };
  })
  .onNotification('session/cancel', () => {});

const connection = app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
await connection.closed;
