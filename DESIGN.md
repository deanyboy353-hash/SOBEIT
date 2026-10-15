# Nudge design system

Two looks, each with a light and a dark version. Each person picks their own look in You → Customise. Light or dark follows the phone's setting unless they override it. Everything here is original: no logos, characters, catchphrases or artwork from any brand, show or game.

| | After Dark (Dean's default) | Glam (Yaz's default) |
|---|---|---|
| Idea | An underground rave. Deep black and purple, neon violet, electric pink, and haze and laser light used sparingly. | Runway and showtime energy. Spotlight, sequin sparkle, hot pink and gold. |
| Display font | **Unbounded** (wide, geometric, a little cheeky) | **Bodoni Moda** (high-contrast, fashion-magazine) |
| Body font | **Manrope** (clean, very readable at small sizes) | **Manrope** |
| Hero treatment | A violet-to-pink rim light on the hero card, plus a faint haze | A gold hairline border, plus a spotlight gradient from the top |

## 1. Colour tokens

Every component reads these CSS variables, so no component uses a raw hex value. Contrast was checked with `scripts/contrast` (WCAG):
- ink is at least 16:1 on every background
- muted text is at least 5:1
- accents used as text are at least 5:1
- faint text is at least 3:1, and is used only for hints and never for anything you need to read

| Token | Role | AD dark | AD light | Glam dark | Glam light |
|---|---|---|---|---|---|
| `--bg` | page | `#07050c` | `#f5f2fc` | `#0c0609` | `#fbf4ef` |
| `--surface` | cards | `#120c1c` | `#ffffff` | `#180d13` | `#fffaf6` |
| `--raised` | inputs, chips, quiet cards | `#1b1329` | `#eee8fa` | `#24131c` | `#f6e6e1` |
| `--line` | hairlines | `#2b2040` | `#e2d9f3` | `#3d2231` | `#ecd6cf` |
| `--ink` | main text | `#f6f0ff` | `#1a1028` | `#fff3f7` | `#2b1219` |
| `--muted` | secondary text | `#a99cc2` | `#5f5475` | `#cfaebe` | `#7d5562` |
| `--faint` | hints only | `#76698e` | `#8d82a3` | `#94707f` | `#a8848f` |
| `--lilac` (accent) | primary accent, links, active states | `#a07bff` | `#5b2fe0` | `#ff3d9a` | `#c8156e` |
| `--pink` (accent 2) | second accent, sparingly | `#ff4fae` | `#c4126f` | `#f0c96a` (gold) | `#8f6500` (gold) |
| `--good` / `--warn` | success / attention | `#4ff0b4` / `#ff6b98` | `#137a4c` / `#b4204f` | `#6ee7b7` / `#ff7a9e` | `#16794a` / `#b0213f` |
| `--glow` | glow colour | violet 45% | violet 18% | gold 40% | pink 16% |

(The accent tokens keep their old names, `--lilac` and `--pink`, so every existing component picks up the new looks without being rewritten.)

## 2. Type

- **Display** (`--font-display`): screen titles, the hero numbers, level-ups. Never used for body text.
- **Body** (`--font-body`): Manrope at weights 400, 500, 600 and 700.

| Step | Size / line height | Use |
|---|---|---|
| Display XL | 40/44 | Level-up number, hero stat |
| H1 | 28/32 (display) | Screen title, greeting |
| H2 | 20/26 | Sheet titles |
| H3 | 16/22, 650 | Card titles |
| Body | 16/24 | Everything readable |
| Small | 14/20 | Supporting lines |
| Tiny | 12.5/18 | Meta and hints |
| Eyebrow | 11.5, 0.12em tracking, uppercase | Section labels |

## 3. Spacing, shape and depth

- **Spacing scale:** 4, 8, 12, 16, 20, 24, 32, 48. The page gutter is 16px and the gap between cards is 12px.
- **Corner radius:**
  - Cards: 20px (can be changed in the style studio).
  - Inputs and chips: 12px.
  - Pills: 999px.
  - Hero: 28px.
- **Depth:** dark modes use glow, not shadow (`0 0 0 1px` hairline plus a coloured blur on the hero only). Light modes use one soft shadow `0 8px 24px` at 6–8% opacity.

## 4. Hierarchy: one hero per screen

Each screen has exactly **one** hero element. Everything else is a quiet card: no border in dark mode, the `--raised` fill, and a smaller title.

| Screen | Hero |
|---|---|
| Home | "Today": the XP ring, the minimum, the streak flame and your characters on one stage |
| Chores | The job you're on, or the next must-do |
| Train | Today's session (the rotation strip with the current session lit) |
| Food | Calories and protein left |
| Play | Today's game |

Rules:
- No gradient fills on ordinary cards; gradients belong only to the hero and to primary buttons.
- No emoji as icons; every icon is an inline line-SVG.

## 5. Motion

- **Presses:** 120ms scale to 0.97, ease-out.
- **Ticks:** the check draws in over 200ms with a little pop to 1.15; the row fades.
- **Screen changes:** a 160ms fade with an 8px rise.
- **Big moments** (level-up, minimum hit, high-five): an overlay of up to 2.6s that fades on its own and never blocks taps.
- **Pet:** idle animation loops of 3–4s.
- **Performance:** animate only `transform` and `opacity`, to hold 60fps.
- **Reduced motion** (the phone setting, or Motion off in Settings): all loops stop and transitions become instant.

## 6. Components

- **Buttons:**
  - Primary: the accent fill, or in After Dark dark a violet-to-pink gradient.
  - Soft: `--raised`.
  - Ghost: text only.
  - Minimum height 44px.
- **Main action:** docked to the top of the tab bar on phones. It's part of the frame, never floating over content.
- **Cards:** `quiet` (default), `spot` (the hero, one per screen) and `tint` (an accent wash, for notes).
- **Tags:** small pills for meaning, such as "Together · 2× XP". A meaning is always written out in words, never shown by colour alone.
