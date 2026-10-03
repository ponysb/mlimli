import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Heart, X } from 'lucide-react';
import publicAccountQr from '../../electron/assets/dyh.png';
import qqQr from '../../electron/assets/qq.png';
import './follow-me.css';

export default function FollowMe() {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  useEffect(() => { if (open && !dialog.current.open) dialog.current.showModal(); }, [open]);
  return <><button className="follow-me-button" onClick={() => setOpen(true)}><Heart size={16}/>关注我</button>{open && <dialog className="follow-me-dialog" ref={dialog} aria-labelledby="follow-me-title" onClose={() => setOpen(false)} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
  }}><header><div><h2 id="follow-me-title">关注我</h2><p>分享 Agent 实践、产品更新与创作经验</p></div><button aria-label="关闭关注我" onClick={() => dialog.current.close()}><X size={18}/></button></header><div className="follow-me-links"><a href="https://space.bilibili.com/7318180" target="_blank" rel="noopener noreferrer"><span className="follow-platform bilibili">B</span><span><b>B 站</b><small>视频与实践分享</small></span><ExternalLink size={16}/></a><a href="https://xhslink.cn/o/7exC6HysEHH" target="_blank" rel="noopener noreferrer"><span className="follow-platform xiaohongshu">红</span><span><b>小红书</b><small>日常分享与更新</small></span><ExternalLink size={16}/></a></div><div className="follow-me-codes"><figure><img src={publicAccountQr} alt="微信公众号二维码"/><figcaption><b>微信公众号</b><small>微信扫码关注</small></figcaption></figure><figure><img src={qqQr} alt="QQ 群二维码"/><figcaption><b>QQ 交流群</b><small>QQ 扫码加入</small></figcaption></figure></div></dialog>}</>;
}
