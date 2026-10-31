// Parse bounded, tagged /proc snapshots. Rates use remote uptime, never SSH round-trip time.
export function parseMonitorSnapshot(text) {
 const groups={};for(const line of String(text).split('\n')){const m=line.match(/^MLI_([A-Z_]+):(.*)$/);if(m)(groups[m[1]]??=[]).push(m[2]);}
 const cpu=new Map();for(const line of groups.CPU||[]){const m=line.match(/^(cpu\d*)\s+(.+)$/);if(!m)continue;const v=m[2].trim().split(/\s+/).map(Number);if(v.length<4||v.some(x=>!Number.isFinite(x)||x<0))continue;cpu.set(m[1],{total:v.slice(0,8).reduce((a,b)=>a+b,0),idle:v[3]+(v[4]||0)});}
 const network=new Map();for(const line of groups.NET||[]){const m=line.match(/^\s*([^:]+):\s*(.*)$/);if(!m||m[1]==='lo')continue;const v=m[2].trim().split(/\s+/).map(Number);if(v.length>=16&&v.every(Number.isFinite))network.set(m[1],{name:m[1],receivedBytes:v[0],transmittedBytes:v[8],receiveErrors:v[2],transmitErrors:v[10]});}
 const io=new Map();for(const line of groups.IO||[]){const v=line.trim().split(/\s+/);if(v.length>=14&&!/^(loop|ram|fd|sr)/.test(v[2]))io.set(v[2],{name:v[2],readBytes:Number(v[5])*512,writtenBytes:Number(v[9])*512,ioMs:Number(v[12])});}
 const mounts=(groups.MOUNTS||[]).flatMap(line=>{const v=line.trim().split(/\s+/);if(v.length<7||!/^\d+$/.test(v[2]))return [];const decode=x=>x.replace(/\\(040|011|012|134)/g,(_,n)=>String.fromCharCode(parseInt(n,8)));return [{device:decode(v[0]),filesystem:v[1],totalBytes:Number(v[2])*1024,usedBytes:Number(v[3])*1024,availableBytes:Number(v[4])*1024,usedPercent:Number(v[5].replace('%','')),path:decode(v.slice(6).join(' '))}];});
 const system=Object.fromEntries((groups.SYSTEM||[]).flatMap(line=>{const index=line.indexOf('\t');return index<0?[]:[[line.slice(0,index),line.slice(index+1)]];}));
 return {cpu,network,io,mounts,system,uptime:Number(groups.UPTIME?.[0])};
}
export function compareMonitorSnapshots(first,second) {
 const a=parseMonitorSnapshot(first),b=parseMonitorSnapshot(second),seconds=b.uptime-a.uptime;
 const rate=(current,previous)=>Number.isFinite(seconds)&&seconds>0&&Number.isFinite(previous)&&current>=previous?(current-previous)/seconds:null;
 const percent=(next,prev)=>{if(!prev||next.total<=prev.total||next.idle<prev.idle)return null;return Math.max(0,Math.min(100,100*(1-(next.idle-prev.idle)/(next.total-prev.total))));};
 return {system:b.system,perCore:[...b.cpu].filter(([name])=>name!=='cpu').map(([name,value])=>({name,utilizationPercent:percent(value,a.cpu.get(name))})),network:[...b.network].map(([name,value])=>({...value,receiveBytesPerSecond:rate(value.receivedBytes,a.network.get(name)?.receivedBytes),transmitBytesPerSecond:rate(value.transmittedBytes,a.network.get(name)?.transmittedBytes)})),diskIO:[...b.io].map(([name,value])=>({...value,readBytesPerSecond:rate(value.readBytes,a.io.get(name)?.readBytes),writeBytesPerSecond:rate(value.writtenBytes,a.io.get(name)?.writtenBytes),busyPercent:rate(value.ioMs,a.io.get(name)?.ioMs)==null?null:Math.min(100,rate(value.ioMs,a.io.get(name)?.ioMs)/10)})),mounts:b.mounts,sampleSeconds:Number.isFinite(seconds)&&seconds>0?seconds:null};
}
