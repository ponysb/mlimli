import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Gift, LoaderCircle, RefreshCw, Sparkles, Users, X } from 'lucide-react';
import './marketing.css';

async function request(path, method = 'GET') {
  const response = await fetch(`/api/account/marketing/${path}`, { method, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '活动加载失败');
  return data;
}
const number = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 6 });

export function useMarketing(account) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const generation = useRef(0);
  const authenticated = Boolean(account?.authenticated), userId = account?.user?.id;
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    try {
      const config = await request('config');
      const result = config.visible && authenticated ? await request('summary') : config;
      if (id === generation.current) { setData(result); setError(''); }
    } catch (reason) {
      if (id === generation.current) { setData(null); setError(reason.message); }
    }
  }, [authenticated, userId]);
  useEffect(() => {
    setData(null); void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    const focus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [refresh]);
  return { data, error, refresh };
}

export function MarketingCard({ data, onClick }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { if (!data?.visible) setDismissed(false); }, [data?.visible]);
  if (!data?.visible) return null;
  if (dismissed) return null;
  return <div className="magic-activity-card">
    <button className="magic-card-main" onClick={onClick}>
      <span className="magic-card-icon"><Gift size={20}/></span>
      <span><strong>魔力加油站</strong><small>{data.checkinEnabled ? data.checkedIn ? '今日已签到 · 明天继续' : <>今日可领 <b>{number(data.checkinReward)}</b> 魔力值</> : '邀请好友，双方得魔力值'}</small></span>
      <span className="magic-card-arrow">↗</span>
    </button>
    <button className="magic-card-close" title="关闭活动提示" aria-label="关闭活动提示" onClick={() => setDismissed(true)}><X size={13}/></button>
  </div>;
}

export default function MarketingPage({ marketing, account, onLogin, onBack, onBalance }) {
  const { data, error, refresh } = marketing;
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);
  async function checkin() {
    if (!account?.authenticated) return onLogin();
    setBusy(true); setMessage(''); setActionError('');
    try {
      const result = await request('checkin', 'POST');
      setMessage(result.alreadyClaimed ? '今天已经领过奖励啦，明天再来。' : `签到成功！${number(result.reward)} 魔力值已到账。`);
      onBalance(result.magicValue); await refresh();
    } catch (reason) { setActionError(reason.message); await refresh(); }
    finally { setBusy(false); }
  }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(data.inviteCode); setCopied(true); }
    catch { setActionError('复制失败，请选中邀请码手动复制。'); }
  }
  useEffect(() => { setCopied(false); }, [data?.inviteCode]);
  return <div className="magic-activities">
    <header className="magic-page-nav"><button onClick={onBack}><ArrowLeft size={16}/>返回工作台</button><button onClick={refresh} aria-label="刷新活动"><RefreshCw size={16}/></button></header>
    <div className="magic-page-heading"><span className="magic-eyebrow"><Sparkles size={14}/> 每一点灵感，都有魔力</span><h1>魔力加油站<span>给下一次创作，充个电。</span></h1><p>每天来见个面，或邀请一位新伙伴。让好想法继续发生。</p>{account?.authenticated && <span className="magic-balance">我的魔力值 <b>{number(account.user?.magicValue)}</b></span>}</div>
    {(error || actionError) && <p className="magic-error" role="alert">{actionError || error}<button onClick={refresh}>重新加载</button></p>}
    {message && <p className="magic-success" role="status"><Check size={16}/>{message}</p>}
    {!data && !error && <p className="magic-loading"><LoaderCircle className="spin" size={18}/>正在获取活动…</p>}
    {data && !data.visible && <div className="magic-empty"><Gift size={32}/><h2>活动暂未开启</h2><p>下一份魔力，敬请期待。</p></div>}
    <div className="magic-activity-grid">
      {data?.checkinEnabled && <section className="magic-reward-panel"><div className="magic-panel-heading"><span className="magic-panel-icon"><Gift size={22}/></span><span className="magic-tag">每日福利</span></div><h2>每天签到，积攒魔力</h2><p>打开工作台，给今天一个小小的开始。</p><div className="magic-reward-number">+{number(data.checkinReward)}<span>魔力值 / 天</span></div><button className="magic-primary" disabled={busy || (account?.authenticated && data.checkedIn)} onClick={checkin}>{busy ? <LoaderCircle size={16} className="spin"/> : data.checkedIn ? <Check size={16}/> : <Sparkles size={16}/>} {data.checkedIn ? '今日已领取' : account?.authenticated ? '领取今日魔力' : '登录后签到'}</button><small>每天限领一次 · 北京时间 00:00 刷新{data.checkedIn ? ` · 今日已领 ${number(data.receivedReward)}` : ''}</small></section>}
      {data?.inviteEnabled && <section className="magic-reward-panel magic-invite-panel"><div className="magic-panel-heading"><span className="magic-panel-icon"><Users size={22}/></span><span className="magic-tag">一起创造</span></div><h2>好用的工作台，分享给朋友</h2><p>新朋友注册时填写你的邀请码，双方都有奖励。</p><div className="magic-invite-rewards"><div><b>+{number(data.inviterReward)}</b><span>你获得的魔力值</span></div><div><b>+{number(data.inviteeReward)}</b><span>朋友获得的魔力值</span></div></div>{account?.authenticated ? <><label className="magic-invite-code">我的邀请码<div><input aria-label="我的邀请码" readOnly value={data.inviteCode || ''}/><button onClick={copyInvite} disabled={!data.inviteCode}><Copy size={15}/>{copied ? '已复制' : '复制'}</button></div></label><div className="magic-invite-stats"><span>成功邀请 <b>{number(data.inviteCount)}</b> 人</span><span>累计获得 <b>{number(data.inviteRewardTotal)}</b> 魔力值</span></div></> : <button className="magic-primary" onClick={onLogin}>登录获取邀请码</button>}</section>}
    </div>
    {data?.visible && <div className="magic-rules"><h3>活动说明</h3><p>签到奖励直接存入账户，可用于官方模型消费。邀请奖励仅适用于填写有效邀请码的新用户，完成邮箱验证并注册成功后自动到账；已注册账户不能补填。实际奖励以领取或注册时的活动配置为准，活动关闭后停止发放。</p></div>}
  </div>;
}
