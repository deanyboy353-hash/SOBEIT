# Life Automation

Your training and weigh-ins, pushed to your phone and watch. You never need to open an app to report in. Ticking a task off is the log.

**Your Sheet:** https://docs.google.com/spreadsheets/d/1tX4vXf8AHlhegFQkdY3ndjgD6HFdvZ4eSLL3vmcE2yI/edit

## What happens by itself

| When | What you get |
|---|---|
| About 6am on training days (Tue, Wed, Fri, Sat) | A calendar event called something like **🏋️ Upper A · 🚲 Bike · leave 15:15**. Open it to see the session, the weather, and the latest you can leave and still make the last bus. |
| 14:45 on training days | Your phone and watch buzz. They buzz again when it's time to leave. |
| Training days | A **🏋️ Gym done** task in Google Tasks. Tick it when you finish and it's logged in the **Gym log** tab within 10 minutes. |
| 08:30 Mon and Wed | A **⚖️ Weigh in** alert, plus a task. Tap the task title, type your weight (`82.4`, `13st 2` or `185 lb` all work), then tick it. |

You don't have to tidy up after yourself:
- Tasks you didn't tick are cleared away the next morning, with no pile-up.
- If you typed a weight but forgot to tick, it's still logged.
- If you ticked the weigh-in without typing a number, it comes back and asks again.

## Changing your settings

Everything is in the Sheet. You can change it on your phone (Google Sheets app) or on your PC. Changes take effect at the next 6am run.

- **Config tab, WEEKLY PLAN:** tick or untick **Train?** for any day. Change which **Session** that day does, what time you're **Free from**, and when the **Alert** goes off.
- **Config tab, SETTINGS:** wake time, weigh-in days, last bus time, travel times, and how wet, cold or windy it can be before you get "bus" instead of "bike". Only change the **Value** column, never the names in column A.
- **Sessions tab:** your exercises, one row each. Change sets, reps, RPE or rest, or add rows. To make a new session, type a new name in the **Session** column and use that name in the weekly plan.

**Want today's plan updated straight away?** On your PC, open the Sheet, then **Automation menu → Plan today again**. This menu only shows on a PC, not in the phone app.

## If something stops working

1. **Check your email.** If the morning run fails, you get an email saying what went wrong.
2. **On your PC, open the Sheet → Automation → Repair (re-run setup).** This rebuilds anything missing. It never wipes your data or settings.
3. **Look at the Log tab.** Every run writes a line there, and errors are marked ERROR.
4. **No buzz on your phone or watch?** On your phone, go to **Settings → Apps → Calendar → Notifications** and make sure they're on.
5. **Still stuck?** Start a new Claude Code session on this GitHub repo and say what's happening. Everything Claude needs is in this folder.

## Coming later

Health Connect data (sleep, steps, heart rate), automatic gym check-in by location, food photos, and a Sunday-evening weekly summary. The web address these will use already works. It's in the **Config** tab as **Web app URL** and **Web app key**. Keep the key private.

---

<details><summary>For developers</summary>

- Google Apps Script, managed with clasp. `src/` is the code: `Main.gs` holds the entry points and triggers, `Planner.gs` holds the pure logic.
- `npm test` runs whole simulated days against fake Google services (`test/fakes.js`).
- `npm run push` uploads code. Triggers use it straight away. `npm run deploy` also updates the web app.
- Script: https://script.google.com/d/1kGCjIZ6uRZteKZ0n_SFiOh5xnZxdoZY1Y1lWlMDno1Fi7D83lMjvuaCX/edit
- Web app: https://script.google.com/macros/s/AKfycbyGglsy-_DOdaCn7DFhNyD8JH89jGapkUXUHdWp-JmdpuupiMPPEp6gm8e23x-yOVbsYQ/exec (`?key=…&source=…`)
- To extend it: new morning jobs go in `dailyJobs_()` (Main.gs), new phone data in `POST_ROUTES` (WebApp.gs), and new one-tap tasks in `taskHandlers_()` (Tasks.gs).
</details>
