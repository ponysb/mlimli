// Shared allowlist: the browser selects IDs; the server owns deployment recipes.
export const ecosystemApps = [
  { id:'postgres', name:'PostgreSQL', category:'database', description:'关系数据库，独立持久化数据卷', image:'postgres:17-alpine', port:5432, secret:'POSTGRES_PASSWORD', volume:'/var/lib/postgresql/data', color:'#3979a4' },
  { id:'mysql', name:'MySQL', category:'database', description:'MySQL 8.4 LTS 数据库', image:'mysql:8.4', port:3306, secret:'MYSQL_ROOT_PASSWORD', volume:'/var/lib/mysql', color:'#438aaa' },
  { id:'mariadb', name:'MariaDB', category:'database', description:'开源关系数据库，兼容 MySQL 协议', image:'mariadb:11.4', port:3306, secret:'MARIADB_ROOT_PASSWORD', volume:'/var/lib/mysql', color:'#487f88' },
  { id:'redis', name:'Redis', category:'database', description:'键值存储与缓存，开启 AOF 持久化', image:'redis:7-alpine', port:6379, passwordArg:true, volume:'/data', color:'#d65353' },
  { id:'mongo', name:'MongoDB', category:'database', description:'文档数据库，初始管理员为 admin', image:'mongo:8', port:27017, secret:'MONGO_INITDB_ROOT_PASSWORD', env:['MONGO_INITDB_ROOT_USERNAME=admin'], volume:'/data/db', color:'#439b63' },
  { id:'adminer', name:'Adminer', category:'database', description:'Web 数据库管理界面，连接已有数据库', image:'adminer:4', port:8080, color:'#7083b4' },
  { id:'nginx', name:'Nginx', category:'web', description:'Web 服务与反向代理，配置在容器内管理', image:'nginx:stable-alpine', port:80, color:'#359e63' },
  { id:'caddy', name:'Caddy', category:'web', description:'轻量 Web 服务器，初始为默认站点', image:'caddy:2-alpine', port:80, volume:'/data', color:'#498e83' },
  { id:'gitea', name:'Gitea', category:'development', description:'自托管 Git 仓库，首次进入完成初始化', image:'gitea/gitea:1.24', port:3000, volume:'/data', color:'#60a361' },
  { id:'code-server', name:'Code Server', category:'development', description:'浏览器代码工作台，密码认证', image:'codercom/code-server:4.100.3', port:8080, secret:'PASSWORD', volume:'/home/coder/project', color:'#428bd5' },
  { id:'uptime-kuma', name:'Uptime Kuma', category:'utilities', description:'站点可用性与服务健康监测', image:'louislam/uptime-kuma:1', port:3001, volume:'/app/data', color:'#63ac8e' },
  { id:'portainer', name:'Portainer', category:'utilities', description:'容器可视化管理，HTTPS，需挂载 Docker Socket', image:'portainer/portainer-ce:2.27.9', port:9443, volume:'/data', socket:true, color:'#4a93ba' },
];
export const packageApps = [
  ['git','Git','development','版本管理与协作','git','git','git'],
  ['svn','Subversion','development','集中式版本管理','subversion','subversion','subversion'],
  ['node','Node.js / npm','runtime','发行版提供的 Node.js 开发环境','nodejs npm','nodejs npm','nodejs npm'],
  ['python','Python 3','runtime','Python 解释器与 pip','python3 python3-pip','python3 python3-pip','python3 py3-pip'],
  ['php','PHP','runtime','PHP 命令行与 FPM','php-cli php-fpm','php-cli php-fpm','php php-fpm'],
  ['java','OpenJDK','runtime','Java 开发套件','default-jdk','java-17-openjdk-devel','openjdk17'],
  ['build','C / C++ 工具链','runtime','编译器、Make 与基础构建工具','build-essential','gcc gcc-c++ make','build-base'],
  ['nginx-native','Nginx（系统服务）','web','原生安装，使用服务器管理启停','nginx','nginx','nginx'],
  ['supervisor','Supervisor','development','进程守护管理工具','supervisor','supervisor','supervisor'],
  ['htop','htop','utilities','交互式进程监控','htop','htop','htop'],
  ['curl','cURL','utilities','HTTP 请求与下载','curl','curl','curl'],
  ['tmux','tmux','utilities','持久终端会话','tmux','tmux','tmux'],
  ['vim','Vim','utilities','终端文本编辑器','vim','vim-enhanced','vim'],
  ['zip','ZIP / Unzip','utilities','压缩与解压','zip unzip','zip unzip','zip unzip'],
  ['rsync','rsync','utilities','增量同步与备份','rsync','rsync','rsync'],
  ['certbot','Certbot','web','ACME 证书工具，安装后需配置域名','certbot','certbot','certbot'],
].map(([id,name,category,description,apt,rpm,apk])=>({id,name,category,description,packages:{apt,rpm,apk}}));
export const appCategories = [['all','精选'],['database','数据库'],['development','开发工具'],['runtime','开发套件'],['web','网站服务'],['utilities','实用工具']];
export function parseInstalledPackages(text) {
  return new Map(String(text || '').split('\n').filter(Boolean).flatMap(line => {
    const [name,version,status] = line.split('\t');
    if (!version || !['ii','installed'].includes(status?.trim())) return [];
    return [[name.replace(/:[a-z0-9]+$/, ''),{version,status:'installed'}]];
  }));

}
