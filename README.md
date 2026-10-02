# 🀄 Mahjong SG Tracker (Singapore / SEA rules)

Live, shared score tracker for a 4-player Singapore mahjong table — free to host on **GitHub Pages** with a free **Firebase Firestore** database. Everyone with the link sees the same game update live.

## Features

| Area | What it does |
|---|---|
| 🏠 Home | Start new game, score calculator, all-time #1, monthly MVP, games in progress, recent games |
| ▶️ Game | New game from the player directory (4 seats, starting score, scorekeeper, location, notes); resume or join by code |
| 🀄 Game table | Game number, dealer 庄 with 连庄 streak, seat winds & seat flowers, score / diff / wins, zero-sum balance check |
| Record win | Winner → self-draw / discard / pay-all (包赔, with trigger) → patterns via **Quick 3-step**, **Limit**, **Catalog** or **Tai only**; single-primary-hand rule, Seven Pairs 2/7 Tai, min-Tai rejection, live actual/effective Tai & base point, settlement preview, remarks |
| Instant payout | Exposed kong 2 each, concealed kong 4 each, flower/season set 4 each, matched flower+season 2 each (no bites) |
| Other actions | Draw round, manual adjust (±10/5/2, zero-sum, reason required), undo last, audit log with void / restore / **edit past round**, reset points, finish game, end / quit |
| 🏁 Recap | Champion, rounds, duration, standings with self-draw / discard / pay-all counts, what each player won with, all rounds, highest hand; share via WhatsApp, Teams format, copy text, CSV |
| 📷 AI hand scan | In Record win / Score: photograph the winning hand, Google Gemini (Firebase AI Logic, free tier) reads the tiles and fills in the patterns with a confidence score for you to check |
| 🧮 Score | Standalone calculator with the same pattern picker |
| 🏆 Ranking | Today / week / month / year / all-time; rank by points, avg per game, wins, win rate, highest Tai, self-draws, pay-all wins, games played, #1 finishes, safest |
| 👥 Players | Directory with handles ("Dragon Master"), career stats, profile with recent games |
| 📖 Rules & Tai | Claiming priority, single-primary-hand rule, Tai → points, pay-all triggers, full Tai catalogue, calculator, 🀄 tile picture guide |
| ⚙️ House rules | Min Tai, Tai cap (3–10 or no cap), special-win Tai, double wind, score label, auto dealer + draw rule, instant payout amounts, pay-all multiplier, final-wall threshold, Tai per pattern, show/hide Chinese |
| 🧪 Test suite | 24 in-app business-rule checks (also run in Node) |
| 💾 Backup | Download / copy JSON, upload / paste JSON (merge), reset rankings (season), sample tournament (demo mode) |

Scoring: base = 2^min(Tai, cap). Discard win → discarder 2×, others 1×. Self-draw → all pay 2×. Pay-all → responsible player pays 6× alone. Every entry is 4 integer deltas that must sum to 0 (checked in the app **and** by `firestore.rules`); entries are voided, never deleted.

## 🧪 Winning hand simulator & rule sets
- **Simulator (Score tab, Record Win, 🙋 I won!, 🧪 Simulate in a game):** 1 · win details → 2 · kind of hand (normal / seven pairs / thirteen wonders / premium) → 3 · build the tiles (4 groups + 1 pair, 3 taps each; flowers & animals; ⭐ mark the winning tile) → 4 · result: the winning pattern, the hand, every Tai with the tiles that earn it, base points and who pays. Nothing is saved unless the host records it.
- **Rule sets:** ⚙️ Rule sets → ⭐ Default plus your own sets (＋ New rule set copies the one you are viewing). Pick a set when you create a game — the game keeps a copy of those rules. Everyone is notified when a set changes.

## One host per game · join screen · requests · notifications
- **Host control:** the phone that creates a game is the host — only it can record wins, payouts, undo, finish or end the game (enforced by `firestore.rules`). Everyone else sees live scores read-only.
- **Hand over / take over:** Host tools → give control to another phone, or set a **host PIN** so someone can take over with 🔑 Take over (the PIN is stored where nobody can read it).
- **Join screen (Kahoot-style):** new games open a lobby with a big code + QR. Players scan, tap "Which player are you?", and the host presses ▶ Start game.
- **🙋 I won!** Players answer simple questions (how they got the tile, runs or triplets, one suit or more, dragons, winds, tap their flowers/animals…) — the app counts the Tai and sends it to the host to approve. Kong/flower payouts can be requested the same way.
- **🧭 Help me count:** the host's Record Win and the Score tab use the same question helper; "advanced" keeps the old pattern picker.
- **🔔 Notifications:** house-rule changes (who changed what), table-rule changes, new requests, approvals/rejections, host changes, game start/finish. Phone alerts work while the app is open or in the background tab (true push when closed would need paid Cloud Functions).

## Try it locally (demo mode)
```bash
python -m http.server 8080     # then open http://localhost:8080
```
With `apiKey: 'REPLACE_ME'` in `js/config.js` the app runs in demo mode (this browser only). Tests: `for t in tests/*.mjs; do node $t; done`

## Go live (free)
1. **Firebase** (console.firebase.google.com, Spark plan): create a Firestore database (`asia-southeast1`), paste **`firestore.rules`** into Firestore → Rules → **Publish**, enable **Authentication → Sign-in method → Anonymous**, and put the web config in `js/config.js`.
1b. **AI hand scan (optional)**: Firebase console → **AI Logic** → **Get started** → choose **Gemini Developer API** (free, no card) → enable. The model can be changed in ⚙️ House rules → AI hand scan.
2. **GitHub Pages**: push this folder to a public repo → Settings → Pages → deploy from `main` / root. Add `<username>.github.io` under Firebase → Authentication → Settings → Authorized domains.

Free-tier headroom: 50k reads / 20k writes per day — plenty for a friend group.

## Files
```
index.html            shell: header + bottom nav
css/styles.css        mobile-first styles (light/dark)
js/app.js             boot + router
js/store.js           Firestore / localStorage adapters (players, games, events, house rules, import)
js/data.js            shared state & cache
js/ui.js              helpers: sheets, dialogs, toasts, clipboard, downloads
js/scoring.js         payouts: 2^Tai, discard/self-draw/pay-all, instant, manual, audit
js/rules.js           house rules, Tai catalogue, dealer rotation
js/hand.js            hand evaluation (single-primary-hand rule, Seven Pairs, min Tai)
js/picker.js          pattern picker (Quick / Scan / Limit / Catalog / Tai only)
js/scan.js, scan-core.js  Gemini photo scan (image shrink, prompt, strict JSON parsing)
js/game.js            live game table + all action sheets
js/recap-core.js      recap maths + WhatsApp/Teams/text/CSV formats
js/recap.js           recap page
js/home.js            home + game tab
js/newgame.js         new game setup
js/calc.js            score calculator
js/leaderboard.js     ranking
js/players.js         player directory & profiles
js/guide.js, tiles.js rules reference & tile guide
js/settings.js        house rules page
js/more.js            more menu + test suite page
js/backup.js          backup & restore
js/selftest.js        business-rule test suite (app + Node)
js/stats.js, prefs.js statistics, preferences
firestore.rules       security rules
tests/                Node tests
```
