# Nudge: notes for Claude

Nudge is a life app for two (Dean and Yaz): chores, the gym, food, health, work blocks, daily games, a private chat and an "empire" to spend XP cash on.
Google Apps Script backend (`src/*.gs`, data in a Google Sheet plus Script Properties) and an installable web app (`web/`, hosted on Firebase).
The DJ game is **not here**: it's **Afters**, its own project (`afters`, next to this repo; https://afters-dj.web.app). Don't read or edit it from here.

## Layout
- `src/`: Apps Script. `WebApp.gs` is the entry point (doGet, doPost, the `rpc` table of callable functions, `appState_`, `batch`). One file per area: `Game.gs` (XP, streaks, lazy days, missed-day cost, comeback, pet, feed), `Quests.gs`/`Chores.gs`/`ChorePlan.gs`/`Schedule.gs`/`Setup.gs` (chores and the daily plan), `Training.gs` (splits, templates, rotation, swaps, progression; see below), `GymDay.gs`/`Planner.gs`/`Rotation.gs`/`Workout.gs`/`Today.gs` (gym day, bus, logging, the Train and Today data), `Food.gs`, `Health.gs`, `Work.gs`, `Deadlines.gs`, `Games.gs`/`Words.gs` (Word, Numbers, Recall, Tempo), `Fun.gs` (names, reminders, Us, prefs), `Empire.gs`, `Wardrobe.gs`, `Chat.gs` (Firestore room), `Push.gs`, `AI.gs`/`Claude.gs` (brief, Ask, meal ideas, weekly review; one voice `AI_VOICE`), `Backup.gs` (backups, the Archive tab), `Afters.gs` (the one link with Afters), `Main.gs` (setup, triggers, `dailyRun`), `Sheets.gs`/`Config.gs` (tabs, caching, settings).
- `src/Secrets.gs`, `src/ImportData.gs`, `src/Instance.gs` are gitignored. Never commit secrets.
- `web/`: the app. `app.js` (all screens), `fmt.js` (pure helpers shared with tests), `outbox.js` (offline queue), `chat.js` (private chat), `setup.js` (wizard), `face.js`/`figure.js`/`look.js`/`avatar3d.js` (characters), `music.js` (chore music), `words.js`, `sw.js`, `index.html`, `app.css`.
- `web/booth.html`: no longer the game. It's the **move page** at the old address: it backs up and moves this browser's old game data to Afters (it loads `bundle.js` from Afters). Remove it once the move is confirmed done.
- `scripts/build.js` builds `src/App.html` (the Apps Script page) and `dist/` (hosting). `npm test` builds, then runs `test/*.test.js` (`test/fakes.js` fakes the Google services).

## Training (src/Training.gs)
- Three main splits in `SPLITS` (`ppsa` Push/Pull/Shoulders & Arms, the default; `ul` Upper A, Lower A, Upper B, Lower B; `ppl` Push/Pull/Legs) plus the optional `pump` (Arms & Shoulders Pump). Default templates are in `TEMPLATES`: rows `[exercise, sets, reps, RPE, rest, superset group]`; two rows sharing a group letter are a superset with one rest.
- Rules for every template, swap and edit: no hip hinges, no calf raises (`NOT_ALLOWED`), more back than chest, 4 to 8 exercises (`test/training.test.js` checks them).
- Rotation, not fixed days: `nextTemplate_` = the session after the last main one done in the current split (`TRAIN_SPLIT` = `{split, since, skip}`; switching starts at the first session and keeps all history). Only logged sessions or Gym done ticks move it. The Pump never moves it, never counts towards the weekly target (health `trainDays`, default 4) and pays `PUMP_XP` bonus once a day; main sessions pay 50 XP via `markGymDone_`.
- Workout log rows carry `RPE` and `Template`. History is never rewritten: `ALIASES`/`canonicalExercise` map old and imported names (Strong, Liftoff, the old rotation) onto template names when read (last time, hints, records, the main-lifts chart).
- Your edits and swaps per template live in `TRAIN_TPL` (`editTemplate`, `swapExercise`, `resetTemplate`); swap options come from `MUSCLES`. `progressionHint`: top of the range at or below target RPE on every set → +2.5 kg (+1–2 kg on small isolation lifts).
- `ensureSplits_` ran once (`TRAIN_V3`): backed up the gym tabs to the "Gym before splits" sheet in the Nudge backups spreadsheet, renamed the replaced Sessions-tab rows to "Old: …", and recorded how history maps.
- App: Settings > Training card (`trainingCard`), Train tab template mode (`tplBody`, `tplModel`, `swapSheet`, `editSheet`), main-lifts chart (`liftChart`, data from `liftHistory_`), Home gym card footer (`gymExtras`).

## The Afters link (keep it this small)
- In: `aftersReport(key, {id, day, minutes, lessons})` (`src/Afters.gs`): practice XP (1 per 2 min, max 30/day), +10 per lesson once, `grantAch_(who, 'booth1')` (gold headphones). Reports are idempotent by id.
- Out: the Mix practice card (`mixPracticeCard`/`aftersUrl` in `app.js`) opens Afters with `#menu&link=<base64 {api,key}>`.
- `S.fun.afters` = `{ today, week, lessons, api }` for the card and the DJ headphones on the character.

## Deploy
- Apps Script: `npm run deploy` (or `clasp push --force` + `clasp update-deployment <id>`).
- Hosting: `firebase deploy --only hosting` (site `life-quest-5c52d`).
- Dylz's separate copy: don't update it unless asked.

## Rules
- Never delete, reset or overwrite stored data; archive removed features' data (`archive_` in Backup.gs).
- Tone: direct, British, dry; no emojis outside the chat (see `test/tone.test.js`).
- Commit trailers and branch rules come from the session instructions.
