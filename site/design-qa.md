# POAI homepage design QA

final result: passed

## Source and evidence

- Approved hero: /Users/san/.codex/generated_images/01a0fb94-e576-7942-9b8f-0e26122e2e0a/exec-350de835-aea8-4bd0-83f6-f1e9f9325ae7.png (1586 × 992).
- Six-scene direction: /Users/san/.codex/generated_images/01a0fb94-e576-7942-9b8f-0e26122e2e0a/exec-d3dde855-d1ab-4577-8e34-5c31b3bd3123.png (724 × 2172).
- Actual PNG logo: supplied /Users/san/Downloads/poai-logo.png, preserved byte for byte.
- Desktop captures: qa/desktop-{home,ai,ota,ops,data,agent}.png, 1440 × 900 CSS and pixels, deviceScaleFactor 1.
- Mobile captures: qa/mobile-home.png, qa/mobile-ota.png, 390 × 844 CSS and pixels, deviceScaleFactor 1.
- Same-input hero comparison: qa/hero-comparison-final.png. Reference normalized to 1440 × 900; tiny aspect difference is generated mock resolution, not browser frame.
- Overview comparison: qa/scenes-comparison.png. Original long mock compresses scenes; actual scenes intentionally expand to full desktop viewports as requested. No pixel-perfect equivalence asserted for compressed scene heights.
- Focused chapter evidence: qa/agent-comparison-final.png and qa/data-comparison-final.png plus full-size implementation PNGs.

## Review

- Typography: system sans / Chinese system fallback, light display typography, matching two-line hero hierarchy. Readable paragraph sizes and unclipped headings. English chapter titles remain progressively longer.
- Layout: desktop six snap scenes; mobile natural section extension, fixed accessible menu, clickable six-position indicators. Hero duplication and login removed as approved.
- Color: midnight navy / ice blue / cyan, violet limited to source logo and illustration detail. Chart state colors and contrast maintained.
- Assets: exact supplied PNG logo, generated raster imagery; no approximate logo. WebP conversion is compression only. Asset edges softly masked, footer image blended into its scene.
- Content: approved order overview → AI → OTA → OPS → DATA → AGENT; AI and OPS are marked developing; chart/interface examples labelled sample data. OTA and Agent use existing official destinations.

## Iterations

1. P2 hero hierarchy: CTA too narrow and navigation offset; enlarged CTA and aligned header spacing. Evidence: hero-comparison-final.png.
2. P2 mobile copy: awkward last-character line break; split subtitle at semantic phrase on narrow mobile. Evidence: mobile-home.png, mobile overflow check passed.
3. P2 image composition: hard footer and illustration edges; applied image masks, retained original raster assets. Evidence: data-comparison-final.png and desktop-agent.png.
4. P2 Assistant fidelity: changed initial dark interior to light panel with dark frame matching source. Evidence: agent-comparison-final.png.
5. Missing favicon request produced console error; restored official icon. Final browser checks have zero errors.

## Interaction checks

Desktop chapter buttons align all six scenes; price filter leaves selected hotel line; chart tooltips are interactive; Assistant tabs and auto-task toggle work. Mobile menu opens, navigates, closes; content bounds checked across all six scenes. Browser errors: none. Build succeeded. Four packaging checks passed.

## Follow-up polish

P3: generated illustration geometry is a fresh matching asset rather than identical pixels. No automatic backend integration or AI analysis is implied by example previews.
