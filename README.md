# Life Automation

Your training and weigh-ins, pushed to your phone and watch. You never need to open an app to report in. Ticking a task off is the log.

**Your Sheet:** https://docs.google.com/spreadsheets/d/1tX4vXf8AHlhegFQkdY3ndjgD6HFdvZ4eSLL3vmcE2yI/edit

## What it is

A Duolingo for your whole life: quests that keep the house running, a workout logger that gets you stronger week by week, food tracking, and a game layer (XP, streaks, levels, badges, rewards) you share with your partner. Everything is pushed to you: calendar alerts on your phone and watch, Google Tasks you can tick, and the app on your home screen.

## The app (one icon, five tabs)

- **🏠 Home**: your XP ring for today, 🔥 streak (with 🧊 freezes that save it on a bad day), team streak, level, **✨ What now?** (tell it your energy and time, it picks *one* job), your morning or evening routine, today's gym, today's quests, weight, water and a feed of what you've both done (send 🙌 high-fives).
- **✨ Quests**: today's board (6 at most, so never a wall), ✋ claim a job, ▶ start any job on a timer with steps, 🅿️ park distractions, **🧠 brain dump** (type everything in your head, it gets sorted into to-dos, repeating jobs, shopping and parked ideas), coming up this week, and adding new repeating quests.
- **🏋️ Train**: nSuns-style upper/lower. Each session has a T1 main lift (9 sets from your training max), a T2 lift (8 sets), then accessories. Tick sets as you go (rest timer starts itself). The heavy **1+** set sets next week's training max automatically. Progress shows training-max history, best estimated 1RM, PRs and weekly volume.
- **🍓 Food**: calories and protein versus targets, one-tap foods, Claude quick-add, undo.
- **🎀 More**: level and XP, this week's scoreboard and fair share, 🎁 reward shop (spend XP on treats you choose), 🛒 shared shopping list (with protein ideas when you're short), 🏅 badges, parked list.

Your partner's link opens the same app with Home, Quests and More (no Train or Food).

**Light or dark:** More tab → 🎨 Look → ☀️ Light, 🌙 Dark or 📱 Match phone. Each of you picks your own.

## What arrives by itself

| When | What you get |
|---|---|
| About 6am | Today's quests in Google Tasks (tick there or in the app, it counts once). A prep task for anything in your calendar tomorrow. Your streak is settled for yesterday. |
| Routine times (08:30 and 22:30 to start) | A 🌅/🌙 calendar alert with the checklist. Tick steps in the app. |
| Training days (Tue, Wed, Fri, Sat) | A 🏋️ calendar event with your main lifts **with weights**, accessories, bike or bus, and leave-by time. Alerts at 14:45 and when it's time to go. |
| Mon and Wed, 08:30 | ⚖️ Weigh-in alert (log it on Home or in the task). |
| While a chores timer runs | Time's up: your phone and watch buzz. Your partner gets an email (if their email is in Config) and a chime on their page. |
| 11pm | 🍽️ What's left on calories and protein. |
| Sunday 7pm | 📊 Your week: food averages, gym, weight, chores, XP and streaks, strength changes and **3 suggested priorities** for next week. |

XP comes from quests, the gym (+50), PRs (+25), weigh-ins, routines, hitting protein, water and brain dumps. Hit the **Daily XP goal** (Config) to keep your streak. Every 7 days of streak earns a 🧊 freeze (max 2).

## Changing your settings

Everything is in the Sheet. Edit on your phone (Google Sheets app) or PC. Only change values, never the names in column A of Config.

