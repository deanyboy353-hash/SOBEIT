# Nudge design system

One calm look, light and dark. Light or dark follows the phone unless you pick one in Settings → Appearance; you can also pick an accent colour and a larger text size. The app should feel like a tool you trust, not a toy: neutral greys, one accent, flat cards, one font, and nothing moving unless it means something.

(Until October 2026 there were two loud looks, After Dark and Glam, with a style studio of animated backgrounds, card styles and fonts. They were removed; the old choices stay saved in each person's prefs but are ignored.)

## 1. Colour tokens

Every component reads these CSS variables (`web/app.css`, the block headed "The look"). No component uses a raw hex value for anything themed.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bg` | page | `#f6f6f7` | `#0e0e10` |
| `--surface` | cards | `#ffffff` | `#17171a` |
| `--raised` | inputs, chips, quiet fills | `#f0f0f2` | `#202024` |
| `--line` | hairlines and card borders | `#e5e5e9` | `#2a2a30` |
| `--ink` | main text | `#16161a` | `#f2f2f4` |
| `--muted` | secondary text | `#5f5f69` | `#a2a2ac` |
| `--faint` | hints only | `#9a9aa3` | `#6c6c76` |
| `--lilac` (the accent) | primary buttons, links, active states | `#5548d9` | `#a8a1ff` |
| `--pink` (second accent) | small labels only, sparingly | `#b2386a` | `#f19bbd` |
| `--good` / `--warn` / `--amber` | success / attention / caution | `#17784d` / `#c0344d` / `#8a5a00` | `#6fd3a0` / `#ff8a9d` / `#f2c35b` |

The accent can be swapped for blue, teal, green, orange or pink (`data-accent`). The names `--lilac` and `--pink` are historical; they mean "accent" and "second accent".

## 2. Type

One family: **Manrope** (variable, 400–800), loaded without blocking the first paint and cached by the service worker.

| Step | Size | Use |
|---|---|---|
| H1 | 26, 800, -0.025em | Screen title, greeting |
| H2 | 19, 650 | Sheet titles |
| H3 | 16, 650 | Card titles |
| Body | 16 | Everything readable |
| Small | 14 | Supporting lines |
| Tiny | 12.5 | Meta and hints |
| Eyebrow | 11.5, 0.08em, uppercase | Section labels |

## 3. Shape and depth

- Spacing: 4, 8, 12, 16, 20, 24, 32. Page gutter 16px, 12px between cards.
- Radius: cards 16px, inputs and buttons 12–14px, pills 999px.
- Cards are flat: the surface colour, a 1px `--line` border and (light only) a barely-there shadow. No gradients, glows, rim lights or glass.
- The main card on a screen (`.card.spot`) is the same card with a little more padding. Hierarchy comes from order and type, not effects.

## 4. Motion

- Presses: 120ms scale to 0.97. Ticks: the check pops in over 220ms. Screen changes: a 160ms fade.
- No full-screen celebrations, confetti or daily splash. A level-up or a won day is a toast, a chime (if sounds are on) and a buzz.
- Animations off in Settings, or the phone's reduced-motion setting, makes everything instant.

## 5. Components

- Buttons: primary (solid accent), soft (accent wash), line (hairline), ghost (text only). At least 44px tall.
- Main action: docked above the tab bar on phones, never floating over content.
- Cards: plain, `spot` (the main one), `tint` (an accent wash for the brief and notes).
- Settings use switches, not ticks. Every meaning is written out in words, never shown by colour alone. Icons are inline line-SVGs, no emoji.
- Characters live behind "Your character" (Settings) and the profile row on You. The Home card "Characters and pet" is off unless you switch it on.
