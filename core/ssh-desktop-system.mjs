import { openDesktopAppTunnel } from './ssh-desktop-tunnel.mjs';
import { ecosystemApps, packageApps } from '../shared/ssh-app-catalog.mjs';
import { getSshSessionClient } from './ssh-runtime.mjs';

import { appNetworkCommand, describeAppInstallError } from './ssh-app-network.mjs';

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const serviceName = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.@:-]{0,199}\.service$/.test(value)) throw new Error('服务名称无效'); return value; };
const containerId = value => { if (typeof value !== 'string' || !/^[a-f0-9]{12,64}$/.test(value)) throw new Error('容器 ID 无效'); return value; };
const packageName = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9+_.:-]{0,127}$/.test(value)) throw new Error('软件包名称无效'); return value; };
const privileged = command => `if [ "$(id -u)" = 0 ]; then ${command}; else sudo -n -- ${command}; fi`;

export function desktopSystemCommand(input = {}) {
  const { area, action = 'list', target } = input;
  if (area === 'sources' && action === 'check') return {command:appNetworkCommand(),readOnly:true,timeoutMs:45000};
  if (area === 'ecosystem') {
    const check = 'command -v docker >/dev/null 2>&1 || { printf "请先安装 Docker，并确保当前账户可以访问 Docker 引擎\\n" >&2; exit 69; }; ';
    if (action === 'list') return { command: check + `docker ps -a --no-trunc --filter label=com.mli.desktop.app --format '{{json .}}'`, readOnly: true };
    const app = ecosystemApps.find(item => item.id === target);
    if (!app) throw new Error('未知生态应用');
    const name = `mli-app-${app.id}`;
    const guard = `test "$(docker inspect --format '{{index .Config.Labels "com.mli.desktop.app"}}' ${quote(name)})" = ${quote(app.id)} || { printf '容器不属于此应用，拒绝操作\\n' >&2; exit 65; }; `;
    if (['start','stop','restart','logs','detail'].includes(action)) {
      const cmd = action === 'logs' ? `docker logs --tail 150 --timestamps ${quote(name)} 2>&1` : action === 'detail' ? `docker inspect --format '{{json .State}} {{json .NetworkSettings.Ports}}' ${quote(name)}` : `docker ${action} ${quote(name)}`;
      return { command: check + guard + cmd, readOnly: ['logs','detail'].includes(action), timeoutMs: 60000 };
    }
    if (action === 'install') {
      const port = Number(input.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('请选择 1024–65535 的本机绑定端口');
      const password = String(input.password || '');
      if ((app.secret || app.passwordArg) && (!/^[A-Za-z0-9_!@%+=.,:-]{12,128}$/.test(password))) throw new Error('密码需为 12–128 位字母、数字或 _!@%+=.,:-');
      const flags = [`--name ${quote(name)}`, '--restart unless-stopped', `--label com.mli.desktop.app=${quote(app.id)}`, `-p ${quote(`127.0.0.1:${port}:${app.port}`)}`];
      if (app.volume) flags.push(`-v ${quote(`${name}-data:${app.volume}`)}`);
      if (app.socket) flags.push('-v /var/run/docker.sock:/var/run/docker.sock');
      for (const value of app.env || []) flags.push(`-e ${quote(value)}`);
      if (app.secret) flags.push(`-e ${quote(`${app.secret}=${password}`)}`);
      const args = app.passwordArg ? ` redis-server --appendonly yes --requirepass ${quote(password)}` : '';
      return { command: check + `if docker container inspect ${quote(name)} >/dev/null 2>&1; then printf '同名容器已存在，请刷新状态或在 Docker 管理中检查\\n' >&2; exit 73; fi; docker pull ${quote(app.image)} && docker run -d ${flags.join(' ')} ${quote(app.image)}${args}`, readOnly: false, timeoutMs: 600000 };
    }
  }
  if (area === 'toolkits' && action === 'install') {
    const app = packageApps.find(item => item.id === target);
    if (!app) throw new Error('未知开发工具或套件');
    const names = kind => app.packages[kind].split(' ').map(quote).join(' ');
    return { command: `if command -v apt-get >/dev/null 2>&1; then ${privileged('apt-get update')} && ${privileged(`env DEBIAN_FRONTEND=noninteractive apt-get install -y -- ${names('apt')}`)}; elif command -v dnf >/dev/null 2>&1; then ${privileged(`dnf install -y -- ${names('rpm')}`)}; elif command -v yum >/dev/null 2>&1; then ${privileged(`yum install -y -- ${names('rpm')}`)}; elif command -v apk >/dev/null 2>&1; then ${privileged(`apk add -- ${names('apk')}`)}; else printf '不支持此软件包管理器' >&2; exit 69; fi`, readOnly:false, timeoutMs:600000 };
  }
  if (area === 'tools' && action === 'list') {
    const commands = {
      databases: `printf 'DATABASE CLIENTS\\n'; for c in mysql mariadb psql redis-cli mongosh sqlite3; do command -v "$c" || true; done; printf '\\nDATABASE SERVICES\\n'; if command -v systemctl >/dev/null; then systemctl list-units --type=service --all --no-pager --plain --no-legend | grep -E 'mysql|mariadb|postgres|redis|mongo' || true; fi; printf '\\nLISTENING PORTS\\n'; ss -lnt 2>/dev/null || true`,
      development: `printf 'RUNTIMES\\n'; for c in node npm python3 php java go rustc git svn; do if command -v "$c" >/dev/null 2>&1; then printf '\\n%s: ' "$c"; "$c" --version 2>&1 | head -n 3; fi; done; printf '\\nPROCESS MANAGERS\\n'; command -v pm2 || true; command -v supervisorctl || true`,
      utilities: `printf 'DISKS\\n'; df -hP; printf '\\nBLOCK DEVICES\\n'; lsblk 2>/dev/null || true; printf '\\nSCHEDULED TASKS (CURRENT USER)\\n'; crontab -l 2>/dev/null || true; printf '\\nSYSTEM TIMERS\\n'; if command -v systemctl >/dev/null; then systemctl list-timers --all --no-pager; fi`,
    };
    if (!Object.hasOwn(commands, target)) throw new Error('未知桌面工具');
    return { command:commands[target], readOnly:true };
  }
  if (area === 'settings' && action === 'list') return {command: 'printf "TIME\\n"; date; printf "TIMEZONE\\n"; cat /etc/timezone 2>/dev/null || true; printf "CRON\\n"; crontab -l 2>/dev/null || true; printf "DNS\\n"; cat /etc/resolv.conf; printf "REPOSITORIES\\n"; cat /etc/apt/sources.list 2>/dev/null || true; ls /etc/apt/sources.list.d /etc/yum.repos.d /etc/apk/repositories 2>/dev/null || true', readOnly:true};
  if (area === 'overview' && action === 'list') return { command: 'printf "HOST\\t"; hostname; printf "KERNEL\\t"; uname -sr; printf "ARCH\\t"; uname -m; printf "USER\\t"; id -un; if [ -r /etc/os-release ]; then . /etc/os-release; printf "OS\\t%s\\n" "$PRETTY_NAME"; fi; printf "NETWORK\\n"; ip -brief address 2>/dev/null || true; printf "DISKS\\n"; df -hP 2>/dev/null; printf "PORTS\\n"; ss -lntup 2>/dev/null || true', readOnly: true };
  if (area === 'services') {
    if (action === 'list') return { command: 'command -v systemctl >/dev/null 2>&1 || { printf "此服务器未安装 systemd\\n" >&2; exit 69; }; systemctl list-units --type=service --all --plain --no-legend --no-pager', readOnly: true };
    const name = serviceName(target);
    if (action === 'logs') return { command: `journalctl -u ${quote(name)} -n 200 --no-pager -o short-iso`, readOnly: true };
    if (action === 'detail') return { command: `systemctl show --no-pager --property=Id,Description,LoadState,ActiveState,SubState,UnitFileState,MainPID,MemoryCurrent,ExecMainStatus ${quote(name)}`, readOnly: true };
    if (['start', 'stop', 'restart', 'enable', 'disable'].includes(action)) return { command: privileged(`systemctl ${action} -- ${quote(name)}`), readOnly: false };
  }
  if (area === 'containers') {
    if (action === 'list') return { command: `command -v docker >/dev/null 2>&1 || { printf "此服务器未安装 Docker\\n" >&2; exit 69; }; docker ps -a --no-trunc --format '{{json .}}'`, readOnly: true };
    const id = containerId(target);
    if (action === 'logs') return { command: `docker logs --tail 200 --timestamps ${quote(id)} 2>&1`, readOnly: true };
    if (action === 'detail') return { command: `docker inspect --format '{{json .State}}' ${quote(id)}`, readOnly: true };
    if (['start', 'stop', 'restart'].includes(action)) return { command: `docker ${action} ${quote(id)}`, readOnly: false };
  }
  if (area === 'packages') {
    if (action === 'list') return { command: `if command -v dpkg-query >/dev/null 2>&1; then dpkg-query -W -f='\${binary:Package}\\t\${Version}\\t\${db:Status-Abbrev}\\n'; elif command -v rpm >/dev/null 2>&1; then rpm -qa --qf '%{NAME}\\t%{VERSION}-%{RELEASE}\\tinstalled\\n'; elif command -v apk >/dev/null 2>&1; then for p in $(apk info); do printf '%s\\t%s\\tinstalled\\n' "$p" "$(apk info -v "$p" | head -n 1)"; done; else printf '不支持此服务器的软件包管理器\\n' >&2; exit 69; fi`, readOnly: true };
    if (action === 'search') {
      const query = String(input.query || '').trim();
      if (!/^[a-zA-Z0-9][a-zA-Z0-9+_.-]{0,63}$/.test(query)) throw new Error('请输入有效的软件名称');
      return { command: `if command -v apt-cache >/dev/null 2>&1; then apt-cache search --names-only -- ${quote(query)}; elif command -v dnf >/dev/null 2>&1; then dnf -q search -- ${quote(query)}; elif command -v apk >/dev/null 2>&1; then apk search ${quote(query)}; else printf '此平台暂不支持软件源搜索\n' >&2; exit 69; fi`, readOnly: true };
    }
    if (action === 'install') {
      const name = packageName(target);
      return { command: `if command -v apt-get >/dev/null 2>&1; then ${privileged('apt-get update')} && ${privileged(`env DEBIAN_FRONTEND=noninteractive apt-get install -y -- ${quote(name)}`)}; elif command -v dnf >/dev/null 2>&1; then ${privileged(`dnf install -y -- ${quote(name)}`)}; elif command -v yum >/dev/null 2>&1; then ${privileged(`yum install -y -- ${quote(name)}`)}; elif command -v apk >/dev/null 2>&1; then ${privileged(`apk add -- ${quote(name)}`)}; else printf '不支持此服务器的软件包管理器\\n' >&2; exit 69; fi`, readOnly: false, timeoutMs: 600000 };
    }
  }
  if (area === 'firewall') {
    if (action === 'list') return { command: `if command -v ufw >/dev/null 2>&1; then ${privileged('ufw status verbose')}; elif command -v firewall-cmd >/dev/null 2>&1; then ${privileged('firewall-cmd --list-all')}; elif command -v nft >/dev/null 2>&1; then ${privileged('nft list ruleset')}; else printf '未发现 UFW、firewalld 或 nftables\\n' >&2; exit 69; fi`, readOnly: true };
    if (action === 'allow') {
      const port = Number(input.port), protocol = input.protocol;
      if (!Number.isInteger(port) || port < 1 || port > 65535 || !['tcp', 'udp'].includes(protocol)) throw new Error('请输入有效端口和协议');
      return { command: `if command -v ufw >/dev/null 2>&1; then ${privileged(`ufw allow ${port}/${protocol}`)}; elif command -v firewall-cmd >/dev/null 2>&1; then ${privileged(`firewall-cmd --add-port=${port}/${protocol}`)}; else printf '端口放行仅支持 UFW 或 firewalld\\n' >&2; exit 69; fi`, readOnly: false };
    }
  }
  throw new Error('不支持的服务器管理操作');
}

export function executeDesktopSystemCommand(client, command, { timeoutMs = 15000, maxBytes = 512 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false, stream, total = 0;
    const stdout = [], stderr = [];
    const finish = (error, code) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), code, truncated: total > maxBytes }); };
    const timer = setTimeout(() => { stream?.signal?.('TERM'); stream?.close?.(); finish(new Error('操作超时，执行结果可能尚未确定，请刷新状态后重试')); }, timeoutMs);
    try { client.exec(command, { pty: false }, (error, value) => {
      if (error) return finish(error);
      stream = value;
      if (settled) { stream.close?.(); return; }
      const collect = chunks => data => { const buffer = Buffer.from(data), remaining = Math.max(0, maxBytes - total); total += buffer.length; if (remaining) chunks.push(buffer.subarray(0, remaining)); };
      stream.on('data', collect(stdout)); stream.stderr.on('data', collect(stderr));
      stream.once('error', error => finish(error));
      stream.once('close', code => finish(null, code ?? null));
    }); } catch (error) { finish(error); }
  });
}

