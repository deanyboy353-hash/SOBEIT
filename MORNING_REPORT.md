# Morning report: overnight audit and polish

Everything below is committed on `claude/adhd-automation-system-htcfxg` (one commit per fix). It's deployed to the website (life-quest-5c52d.web.app) and to Apps Script (version @41). All 204 automated tests pass. No stored data was deleted or reset. The only data changes add fields (for example the pet's lifetime day count) or rename old Upper/Lower rows to "Old: …" so they're kept but ignored.

## 1. Known bugs: fixed

| Bug | What changed |
|---|---|
| Train programme | Push → Pull → Shoulders & Arms rotation with no hip hinges (hack squat, leg press, chest-supported row, leg curls). It only moves on when a session is actually logged; miss a day and the same session waits for you. Old "Upper A/B" sessions are kept as "Old: …" and ignored. Old feed and XP entries were relabelled to the session they really were. |
| Today brief | No greeting of its own (Home already says hello). It's written for the current part of the day and refreshes when that changes. Rest days say so. It knows the rotation, bus times and what's left. |
| Currency | £ everywhere (cash, shop, empire), with a test. |
| Health sync zeros | "Synced at" no longer shows over zeros. It explains why there's no data and what to do, with a Check again button. The HC Webhook connection is recorded. |
| Avatars | Your real face (from the dressing room) is used everywhere: Play, the feed, the menu and the dressing room. |
| Tabs | At most 5 tabs (yours: Home, Chores, Train, Food; Yaz's: Home, Chores, Play, Work), plus a More sheet. |
| Mix practice | Opens Booth. |

## 2. Audit

* **Tapping every button, as Yaz on a phone:** 260 buttons on 27 screens. This found one real bug, now fixed and deployed (version @41): "Show my answers" under Setup could crash. Everything else it reported was the test itself:
  * classic characters folded away in a closed section
  * memory-game pads that only respond during a round
  * buttons behind the dressing room the test had left open

* **Every screen as both of you.** An automated pass on phone, desktop, light and dark visits every screen and taps every button. No text errors (no undefined, NaN, null, "the The" or stray punctuation), no layout overflow, and no script errors.
* **Numbers.** Tests cover XP, levels, streaks, calories, protein, water, chore counts, head-to-head and "days over".
* **Time.** Everything runs on Europe/London. Tests cover the midnight rollover and the clocks going back on 25 Oct.
* **Privacy.** Yaz's link never receives your body data (weight, food, health). No API keys are in the front end. Backups leave out every key and token.
* **Offline.** The app shell opens instantly from cache and works offline. It refreshes in the background, and a toast offers a reload when a new version is ready.
* **Performance.** Loading shows skeleton cards instead of "Loading…". Background animations are GPU-only and stop under reduced motion or when Motion is off in Settings.

## 3. Extras added

* **Home-screen shortcuts** (long-press the icon): Log food, Log weight, Start gym session, Today's chores.
* **Share to Nudge**: share a photo or text from any app and it lands on Food. Photos are estimated by Claude and logged, with one-tap undo. There's also a "Snap or share a photo" button on Food.
* **Push notifications**:
  * Leave-by: 15 minutes before you need to go.
  * Weigh-in: at wake time on weigh days.
  * Noon "Eat something now": only if nothing is logged.
  * 11pm food check: what's left in kcal and protein.
  * Bins: at 7pm the evening before collection, to whoever has the job.
  * Nudges from Yaz already pushed and still do.
* **Haptics** on chores, sets and beaten challenges. **Sounds are now off by default** (Settings → Feel).
* **Style studio** (You → Customise):
  * Background: Live (drifts and changes colour with the time of day: dawn, day, dusk, night), Lasers, Grid, Stars or Plain.
  * Cards: Soft, Glass, Neon, Outline or Flat.
  * Font: Clean, Rounded, Mono, Serif or Poster.
  * Corners: Round, Sharp or Pill.
  * Three new accents: Lime, Red and Gold.
  * Rave is the default theme.
* **Celebrations**:
  * Hitting your minimum: a "Today counts" burst.
  * Level up: a bigger burst with the level number and rays.
  * Streak: the flame grows with it.
  * Both of you hitting the minimum: a high-five animation, also shown when you send one.
  * None of these block taps.
* **Character creator**: build (slim to big), height, facial hair (none, stubble, goatee, full), eye colour and freckles. These show on the 3D figure and on every face in the app.
* **Reacting to the day**:
  * Gym kit on training days.
  * Rain jacket when rain is 60% or more.
  * Headphones after Booth.
  * Sleepy after midnight, with "Time for bed" under the 3D stage.
  * Happy and bouncing when you both hit the minimum.
* **Earned outfits** (in the dressing room, with what unlocks them; free, never for sale):
  * Flame streak hoodie: 7-day streak.
  * Gym stringer: 10 gym sessions.
  * Gold DJ headphones: first Booth lesson at Solid or better.
  * Pet keeper's crown: the pet reaches Legend.
* **Shared pet** (Home): grows with every day you both win, from Egg through Hatchling, Little one, Teen, Grown-up and Legend to Mythic. It never shrinks or dies; when the joint streak lapses it just naps.
* **Thumb-reach button** on phones (bottom right): What now (Home), Start a job (Chores), Next set (Train), Log food (Food), Add a block (Work).
* **Backups**:
  * Every morning a compressed copy of every tab goes into a separate "Nudge backups" spreadsheet in your Drive. The last 14 days are kept.
  * Settings → Backups has Export everything (downloads a file), Import backup and Back up now.
  * **Import never overwrites**: it rebuilds the backup as a new "Nudge restore …" sheet for you to check.

## 4. Decisions I made

1. **Rotation advances on completion, not on the calendar.** A missed day doesn't skip a session.
2. **Old training rows renamed, not deleted.** "Old: Upper A" and similar are kept in the sheet and ignored by the app.
3. **Sounds off by default.** If you'd saved sounds on before, that choice stays.
4. **Scheduled alerts ignore quiet hours.** Leave-by, weigh-in, noon, the food check and bins are at times you set, so they fire anyway. Streak nags still respect quiet hours.
5. **Backups go to a separate sheet, not Drive files.** This needs no new Google permissions; Drive access would have needed you to re-approve the script.
6. **Only your link can export or import everything.** Backups hold both of you, including your body data.
7. **"Mastered" for the Booth outfit means Solid or better.** "Locked in" needs every ear-training aid off, which is a much later goal.
8. **The pet grows on lifetime joint days, not the current streak.** That way it never shrinks.
9. **Celebrations never block the screen.** They fade on their own and taps go straight through.

## 5. Needs you

* **Open the app on both phones once.** This picks up the new version: tap the "New version" toast, or close and reopen.
* **Allow notifications** on both phones if Home shows the "Notifications are off" card. The new alerts can't reach you otherwise.
* **Claude API key**: photo food and share-to-food need it (You → Settings). It's already set if quick-add works.
* **Run Setup on both phones** if you haven't: You → Setup. Yaz sees her own version, with no health questions unless she opts in.
* I couldn't reach the live site from my sandbox (the network blocks it). Everything was tested against a full local copy of the app and server instead, so the checks below matter.

## 6. Couldn't finish, and why

* **Real-phone checks**: haptics, share-to-Nudge, home-screen shortcuts and push timing only work on a real installed phone. They're built and tested in a desktop browser, but I can't hold a phone.
* **3D stage reactions** are shown as a line of text under the stage, and the moods appear on the 2D faces. Animating the 3D figures themselves (sleep, bounce) would be a bigger job, so I left it.

## 7. Try these first

1. **Share a photo of your next meal to Nudge** (Share → Nudge). It should land on Food, estimated and logged.
2. **You → Customise → Style studio.** Try Glass cards with the Lasers or Stars background.
3. **Dressing room → Body.** Set your build, facial hair and eyes, then look at Home's pet card and your face around the app.

## Phone testing checklist

- [ ] Long-press the Nudge icon: four shortcuts, and each opens the right box.
- [ ] Share a photo from Gallery to Nudge: it's estimated and logged on Food.
- [ ] Tick a chore: you feel a buzz.
- [ ] Tomorrow: the weigh-in push arrives at wake time (on weigh days), noon "eat now" only if nothing's logged, and the 11pm food check.
- [ ] A gym day: "Leave in 15 min" arrives.
- [ ] The evening before bins: the 7pm push.
- [ ] Settings → Backups → Back up now, then Open backups: the sheet is there.
- [ ] Both of you hit the minimum: the high-five appears and the pet hops.
