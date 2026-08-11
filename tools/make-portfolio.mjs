/**
 * 크몽 포트폴리오 이미지 생성
 *
 *   portfolio/compare.png       시안 vs 결과물 + diff 오버레이
 *   portfolio/responsive.png    1920 / 768 / 375
 *   portfolio/optimization.png  용량 최적화 실측값 (--with-optimization 플래그 필요)
 *
 * 방식:
 *   HTML을 만들어 Playwright로 찍는다. 이미지 합성 라이브러리로 글자를 그리는 것보다
 *   자간·행간·정렬을 다루기 쉽고, 결과를 브라우저로 열어 눈으로 확인할 수 있다.
 *
 * 수치는 전부 docs/*.json 리포트에서 읽는다. 코드에 숫자를 박아두지 않는다.
 *
 * 실행: node tools/make-portfolio.mjs
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(ROOT, 'portfolio');
const PORT = 4187;

const WIDTH = 1200; // 요청 고정폭
const MAX_HEIGHT = 3000; // 요청 상한

const INK = '#101828';
const MUTED = '#667085';
const LINE = '#d0d5dd';
const BG = '#f7f8fa';

const FOOTNOTE = '웹 접근성 인증(KWCAG) 8회 취득 기준의 시맨틱 마크업';

// ---------- 유틸 ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function serve() {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) return void res.writeHead(403).end();
    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error();
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

const nf = (n) => n.toLocaleString('en-US');
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function readJson(name) {
  return JSON.parse(await readFile(path.join(DOCS, name), 'utf-8'));
}

function shell(bodyHtml, extraCss = '') {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
  @font-face { font-family:'Pretendard'; src:url('/tools/fonts/pretendard-400.woff2') format('woff2'); font-weight:400; font-display:block; }
  @font-face { font-family:'Pretendard'; src:url('/tools/fonts/pretendard-600.woff2') format('woff2'); font-weight:600; font-display:block; }
  @font-face { font-family:'Pretendard'; src:url('/tools/fonts/pretendard-700.woff2') format('woff2'); font-weight:700; font-display:block; }
  *,*::before,*::after{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    width:${WIDTH}px; background:${BG}; color:${INK};
    font-family:'Pretendard',sans-serif; -webkit-font-smoothing:antialiased;
  }
  .page{ padding:44px 44px 30px; }
  .foot{
    margin-top:30px; padding-top:18px; border-top:1px solid ${LINE};
    color:${MUTED}; font-size:14px; font-weight:400; text-align:center; letter-spacing:-0.01em;
  }
  ${extraCss}
</style></head><body><div class="page">${bodyHtml}</div></body></html>`;
}

async function shoot(page, html, file) {
  // setContent는 페이지 URL이 about:blank라 '/docs/...' 같은 절대경로가 서버로 안 간다.
  // 임시 파일로 떨궈 실제 URL로 열어야 이미지와 폰트가 붙는다.
  const tmpDir = path.join(DOCS, '_tmp');
  await mkdir(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, file.replace('.png', '.html'));
  await writeFile(tmp, html, 'utf-8');

  await page.goto(`http://localhost:${PORT}/docs/_tmp/${path.basename(tmp)}`, {
    waitUntil: 'networkidle',
  });
  await page.evaluate(() => document.fonts.ready);

  // 이미지가 하나라도 못 붙으면 박스 높이가 0이 되어 조용히 망가진다. 명시적으로 막는다.
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((i) => !i.complete || i.naturalWidth === 0)
      .map((i) => i.getAttribute('src'))
  );
  if (broken.length) throw new Error(`${file}: 이미지 로드 실패 ${broken.join(', ')}`);
  const out = path.join(OUT, file);
  await page.screenshot({ path: out, fullPage: true });

  const meta = await sharp(out).metadata();
  if (meta.width !== WIDTH) throw new Error(`${file}: 가로 ${meta.width}px (1200이어야 함)`);
  if (meta.height > MAX_HEIGHT) throw new Error(`${file}: 세로 ${meta.height}px (3000 초과)`);
  console.log(`${file.padEnd(20)} ${meta.width}×${meta.height}`);
  return meta;
}

// ---------- 1. compare.png ----------

async function buildCompare(page) {
  const diff = await readJson('diff-report.json');

  // 시안 렌더와 결과물 캡처를 같은 영역으로 잘라 임시 파일로 저장한다.
  // 두 이미지의 픽셀 크기가 같아야 좌우 패널이 정확히 같은 배율로 들어간다.
  const H = diff.compared_height;
  const cropDir = path.join(DOCS, '_crop');
  await mkdir(cropDir, { recursive: true });

  await sharp(path.join(DOCS, 'figma-reference.png'))
    .extract({ left: 48, top: 75, width: 1800, height: H })
    .png()
    .toFile(path.join(cropDir, 'ref.png'));

  await sharp(path.join(DOCS, 'shots', 'chromium-1920.png'))
    .extract({ left: 60, top: 0, width: 1800, height: H })
    .png()
    .toFile(path.join(cropDir, 'shot.png'));

  // diff 아래에 수치 캡션을 달았다가 뺐다.
  // 이미지가 이미 '겹쳐서 대조했다'는 걸 보여주는데 그 밑에 숫자를 늘어놓으면
  // 설명 과잉으로 읽힌다. 실측값은 docs/diff-report.json과 README에 남아 있다.

  const css = `
    .split{ display:grid; grid-template-columns:1fr 1px 1fr; gap:0 34px; align-items:start; }
    .label{ font-size:17px; font-weight:600; letter-spacing:-0.02em; margin-bottom:14px; }
    .divider{ background:${LINE}; align-self:stretch; width:1px; }
    .shotbox{ background:#fff; border:1px solid ${LINE}; overflow:hidden; line-height:0; }
    .shotbox img{ width:100%; display:block; }
    .diffwrap{ margin-top:34px; display:flex; flex-direction:column; align-items:center; }
    .diffbox{ width:330px; background:#fff; border:1px solid ${LINE}; overflow:hidden; line-height:0; }
    .diffbox img{ width:100%; display:block; }
  `;

  // 좌우 라벨은 각 열의 같은 높이에 오도록 그리드 행을 맞춘다.
  const body = `
    <div class="split">
      <div><div class="label">Figma 시안</div></div>
      <div class="divider"></div>
      <div><div class="label">퍼블리싱 결과물</div></div>

      <div class="shotbox"><img src="/docs/_crop/ref.png" alt=""></div>
      <div class="divider"></div>
      <div class="shotbox"><img src="/docs/_crop/shot.png" alt=""></div>
    </div>

    <div class="diffwrap">
      <div class="diffbox"><img src="/docs/diff-overlay.png" alt=""></div>
    </div>

    <div class="foot">${FOOTNOTE}</div>
  `;

  return shoot(page, shell(body, css), 'compare.png');
}

// ---------- 2. responsive.png ----------

async function buildResponsive(page) {
  const shots = [
    { file: 'chromium-1920.png', label: '1920 데스크톱' },
    { file: 'chromium-768.png', label: '768 태블릿' },
    { file: 'chromium-375.png', label: '375 모바일' },
  ];

  for (const s of shots) {
    const m = await sharp(path.join(DOCS, 'shots', s.file)).metadata();
    s.w = m.width;
    s.h = m.height;
  }

  // "비율 유지, 세로 높이 맞춰 정렬"
  // → 세 장의 표시 높이를 같게 두고, 폭은 원본 비율대로 정한다.
  //   공통 높이 H일 때 각 폭 = H × (w/h). 세 폭의 합 + 간격이 콘텐츠 폭에 맞도록 H를 역산한다.
  const PAD = 44;
  const GAP = 26;
  const avail = WIDTH - PAD * 2 - GAP * 2;
  const ratioSum = shots.reduce((s, x) => s + x.w / x.h, 0);
  let H = Math.floor(avail / ratioSum);

  // 라벨·푸터를 더해 3000을 넘지 않도록 상한을 건다.
  const CHROME = 44 + 40 + 30 + 60; // 상단 패딩 + 라벨줄 + 하단 패딩 + 푸터
  H = Math.min(H, MAX_HEIGHT - CHROME);

  shots.forEach((s) => {
    s.dw = Math.round(H * (s.w / s.h));
    s.dh = H;
  });

  const css = `
    .row{ display:flex; gap:${GAP}px; justify-content:center; align-items:flex-end; }
    .col{ display:flex; flex-direction:column; align-items:center; }
    .frame{ background:#fff; border:1px solid ${LINE}; overflow:hidden; line-height:0; }
    .frame img{ display:block; }
    .cap{ margin-top:14px; font-size:15px; font-weight:600; letter-spacing:-0.02em; }
    .note{ margin-top:26px; text-align:center; font-size:15px; color:${MUTED}; letter-spacing:-0.01em; }
  `;

  const cols = shots
    .map(
      (s) => `<div class="col">
        <div class="frame" style="width:${s.dw}px;height:${s.dh}px">
          <img src="/docs/shots/${s.file}" style="width:${s.dw}px;height:${s.dh}px">
        </div>
        <div class="cap">${s.label}</div>
      </div>`
    )
    .join('');

  const body = `
    <div class="row">${cols}</div>
    <div class="note">PC · 태블릿 · 모바일 반응형 대응</div>
    <div class="foot">${FOOTNOTE}</div>
  `;

  return shoot(page, shell(body, css), 'responsive.png');
}

// ---------- 3. optimization.png ----------

async function buildOptimization(page) {
  const img = await readJson('image-report.json');
  const font = await readJson('font-report.json');

  const before = img.total_before + font.total_source_bytes;
  const after = img.total_after + font.total_bytes;
  const pct = ((before - after) / before) * 100;

  const imgPct = ((img.total_before - img.total_after) / img.total_before) * 100;
  const fontPct =
    ((font.total_source_bytes - font.total_bytes) / font.total_source_bytes) * 100;

  const css = `
    .hero{ text-align:center; padding:34px 0 6px; }
    .nums{ display:flex; align-items:baseline; justify-content:center; gap:26px; }
    .num{ font-size:72px; font-weight:700; letter-spacing:-0.035em; line-height:1.1; }
    .num small{ display:block; font-size:16px; font-weight:600; color:${MUTED}; letter-spacing:-0.01em; margin-bottom:8px; }
    .arrow{ font-size:44px; color:${MUTED}; font-weight:400; }
    .after{ color:#1f7a5c; }
    .badge{
      display:inline-block; margin-top:26px; padding:12px 26px; border-radius:999px;
      background:#1f7a5c; color:#fff; font-size:26px; font-weight:700; letter-spacing:-0.02em;
    }
    table{ width:100%; border-collapse:collapse; margin-top:40px; font-size:15px; }
    th,td{ padding:15px 14px; text-align:left; border-bottom:1px solid ${LINE}; vertical-align:top; }
    th{ font-size:13px; font-weight:600; color:${MUTED}; letter-spacing:-0.01em; border-bottom:1px solid #b9c0cc; }
    td.k{ font-weight:600; white-space:nowrap; }
    td.n{ white-space:nowrap; font-variant-numeric:tabular-nums; }
    td.d{ font-weight:600; color:#1f7a5c; white-space:nowrap; }
    td.w{ color:${MUTED}; line-height:1.55; }
  `;

  const body = `
    <div class="hero">
      <div class="nums">
        <div class="num"><small>압축 전</small>${kb(before)}</div>
        <div class="arrow">→</div>
        <div class="num after"><small>압축 후</small>${kb(after)}</div>
      </div>
      <div class="badge">${pct.toFixed(1)}% 감소</div>
    </div>

    <table>
      <tr><th>구분</th><th>압축 전</th><th>압축 후</th><th>감소</th><th>근거</th></tr>
      <tr>
        <td class="k">폰트</td>
        <td class="n">${nf(font.total_source_bytes)} B</td>
        <td class="n">${nf(font.total_bytes)} B</td>
        <td class="d">${fontPct.toFixed(1)}%</td>
        <td class="w">가변폰트 latin 서브셋 → 시안이 쓰는 굵기 ${font.fonts.length}종으로 고정 후 실제 사용 문자 ${font.charset_size}자만 서브셋</td>
      </tr>
      <tr>
        <td class="k">이미지</td>
        <td class="n">${nf(img.total_before)} B</td>
        <td class="n">${nf(img.total_after)} B</td>
        <td class="d">${imgPct.toFixed(1)}%</td>
        <td class="w">원본 PNG·JPEG ${img.photos.length + img.avatars.length + img.products.length}장 → WebP 변환, 표시 크기의 2배 이내로 리사이즈</td>
      </tr>
    </table>

    <div class="foot">${FOOTNOTE}</div>
  `;

  return shoot(page, shell(body, css), 'optimization.png');
}

// ---------- 실행 ----------

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    // fullPage는 뷰포트보다 짧은 콘텐츠도 뷰포트 높이만큼 찍는다.
    // 아래 여백이 남지 않도록 뷰포트 높이를 최소로 둔다.
    viewport: { width: WIDTH, height: 200 },
    deviceScaleFactor: 1,
  });

  const results = {};
  results.compare = await buildCompare(page);
  results.responsive = await buildResponsive(page);

  // 용량 최적화 이미지는 기본으로 만들지 않는다.
  // 압축 자체는 계속 적용하지만(사이트가 실제로 빨라지는 부분이라 뺄 이유가 없다),
  // 포트폴리오에 걸었을 때 시안 대조·반응형만큼 눈에 들어오지 않아 제외했다.
  // 필요하면 `node tools/make-portfolio.mjs --with-optimization` 로 다시 뽑는다.
  if (process.argv.includes('--with-optimization')) {
    results.optimization = await buildOptimization(page);
  }

  await browser.close();
  server.close();

  await writeFile(
    path.join(DOCS, 'portfolio-report.json'),
    JSON.stringify(
      Object.fromEntries(
        Object.entries(results).map(([k, v]) => [k, { width: v.width, height: v.height }])
      ),
      null,
      2
    ),
    'utf-8'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
