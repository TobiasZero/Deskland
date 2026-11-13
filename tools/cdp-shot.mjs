// 开发工具：用 Chrome DevTools Protocol 打开页面、执行一段脚本、截一张图。
// 用法：
//   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\cdp about:blank
//   node tools/cdp-shot.mjs "http://localhost:5178/settings.html" out.png 1500 "document.querySelector('.theme[data-id=volcano]').click()"
import { writeFileSync } from 'node:fs';

const [url, out, waitArg, evalJs, postArg] = process.argv.slice(2);
const port = process.env.CDP_PORT || 9222;
const wait = +(waitArg || 1500);
const postWait = +(postArg || 1200);

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = list.find(t => t.type === 'page');
if (!target) throw new Error('没有可用的页面 target');

const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const problems = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    problems.push('EXCEPTION: ' + (d.exception?.description || d.text));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    problems.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  }
});
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, wait));
if (evalJs) {
  const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) console.error('页面脚本出错：', r.exceptionDetails.text, r.exceptionDetails.exception?.description || '');
  else console.log('eval:', JSON.stringify(r.result?.value ?? null));
  await new Promise(r => setTimeout(r, postWait));
}
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
if (problems.length) console.log('页面问题：\n  ' + problems.slice(0, 8).join('\n  '));
else console.log('页面无报错');
console.log('已保存', out);
ws.close();