- **Chores tab (your quests)**: Job, Minutes, Steps (separate with `;`), **Every** (`daily`, `3 days`, `weekly`, `2 weeks`, `monthly`, `monthly 15` = the 15th, `3 months`, `yearly`, a weekday like `Wed`, or `as needed`), **Who** (Anyone / Me / Partner), **Energy** (Low / Medium / High, used by What now?), **XP** (blank = worked out from minutes). *Set your bin day*: "Take the bins out" is `Wed` for now.
- **Routines tab**: name, who, time and steps.
- **Rewards tab**: your treats and their XP cost.
- **Lifts tab**: training maxes (the app fills these in; edit if you want). **Programme tab**: which lifts each session uses and their sets (`75x5, 85x3, 95x1+` means % of training max × reps; `+` = as many as you can). **Sessions tab**: accessories.
- **Presets tab**: one-tap foods. **Config tab**: names, partner email, targets, daily XP goal, quests per day, water goal, meds reminder time, plate step, and the weekly gym plan.
- **Your app link** / **Partner app link** (Config): open in Chrome → ⋮ → Add to home screen (iPhone: Safari → Share → Add to Home Screen). Keep them private.

## If something stops working

1. **Check your email.** If the morning run fails, you get an email saying what went wrong.
2. **On your PC, open the Sheet → Automation → Repair (re-run setup).** This rebuilds anything missing. It never wipes your data or settings.
3. **Look at the Log tab.** Every run writes a line there, and errors are marked ERROR.
4. **Quick-add says the key was rejected, or you're out of credit?** Top up or make a new key at console.anthropic.com, then paste it into **Replace Claude API key** at the bottom of the app's Food tab.
5. **No buzz on your phone or watch?** On your phone, go to **Settings → Apps → Calendar → Notifications** and make sure they're on.
6. **Still stuck?** Start a new Claude Code session on this GitHub repo and say what's happening. Everything Claude needs is in this folder.

## Coming later

Health Connect data (sleep and steps will join the Sunday summary), automatic gym check-in by location, and food photos. The web address these will use already works. It's in the **Config** tab as **Web app URL** and **Web app key**. Keep the key private.

---

<details><summary>For developers</summary>

- Google Apps Script, managed with clasp. `src/` is the code: `Main.gs` holds the entry points and triggers, `Planner.gs` holds the pure logic.
- `npm test` runs whole simulated days against fake Google services (`test/fakes.js`).
- `npm run push` uploads code. Triggers use it straight away. `npm run deploy` also updates the web app.
- Script: https://script.google.com/d/1kGCjIZ6uRZteKZ0n_SFiOh5xnZxdoZY1Y1lWlMDno1Fi7D83lMjvuaCX/edit
- Web app: https://script.google.com/macros/s/AKfycbyGglsy-_DOdaCn7DFhNyD8JH89jGapkUXUHdWp-JmdpuupiMPPEp6gm8e23x-yOVbsYQ/exec (`?key=…&source=…`)
- The app is one page, `App.html` (tabs: Home / Quests / Train / Food / More), served by `doGet` with the state from `appState_()`. Quick taps update the screen first and save in the background.
- Speed: within one run every tab is read once (`vals_()` in Sheets.gs) and Script Properties once (`PROPS`); writes keep that memory current. Call `forget_(tab)` after writing to a tab directly.
- Quests (`Quests.gs`), game (`Game.gs`: XP log, streaks, badges, rewards, feed), routines (`Routines.gs`), workouts (`Workout.gs`: nSuns T1/T2 from the Lifts and Programme tabs, progression in `tmIncrease`). Chores timers: `Chores.gs`. The partner has their own key (`PARTNER_KEY` Script Property) that `who_()` maps to "partner". It only reaches the chores calls. Live timers are the `CHORE_me` / `CHORE_partner` Script Properties.
- Food: `Food.gs` holds the server calls (all key-checked), and `Claude.gs` the Claude API call. The API key is the `ANTHROPIC_API_KEY` Script Property.
- `prepareSheet_()` runs every morning, so new tabs, columns, settings and triggers arrive without re-running setup.
- To extend it: new morning jobs go in `dailyJobs_()` (Main.gs), new phone data in `POST_ROUTES` (WebApp.gs), and new one-tap tasks in `taskHandlers_()` (Tasks.gs).
</details>
