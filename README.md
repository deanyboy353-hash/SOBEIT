# Life Automation

Your training and weigh-ins, pushed to your phone and watch. You never need to open an app to report in. Ticking a task off is the log.

**Your Sheet:** https://docs.google.com/spreadsheets/d/1tX4vXf8AHlhegFQkdY3ndjgD6HFdvZ4eSLL3vmcE2yI/edit

## What it is

A Duolingo for your whole life, shared with your partner. Chores that keep the house running, a workout logger that makes you stronger week by week, food tracking, daily brain games you play against each other, and Claude helping out throughout. Things come to you: push notifications, calendar alerts on your phone and watch, and Google Tasks you can tick.

## The app

**Install it:** open your app link (Config tab, **Your app link**). It starts with https://life-quest-5c52d.web.app.
- **Android (Chrome):** menu (three dots), then **Install app**.
- **iPhone (Safari):** **Share**, then **Add to Home Screen**. Open it from the Home Screen icon from then on.
- Then in the app: **You** (top right) → **Turn on notifications**. Do this once on each phone.

**Tabs**
- **Home**: a short morning brief from Claude, **Ask anything** (type how you feel or what you need; it can add shopping, chores and to-dos, park a worry or pick one job for you), your XP ring, streaks, **What should I do now?**, your routine, today's gym, today's chores, weight, water, and what your partner has done (high-five them or send a nudge).
- **Chores**: **Today** shows today's jobs. Start one on a timer with steps; your partner can join. **Schedule** shows every chore under Every day, Weekly, Every 2 weeks and Monthly, each with a next date. Tap one to change its days or date, **Add a chore**, or **Spread the dates** to share everything out again (heavy jobs stay off gym days).
- **Play**: three daily puzzles, the same for both of you, with live scores. **Word** (five letters, six guesses; you see your partner's colours but not their letters until you've both finished), **Numbers** (reach the target), **Recall** (remember the sequence). **Stats** shows your head-to-head record and word streak. You get a notification when your partner plays.
- **Train**: nSuns-style upper/lower. The main lift (9 sets) and second lift (8 sets) come from your training max, then accessories. Tick sets as you go and the rest timer starts itself. The heavy **1+** set sets next week's training max. Progress shows your history and PRs.
- **Food**: calories and protein versus targets, one-tap foods, Claude quick-add, **Meal ideas** that fit what's left, undo.
- **You** (the person icon, top right): level, this week's scores, shopping list, rewards, badges, and settings: Light, Dark or Match phone, notifications, installing, and the Claude key.

Your partner's link opens the same app without Train and Food.

## What arrives by itself

| When | What you get |
|---|---|
| About 6am | Today's quests in Google Tasks (tick there or in the app, it counts once). A prep task for anything in your calendar tomorrow. Your streak is settled for yesterday. |
| About 6am | Your morning brief from Claude (if the Claude key is saved). |
| Routine times (08:30 and 22:30 to start) | A calendar alert with the checklist. Tick steps in the app. |
| Training days (Tue, Wed, Fri, Sat) | A calendar event with your main lifts **with weights**, accessories, bike or bus, and leave-by time. Alerts at 14:45 and when it's time to go. |
| Mon and Wed, 08:30 | Weigh-in alert (log it on Home or in the task). |
| While a chores timer runs | Time's up: a notification on the phone of whoever is doing it. |
| 11pm | What's left on calories and protein. |
| When your partner plays, nudges you or asks you to join | A notification. |
| Sunday 6pm | Your week, opening with a short review from Claude: food averages, gym, weight, chores, XP and streaks, strength changes and **3 suggested priorities** for next week. |

XP comes from quests, the gym (+50), PRs (+25), weigh-ins, routines, hitting protein, water and brain dumps. Hit the **Daily XP goal** (Config) to keep your streak. Every 7 days of streak earns a freeze that saves it on a bad day (max 2).

## Changing your settings

Everything is in the Sheet. Edit on your phone (Google Sheets app) or PC. Only change values, never the names in column A of Config.

