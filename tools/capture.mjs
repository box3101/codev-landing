/**
 * 렌더 캡처 + 크로스브라우징 확인
 *
 * 하는 일:
 *   1. 정적 서버를 띄운다 (file:// 로 열면 폰트 CORS가 막혀 실제와 다르게 찍힌다)
 *   2. Chromium / Firefox / WebKit 3종으로 1920·768·375 전체 페이지를 캡처한다
 *   3. 콘솔 에러가 있으면 같이 뱉는다
 *
 * 실행: node tools/capture.mjs [--browsers=chromium,firefox,webkit]
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'shots');
const PORT = 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

function serve() {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const file = path.join(ROOT, rel);

    // 루트 밖으로 나가는 경로 차단
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }

    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404).end('not found');
    }
  });

  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// 요청받은 3종 뷰포트. 높이는 전체 페이지 캡처라 의미가 없지만 초기 뷰포트 기준은 필요하다.
const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '768', width: 768, height: 1024 },
  { name: '375', width: 375, height: 812 },
];

const ENGINES = { chromium, firefox, webkit };

async function run() {
  const arg = process.argv.find((a) => a.startsWith('--browsers='));
  const wanted = arg ? arg.split('=')[1].split(',') : ['chromium'];

  await mkdir(OUT, { recursive: true });
  const server = await serve();
  const problems = [];

  for (const engineName of wanted) {
    const engine = ENGINES[engineName];
    if (!engine) throw new Error(`알 수 없는 브라우저: ${engineName}`);

    const browser = await engine.launch();

    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });

      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`[${engineName} ${vp.name}] ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`[${engineName} ${vp.name}] ${e.message}`));

      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

      // loading="lazy" 이미지는 전체 페이지 캡처 시 뷰포트 밖이라 로드되지 않는다.
      // 배포용으로는 lazy가 맞으므로 마크업은 두고, 캡처할 때만 강제로 즉시 로드시킨다.
      await page.evaluate(async () => {
        const imgs = Array.from(document.images);
        imgs.forEach((img) => {
          img.loading = 'eager';
          if (!img.complete) img.src = img.src; // 재요청 유도
        });
        await Promise.all(
          imgs.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((res) => {
                  img.addEventListener('load', res, { once: true });
                  img.addEventListener('error', res, { once: true });
                })
          )
        );
      });

      // 폰트가 다 그려진 뒤에 찍어야 캡처마다 글자 폭이 달라지지 않는다
      await page.evaluate(() => document.fonts.ready);

      // 스크롤 페이드인을 전부 켜둔다. 캡처 시점에 반쯤 투명하면 비교가 무의미하다.
      await page.evaluate(() => {
        document.documentElement.classList.remove('js-reveal');
      });
      await page.waitForTimeout(200);

      await page.screenshot({
        path: path.join(OUT, `${engineName}-${vp.name}.png`),
        fullPage: true,
      });

      console.log(`캡처: ${engineName}-${vp.name}.png`);
      await page.close();
    }

    await browser.close();
  }

  server.close();

  if (problems.length) {
    console.log('\n콘솔/페이지 에러:');
    problems.forEach((p) => console.log('  ' + p));
    process.exitCode = 1;
  } else {
    console.log('\n콘솔 에러 없음');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
