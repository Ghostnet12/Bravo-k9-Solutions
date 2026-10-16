"""Build lossless Latin delivery subsets; original fonts remain the fallback.

Run with FontTools and Brotli installed in a temporary Python environment:
    python scripts/subset-brand-fonts.py
No Python dependency is needed to build or serve the website.
"""
from pathlib import Path
from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1] / "client/public/fonts"
RANGES = [(0, 0xFF), (0x131, 0x131), (0x152, 0x153), (0x2BB, 0x2BC),
          (0x2C6, 0x2C6), (0x2DA, 0x2DA), (0x2DC, 0x2DC), (0x300, 0x36F),
          (0x2000, 0x206F), (0x20AC, 0x20AC), (0x2100, 0x214F),
          (0x2190, 0x21FF), (0x2212, 0x2212), (0x2215, 0x2215),
          (0x2600, 0x27BF), (0xFEFF, 0xFEFF), (0xFFFD, 0xFFFD)]
POINTS = {point for start, end in RANGES for point in range(start, end + 1)}

for name in ["bebas-neue", "montserrat-400", "montserrat-600", "montserrat-700"]:
    original = TTFont(ROOT / f"{name}.ttf", recalcTimestamp=False)
    delivery = TTFont(ROOT / f"{name}.ttf", recalcTimestamp=False)
    options = subset.Options()
    options.glyph_names = True
    options.layout_features = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=POINTS)
    subsetter.subset(delivery)
    delivery.flavor = "woff2"
    target = ROOT / f"{name}-latin.woff2"
    delivery.save(target)
    saved = TTFont(target)
    assert saved.getBestCmap() == {point: glyph for point, glyph in original.getBestCmap().items() if point in POINTS}
    source_glyphs, saved_glyphs = original.getGlyphSet(), saved.getGlyphSet()
    for glyph in saved.getBestCmap().values():
        assert original["hmtx"][glyph] == saved["hmtx"][glyph], f"Changed advance: {name}/{glyph}"
        source_pen, saved_pen = DecomposingRecordingPen(source_glyphs), DecomposingRecordingPen(saved_glyphs)
        source_glyphs[glyph].draw(source_pen)
        saved_glyphs[glyph].draw(saved_pen)
        assert source_pen.value == saved_pen.value, f"Changed outline: {name}/{glyph}"
    for table, fields in [("head", ["unitsPerEm"]), ("hhea", ["ascent", "descent", "lineGap"]),
                          ("OS/2", ["sTypoAscender", "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent"])]:
        for field in fields:
            assert getattr(original[table], field) == getattr(saved[table], field), f"Changed line metric: {name}/{field}"
    print(f"{name}: {(ROOT / f'{name}.woff2').stat().st_size} → {target.stat().st_size} bytes; glyph outlines and metrics identical")
