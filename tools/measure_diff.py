"""
시안 대조 실측

하는 일:
  1. Figma 시안 렌더와 퍼블리싱 결과 캡처를 같은 좌표계로 맞춘다
  2. 픽셀 일치율과 '기준선 오차'를 재서 docs/diff-report.json에 남긴다
  3. 겹쳐 보는 diff 오버레이 이미지를 만든다

기준선 오차란:
  글자 안티앨리어싱은 Figma와 브라우저가 원래 다르게 그린다. 그래서 픽셀을 그대로 빼면
  '틀리지 않았는데 다른' 값이 잔뜩 남는다. 레이아웃이 맞았는지 보려면 구조선(섹션 경계,
  카드 테두리, 구분선)의 y좌표가 몇 px 어긋났는지를 재는 게 맞다.

실행: python tools/measure_diff.py
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

# 시안 export는 프레임 그림자 때문에 여백이 붙어 있다. 실측으로 확인한 보정값.
REF_OFFSET_X = 48
REF_OFFSET_Y = 75
DESIGN_W = 1800
SHOT_W = 1920


def load_pair():
    ref = Image.open(DOCS / "figma-reference.png").convert("RGB")
    shot = Image.open(DOCS / "shots" / "chromium-1920.png").convert("RGB")

    ref = ref.crop((REF_OFFSET_X, REF_OFFSET_Y, REF_OFFSET_X + DESIGN_W, ref.height))

    # 1920 캡처에서 디자인 영역(가운데 1800)만 잘라낸다
    left = (SHOT_W - DESIGN_W) // 2
    h = min(ref.height, shot.height)
    ref = ref.crop((0, 0, DESIGN_W, h))
    shot = shot.crop((left, 0, left + DESIGN_W, h))
    return ref, shot


def structural_lines(arr):
    """가로로 길게 이어지는 어두운 행 = 구조선. 그 y좌표 목록을 돌려준다.

    임계값 30%는 실측으로 정했다. 15%로 낮추면 큰 제목의 글자 행까지 선으로 잡혀
    엉뚱한 선끼리 짝지어지면서 오차가 부풀려진다. 30% 이상이면 섹션 구분선과
    카드 상/하단 테두리만 남는다.
    """
    dark = arr.sum(2) < 300
    rows = [y for y in range(arr.shape[0]) if dark[y].sum() > DESIGN_W * 0.3]
    out, prev = [], -99
    for y in rows:
        if y - prev > 4:
            out.append(y)
        prev = y
    return out


def main():
    ref_img, shot_img = load_pair()
    ref = np.array(ref_img).astype(int)
    shot = np.array(shot_img).astype(int)

    diff = np.abs(ref - shot).sum(2)

    # 일치율: 채널 합 기준 허용오차 안에 들어온 픽셀 비율
    match_30 = float((diff <= 30).mean() * 100)
    match_60 = float((diff <= 60).mean() * 100)

    # 기준선 오차: 시안 구조선마다 결과물에서 가장 가까운 구조선까지의 거리
    ref_lines = structural_lines(ref)
    shot_lines = structural_lines(shot)
    # 개수가 같으면 순서대로 짝짓는다. 다르면 가장 가까운 선을 찾는다.
    if len(ref_lines) == len(shot_lines):
        offsets = [abs(a - b) for a, b in zip(ref_lines, shot_lines)]
    else:
        offsets = [min(abs(y - s) for s in shot_lines) for y in ref_lines if shot_lines]

    report = {
        "compared_height": int(ref.shape[0]),
        "design_width": DESIGN_W,
        "pixel_match_pct_tol30": round(match_30, 2),
        "pixel_match_pct_tol60": round(match_60, 2),
        "mean_channel_diff": round(float(diff.mean()), 2),
        "structural_lines_ref": len(ref_lines),
        "structural_line_offsets_px": offsets,
        "max_line_offset_px": int(max(offsets)) if offsets else None,
        "mean_line_offset_px": round(float(np.mean(offsets)), 2) if offsets else None,
    }

    # ----- 1px 허용오차 diff -----
    #
    # 픽셀을 그냥 빼면 글자 가장자리가 전부 '차이'로 잡힌다. Figma는 자체 래스터라이저로,
    # 브라우저는 서브픽셀로 글자를 그리기 때문에 같은 위치·같은 크기여도 가장자리 픽셀값이 다르다.
    # 그래서 '주변 1px 안에 비슷한 픽셀이 하나도 없을 때만 차이로 친다'는 기준을 쓴다.
    # 이러면 안티앨리어싱 차이는 걸러지고 진짜로 어긋난 부분만 남는다.
    shifted = np.full(diff.shape, 1e9)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            rolled = np.roll(np.roll(shot, dy, axis=0), dx, axis=1)
            shifted = np.minimum(shifted, np.abs(ref - rolled).sum(2))

    tol1_match = float((shifted <= 60).mean() * 100)
    report["pixel_match_pct_1px_tolerance"] = round(tol1_match, 2)

    (DOCS / "diff-report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # ----- diff 오버레이 -----
    # 시안을 옅은 회색으로 깔고, 1px 허용오차로도 어긋난 픽셀만 빨갛게 얹는다.
    base = np.array(ref_img.convert("L").convert("RGB")).astype(int)
    base = (base * 0.3 + 255 * 0.7).astype(np.uint8)
    overlay = base.copy()
    overlay[shifted > 60] = [220, 38, 38]
    Image.fromarray(overlay).save(DOCS / "diff-overlay.png")

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
