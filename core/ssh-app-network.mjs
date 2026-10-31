// All probe destinations are owned here, never supplied as shell text by the browser.
export function appNetworkCommand() {
  return `printf '=== 服务器与包管理器 ===\\n'; uname -sm; cat /etc/os-release 2>/dev/null | head -n 8
printf '\\n=== 当前发行版软件源 ===\\n'
for file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources /etc/yum.repos.d/*.repo /etc/apk/repositories; do
  [ -f "$file" ] || continue
  printf '\\n%s\\n' "$file"
  sed -n '/^[[:space:]]*#/d; /./p' "$file" | head -n 60 | sed -E 's#(https?://)[^/@[:space:]]+:[^/@[:space:]]+@#\\1[redacted]@#g'
done
printf '\\n=== Docker 镜像加速配置（引擎实际生效值）===\\n'
if command -v docker >/dev/null 2>&1; then docker info --format '{{json .RegistryConfig.Mirrors}}' 2>&1; else printf '未安装 Docker\\n'; fi
printf '\\n=== 从远程服务器探测 Docker Hub ===\\n'
if ! command -v curl >/dev/null 2>&1; then printf '缺少 curl，无法执行 HTTPS 探测；未自动安装。\\n'; exit 0; fi
for url in https://registry-1.docker.io/v2/ https://auth.docker.io/; do
  printf '%s ' "$url"
  status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --connect-timeout 5 --max-time 10 "$url" 2>/dev/null)
  result=$?
  case "$result" in
    0) case "$status" in 2??|3??|401|404) printf '可达 HTTP %s\\n' "$status";; 429) printf '请求受限 HTTP 429，稍后重试或使用已认证仓库\\n';; *) printf 'HTTP %s，请检查仓库或代理策略\\n' "$status";; esac;;
    5|6) printf 'DNS 解析失败（含代理域名）\\n';;
    7) printf '连接失败，请检查出站网络、防火墙或代理\\n';;
    28) printf '连接或响应超时\\n';;
    35|60) printf 'TLS 握手或证书校验失败\\n';;
    *) printf '网络检查失败，curl 退出码 %s\\n' "$result";;
  esac
done
printf '\\n说明：此检查使用 SSH 会话网络；Docker daemon 可能使用不同代理。入口可达不保证镜像层 CDN、架构或仓库权限可用。未更改软件源、代理或重启 Docker。\\n'`;
}
export function describeAppInstallError(detail) {
  if (/too many requests|toomanyrequests|429/i.test(detail)) return '镜像仓库限流：请稍后重试，或配置可信的已认证仓库。';
  if (/could not resolve|temporary failure resolving|no such host|name resolution/i.test(detail)) return '服务器 DNS 解析失败：请检查远程服务器 DNS 和代理域名。';
  if (/x509|certificate|tls handshake/i.test(detail)) return '服务器 TLS 或证书校验失败：请检查系统时间、CA 证书与代理。';
  if (/manifest unknown|no matching manifest|not found.*manifest/i.test(detail)) return '镜像版本不存在或不支持此服务器架构。';
  if (/unauthorized|authentication required|pull access denied/i.test(detail)) return '镜像仓库认证失败或无拉取权限：请检查服务器 Docker 登录状态。';
  if (/timeout|timed out|network is unreachable|connection refused/i.test(detail)) return '服务器下载网络不可用或超时：请在应用中心检查远程网络和镜像加速配置。';
  return '';
}
