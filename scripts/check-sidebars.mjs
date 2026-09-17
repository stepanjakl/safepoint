import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
// Requires pnpm dev. Set CHROME_BIN and SIDEBAR_TEST_URL when needed.
const profile = mkdtempSync(join(tmpdir(), 'safepoint-sidebar-'));
const chrome = spawn(
  process.env.CHROME_BIN ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    '--disable-gpu',
    '--force-device-scale-factor=2',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let socket;
try {
  const file = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !existsSync(file); i++) await delay(100);
  const port = Number(readFileSync(file, 'utf8').split('\n')[0]);
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: 'PUT',
    })
  ).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(m.error);
      else p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown')
      errors.push(m.params.exceptionDetails);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 200; i++) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    throw Error(`Timed out: ${expression}`);
  };
  const dimensions = async (width, height = 900) =>
    send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    });
  const state = () =>
    evaluate(
      `(()=>{const h=document.querySelector('.sidebar-handle');const n=document.querySelector('.sidebar-navigation');const s=document.querySelector('.resizable-shell');const r=h.getBoundingClientRect();return {width:Number(h.getAttribute('aria-valuenow')),max:Number(h.getAttribute('aria-valuemax')),collapsed:s.hasAttribute('data-collapsed'),inert:n.inert,opacity:getComputedStyle(n).opacity,handleDisplay:getComputedStyle(h).display,x:r.x+r.width/2,y:r.y+r.height/2,overflow:document.documentElement.scrollWidth>innerWidth,focus:document.activeElement===h,navWidth:n.getBoundingClientRect().width,stored:localStorage.getItem('safepoint.sidebar.v1')}})()`,
    );
  const mouse = async (type, x, y, button = 'left') =>
    send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button,
      clickCount: type === 'mouseMoved' ? 0 : 1,
      buttons: type === 'mousePressed' ? 1 : 0,
    });
  const key = async (key, code = key, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      modifiers,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      modifiers,
    });
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(
      `/tmp/safepoint-sidebar-${name}.png`,
      Buffer.from(r.data, 'base64'),
    );
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await dimensions(1440);
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await send('Page.navigate', {
    url: process.env.SIDEBAR_TEST_URL ?? 'http://localhost:3000/',
  });
  await until(
    `Number(document.querySelector('.sidebar-handle')?.getAttribute('aria-valuenow'))===250`,
  );
  await evaluate(`document.fonts.ready`);

  const clickElement = async (selector) => {
    const r = await evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    await mouse('mouseMoved', r.x, r.y);
    await mouse('mousePressed', r.x, r.y);
    await mouse('mouseReleased', r.x, r.y);
  };
  const assistantState = () =>
    evaluate(
      `(()=>{const h=document.querySelector('.sidebar-handle[data-side="right"]');const r=h?.getBoundingClientRect();const t=document.querySelector('textarea');return {open:document.querySelector('button[aria-label="Assistant"]').getAttribute('aria-expanded'),width:h?.getAttribute('aria-valuenow'),max:h?.getAttribute('aria-valuemax'),x:r?.x+r?.width/2,y:r?.y+r?.height/2,focus:document.activeElement===t,draft:t?.value,columns:getComputedStyle(document.querySelector('.resizable-shell')).gridTemplateColumns,modal:!!document.querySelector('.assistant-modal'),overflow:document.documentElement.scrollWidth>innerWidth}})()`,
    );

  const side = (which) =>
    evaluate(
      `(()=>{const h=document.querySelector('.sidebar-handle[data-side="${which}"]');if(!h)return null;const r=h.getBoundingClientRect();return {width:Number(h.getAttribute('aria-valuenow')),x:r.x+r.width/2,y:r.y+r.height/2,path:h.querySelector('path').getAttribute('d'),hover:h.hasAttribute('data-hovered'),cursor:getComputedStyle(h).cursor}})()`,
    );
  const dragTo = async (which, width) => {
    const s = await side(which);
    await mouse('mousePressed', s.x, s.y);
    const x = s.x + (width - s.width) * (which === 'left' ? 1 : -1);
    await mouse('mouseMoved', x, s.y);
    await delay(35);
    return { x, y: s.y };
  };
  const release = async (point) => {
    await mouse('mouseReleased', point.x, point.y);
    await delay(40);
  };
  assert.equal((await assistantState()).open, 'false');
  assert.equal(await side('right'), null);
  await clickElement('button[aria-label="Assistant"]');
  await delay(60);
  assert.equal((await assistantState()).width, '320');
  assert.equal((await assistantState()).focus, true);
  await evaluate(
    `Array.from(document.querySelectorAll('.assistant-content button')).find(b=>b.textContent==='Explain this run').click()`,
  );
  await delay(20);
  assert.equal((await assistantState()).draft, 'Explain this run');
  assert.equal(
    await evaluate(
      `document.querySelector('.assistant-content button[disabled]')?.textContent`,
    ),
    'Send',
  );
  let point = await dragTo('right', 400);
  assert.equal((await side('right')).width, 400);
  await release(point);
  assert.equal(
    JSON.parse(await evaluate(`localStorage.getItem('safepoint.assistant.v1')`))
      .width,
    25,
  );
  point = await dragTo('right', 200);
  assert.equal((await side('right')).path, 'M12 4 L12 22 L12 40');
  await mouse('mouseMoved', point.x + 80, point.y);
  await delay(30);
  assert.equal((await side('right')).path, 'M14 4 L10 22 L14 40');
  await mouse('mouseMoved', point.x, point.y);
  await delay(30);
  assert.equal((await side('right')).path, 'M10 4 L14 22 L10 40');
  await release(point);
  assert.equal((await side('right')).width, 280);
  await key('Enter', 'Enter', 1);
  await delay(30);
  assert.equal((await side('right')).width, 320);
  point = await dragTo('right', 100);
  await key('Escape');
  await release(point);
  assert.equal((await side('right')).width, 320);
  point = await dragTo('right', 100);
  await release(point);
  assert.equal(await side('right'), null);
  assert.equal((await assistantState()).open, 'false');
  await clickElement('button[aria-label="Assistant"]');
  await delay(50);
  assert.equal((await assistantState()).width, '320');
  assert.equal((await assistantState()).draft, 'Explain this run');
  // The left controller keeps its original bounds, directions, persistence and search behavior.
  point = await dragTo('left', 300);
  await release(point);
  assert.equal((await side('left')).width, 300);
  point = await dragTo('left', 100);
  await release(point);
  assert.equal((await state()).collapsed, true);
  await key('k', 'KeyK', 4);
  await delay(50);
  assert.equal((await state()).collapsed, false);
  await evaluate(
    `document.querySelector('.sidebar-handle[data-side="left"]').focus()`,
  );
  await key('Enter', 'Enter', 1);
  await delay(50);
  assert.equal((await side('left')).width, 250);
  // Both panels at their widest must still leave 640px for the sheet.
  await evaluate(
    `document.querySelector('.sidebar-handle[data-side="right"]').focus()`,
  );
  await key('End');
  await delay(50);
  await dimensions(1280);
  await delay(100);
  assert.equal((await assistantState()).overflow, false);
  assert.ok(
    await evaluate(
      `parseFloat(getComputedStyle(document.querySelector('.resizable-shell')).gridTemplateColumns.split(' ')[1])>=639`,
    ),
  );
  const savedWidth = JSON.parse(
    await evaluate(`localStorage.getItem('safepoint.assistant.v1')`),
  ).width;
  assert.equal(savedWidth, 30);
  assert.equal((await assistantState()).width, '370');
  await dimensions(1440);
  await delay(100);
  assert.equal((await assistantState()).width, '480');
  // Route changes keep draft and open state; reload keeps preferences but clears draft.
  await clickElement('a[href="/examples/support"]');
  await delay(700);
  assert.equal((await assistantState()).draft, 'Explain this run');
  await evaluate('window.sidebarBeforeReload=true');
  await send('Page.reload');
  await until('!window.sidebarBeforeReload');
  await until(
    `document.querySelector('.sidebar-handle[data-side="right"]')?.getAttribute('aria-valuenow')==='480'`,
  );
  assert.equal((await assistantState()).width, '480');
  assert.equal((await assistantState()).draft, '');
  // Reset animates the content width and sheet edge together; clicks never collapse first.
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await evaluate(
    `document.querySelector('.sidebar-handle[data-side="right"]').focus()`,
  );
  await key('Enter', 'Enter', 1);
  const frames = await evaluate(`new Promise(resolve => {
    const frames = []; const start = performance.now();
    function sample() {
      const shell = document.querySelector('.resizable-shell');
      frames.push({menu: document.querySelector('.assistant-content').getBoundingClientRect().width,
        track: parseFloat(getComputedStyle(shell).gridTemplateColumns.split(' ')[2]),
        open: shell.hasAttribute('data-assistant-open')});
      if (performance.now() - start < 1100) requestAnimationFrame(sample); else resolve(frames);
    } requestAnimationFrame(sample);
  })`);
  assert.ok(frames.some((frame) => frame.menu > 321 && frame.menu < 479));
  assert.ok(
    frames.every(
      (frame) => frame.open && Math.abs(frame.menu - frame.track) < 1,
    ),
  );
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  // Pointer tooltips belong only to the grip. Fast passes never light the handle.
  await evaluate(
    `document.querySelector('.sidebar-handle[data-side="right"]').blur()`,
  );
  const edge = await side('right');
  await mouse('mouseMoved', edge.x - 100, edge.y - 100);
  await delay(30);
  await mouse('mouseMoved', edge.x, edge.y - 100);
  assert.equal((await side('right')).hover, false);
  await mouse('mouseMoved', edge.x + 100, edge.y - 100);
  await delay(120);
  assert.equal((await side('right')).hover, false);
  await mouse('mouseMoved', edge.x, edge.y - 100);
  await delay(130);
  assert.equal((await side('right')).hover, true);
  assert.equal(
    await evaluate(
      `!!document.querySelector('[role="tooltip"]:not([data-exiting])')`,
    ),
    false,
  );
  await mouse('mouseMoved', edge.x + 9, edge.y);
  await delay(130);
  assert.equal(
    await evaluate(
      `!!document.querySelector('[role="tooltip"]:not([data-exiting])')`,
    ),
    true,
  );
  point = await dragTo('right', 360);
  await release(point);
  assert.equal((await side('right')).hover, false, 'release suppresses hover');
  // Overlay focus, Escape, and phone layout.
  await dimensions(1100);
  await delay(150);
  assert.equal((await assistantState()).modal, true);
  assert.equal((await assistantState()).focus, true);
  for (let i = 0; i < 8; i++) {
    await key('Tab');
    assert.equal(
      await evaluate(`!!document.activeElement.closest('[role="dialog"]')`),
      true,
    );
  }
  await key('Escape');
  await delay(60);
  assert.equal((await assistantState()).open, 'false');
  assert.equal(
    await evaluate(
      `document.activeElement===document.querySelector('button[aria-label="Assistant"]')`,
    ),
    true,
  );
  await clickElement('button[aria-label="Assistant"]');
  await delay(60);
  await dimensions(600);
  await delay(150);
  assert.equal((await assistantState()).overflow, false);
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.sidebar-handle[data-side="right"]')).display`,
    ),
    'none',
  );
  await dimensions(600, 500);
  await delay(100);
  assert.ok(
    await evaluate(
      `document.querySelector('.assistant-content textarea').getBoundingClientRect().bottom<innerHeight`,
    ),
  );
  await clickElement('button[aria-label="Close assistant"]');
  await delay(60);
  assert.equal((await assistantState()).open, 'false');
  await dimensions(1440);
  await delay(100);
  await clickElement('button[aria-label="Assistant"]');
  await delay(60);
  await evaluate(`document.documentElement.dataset.theme='dark'`);
  await shot('assistant-dark');
  // Keyboard width presets and Escape must affect the popup, not its parent panel.
  await evaluate(
    `document.querySelector('.sidebar-handle[data-side="right"]').focus()`,
  );
  await key('F10', 'F10', 8);
  await delay(80);
  assert.ok(
    await evaluate(`!!document.querySelector('[aria-label="Sidebar width"]')`),
  );
  await key('Escape');
  await delay(80);
  assert.equal((await assistantState()).open, 'true');
  await dimensions(1100);
  await delay(150);
  await mouse('mousePressed', 500, 450);
  await mouse('mouseReleased', 500, 450);
  await delay(80);
  assert.equal(
    (await assistantState()).open,
    'false',
    'backdrop dismisses overlay',
  );
  // Corrupt storage falls back closed; blocked storage still allows local interaction.
  await evaluate(
    `localStorage.setItem('safepoint.assistant.v1','invalid');window.dispatchEvent(new StorageEvent('storage',{key:'safepoint.assistant.v1'}))`,
  );
  await clickElement('button[aria-label="Assistant"]');
  await delay(80);
  assert.equal((await assistantState()).width, '320');
  await clickElement('button[aria-label="Close assistant"]');
  await delay(80);
  await evaluate(
    `Storage.prototype.setItem=function(){throw new DOMException('Blocked','SecurityError')}`,
  );
  await clickElement('button[aria-label="Assistant"]');
  await delay(80);
  assert.equal((await assistantState()).open, 'true');
  assert.deepEqual(errors, []);
  console.log(
    'PASS shared left/right drag, thresholds, reset, cancellation, prompts, disabled send, independent persistence, viewport caps, route draft, reload, modal focus/Escape, phone and keyboard-height layout.',
  );
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  await delay(150);
  rmSync(profile, { recursive: true, force: true });
}
