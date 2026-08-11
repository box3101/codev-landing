"""
폰트 서브셋 도구

하는 일:
  1. index.html에서 실제로 화면에 나오는 문자만 뽑는다
  2. 가변폰트(variable font)를 시안이 쓰는 굵기로 각각 고정(instancing)한다
  3. 그 굵기별 폰트를 위 문자셋으로 잘라내고 woff2로 다시 압축한다

왜 이렇게 하나:
  - Google Fonts가 주는 파일은 가변폰트라 400~900 굵기 전 구간이 들어 있다.
    시안은 Playfair 400/500/700, Manrope 400/600 다섯 가지만 쓴다.
  - latin 서브셋이라 해도 실제로 안 쓰는 글리프가 대부분이다.
  - 두 단계를 거치면 눈에 보이는 결과는 그대로인데 전송량만 줄어든다.

실행: python tools/subset_fonts.py
"""

import json
import re
import shutil
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "assets" / "fonts"
HTML = ROOT / "index.html"

# 시안이 쓰는 굵기만. 여기 없는 굵기는 아예 만들지 않는다.
TARGETS = [
    ("playfair-display-var.woff2", "playfair-display", [400, 500, 700]),
    ("manrope-var.woff2", "manrope", [400, 600]),
]


def used_characters() -> set:
    """index.html의 텍스트 노드에서 쓰인 문자를 모은다."""
    html = HTML.read_text(encoding="utf-8")

    # script / style 블록은 화면에 안 나오므로 제외
    html = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    # 주석 제거
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.S)
    # 태그 제거 (속성값은 화면에 안 나오므로 같이 날아간다)
    text = re.sub(r"<[^>]+>", " ", html)

    # 엔티티를 실제 문자로 되돌린다
    import html as html_mod

    text = html_mod.unescape(text)

    chars = set(text)

    # 안전망: 기본 라틴 전체를 포함시킨다.
    # 나중에 문구가 바뀌어도 글자가 통째로 사라지는 사고를 막는다.
    chars |= {chr(c) for c in range(0x20, 0x7F)}

    # 제어문자 제거
    return {c for c in chars if ord(c) >= 0x20 and c not in "\n\r\t"}


def build():
    chars = used_characters()
    report = {"charset_size": len(chars), "fonts": []}

    for src_name, out_base, weights in TARGETS:
        src = FONT_DIR / src_name
        if not src.exists():
            raise SystemExit(f"원본 폰트가 없습니다: {src}")

        before = src.stat().st_size

        for weight in weights:
            font = TTFont(src)

            # 1) 가변축 고정 — 해당 굵기 하나짜리 정적 폰트로 만든다
            instancer.instantiateVariableFont(font, {"wght": weight}, inplace=True)

            # 2) 문자 서브셋
            opts = Options()
            opts.flavor = "woff2"
            opts.desubroutinize = True
            opts.layout_features = ["kern", "liga", "calt"]  # 커닝/합자만 남긴다
            opts.name_IDs = ["*"]
            opts.notdef_outline = True

            sub = Subsetter(options=opts)
            sub.populate(text="".join(sorted(chars)))
            sub.subset(font)

            out = FONT_DIR / f"{out_base}-{weight}.woff2"
            font.flavor = "woff2"
            font.save(out)
            font.close()

            after = out.stat().st_size
            report["fonts"].append(
                {
                    "file": out.name,
                    "weight": weight,
                    "source": src_name,
                    "source_bytes": before,
                    "bytes": after,
                }
            )
            print(f"{out.name:32} {before:>7,} -> {after:>7,} bytes")

    # 원본 가변폰트는 배포본에서 빼고 보관용으로 옮긴다
    keep = FONT_DIR / "_source"
    keep.mkdir(exist_ok=True)
    for src_name, _, _ in TARGETS:
        p = FONT_DIR / src_name
        if p.exists():
            shutil.move(str(p), str(keep / src_name))

    total_src = sum(
        (keep / n).stat().st_size for n, _, _ in TARGETS if (keep / n).exists()
    )
    total_out = sum(f["bytes"] for f in report["fonts"])
    report["total_source_bytes"] = total_src
    report["total_bytes"] = total_out

    (ROOT / "docs" / "font-report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\n문자 {len(chars)}자 기준")
    print(f"원본 가변폰트 합계: {total_src:,} bytes")
    print(f"서브셋 결과 합계  : {total_out:,} bytes")
    print(f"감소율            : {(1 - total_out / total_src) * 100:.1f}%")


if __name__ == "__main__":
    build()
