# Codev — B2B Landing Page 퍼블리싱

Figma 시안을 HTML + SCSS로 1:1 재현한 퍼블리싱 데모입니다.

## 라이선스 / 출처

> **Design: Figma Community — Codev B2B Landing Page**
> https://www.figma.com/community/file/1351088940773567929/b2b-landing-page-design

디자인 저작권은 원저작자에게 있습니다. 이 저장소는 **퍼블리싱(마크업·스타일) 결과물**만 포함하며,
시안을 상업적으로 재배포하지 않습니다.

## 기술 스택

| 항목 | 내용 |
| --- | --- |
| 마크업 | HTML5 (시맨틱 랜드마크, heading 위계) |
| 스타일 | SCSS → 컴파일된 CSS 동시 산출 |
| 스크립트 | 바닐라 JS (IntersectionObserver 하나) |
| 이미지 | WebP 변환 + 압축 (sharp) |
| 폰트 | Playfair Display / Manrope — 사용 굵기 + 사용 문자만 서브셋 (fontTools) |
| 검증 | Playwright — Chromium / Firefox / WebKit |

의존성은 전부 개발용입니다. 배포물은 정적 파일뿐이라 런타임 의존성이 없습니다.

## 실행

```bash
npm install

npm run css      # SCSS 컴파일
npm run watch    # 변경 감지 컴파일
npm run build    # 일반 + 압축 CSS 동시 산출

npm run img      # 이미지 WebP 변환/압축 + 리포트 생성
python tools/subset_fonts.py   # 폰트 서브셋 + 리포트 생성

npm run serve    # 로컬 서버 (http://localhost:4173)
node tools/capture.mjs --browsers=chromium,firefox,webkit   # 3종 캡처
npm run portfolio   # 포트폴리오 이미지 3장 생성
```

## 구조

```
codev-landing/
├─ index.html              마크업
├─ src/scss/               SCSS 소스 (한국어 주석으로 판단 근거 기록)
│  ├─ _functions.scss      유동 타이포 계산 (clamp 선형 보간)
│  ├─ _tokens.scss         색상·간격·타이포 토큰
│  ├─ _base.scss           리셋 · 폰트 · 접근성
│  ├─ _layout.scss         섹션 골격 · 2컬럼 · 스크롤 페이드인
│  ├─ _components.scss     버튼 · 카드 · 인물 · 미디어
│  └─ _sections.scss       섹션별 스타일
├─ dist/css/style.css      컴파일 결과 (+ style.min.css)
├─ assets/                 fonts · icons · img · raw(시안 원본 비트맵)
├─ tools/                  이미지/폰트/캡처/포트폴리오 스크립트
└─ docs/                   토큰 문서 · 시안 레퍼런스 · 캡처 · 리포트
```

## 시안 대조 방법

커뮤니티 파일의 디자인 프레임이 `Thumbnail` 안에 **1/3로 축소**되어 들어 있어서,
Figma가 돌려주는 px값을 그대로 쓰면 안 됩니다. 3배 환산해야 원본값이 나옵니다.
환산이 맞는지는 시안 렌더를 픽셀 단위로 실측해 교차검증했습니다.

자세한 내용은 [`docs/design-tokens.md`](docs/design-tokens.md)에 정리했습니다.

| 항목 | 값 |
| --- | --- |
| 디자인 캔버스 | 1800px (콘텐츠 1600 + 좌우 패딩 100) |
| 페이지 배경 | `#fafafa` |
| 전체 높이 | 6393px |

1920 뷰포트에서는 배경만 전폭으로 깔고 콘텐츠를 1600 중앙 정렬합니다.
`(1920 − 1600) / 2 = 160`이 시안을 1920 한가운데 놓았을 때의 텍스트 시작점과 같아
좌표가 그대로 맞습니다.

## 접근성

- `skip-link`로 본문 바로가기 (WCAG 2.4.1)
- `header` / `nav` / `main` / `footer` 랜드마크, `aria-labelledby`로 섹션 이름 연결
- heading 위계 `h1 → h2 → h3` (건너뛰지 않음)
- 장식 이미지는 `alt=""` + `aria-hidden`, 내용 이미지는 서술형 `alt`
- `:focus-visible` 포커스 링 — 다크 섹션에서는 민트로 전환해 대비 확보
- `prefers-reduced-motion` 존중 (애니메이션 제거)
- 폰트 크기는 `rem` 절편 + `vw` 기울기 조합이라 브라우저 기본 글꼴 크기 설정에 반응 (WCAG 1.4.4)

> 시안에 폼(form)이 없어 `label` 연결 대상이 없습니다.
> 시안에 없는 입력 요소를 새로 만들지 않았습니다.
