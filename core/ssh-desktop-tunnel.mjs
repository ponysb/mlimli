import net from 'node:net';
const tunnels = new Map();
// Only ephemeral loopback listeners; remote destination is fixed by the deployment record.
export async function openDesktopAppTunnel(client, key, remotePort) {
  if (!Number.isInteger(remotePort) || remotePort < 1024 || remotePort > 65535) throw new Error('应用端口无效');
  const existing=tunnels.get(key);
  if(existing && existing.client===client && existing.remotePort===remotePort) {existing.touch();return existing.port;}
  existing?.close();
  const sockets=new Set();let timer;
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('error',()=>socket.destroy());socket.once('close',()=>sockets.delete(socket));
    client.forwardOut('127.0.0.1',socket.remotePort||0,'127.0.0.1',remotePort,(error,stream)=>{
      if(error||socket.destroyed){stream?.destroy();socket.destroy();return;}
      stream.on('error',()=>socket.destroy());socket.once('close',()=>stream.destroy());stream.once('close',()=>socket.destroy());socket.pipe(stream).pipe(socket);
    });
  });
  const entry={client,remotePort,port:0,touch(){clearTimeout(timer);timer=setTimeout(()=>entry.close(),60*60*1000);timer.unref();},close(){clearTimeout(timer);for(const socket of sockets)socket.destroy();server.close();client.off('close',entry.close);if(tunnels.get(key)===entry)tunnels.delete(key);}};
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  entry.port=server.address().port;tunnels.set(key,entry);client.once('close',entry.close);entry.touch();return entry.port;
}
