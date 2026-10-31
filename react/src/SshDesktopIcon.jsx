import React, { useId } from 'react';

// Local vector artwork stays crisp at small taskbar sizes without network assets.
export default function SshDesktopIcon({ app }) {
  const uid = useId().replace(/:/g, '');
  const palettes = {
    launchpad:['#d4a6ff','#7664d9'], databases:['#8bd9e4','#3887af'], development:['#9eb8ff','#5d66c7'], utilities:['#ffd18e','#d28b43'], finder:['#8ae3ff','#2199e9'], monitor:['#263b42','#102126'],
    editor:['#ffffff','#dce5f0'], terminal:['#3d485a','#101825'],
    system:['#dce6f3','#7c90ad'], applications:['#80b9ff','#4264dd'],
    settings:['#e2e6eb','#8b9aaf'], trash:['#f3f6fa','#b6c4d6']
  };
  const [top,bottom]=palettes[app]||palettes.system;
  const fill=`url(#${uid})`;
  return <svg className="sd-app-art" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id={uid} x2="0" y2="1"><stop stopColor={top}/><stop offset="1" stopColor={bottom}/></linearGradient><linearGradient id={`${uid}shine`} x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".65"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient></defs>
    {app==='finder' ? <><path d="M7 18V13a5 5 0 0 1 5-5h15l6 7h19a5 5 0 0 1 5 5v30H7Z" fill="#278dcc"/><path d="M6 22a5 5 0 0 1 5-5h17l5 5h20a5 5 0 0 1 5 5l-3 25a5 5 0 0 1-5 4H11a5 5 0 0 1-5-5Z" fill={fill} stroke="#b5efff" strokeWidth="1"/><path d="M10 26h43" stroke="#d9f8ff" strokeOpacity=".65"/><path d="M12 47h36" stroke="#0875b5" strokeOpacity=".2"/></> : app==='trash' ? <><path d="m15 18 3 37a4 4 0 0 0 4 3h20a4 4 0 0 0 4-3l3-37" fill={fill} stroke="#f5f9ff"/><path d="M12 16h40v5H12Z" fill="#c5d1df" stroke="#f5f9ff"/><path d="M25 15v-4h14v4M25 28l1 21m12-21-1 21" fill="none" stroke="#7a8da4" strokeWidth="3" strokeLinecap="round"/></> : <><rect x="5" y="5" width="54" height="54" rx="13" fill={fill} stroke="#fff" strokeOpacity=".5"/><rect x="7" y="7" width="50" height="24" rx="11" fill={`url(#${uid}shine)`} opacity=".24"/>
      {app==='monitor'&&<><path d="M13 19h38M13 30h38M13 41h38M22 13v38M34 13v38M46 13v38" stroke="#80b8aa" strokeOpacity=".12"/><path d="M11 35h10l5-17 7 30 6-20 5 7h9" fill="none" stroke="#70f2af" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/></>}
      {app==='terminal'&&<g fill="none" stroke="#edf5ff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m17 22 10 10-10 10M33 42h14"/></g>}
      {app==='editor'&&<><path d="M19 12h20l9 9v31H19Z" fill="#000" opacity=".1" transform="translate(0 2)"/><path d="M17 11h21l9 9v31H17Z" fill="#fff" stroke="#aab9cc"/><path d="M38 11v10h9" fill="#e1eaf5" stroke="#aab9cc"/><path d="M23 28h18M23 34h18M23 40h13" stroke="#6c99c8" strokeWidth="2" strokeLinecap="round"/></>}
      {app==='system'&&<><rect x="14" y="14" width="36" height="15" rx="4" fill="#536a86" stroke="#f1f6fc"/><rect x="14" y="35" width="36" height="15" rx="4" fill="#536a86" stroke="#f1f6fc"/><circle cx="21" cy="22" r="2" fill="#8df5c6"/><circle cx="21" cy="43" r="2" fill="#8df5c6"/><path d="M30 22h13M30 43h13" stroke="#dce9f9" strokeWidth="2" strokeLinecap="round"/></>}
      {app==='launchpad'&&[17,28,39].flatMap(x=>[17,28,39].map(y=><rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" rx="2" fill="white"/>))}
      {app==='databases'&&<g fill="#d5f5ff" stroke="#286988" strokeWidth="1.5"><path d="M17 23v21c0 9 30 9 30 0V23"/><ellipse cx="32" cy="22" rx="15" ry="7"/><path d="M17 33c0 9 30 9 30 0M17 42c0 9 30 9 30 0" fill="none"/></g>}
      {app==='development'&&<path d="m23 23-10 9 10 9m18-18 10 9-10 9m-6-24-6 30" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
      {app==='utilities'&&<path d="M40 14a12 12 0 0 0-14 15L14 42a5 5 0 0 0 8 8l13-13a12 12 0 0 0 15-14l-9 8-8-8Z" fill="#fff1d5" stroke="#ad7132" strokeWidth="1.5"/>}
      {app==='applications'&&[18,33].flatMap((x)=>[18,33].map(y=><rect key={`${x}-${y}`} x={x} y={y} width="12" height="12" rx="3" fill="white" opacity={x===y?1:.8}/>))}
      {app==='settings'&&<><g transform="translate(32 32)" fill="#677990">{Array.from({length:8},(_,i)=><rect key={i} x="-4" y="-22" width="8" height="14" rx="2" transform={`rotate(${i*45})`}/>)}<circle r="17" stroke="#eef3fa" strokeWidth="1.2"/><circle r="9" fill="#cad5e2" stroke="#53677f" strokeWidth="2"/><circle r="4" fill="#f3f6fb"/></g></>}
    </>}
  </svg>;
}
