// Renders icon.svg to PNG (192 and 512) with Chromium so the bundled Chinese font is used.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
const fontCss = `@font-face{font-family:"HSK Han";font-weight:700;src:url("file://${path.join(root, 'fonts/noto-sans-sc-chinese-simplified-700-normal.woff2')}") format("woff2");}`;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><head><style>${fontCss} html,body{margin:0;background:transparent}</style></head>
      <body>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, `icon-${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  }
  await browser.close();
  console.log('icons written');
})().catch((e) => { console.error(e); process.exit(1); });
