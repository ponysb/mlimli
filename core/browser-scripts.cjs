// Fixed scripts shared by local Electron and cloud desktop; never evaluate Agent-provided JS.
function snapshotScript(prefix) {
  return `(() => {
    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const secret = el => el.type === 'password' || /password|one-time-code|cc-/i.test(el.autocomplete || '') || /password|passwd|secret|token|otp|verification/i.test([el.name, el.id, el.getAttribute('aria-label')].join(' '));
    const elements = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')).filter(el => visible(el) && !secret(el)).slice(0, 200);
    window.__mliAppRefs = new Map();
    window.__mliAppRefUrl = location.href;
    const items = elements.map((el, i) => { const ref = ${JSON.stringify(prefix)} + '-' + i; window.__mliAppRefs.set(ref, el); return { ref, tag: el.tagName.toLowerCase(), type: el.type || '', label: (el.getAttribute('aria-label') || el.innerText || el.placeholder || el.name || '').slice(0, 160), disabled: Boolean(el.disabled) }; });
    return { title: document.title.slice(0, 200), text: (document.body?.innerText || '').slice(0, 18000), elements: items };
  })()`;
}
function elementScript(ref, action, text) {
  return `(() => {
    const el = window.__mliAppRefs?.get(${JSON.stringify(ref)});
    if (!el || !el.isConnected || window.__mliAppRefUrl !== location.href) throw new Error('元素引用已失效，请重新读取页面');
    if (el.disabled || el.type === 'password' || /password|one-time-code|cc-/i.test(el.autocomplete || '') || /password|passwd|secret|token|otp|verification/i.test([el.name, el.id, el.getAttribute('aria-label')].join(' '))) throw new Error('不能操作密码、验证码、支付或敏感字段');
    const rect = el.getBoundingClientRect(); if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') throw new Error('元素当前不可见');
    el.scrollIntoView({block:'center'}); el.focus();
    ${action === 'click' ? 'el.click();' : `if (!['INPUT','TEXTAREA'].includes(el.tagName) && !el.isContentEditable) throw new Error('该元素不能输入文字');
      if (el.readOnly || el.getAttribute('aria-readonly') === 'true') throw new Error('该字段为只读，不能输入文字');
      if (el.isContentEditable) {
        const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(el);
        selection.removeAllRanges(); selection.addRange(range);
      } else {
        if (el.tagName === 'INPUT' && !['text','search','email','url','tel','number','date','datetime-local','month','week','time'].includes(el.type)) throw new Error('该字段不支持文本输入');
        const prototype = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, ${JSON.stringify(text)});
        el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:${JSON.stringify(text)}}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
        return { ok: true };
      }
      if (!document.execCommand('insertText', false, ${JSON.stringify(text)})) throw new Error('浏览器未能输入文字，请重新读取页面');`}
    // Keep connected references usable for click -> type; navigation/new snapshots replace the map.
    return { ok: true };
  })()`;
}

module.exports={snapshotScript,elementScript};
