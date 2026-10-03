import path from 'node:path';

export const HELP = `MLI Agent

  mli [--cwd PATH] [--resume [SESSION]]
  mli exec [--json] [--auto] [--resume SESSION] "PROMPT"
  mli models
  mli model MODEL_ID
  mli config
  mli login
  mli logout
  mli serve

  --data-dir PATH   User configuration directory
  --connect URL     Connect to an existing loopback runtime
  --help            Show this help
  --version         Show version
`;

export function parseOptions(args, cwd = process.cwd()) {
  const options = { command: 'tui', cwd: path.resolve(cwd), positional: [], json: false, auto: false };
  const commands = new Set(['exec', 'models', 'model', 'config', 'login', 'logout', 'serve']);
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === '--') { options.positional.push(...args.slice(index + 1)); break; }
    if (value === '--help' || value === '-h') options.help = true;
    else if (value === '--version' || value === '-v') options.version = true;
    else if (value === '--json') options.json = true;
    else if (value === '--auto') options.auto = true;
    else if (value === '--resume') {
      options.resume = true;
      if (args[index + 1] && !args[index + 1].startsWith('-')) options.resume = args[++index];
    } else if (['--cwd', '--data-dir', '--connect'].includes(value)) {
      const next = args[++index];
      if (!next || next.startsWith('--')) throw new Error(`${value} requires a value`);
      if (value === '--cwd') options.cwd = path.resolve(cwd, next);
      if (value === '--data-dir') options.dataRoot = path.resolve(cwd, next);
      if (value === '--connect') options.connect = next;
    } else if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    else if (commands.has(value) && options.command === 'tui' && !options.positional.length) options.command = value;
    else options.positional.push(value);
  }
  if (options.command === 'exec' && options.resume === true) throw new Error('mli exec --resume requires a session ID');
  if (options.command !== 'exec' && (options.json || options.auto)) throw new Error('--json and --auto are only available for mli exec');
  return options;
}

export function loopbackUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('--connect requires a loopback HTTP origin');
  return url.origin;
}
