# Nudge

Your training and weigh-ins, pushed to your phone and watch. You never need to open an app to report in. Ticking a task off is the log.

**Your Sheet:** https://docs.google.com/spreadsheets/d/1tX4vXf8AHlhegFQkdY3ndjgD6HFdvZ4eSLL3vmcE2yI/edit

## What it is

A Duolingo for your whole life, shared with your partner. Chores that keep the house running, a workout logger that makes you stronger week by week, food tracking, daily brain games you play against each other, and Claude helping out throughout. Things come to you: push notifications, and gym and weigh-in alerts in your calendar.

## The app

**Install it:** open your app link (Config tab, **Your app link**). It starts with https://life-quest-5c52d.web.app.
- **Android (Chrome):** menu (three dots), then **Install app**.
- **iPhone (Safari):** **Share**, then **Add to Home Screen**. Open it from the Home Screen icon from then on.
- Then in the app: **You** (top right) → **Turn on notifications**. Do this once on each phone.

**Tabs**
- **Home**: a short **Today brief** from Claude (rewritten at most four times a day, morning, midday, after work and evening, plus once when you win the day), **Ask anything** (type how you feel or what you need; it can add shopping, chores and to-dos, park a worry or pick one job for you), Win the day with your streak and a **Take a lazy day** button, the docked **What now?** button, your routine, today's gym, today's chores, weight, water, and what your partner has done (high-five them or send a nudge).
- **Setup** (Home, **Start setup**; later You, Settings, **Setup**): one short question per screen, mostly taps. Each of you does your own part on your own phone: name and character, work days and hours, wake and bed times, when you have energy, how many chores feel manageable, your **daily minimum** (default 2 must-do jobs), chores you don't mind or hate, what motivates you, gentle or direct reminders, and quiet hours. **Health and fitness** is a private, opt-in part (on and pre-filled for Dean; off for Yaz unless she turns it on in Settings). The **house** part is shared: whoever does it first fills it in (floors, rooms, bins and collection days, laundry day, pets, and how often the 12 common chores get done now, how often you'd like, and who does them). Then it builds the chore list, merging with what's already there (history kept), and you review it first. Change one answer any time from Settings, **Show my answers**, without redoing the rest.
- **Your day** (once setup has built the list): each of you gets your own **minimum** (short must-do jobs, 10 minutes or less) and **bonus** jobs. Do the minimum (any jobs count) and the day is a win: the streak counts these days, not the XP goal. Lighter on work and gym days, bigger jobs on days off, bins the evening before collection, nothing heavy after 9pm, shared jobs split fairly (take turns, steering away from jobs you hate), missed jobs roll on a couple at a time instead of piling up. Jobs you want to do more often build up over 3 weeks.
- **Chores**: **Today** shows today's jobs. Start one on a timer with steps; your partner can join. **Schedule** shows every chore (by room or area once setup is done). Tap one to change anything: name, area, how often (or set days, every week or every other week), minutes, who (you, your partner, together, take turns, whoever), time of day, XP and notes; move it up or down, archive it (paused, kept) or delete it. Changes apply to the days ahead.
- **Work**: time blocking for your work day. Type "Write the report 10-11:30", "Emails 30m" or "Call Sam at 3pm 45m" and it lands on today's timeline (no time given: the next free slot). On a computer, drag blocks to move them and drag the bottom edge to resize; click an empty time to add one there. Start a block, tick it off, get paid: about 2 XP per 10 minutes (deep work 1.5x, meetings half, breaks 2), +3 for starting on time, +1 for each block already done today (up to +5). Finish every work block (3 or more) for a **clean sheet**: +25 XP and a work streak. Also: plan tomorrow, fill a day from a list (one per line), copy your last plan, "Running late +15" to push the rest of the day back, "Block 30m" for deadlines that have no time set aside, music that lasts the block, and your work hours. Blocks with a number ("Queue 40 emails", "Edit 3 videos") get a counter: hit the number and it ticks itself off, stop early for a share, beat it for +3. Your job kit (editable) drops your usual tasks in with one tap, and the pay card shows this week's totals. Your phone pings you just before each block, if you haven't started it, and when it ends (quiet from 22:30 to 08:00).
- **Play**: four daily games (Word, Numbers, Recall, Tempo), the same for both of you, with live scores, and a **Booth** tab that opens the DJ trainer. **Word** (five letters, six guesses; you see your partner's colours but not their letters until you've both finished), **Numbers** (reach the target), **Recall** (remember the sequence). **Stats** shows your head-to-head record and word streak. You get a notification when your partner plays.
- **3D characters and wardrobe**: you and your partner as smooth 3D characters (Vice City and San Andreas style, with runway glam) on Home and You. The Dressing room sells hair, tops, bottoms, shoes, extras, patterns and a Glam kit for cash; the best pieces also need chores done (ball gown 75, winner's crown 100).
- **Afterhours: Booth** (its own page: `booth.html`, or Play, Booth, Open Booth): learn to mix on your Hercules DJControl Inpulse 500, on your PC in Chrome.
  - **Controller test** first: every control lights up on a diagram with its raw MIDI message; **Fix** re-learns one; the lights check tests the LEDs and Beatmatch Guide. The mapping lives in `web/booth-map.js`.
  - **Free mix**: two decks with your tracks (BPM, beat grid, Camelot key and 3-band waveform worked out once and saved), 3-band EQ with full kill, filter, trim, pitch, jog nudge, SYNC (on by default), hot cues, loops (LOOP IN/OUT, loop knob, loop pads, SHIFT rolls), slicer, beatjump and a sampler. Crossfader locked to the middle unless you unlock it in Sound settings.
  - **Tutorials** (nothing locked): Loops 101, EQ and filter basics, Beatmatching basics, and every transition step by step with the exact control lit up.
  - **Advanced Academy** (Booth, Academy): 22 techniques in 7 modules (looping, filters, EQ and speed, FX exits, hot cues and structure, tempo and key, beatmatching by ear). Each one: a 2-3 sentence explanation, a **demo** (the decks play it and the controls move on the diagram), **practice** with prompts and ghost lines and feedback after each move, then a **test** scored to the 1/8 beat for quick moves ("LOOP OUT pressed 1/4 beat late", "Pressed pad 1 (Hot cue mode) instead of LOOP IN"). Mastery goes Learning, Solid, Locked in (Locked in needs the phrase counter, waveforms and energy meter switched off). Pass a test to unlock the next; jump to anything unlocked. Also: **speed challenges**, **Calibrate timing** (tap along; asked for the first time and when your speakers change), built-in loops or your own tracks, a **10-minute warm-up** of your weakest techniques, **live challenges** in Free mix with a combo, techniques spotted and scored in Free mix and Set mode, and a **one-page summary** of every technique with its CDJ + DJM equivalent. The Controller test has a **Pad modes** check too.
  - **Transition drills**, **Ghost line** (follow the scrolling target fader and EQ lines), **Manual beatmatching** (three levels: lights and waveforms, lights only, ears only), **Set mode** (3-4 tracks in order) and a **Daily challenge** (same for both of you, head to head in Play).
  - Every transition is scored on bass clash (beats), volume (measured dB dips and spikes), phrase timing and smoothness, with coach notes that say exactly what happened ("Bass clash for 6 beats at bar 34") and a scrubbable replay. **Stats** and **Recordings** keep your progress and mixes on that computer.
  - Tempo works like vinyl (speed and pitch together): no latency, no glitches. Headphone cue needs the Inpulse 500 as a 4-channel output in Windows, or a second sound device (see Sound settings).
- **Train**: nSuns-style upper/lower. The main lift (9 sets) and second lift (8 sets) come from your training max, then accessories. Tick sets as you go and the rest timer starts itself. Doing a different session today? Tap it and press **Switch** (or **Make today a rest day**): your calendar event, gym task and Home card follow. **Next in order** suggests the session after your last one. The heavy **1+** set sets next week's training max. Progress shows your history and PRs.
- **Food**: calories and protein versus targets, one-tap foods, Claude quick-add, **Meal ideas** that fit what's left, undo.
- **Health**: your sleep (score, time asleep, a stage-by-stage chart of the night, how deep/REM/light/awake compare with what's typical, wake-ups, bedtime consistency, sleep debt, last 7 nights), readiness (sleep plus heart-rate variability and resting heart rate against your own two weeks, with advice for today's workout), activity (steps by hour, distance, active calories, workouts, two weeks of steps) and heart (resting HR, HRV, blood oxygen, breathing, heart rate through the day, trends). Tap any chart for details, use the arrows for earlier days, and tap **Explain my sleep and readiness** for Claude's take. Needs the free **HC Webhook** app; the Health tab shows the steps and your private address. Sleep score and readiness are the app's own estimates.
- **You** (the person icon, top right): level, this week's scores, shopping list, and settings: Light, Dark or Match phone, notifications, installing, and the Claude key.

Your partner's link opens the same app without Train and Food.

**Deadlines (they nag until it's done)**
- On Home, type something with a time: "Send the invoice by 3pm", "Call the garage in 20 mins", "Bins out tonight". (Or tell Ask.)
- It reminds you as the time gets close, then once it's late keeps going (every 5 minutes on **Duolingo** level) until you tap **Done** or **Park it**. The notification stays on screen and has the buttons on it.
- Done on time +15 XP, late +5 XP. **+30m** costs 3 XP, **Park it** costs 10 XP (it goes to Saved for later).
- How hard it pushes: Customise, then Reminders: Gentle, Normal or Duolingo (also a streak nag every half hour from 6pm until you hit your goal). Quiet from 10:30pm to 8am.

**Cash and your empire**
- Every XP also pays $10. Spend it under You, then **Your empire**: San Andreas and Vice City homes and businesses (the Grove Street house, the Malibu Club, the Vercetti Estate…), cars, bikes, a boat, a helicopter, even a jump jet.
- Upgrade places (a music studio and DJ booth, an art wall, a pool…) and vehicles (respray, hydraulics, nitro…). Businesses pay out every morning. Sell anything back for 60%.
- Your character card shows your ride, your home and your net worth.

**Plan the week**
- Chores, then **Plan**: tap a job, then tap who does it (you, your partner, **Together** or Either), like matching pairs. Save the week and your partner sees it.
- **Together** jobs (making the bed, the food shop, the bedding) pay **both of you double XP** when you do them together: tick one and choose Together.

**Music for chores**
- On a chore timer (or Chores, then Music library), pick one of 12 stations: lo-fi, house, disco, garage, techno, drum and bass, synthwave, hip hop, afro house, trance, dubstep, ambient.
- The app makes an original mix that lasts as long as your timer and finishes on a proper outro, never mid-beat (at most one phrase, about 15 to 28 seconds, either side). If you add 5 minutes, the mix follows.

**The fun parts**
- **Yazzy & Deany**: nicknames and a team name throughout (Config tab). Your levels have names: a DJ career for Deany (Bedroom DJ, Warm-up set… Headliner), album eras for Yazzy (The College Dropout, Late Registration, Graduation…). Change them with **Your level titles** / **Partner level titles** (DJ, Ye or None).
- **Daily intro**: the first time you open the app each day, a quick welcome with your streaks.
- **Reminders**: if your streak is at risk, a nudge at 7:30pm and a firmer one at 9:30pm (never on a lazy day). Also when your partner pulls ahead, or has done the word and you haven't. Nothing after 10:30pm.
- **Us** (Home, private): one tap logs it, +20 XP each. Wink, ask "Tonight?" (one-tap Yes or Rain check), roll the dice for an idea, and earn private Us badges. Never in the feed or the weekly email.
- **Stakes**: before either of you finishes the word, set what the loser owes the winner.
- **Tempo** (Play): hear a beat, then keep it going on your own. Closest BPM wins.
- **Customise** (You, then Customise the app): pick a San Andreas or Vice City character (shows on your Home screen, in Play and in your partner's feed, with Respect and wanted-level streak stars), themes (Light, Dark, Rave, Grove, Vice, Auto), accent colour, text size, your nickname and team name, level titles (DJ, Ye, GTA or plain), the order of your Home screen (or hide parts), and sounds, vibration, confetti and animations.
- Switch reminders off in the Config tab: **Reminders**.


## Lazy days, missed days and the comeback

- **Lazy days**: two each a week, back every Monday. Tap **Take a lazy day** on Home. The day is neither won nor lost, the streak is protected, the minimum becomes one small optional thing (a glass of water), and the brief goes easy. Home shows "Lazy days left this week: 1 of 2"; with none left the button is greyed out and says why. Changed your mind today? **Undo** gives it back.
- **Missing the minimum** (no lazy day): the streak resets and you lose 10% of what the day could have earned, at most 10 XP and £100. Never below zero, never a level, never anything you've bought. The pet just gets sleepy.
- **The next morning** Home says so plainly ("Missed yesterday: −3 XP. Win today to get it back.") and, until noon, offers to make yesterday a lazy day instead if that week has one left: the streak and the XP come back.
- **Comeback**: win the day after a missed one and the lost XP and cash are paid back.

## Retired features

Daily challenges and the chest, surprise Double XP, rewards bought with XP, Google Tasks, routine calendar events and the Meds alert, Wrapped, the Mix game, Next up and Make something on Home, the big "What should I do now?" button (the docked **What now?** stays), Nudge for Chrome, general badges and streak freezes are gone. Their data was copied once into the **Archive** tab of the Sheet (and the Rewards tab renamed **Old Rewards**) in case you want them back. Nothing else was deleted.

## What arrives by itself

| When | What you get |
|---|---|
| About 6am | Today's jobs in the app. Your streak is settled for yesterday (a missed day costs a little; see above). |
| About 6am | Your morning brief from Claude (if the Claude key is saved). |
| Training days (Tue, Wed, Fri, Sat) | A calendar event with your main lifts **with weights**, accessories, bike or bus, and leave-by time. Alerts at 14:45 and when it's time to go. |
| Mon and Wed, 08:30 | Weigh-in alert (log it on Home). |
| While a chores timer runs | Time's up: a notification on the phone of whoever is doing it. |
| 11pm | What's left on calories and protein. |
| When your partner plays, nudges you or asks you to join | A notification. |
| Sunday 6pm | Your week, opening with a short review from Claude: food averages, gym, weight, chores, XP and streaks, strength changes and **3 suggested priorities** for next week. |

XP comes from quests, the gym (+50), PRs (+25), weigh-ins, routines, hitting protein, water and brain dumps. Win the day (your minimum, or the **Daily XP goal** before setup) to keep your streak; lazy days protect it.

## Changing your settings

Everything is in the Sheet. Edit on your phone (Google Sheets app) or PC. Only change values, never the names in column A of Config.

- **Chores tab (your quests)**: Job, Minutes, Steps (separate with `;`), **Every** (`daily`, `3 days`, `weekly`, `2 weeks`, `monthly`, `monthly 15` = the 15th, `3 months`, `yearly`, a weekday like `Wed`, or `as needed`; the Schedule page in the app sets these for you), **Next due** (the app fills it in), **Who** (Anyone / Me / Partner), **Energy** (Low / Medium / High, used by What now?), **XP** (blank = worked out from minutes). *Set your bin day*: open Chores, then Schedule, then tap "Take the bins out".
- **Routines tab**: name, who, time and steps.
- **Lifts tab**: training maxes (the app fills these in; edit if you want). **Programme tab**: which lifts each session uses and their sets (`75x5, 85x3, 95x1+` means % of training max × reps; `+` = as many as you can). **Sessions tab**: accessories.
- **Presets tab**: one-tap foods. **Config tab**: names, partner email, targets, daily XP goal, quests per day, water goal, plate step, and the weekly gym plan.
- **Your app link** / **Partner app link** (Config): see Install it, above. Keep them private: the key in the link is the only password.

## If something stops working

1. **Check your email.** If the morning run fails, you get an email saying what went wrong.
2. **On your PC, open the Sheet → Automation → Repair (re-run setup).** This rebuilds anything missing. It never wipes your data or settings.
3. **Look at the Log tab.** Every run writes a line there, and errors are marked ERROR.
4. **Quick-add says the key was rejected, or you're out of credit?** Top up or make a new key at console.anthropic.com, then paste it in the app under **You → Claude API key**.
5. **No notifications?** Open the app, then **You → Turn on notifications** again. Check your phone's settings allow notifications for Nudge (and for Calendar). On iPhone it only works from the Home Screen icon. If push isn't working, nudges fall back to email for your partner and a calendar alert for you.
6. **Still stuck?** Start a new Claude Code session on this GitHub repo and say what's happening. Everything Claude needs is in this folder.

---

<details><summary>For developers</summary>

- Backend: Google Apps Script managed with clasp (`src/`). `Main.gs` has entry points and triggers; `Planner.gs` pure logic (scheduling, games, strength maths).
- Frontend: `web/` (index.html, app.css, app.js, sw.js, manifest, icons). `npm run build` (scripts/build.js) makes `src/App.html` (the Google page, talks via `google.script.run`) and `dist/` (the installable app, talks to `doPost` with `{fn, key, args}`; allowed calls are in `rpcTable_()` in WebApp.gs). Edit `web/`, never `src/App.html`.
- `npm test` builds, then runs simulated days against fake Google services (`test/fakes.js`).
- `npm run deploy` pushes Apps Script and updates the web app. `npm run publish` puts `dist/` on Firebase Hosting (project `life-quest-5c52d`, settings in `app.config.json`, which is public by design).
- Push: Firebase Cloud Messaging (`Push.gs`). The service account key is in `src/Secrets.gs`, which is pushed to Apps Script but gitignored. It can also be the `FCM_SA` Script Property. Phones register with `registerDevice`; the list is the `DEVICES` Script Property.
- Claude: `Claude.gs` (API call, structured output) and `AI.gs` (brief, Ask, meal ideas, weekly review). The key is the `ANTHROPIC_API_KEY` Script Property. Every prompt shares one voice (`AI_VOICE`): direct, British, short, no emojis.
- Claude calls a day: the Today brief is at most 5 per person (4 slots plus one when the day is won); it used to be rewritten for every part of the day, every 3 hours and after most jobs, typically 8 to 12 per person. Ask, meal ideas, food quick-add and the sleep explanation only run when you tap them; the weekly review is one a week.
- Chores: `Quests.gs` (board, completion), `Schedule.gs` (rhythms, spreading dates, the Schedule page), `Chores.gs` (timers). Games: `Games.gs` (`Words.gs` is the word list). Game layer: `Game.gs`. Training: `Workout.gs`. Food: `Food.gs`.
- The partner key (`PARTNER_KEY`) only reaches chores, games and shared calls, never food, training or doPost data.
- Speed: within one run every tab is read once (`vals_()`) and Script Properties once (`PROPS`). Call `forget_(tab)` after writing to a tab directly.
- `prepareSheet_()` runs every morning, so new tabs, settings and triggers arrive without re-running setup.
- Script: https://script.google.com/d/1kGCjIZ6uRZteKZ0n_SFiOh5xnZxdoZY1Y1lWlMDno1Fi7D83lMjvuaCX/edit
</details>

## Art and asset licences

Every character, outfit, icon and illustration in Nudge is original, drawn or modelled in code for this app. Nothing is copied from any game, show, app or brand.

| What | Where | Licence |
|---|---|---|
| 2D figures (Home, You, dressing room) | `web/figure.js` | Original, part of this app |
| 3D characters (creator prototype, waiting for approval) | `web/ps2char.js`: procedural skinned bodies, canvas-painted textures | Original, part of this app |
| Faces and portraits | `web/face.js` | Original, part of this app |
| 3D engine | `web/three.min.js` (three.js r149) | MIT |
| Fonts | Unbounded, Bodoni Moda, Manrope (Google Fonts) | SIL Open Font Licence 1.1 |

No third-party 3D models or animations are used yet. If CC0 packs (Quaternius, Kenney) or Mixamo animations are added later, each one is listed here with its licence and source.
