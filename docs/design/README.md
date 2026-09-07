# Design references

## homepage-prototype.html
The approved homepage prototype (2026-09-05). Same file as the published artifact, minus the
embedded photos: `{{HERO}}`, `{{BUNKER}}`, `{{BUNKERCARD}}`, `{{AERIAL}}`, `{{TEE}}`, `{{IRON}}`,
`{{LOGO}}` are placeholders. The real build uses `next/image` with the assets below, never data URIs.

## Photos (Unsplash, free license)
| placeholder | Unsplash photo id | used for | crop / size in prototype |
|---|---|---|---|
| HERO | 1587174486073-ae5e5cff23aa | hero (ball at the cup) — already the live site's hero | 1600w, position 62% 60% |
| BUNKER | 1592919505780-303950717480 | pinned story photo | crop y 1400–2800 of the 1800×3200 original, 1600w |
| BUNKERCARD | same | Sandpiper Links card | 1000w |
| AERIAL | 1500932334442-8761ee4810a7 | Hollow Creek card | 1000w |
| TEE | 1532601224476-15c79f2f7a51 | "We set it up" band | 1600w, position center 40% |
| IRON | 1593111774240-d529f12cf4bb | Stony Hollow card + demo device header | 1000w |
| LOGO | public/brand/logo-lockup.png | nav + footer | 600w |

URL pattern: `https://images.unsplash.com/photo-<id>?auto=format&fit=crop&w=1600&q=70`

Replace with real course photography as courses go live; the layout assumes 3:2 landscape.

## Product mockups
Design canvas "GreenReserve UI": https://claude.ai/code/artifact/9e4a82e3-f03a-4dcd-9c7a-2a6d960d45ba
Boards are drawn in the STAFF look; golfer pages are built in the PUBLIC look per UI_REVISE_SPEC §0.
