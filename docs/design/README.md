# Design references

## homepage-prototype.html
The approved homepage prototype (2026-09-05). Same file as the published artifact, minus the
embedded photos: `{{BUNKER}}`, `{{BUNKERCARD}}`, `{{AERIAL}}`, `{{IRON}}`,
`{{LOGO}}` are placeholders. The real build uses `next/image` with the assets below, never data URIs.

## Photos (Unsplash, free license)
| placeholder | Unsplash photo id | used for | crop / size in prototype |
|---|---|---|---|
| BUNKER | 1592919505780-303950717480 | pinned story photo | crop y 1400–2800 of the 1800×3200 original, 1600w |
| BUNKERCARD | same | Sandpiper Links card | 1000w |
| AERIAL | 1500932334442-8761ee4810a7 | Hollow Creek card | 1000w |
| IRON | 1593111774240-d529f12cf4bb | Stony Hollow card + demo device header | 1000w |
| LOGO | public/brand/logo-lockup.png | nav + footer | 600w |
| STORY (H-2a) | `public/home/story.mp4` + `story.webm` + `story-poster.jpg` | looping clip under the pinned story beats (desktop only) | supplied by Cam 2026-09-14 — source and licence: **Cam to record here** |

URL pattern: `https://images.unsplash.com/photo-<id>?auto=format&fit=crop&w=1600&q=70`

Replace with real course photography as courses go live; the layout assumes 3:2 landscape.

## Product mockups
Design canvas "GreenReserve UI": https://claude.ai/code/artifact/9e4a82e3-f03a-4dcd-9c7a-2a6d960d45ba
Boards are drawn in the STAFF look; golfer pages are built in the PUBLIC look per UI_REVISE_SPEC §0.
