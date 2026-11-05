const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const raw = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
const out = [['../web/icon-512.png', 512, 0], ['../web/icon-192.png', 192, 0], ['../web/apple-touch-icon.png', 180, -1], ['../web/icon-maskable.png', 512, 0.12], ['../extension/icon-128.png', 128, 0], ['../extension/icon-48.png', 48, 0], ['../extension/icon-16.png', 16, 0], ['../web/favicon-32.png', 32, 0], ['preview.png', 512, 0]];
(async () => {
  const b = await chromium.launch();
  for (const [f, s, pad] of out) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    // non-maskable icons get rounded corners baked in; maskable fills edge to edge with the mark scaled into the safe zone
    const rx = pad ? 0 : s * 0.22, inner = raw.replace('SCALE', pad > 0 ? '0.76' : s <= 32 ? '1.12' : '1');
    await p.setContent(`<html><body style="margin:0;background:transparent"><div style="position:relative;width:${s}px;height:${s}px;border-radius:${rx}px;overflow:hidden;background:#07030f">${inner}</div><style>svg{width:100%;height:100%;display:block}</style></body></html>`);
    await p.screenshot({ path: path.join(__dirname, f), omitBackground: true });
    await p.close();
  }
  await b.close();
})();
