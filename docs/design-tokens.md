# Codev B2B Landing — 디자인 토큰

시안 출처: Figma Community — Codev B2B Landing Page Design
파일: `XkVGFAcfzTP2MQuVLOqKCt` / 디자인 프레임: `7:834`

## 좌표계 보정 (중요)

커뮤니티 파일의 디자인 프레임은 `Thumbnail` 프레임 안에 **1/3로 축소**되어 배치돼 있다.
따라서 `get_design_context`가 돌려주는 모든 px값은 **원본의 1/3**이다. 3배 하면 전부 정수로 떨어진다.

| 축소본 | 원본 | 검증 |
| --- | --- | --- |
| 600 | **1800** | 프레임 폭 |
| 533.333 | **1600** | 콘텐츠 폭 |
| 33.333 | **100** | 좌우 패딩 |
| 8.333 | **25** | 본문 폰트 |
| 16.667 | **50** | 제목 폰트 |
| 2131 | **6393** | 전체 높이 |

### 렌더 실측 교차검증

3배 스케일로 export한 시안 렌더(`figma-reference.png`, 2040×2151)에서 직접 픽셀을 측정해
위 환산이 맞는지 확인했다. export 좌표 → 원본 좌표 보정값은 `x-48`, `y-75`.

- 다크 히어로 영역 bbox = x `0~1799` → **full-bleed 1800px 확정**
  (`get_design_context`는 1600px 콘텐츠 div에 배경을 물려주지만, 실제 렌더는 전폭이다. 렌더가 기준)
- 다크 영역 높이 = 852px ≒ Navbar 123 + Hero 730 = **853** ✔
- 텍스트 좌측 시작 x = `100`, 우측 끝 x = `1700` → **패딩 100 / 콘텐츠 1600 확정** ✔
- 페이지 배경 샘플 = `#fafafa` (순백 아님)

## 색상

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--c-ink` | `#132229` | 다크 배경 (히어로/배너/푸터) |
| `--c-mint` | `#b1d6ce` | 다크 위 텍스트·로고·장식선 |
| `--c-text` | `#121212` | 본문/제목 기본 |
| `--c-bg` | `#fafafa` | 페이지 배경 |

## 타이포그래피

| 역할 | 폰트 | 크기 | 비고 |
| --- | --- | --- | --- |
| 네비 링크 | Playfair Display Medium | 25px | `#b1d6ce` |
| 히어로 제목 | Playfair Display Regular | 50px | `#b1d6ce`, 3줄 강제 개행 |
| 섹션 제목 | Playfair Display Regular | 50px | `#121212` |
| 본문 | Manrope Regular | 25px | `#121212` |
| 버튼 라벨 | Manrope SemiBold | 25px | underline |

사용 굵기: Playfair Display `400/500`, Manrope `400/600` → **이 4종만 서브셋**한다.

## 레이아웃

- 디자인 캔버스 **1800px**, 섹션 패딩 **100px**, 콘텐츠 **1600px**
- 2컬럼 섹션은 `750px + 750px`, `justify-content: space-between`
- 1920 뷰포트: 배경은 full-bleed, 콘텐츠만 1600 중앙 정렬

## 섹션 높이 (원본 px)

| 섹션 | node | 높이 |
| --- | --- | --- |
| Navbar | 7:835 | 123 |
| Hero | 7:848 | 730 |
| About | 7:906 | 600 |
| line | 7:916 | 10 |
| Service | 7:919 | 622 |
| Slider | 7:948 | 760 |
| Product | 7:966 | 1262 |
| Testimonial | 7:1227 | 926 |
| Banner | 7:1272 | 760 |
| Footer | 7:1284 | 600 |
| **합계** | | **6393** |

## 섹션별 상세

### Navbar (7:835)

- 패딩 `100px / 15px`, 콘텐츠 1600, `gap 125px`
- 로고 SVG `106.48 × 30.03`
- 메뉴 `gap 30px`, 링크 패딩 `30px 15px`, 라벨 25px
- 항목: Service / Portfolio / Career / Contact

### Hero (7:848)

- 패딩 100, 다크 배경 full-bleed
- Col-1 750px: 제목 Playfair 50px `#b1d6ce`, 높이 530
  - "Make Your Business Dream / Come True with a Professional / Website!" (3줄)
- Col-2 750px: 장식 격자 — 4행 × 6열, 셀 `90×90`, 행 `gap 45px`
  - 각 셀은 `/ \ | —` 형태의 선 SVG, 일부는 `Codev` 텍스트 자리

### About (7:906)

- 배경 `#fafafa`, 패딩 100, 콘텐츠 높이 400
- Col-1 750: Playfair 50px "Don't wait any longer, start your journey to business success with a professional website!"
- Col-2 750: `space-between`
  - 본문 Manrope 25px
  - 버튼 `border 1.875px #121212`, 패딩 `15px 20px`, `gap 20px`, 라벨 SemiBold 25px underline + 화살표 아이콘 30px
