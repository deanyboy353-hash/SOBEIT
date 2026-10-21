# Report: speed, the private chat, days off, Booth phase 6

Everything is on `claude/adhd-automation-system-htcfxg` and deployed: the website, Apps Script @49, and Dylz's copy @7. **260 tests pass**, including the chat's privacy rules checked against Google's own Firestore emulator. No stored data was deleted or moved.

## 1. Speed

### What was slow, and why
I measured every common action by counting the Google service calls each one makes (each is a network hop inside Apps Script) and timing taps in a real browser.

- **Every tap returned the whole app.** That's a 70 KB state built from ~75 cache lookups, plus up to 24 sheet reads when the cache is cold. That is roughly 1–4.7 s of server time per tap, on top of about 1 s of Apps Script start-up and the phone's network.
- **Taps waited in a queue.** Saves ran strictly one after another, so three quick taps could take 10 s or more to settle.
- **Some actions froze the screen until the server answered.** These were saving a look, buying, logging weight, deadline buttons, Empire purchases and chore timers.

### Before → after
Measured in a browser, with the server deliberately slowed to 3 s per request:

| Tap | Before | After |
|---|---|---|
| Save look (dressing room) | 4,733 ms | 26 ms |
| Water +1 / routine step / job done | 26–31 ms | 23–29 ms |
| Accent colour | 24 ms | 33 ms |
| Buy an item | waited for the server | 8 ms |
| Six taps reaching the server | 12 requests, one after another | 9 requests: the three Home taps went as one batch |

The before figures for water, routine, job done and accent were already fast, because those taps updated the screen locally. Server cost for five taps: ~2.2 s batched vs ~8 s one at a time. There is a test for this budget.

### What changed
- **An outbox on the phone (IndexedDB).** Every change is saved on the phone first and the screen updates at once. Changes go to the server in the background, in batches, and the server builds the screen once per batch.
- **Retries.** If the server can't be reached, the app retries quietly (1 s, 3 s, 8 s, 20 s, then every minute) and shows "Offline: saved on this phone" after three failures. A change is only dropped if the server says no (for example "You need £550 more"), and then you see why.
- **Instant feedback on every button:** a pressed state and a tiny buzz on touch-down, a tick animation, and a small "Saving…" pill if a save takes longer than 1.5 s.
- **Lazy-loading.** The old 3D character code no longer loads at start, and the chat's database code loads only when needed.
- **Live updates through Firebase (Firestore, London, free tier).** It carries the chat and live partner scores, so Yaz sees your XP and Win the day change within about a second. Apps Script stays the source of truth for everything else, so **no data was migrated** and nothing moved.

## 2. Us: the private chat
Tap the Us card on Home.

**What's in it:**
- Real-time messages, with receipts: Sent ✓ → Delivered ✓✓ → Read (with the time).
- A typing indicator and online / last seen.
- Wink, Tonight? and Dice as animated messages. Tonight? has quick replies: "Yes 😏", "Maybe later", "Not tonight".
- Emoji reactions, reply-to, photos (compressed on the phone), voice notes (up to 60 s), and delete for both.
- Disappearing messages: off, 24 hours or 7 days, for both of you.
- Your Us stats and badges at the top, with "+20 XP" to log.

**Tested on two phones:** Yaz's Home showed the new message 247 ms after you sent it, and you saw "Read 10:14" as soon as she opened the chat.

**Privacy:**
- **The database locks it, not just the app.** The chat lives in a "room" named by a 64-character random secret, created by your server and given only to your two phones. The secret is stored where no phone can read it. The database refuses any request that doesn't name the exact room, and rooms can't be listed. Tested against Google's emulator.
- **Notifications** say only "New message from Yazzy". The server is never sent the words.
- **The chat never reaches the server**, so it can't appear in the feed, the brief, emails, backups or any AI feature. There's a test that fails if server code ever reads messages. The room secret is also kept out of backups (a test caught that, and it's fixed).
- **Chat lock:** fingerprint, face or phone PIN, on each phone (chat settings: ⋯).

## 3. Small fixes
- **The brief matches the day.** It knows when the day is won (the AI is told not to suggest more chores) and rewrites itself a minute after any job is done. Until then it says "Day won. Updating your brief…" rather than showing old advice.
- **Days off:**
  - Work cards are hidden on Fri–Sun, on Yaz's non-work days, and on any day marked off with "Mark today off" in Work.
  - The gym plan on a day off never falls back to the after-work 15:01. There's a "leave around" picker on the gym card, and Change still works.
- **A compact "Day won" card** when all of today's jobs are done.

**About the midday bus:** your Transport timetable only has the after-work buses, so there's no midday pair to pick from. On days off it now says so and offers the e-bike when it's dry. **To get the midday bus pair, add the 3's daytime times** under Transport in the Config tab. I couldn't fetch the real timetable from here (the network blocks bustimes.org) and didn't want to guess.

## 4. Booth, phase 6: real-world skills
- **Quantise (Q):** hot cue jumps land at the same point in the beat, so you stay in time.
- **Slip:** let go of a hot cue or toneplay pad and the track is where it would have been. Tested: 20.1 s → 21.46 s after a 1.3 s toneplay.
- **Toneplay pads** (the mode that wasn't in Booth yet): play from hot cue 1 at ±1–4 semitones.
- **Next track**, a selection trainer: three candidates and a floor to read (hold it, build it, bring it down). Each choice is scored on tempo, Camelot key and energy, with a DJ's reasons ("two steps up: an energy lift, mix it quickly"). It uses a practice crate or your own analysed tracks, keeps a running score, and has the Camelot wheel explained in one minute.

## Tests added
- Optimistic outbox: saved before sending, batching, back-off retry, survives a restart, only a server "no" undoes a change.
- Performance budget on the server.
- Chat: read receipts, presence and typing, disappearing messages, discreet notifications, and privacy rules (emulator).
- Server never reads chat content.
- Brief and state consistency.
- Days off and the day-off gym plan.
- Quantise, toneplay and next-track scoring.

## What you and Yaz need to do on your phones
1. **Open Nudge once and tap "Reload"** when it says a new version is ready (or close and reopen it).
2. **Allow notifications** if Home shows the "Notifications are off" card. Chat notifications need it.
3. **Optional chat lock:** Us → ⋯ → Lock the chat → Turn on (fingerprint or PIN). Do it on each phone.
4. **Voice notes:** allow the microphone the first time you tap the mic.
5. **You:** add the 3's daytime bus times under Transport in the Config tab, so days off get a midday bus pair.

## Still waiting on you
- **The five 3D characters** from last round (`docs/screens/characters-v2-five.png`): yes or no before I roll them out.
- **Firebase features that need billing.** Auto-deleting expired messages on the server needs billing. Without it, disappearing messages are hidden and deleted by your phones instead.
