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
| Whenever you eat | Open the **Food** page from your home screen. Tap a button to log a regular food, or type something like `2 protein weetabix 200ml milk` and Claude estimates it. **Undo last** fixes a wrong tap. |
| Whenever there's a job to do | Open **Chores**. Pick one job (e.g. **Do the dishes, 15 min**) and you get a timer and the steps, one at a time. You and your partner see what each other is doing. Remembered something else that needs doing? **Park it**, don't do it. When time's up, your phone and watch buzz. Your partner's page chimes while it's open. Then tap **Done**, **+5 min** or **Stop and park the rest**. |
| 11pm every day | A **🍽️** alert with calories and protein left. If you're over on calories but short on protein, it suggests a shake or yogurt instead. |
| Sunday 7pm | A **📊 Your week** event: daily food averages, gym sessions done, weight change, chores each of you did, and the week ahead. |

You don't have to tidy up after yourself:
- Tasks you didn't tick are cleared away the next morning, with no pile-up.
- If you typed a weight but forgot to tick, it's still logged.
- If you ticked the weigh-in without typing a number, it comes back and asks again.

## Changing your settings

Everything is in the Sheet. You can change it on your phone (Google Sheets app) or on your PC. Changes take effect at the next 6am run.

- **Config tab, WEEKLY PLAN:** tick or untick **Train?** for any day. Change which **Session** that day does, what time you're **Free from**, and when the **Alert** goes off.
- **Config tab, SETTINGS:** wake time, weigh-in days, last bus time, travel times, and how wet, cold or windy it can be before you get "bus" instead of "bike". Only change the **Value** column, never the names in column A.
- **Presets tab:** your regular foods, one row per button: name, kcal, protein. Change, add or delete rows. The page shows them next time it opens.
- **Chores tab:** your jobs, their usual minutes and the steps (separate steps with `;`). Each button also shows how long you *actually* take, once you've done a job a few times.
- **Config tab, chores:** `Your name` and `Partner name`. **Chores page (you)** is your link, which also has a button to switch to Food. **Chores page (partner)** is the link to send your partner: it only opens chores, never your food or anything else. On an iPhone: open it in Safari, tap Share, then **Add to Home Screen**.
- **Config tab, food:** `Daily kcal target`, `Protein min (g)`, `Protein max (g)` and `Evening food check` time. The **Food page** row holds your personal link to the page.
- **Sessions tab:** your exercises, one row each. Change sets, reps, RPE or rest, or add rows. To make a new session, type a new name in the **Session** column and use that name in the weekly plan.

**Want today's plan updated straight away?** On your PC, open the Sheet, then **Automation menu → Plan today again**. This menu only shows on a PC, not in the phone app.

## If something stops working

1. **Check your email.** If the morning run fails, you get an email saying what went wrong.
2. **On your PC, open the Sheet → Automation → Repair (re-run setup).** This rebuilds anything missing. It never wipes your data or settings.
3. **Look at the Log tab.** Every run writes a line there, and errors are marked ERROR.
4. **Quick-add says the key was rejected, or you're out of credit?** Top up or make a new key at console.anthropic.com, then paste it into **Replace Claude API key** at the bottom of the food page.
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
- Chores: `Chores.gs` + `ChoresPage.html`. The partner has their own key (`PARTNER_KEY` Script Property) that `who_()` maps to "partner". It only reaches the chores calls. Live timers are the `CHORE_me` / `CHORE_partner` Script Properties.
- Food: `Food.gs` holds the page's server calls (all key-checked), `FoodPage.html` the page, and `Claude.gs` the Claude API call. The API key is the `ANTHROPIC_API_KEY` Script Property.
- `prepareSheet_()` runs every morning, so new tabs, columns, settings and triggers arrive without re-running setup.
- To extend it: new morning jobs go in `dailyJobs_()` (Main.gs), new phone data in `POST_ROUTES` (WebApp.gs), and new one-tap tasks in `taskHandlers_()` (Tasks.gs).
</details>
