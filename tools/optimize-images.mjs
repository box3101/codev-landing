/**
 * 이미지 최적화
 *
 * 하는 일:
 *   1. Figma에서 받은 원본(PNG/JPEG)을 WebP로 변환하고 압축한다
 *   2. 후기 카드 아바타는 원본 사진에서 정사각으로 잘라 2배 해상도로 다시 만든다
 *      (Figma가 내려준 아바타는 50×50이라 75px로 띄우면 뭉갠다)
 *   3. 변환 전/후 용량을 docs/image-report.json에 남긴다 — 포트폴리오 이미지의 근거값
 *
 * 실행: npm run img
 */

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'assets', 'raw');
const IMG = path.join(ROOT, 'assets', 'img');

// 화면에 실제로 쓰이는 이미지만 변환한다. raw 폴더의 나머지는 시안 내부 목업 소재라 배포에 안 들어간다.
// 큰 인물 사진 2장은 시안에서 흑백 처리돼 있다.
// 시안 렌더의 인물 픽셀 채도를 재보니 0.0 / 0.5로 완전한 그레이스케일이었다.
// (반면 후기 카드 아바타는 채도 14.9로 컬러가 남아 있어 흑백 처리하지 않는다)
// Figma가 내려주는 흑백 에셋을 그대로 쓰지 않고 원본(raw)에서 직접 변환하는 이유는
// 원본 해상도가 더 커서 압축 여유가 있기 때문이다.
const PHOTOS = [
  // [원본, 결과, 최대 폭] — 최대 폭은 표시 크기의 2배(레티나 대응)를 넘지 않게 잡는다
  { src: 'raw_03.png', out: 'portrait-founder.webp', width: 1048, from: 'raw', gray: true },
  { src: 'raw_12.png', out: 'portrait-team.webp', width: 1548, from: 'raw', gray: true },
];

// 아바타: 원본 사진 → 정사각 크롭 → 원형 마스크 → 150px(표시 75px의 2배)
const AVATARS = [
  { src: 'raw_09.jpg', out: 'avatar-1.webp' }, // Omar Vaccaro
  { src: 'raw_06.jpg', out: 'avatar-2.webp' }, // Jocelyn Donin
  { src: 'raw_10.jpg', out: 'avatar-3.webp' }, // Nolan Calzoni
];

const AVATAR_PX = 150;

async function sizeOf(p) {
  try {
    return (await stat(p)).size;
  } catch {
    return 0;
  }
}

async function main() {
  await mkdir(IMG, { recursive: true });
  const report = { photos: [], avatars: [], products: [] };

  // ----- 인물 사진 -----
  for (const { src, out, width, from: dir, gray } of PHOTOS) {
    const from = path.join(dir === 'raw' ? RAW : IMG, src);
    const to = path.join(IMG, out);
    const before = await sizeOf(from);
    if (!before) {
      console.warn(`건너뜀 (원본 없음): ${src}`);
      continue;
    }

    const meta = await sharp(from).metadata();
    // 원본보다 키우지 않는다. 없는 화소를 만들어봐야 용량만 는다.
    const target = Math.min(width, meta.width);

    let pipe = sharp(from).resize({ width: target, withoutEnlargement: true });
    // 흑백 변환은 압축에도 유리하다. 색차 성분이 사라져 같은 화질에서 파일이 더 작아진다.
    if (gray) pipe = pipe.grayscale();

    await pipe.webp({ quality: 82, effort: 6 }).toFile(to);

    const after = await sizeOf(to);
    report.photos.push({ file: out, source: src, before, after, width: target });
    console.log(`${out.padEnd(28)} ${before.toLocaleString().padStart(9)} -> ${after.toLocaleString().padStart(8)}`);
  }

  // ----- 아바타 -----
  const mask = Buffer.from(
    `<svg width="${AVATAR_PX}" height="${AVATAR_PX}"><circle cx="${AVATAR_PX / 2}" cy="${AVATAR_PX / 2}" r="${AVATAR_PX / 2}" fill="#fff"/></svg>`
  );

  for (const { src, out } of AVATARS) {
    const from = path.join(RAW, src);
    const to = path.join(IMG, out);
    const before = await sizeOf(from);
    if (!before) {
      console.warn(`건너뜀 (원본 없음): ${src}`);
      continue;
    }

    await sharp(from)
      .resize(AVATAR_PX, AVATAR_PX, { fit: 'cover', position: 'top' })
      .composite([{ input: mask, blend: 'dest-in' }])
      .webp({ quality: 86, effort: 6, alphaQuality: 100 })
      .toFile(to);

    const after = await sizeOf(to);
    report.avatars.push({ file: out, source: src, before, after });
    console.log(`${out.padEnd(28)} ${before.toLocaleString().padStart(9)} -> ${after.toLocaleString().padStart(8)}`);
  }

  // ----- 제품 카드 스크린샷 -----
  // Figma에서 노드 export로 받은 PNG가 있으면 WebP로 변환한다.
  for (const name of ['product-ecommerce', 'product-signup']) {
    const from = path.join(IMG, `${name}.png`);
    const to = path.join(IMG, `${name}.webp`);
    const before = await sizeOf(from);
    if (!before) {
      console.warn(`건너뜀 (원본 없음): ${name}.png`);
      continue;
    }

    await sharp(from)
      .resize({ width: 1420, withoutEnlargement: true }) // 표시 710px의 2배
      .webp({ quality: 84, effort: 6 })
      .toFile(to);

    const after = await sizeOf(to);
    report.products.push({ file: `${name}.webp`, source: `${name}.png`, before, after });
    console.log(`${(name + '.webp').padEnd(28)} ${before.toLocaleString().padStart(9)} -> ${after.toLocaleString().padStart(8)}`);
  }

  const all = [...report.photos, ...report.avatars, ...report.products];
  report.total_before = all.reduce((s, r) => s + r.before, 0);
  report.total_after = all.reduce((s, r) => s + r.after, 0);
  report.saved_pct = report.total_before
    ? +(((report.total_before - report.total_after) / report.total_before) * 100).toFixed(1)
    : 0;

  await writeFile(
    path.join(ROOT, 'docs', 'image-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );

  console.log(`\n합계 ${report.total_before.toLocaleString()} -> ${report.total_after.toLocaleString()} bytes (${report.saved_pct}% 감소)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
