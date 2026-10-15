# Report: Win the day, Booth fixes, design roll-out, character creator

Everything is on `claude/adhd-automation-system-htcfxg` and deployed: the website, Apps Script @47, and Dylz's copy @6. **235 tests pass.** No stored data was deleted. Two pieces of stored text changed: the "Look at the Home tab" step was removed from existing morning routines, and the free starter wardrobe was widened.

## What changed

**1. Characters (quick fix).** The 3D mannequins are replaced everywhere by 2D illustrated figures: full body on Home, You and the dressing room, and heads in small spots. These all still work:
- gym kit on training days
- rain jacket when it's raining
- headphones after Booth
- sleepy after midnight
- bouncing when you've both won the day
- the Jheri curl unlock

The 3D code is kept for the creator.

**2. Booth**
- **No more jump to the bottom.** Results dock over the bottom of the screen, so the page and the decks stay exactly where they were (checked in a real browser: scroll position 260 → 260). The buttons are Try again, Next lesson and Keep playing (which closes the panel and leaves the decks running).
- **Back to the start of a track:**
  - CUE while paused returns to the cue point, which is the first beat unless you set one. Straight after scrubbing with the jog wheel, CUE sets the cue there instead.
  - SHIFT + CUE jumps to 0:00, and keeps playing if it was.
  - Each deck has an on-screen ⏮ Start button.
  - Keys **3** / **4** (Deck A / B), or Shift + the deck's CUE key.
  - Beatjump pads: back 1, 4, 8, 16 and 32 beats, and pad 8 = Start. With SHIFT: forward jumps, and pad 8 = back to cue.
  - SHIFT + CUE is mapped on the Inpulse 500 and labelled on the controller diagram.

**3. Home**
- **Win the day** is the one score. It counts your daily minimum of jobs, or the XP goal until setup has planned your day. The streak, the couple streak and the pet all follow it. XP, challenges, streaks and cash sit inside the same hero card, and "Goal hit" is gone.
- **New order:**
  1. Today brief
  2. Win the day
  3. Next deadline, or a small "+ Add deadline" link when there are none
  4. The routine for now
  5. Water and weight
  6. Characters with the pet at their feet
  7. Everything else

  Every card can be moved or hidden in Edit home screen. Old saved orders were reset to this one, but anything you'd hidden stays hidden.
- **Routines:**
  - The morning routine folds to one line after noon (for example "Morning routine 3/6"), and you can tap it to open.
  - The evening routine appears at 6pm. If you have none, there's "Add an evening routine" or "Not for me".
  - "Look at the Home tab" is removed.
- **The brief** rewrites itself every 3 hours, for each part of the day, and after something big: the day won, the gym done, a routine finished, or a deadline done (at most every 15 minutes). It shows "updated X min ago".
- **Rotation:** checked against your imported history. Next is **Shoulders & Arms**, and logging it moves the rotation on. Train shows one rotation strip.

**4. Design.** The After Dark and Glam looks (each light and dark, following the phone) are now on every screen. Each screen has one hero:
- Chores: your jobs
- Train: the rotation
- Food: calories
- Play: head to head
- Work: the day plan
- Empire: cash
- You: your look
- Customise: the look picker

An automated check of all 34 screen and look combinations at phone size found no overlaps, no clipped text and no sideways scroll. It found one real bug, now fixed: the cash amount was invisible in Glam light.

**5. Character creator (2D now, 3D waiting for your OK)**
- **The dressing room now has:**
  - eight tabs: Body, Face, Hair, Tops, Bottoms, Shoes, Accessories, Details
  - colour palettes and an any-colour picker
  - Randomise, which only uses things you own and never changes your body
  - Undo and Redo
  - **three saved looks each**
  - Stand, Runway and Happy poses, and zoom
- The free starter set is much bigger (30+ pieces). Showpieces still unlock with chores and cash, the four earned outfits still come from achievements, and the Jheri curl is still a 3-chore unlock.
- **3D quality gate.** The 3D body is rebuilt as one continuous skinned mesh with no ball joints. Clothes are painted into low-res textures the way PS2-era games did it. There are 2,000–2,300 triangles per character, a relaxed weight-on-one-leg stance, and bending that works (see the dance pose).

  See `docs/screens/characters-v2-five.png`, `-dance.png` and `-ps2-mode.png`. **It is not rolled out.** The 2D figures stay until you say yes.

## Screenshots (`docs/screens/`)
- **Home:**
  - `home-v3-afterdark-dark.png`, `home-v3-afterdark-light.png`, `home-v3-glam-dark.png`, `home-v3-glam-light.png`
  - afternoon (routine folded): `home-afternoon-routine-folded.png`
  - evening: `home-evening-routine.png`
  - before: `home-before-after.png` (from the last round)
- **Every screen:** `all-afterdark-dark.png`, `all-glam-light.png`, `all-mixed.png`
- **Booth:** `booth-result-docked.png`
- **Creator:** `creator-2d.png` (2D), `characters-v2-*.png` (3D)

## Decisions I made
1. **Win the day stays "your minimum of jobs"** (the XP goal before setup). XP, challenges and streaks feed into it on the card rather than changing what counts as a win, so your streak history means the same thing.
2. **CUE while paused goes back to the cue**, as you asked. You can still set a new cue: scrub with the jog wheel, then press CUE within 3 seconds.
3. **Results dock as a panel** rather than appearing inline, so nothing on the page ever moves.
4. **The evening routine shows from 6pm whatever time it's set for.** A morning routine that you finish before noon also folds.
5. **The creator's 3D stays switched off until you approve the five characters.**

## Needs you
- **Approve (or not) the five 3D characters** in `docs/screens/characters-v2-five.png`. On a yes I switch Home, Play, the feed and the dressing room over, keep 2D portraits in small spots, and fall back to 2D on slow phones.
- **CC0 packs.** I couldn't download Quaternius or Kenney models: this environment's network blocks quaternius.com, kenney.nl and opengameart.org. To let me use them, add those hosts under Network access → Allowed domains in the cloud environment's settings (environment menu → Edit). Mixamo needs an Adobe login, so I can't use it from here.

## Check on the phone
- [ ] Home order: brief, Win the day, deadline link, routine, water/weight, characters.
- [ ] After 12:00 the morning routine is one line; after 18:00 the evening one shows.
- [ ] The brief says "updated X min ago" and refreshes after you win the day.
- [ ] Booth: finish a lesson and the page doesn't move. Try CUE (paused), SHIFT + CUE, the Start button and the beatjump pads on the Inpulse.
- [ ] Dressing room: Randomise, Undo, save a look in a slot, then wear it again.
- [ ] Both looks in light and dark (You → Customise → Light or dark).