export async function manageSshDesktopSystem(connectionId, input) {
  if (input.area === 'ecosystem' && input.action === 'open') {
    const app=ecosystemApps.find(item=>item.id===input.target);
    if(!app || app.category==='database' && app.id!=='adminer') throw new Error('此应用使用数据库协议，请通过数据库客户端连接');
    const client=getSshSessionClient(connectionId);
    const guard=desktopSystemCommand({area:'ecosystem',action:'detail',target:app.id}).command;
    const result=await executeDesktopSystemCommand(client,guard);
    if(result.code!==0)throw new Error(result.stderr||'无法读取应用状态');
    const split=result.stdout.trim().indexOf('} ');
    if(split<0)throw new Error('服务器未返回应用端口');
    const state=JSON.parse(result.stdout.slice(0,split+1));
    const ports=JSON.parse(result.stdout.slice(split+2));
    if(!state.Running)throw new Error('请先启动应用');
    const binding=ports[`${app.port}/tcp`]?.find(value=>value.HostIp==='127.0.0.1');
    if(!binding)throw new Error('没有找到应用的本机绑定端口');
    const port=await openDesktopAppTunnel(client,`${connectionId}:${app.id}`,Number(binding.HostPort));
    return {url:`${app.id==='portainer'?'https':'http'}://127.0.0.1:${port}`,stdout:'SSH 隧道已建立，仅监听本机；连接断开或一小时后自动关闭。',code:0};
  }
  const plan = desktopSystemCommand(input);
  const result = await executeDesktopSystemCommand(getSshSessionClient(connectionId), plan.command, { timeoutMs: plan.timeoutMs || 20000 });
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || `退出码 ${result.code}`).trim().slice(0, 2000);
    const hint = describeAppInstallError(detail);
    if(hint)throw new Error(`${hint}\n${detail}`);
    throw new Error(/sudo:.*(password|密码)|permission denied|access denied/i.test(detail) ? `权限不足，请使用具备此操作权限的 SSH 账户：${detail}` : detail);
  }
  return { ...result, area: input.area, action: input.action || 'list', sampledAt: Date.now() };
}
