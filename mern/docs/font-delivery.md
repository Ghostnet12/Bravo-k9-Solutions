# Brand font delivery

The original Bebas Neue and Montserrat TTFs, complete WOFF2 fonts, and licenses
remain unchanged. Latin WOFF2 subsets include common punctuation, combining
marks, arrows, and supported symbols. CSS checks these subsets first for their
declared character ranges; other characters use the complete brand font.

Run `python scripts/subset-brand-fonts.py` in an environment with FontTools and
Brotli to reproduce the delivery assets. Neither package is a website runtime
or build dependency. The script verifies Unicode coverage, decomposed glyph
outlines, advance widths, and line metrics against the original fonts.

| Face | Complete WOFF2 | Latin WOFF2 |
| --- | ---: | ---: |
| Bebas Neue | 20,212 B | 15,236 B |
| Montserrat 400 | 62,128 B | 22,004 B |
| Montserrat 600 | 62,908 B | 21,980 B |
| Montserrat 700 | 63,560 B | 22,208 B |

The controlled homepage performance check verifies that ordinary homepage text
uses only the Latin assets, then requests extended characters to confirm the
complete Montserrat font still loads. Public content editing keeps its full
character coverage. These delivery changes do not change the approved hero
photograph, crop, typography, or CTA layout.