- **Chores tab (your quests)**: Job, Minutes, Steps (separate with `;`), **Every** (`daily`, `3 days`, `weekly`, `2 weeks`, `monthly`, `monthly 15` = the 15th, `3 months`, `yearly`, a weekday like `Wed`, or `as needed`; the Schedule page in the app sets these for you), **Next due** (the app fills it in), **Who** (Anyone / Me / Partner), **Energy** (Low / Medium / High, used by What now?), **XP** (blank = worked out from minutes). *Set your bin day*: open Chores, then Schedule, then tap "Take the bins out".
- **Routines tab**: name, who, time and steps.
- **Rewards tab**: your treats and their XP cost.
- **Lifts tab**: training maxes (the app fills these in; edit if you want). **Programme tab**: which lifts each session uses and their sets (`75x5, 85x3, 95x1+` means % of training max × reps; `+` = as many as you can). **Sessions tab**: accessories.
- **Presets tab**: one-tap foods. **Config tab**: names, partner email, targets, daily XP goal, quests per day, water goal, meds reminder time, plate step, and the weekly gym plan.
- **Your app link** / **Partner app link** (Config): see Install it, above. Keep them private: the key in the link is the only password.

## If something stops working

1. **Check your email.** If the morning run fails, you get an email saying what went wrong.
2. **On your PC, open the Sheet → Automation → Repair (re-run setup).** This rebuilds anything missing. It never wipes your data or settings.
3. **Look at the Log tab.** Every run writes a line there, and errors are marked ERROR.
4. **Quick-add says the key was rejected, or you're out of credit?** Top up or make a new key at console.anthropic.com, then paste it in the app under **You → Claude API key**.
5. **No notifications?** Open the app, then **You → Turn on notifications** again. Check your phone's settings allow notifications for Life Quest (and for Calendar). On iPhone it only works from the Home Screen icon. If push isn't working, nudges fall back to email for your partner and a calendar alert for you.
6. **Still stuck?** Start a new Claude Code session on this GitHub repo and say what's happening. Everything Claude needs is in this folder.

---

<details><summary>For developers</summary>

- Backend: Google Apps Script managed with clasp (`src/`). `Main.gs` has entry points and triggers; `Planner.gs` pure logic (scheduling, games, strength maths).
- Frontend: `web/` (index.html, app.css, app.js, sw.js, manifest, icons). `npm run build` (scripts/build.js) makes `src/App.html` (the Google page, talks via `google.script.run`) and `dist/` (the installable app, talks to `doPost` with `{fn, key, args}`; allowed calls are in `rpcTable_()` in WebApp.gs). Edit `web/`, never `src/App.html`.
- `npm test` builds, then runs simulated days against fake Google services (`test/fakes.js`).
- `npm run deploy` pushes Apps Script and updates the web app. `npm run publish` puts `dist/` on Firebase Hosting (project `life-quest-5c52d`, settings in `app.config.json`, which is public by design).
- Push: Firebase Cloud Messaging (`Push.gs`). The service account key is in `src/Secrets.gs`, which is pushed to Apps Script but gitignored. It can also be the `FCM_SA` Script Property. Phones register with `registerDevice`; the list is the `DEVICES` Script Property.
- Claude: `Claude.gs` (API call, structured output) and `AI.gs` (brief, Ask, meal ideas, weekly review). The key is the `ANTHROPIC_API_KEY` Script Property.
- Chores: `Quests.gs` (board, completion), `Schedule.gs` (rhythms, spreading dates, the Schedule page), `Chores.gs` (timers). Games: `Games.gs` (`Words.gs` is the word list). Game layer: `Game.gs`. Training: `Workout.gs`. Food: `Food.gs`.
- The partner key (`PARTNER_KEY`) only reaches chores, games and shared calls, never food, training or doPost data.
- Speed: within one run every tab is read once (`vals_()`) and Script Properties once (`PROPS`). Call `forget_(tab)` after writing to a tab directly.
- `prepareSheet_()` runs every morning, so new tabs, settings and triggers arrive without re-running setup.
- Script: https://script.google.com/d/1kGCjIZ6uRZteKZ0n_SFiOh5xnZxdoZY1Y1lWlMDno1Fi7D83lMjvuaCX/edit
</details>
