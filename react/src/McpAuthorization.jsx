import React, { useEffect, useRef, useState } from 'react';

export default function McpAuthorization({ id }) {
  const attempted = useRef(null);
  const [error, setError] = useState('');
  async function open() {
    setError('');
    try {
      if (!window.desktop?.openMcpAuthorization) throw new Error('请在桌面应用中使用内部浏览器授权。');
      await window.desktop.openMcpAuthorization(id);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { if (id && attempted.current !== id) { attempted.current = id; open(); } }, [id]);
  return <><button type="button" onClick={open}>在应用内打开授权页面</button>{error && <p role="alert">{error}</p>}</>;
}
