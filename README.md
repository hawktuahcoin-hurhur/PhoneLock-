# PhoneLock 🔒📚

Gamified daily studying: SAT prep plus 350+ topics, with XP, streaks, and trophies. PhoneLock comes in two versions:

| | **Web app** (`web/`) | **iPhone app** (`PhoneLock/`) |
|---|---|---|
| Cost | Free | Needs a Mac and a $99/yr Apple Developer account |
| Install | Open the site, then Add to Home Screen | Build with Xcode |
| Keeps you honest with | Reminder notifications and a Home Screen badge | Real app locking through Screen Time |

---

## Web app (free)

A Home Screen web app (PWA). It runs offline, keeps your progress on your device, and needs no build step. It's plain HTML, CSS, and JavaScript in `web/`.

- **Daily intake:** a set number of correct answers per day, including a minimum number of SAT answers. Strict mode takes one correct answer off today's progress for each wrong one.
- **Reminders:** notifications at times you choose, sent when the goal isn't done yet. The Home Screen icon badge shows how many answers you still need.
- **Gamification:** XP and levels, combos, coins, streaks with streak freezes, 19 trophies, a study heatmap, and confetti.
- **Same content as the iPhone app:** it's exported from the Swift sources by `python3 tools/export-web-content.py`. AI topics use your own Anthropic API key, which is stored only in your browser.

### 1. Put it online (free)

The site must be served over HTTPS for Home Screen install and notifications to work. Pick one option:

- **Netlify:** sign in with GitHub, choose *Add new site → Import an existing project*, and pick this repo. `netlify.toml` already points it at `web/`, so there's nothing to configure.
- **Cloudflare Pages:** connect the repo, leave the build command empty, and set the output directory to `web`.
- **GitHub Pages:** this needs a public repo, or a paid plan for private repos. In *Settings → Pages*, set Source to *GitHub Actions*. Then under *Settings → Secrets and variables → Actions → Variables*, add `DEPLOY_PAGES` = `on`. `.github/workflows/deploy-web.yml` publishes `web/` on every push.

To try it on your computer first, run `python3 -m http.server -d web 8000` and open http://localhost:8000.

### 2. Add it to your Home Screen

- **iPhone:** open the site in **Safari**, tap Share, then **Add to Home Screen**. Open PhoneLock from the new icon, then go to Settings → Reminders → **Enable**. On iPhone, notifications only work in the Home Screen app, on iOS 16.4 or later.
- **Android:** open the site in Chrome. Tap **Install app** from the menu, or accept the install prompt.

### 3. Reminders

- **Built in (no setup):** at each reminder time you set, PhoneLock sends a notification if today's goal isn't done. This works while the app is open or suspended in the background. On iPhone, a fully closed web app can't schedule its own notifications, so for that you need background reminders.
- **Background reminders (optional, free):** a GitHub Actions schedule sends a push to your phone. When the push arrives, the app writes the message from your saved progress, for example "Keep your 6-day streak. Still to go: 12 correct answers". If you've already finished, you get a short "goal complete" note instead.
  1. In the Home Screen app, go to Settings → Background push → **Generate push keys**. Copy the private key right away; it's only shown once.
  2. Tap **Create push subscription** and copy the result.
  3. In GitHub, under *Settings → Secrets and variables → Actions*, add three secrets: `VAPID_PUBLIC_KEY` (the public key shown in the app), `VAPID_PRIVATE_KEY`, and `PUSH_SUBSCRIPTIONS` (the subscription JSON). To use more than one device, put the subscriptions in a JSON array.
  4. Add a repository **variable** `PUSH_REMINDERS` = `on`. Then edit the `cron` times in `.github/workflows/study-reminders.yml`. They're in UTC.
  5. To test it, go to *Actions → Study reminders → Run workflow*.

  A private repo gets 2,000 free Actions minutes a month, and each reminder run uses about 1 minute.

---

## iPhone app (Screen Time lock)

An iPhone app that locks the apps you choose every morning. They stay locked until you finish your daily study goal: SAT prep plus 350+ topics.

- **Real app locking**: uses Apple's Screen Time API (FamilyControls / ManagedSettings / DeviceActivity). You pick apps, categories, or websites. They get the system shield until you hit your goal, and a background extension locks them again at midnight even if PhoneLock is closed.
- **Daily intake**: a set number of correct answers per day, with a minimum number of SAT answers.
- **Commitment mode**: while apps are locked, you can't lower goals, remove apps, or pause the lock.
- **Strict mode**: each wrong answer takes one correct answer off today's progress, so guessing doesn't pay.
- **Gamification**: XP and levels ("Rookie" → "1600 Legend"), combo multipliers, coins, a daily streak with streak freezes, 19 achievements, a 15-week study heatmap, confetti, and haptics.
- **Emergency pass**: spend coins to unlock for 15 minutes. Apps lock again on their own when it runs out.

### Content

| Source | Topics | Needs internet? |
|---|---|---|
| SAT Math generators (linear, systems, quadratics, trig, circles, stats, …) | 28 topics, unlimited questions | No |
| SAT Reading & Writing (boundaries, agreement, transitions, words in context, evidence, …) | 7 topics | No |
| General math generators (arithmetic → calculus, binary, combinatorics) | 15 | No |
| Flashcard decks (SAT vocab, roots, capitals, elements, languages, history, literature, CS, psych, econ, …) | 41 | No |
| AI topics written by Claude (AP courses, college subjects, languages, coding, …) | 261, plus anything you type with ✨ | Yes (your Anthropic API key) |
| Your own decks (paste `term | definition` lines) | unlimited | No |

SAT Math, SAT Reading & Writing, and SAT Vocab count toward the SAT minimum.

### Build & run

You need a Mac with Xcode 15+, a **physical iPhone on iOS 16+** (Screen Time doesn't work in the Simulator), and a paid Apple Developer account (the Family Controls capability isn't available to free teams).

```bash
brew install xcodegen
xcodegen            # generates PhoneLock.xcodeproj from project.yml
open PhoneLock.xcodeproj
```

1. In `project.yml` (or the project build settings), set `BUNDLE_ID_PREFIX` to something you own (e.g. `com.yourname`) and set `DEVELOPMENT_TEAM` to your team ID.
2. In Xcode, check each of the 3 targets (**PhoneLock**, **DeviceActivityMonitor**, **ShieldConfiguration**) under *Signing & Capabilities*. Each needs the **Family Controls** capability and the App Group `group.<prefix>.phonelock`. The entitlements are generated already, and automatic signing registers them.
3. Run on your iPhone. Grant Screen Time access, pick the apps to lock, set your goal, and start studying.

> The Family Controls entitlement works for development builds on your own devices. TestFlight or App Store distribution needs [Apple's approval](https://developer.apple.com/contact/request/family-controls-distribution).

#### AI topics (optional)

Go to Settings → AI topics and paste an Anthropic API key from [console.anthropic.com](https://console.anthropic.com). The key is stored in the iOS Keychain, and requests go straight from the phone to the Claude API. The default model is `claude-opus-5`; you can switch to `claude-sonnet-5` or `claude-haiku-4-5` for lower cost. Questions are generated 15 at a time and cached per topic.

### Project layout

```
project.yml                     XcodeGen spec (app + 2 extensions)
Shared/LockShared.swift         App Group state + LockEngine (apply/clear shield); used by all targets
DeviceActivityMonitor/          Background extension: re-lock at midnight and when a pass ends
ShieldConfiguration/            Custom "Study first 📚" lock screen with today's remaining goal
PhoneLock/
  App/                          Entry point, root tabs, achievement/level-up toasts
  Models/                       Question/Topic/Deck, progress & settings, leveling, achievements
  Content/                      SAT generators, R&W bank, flashcard decks, AI topic catalog, Catalog
  Services/                     GameStore (XP/streak/goal), LockManager (Screen Time), QuestionEngine, AIService, Keychain
  Theme/ Views/                 Dark glass UI: Today, Study, Quiz, Trophies, Settings, Onboarding
web/                            Free Home Screen web app (index.html, app.js, generators.js, data.js, sw.js)
push/send-reminders.mjs         Sends background reminder pushes (run by .github/workflows/study-reminders.yml)
tools/export-web-content.py     Regenerates web/data.js from the Swift content
```

### Limits

- iOS lets you revoke PhoneLock's Screen Time permission in the Settings app. That removes the lock. Apple doesn't let an individual-authorization app prevent this. To make it harder, set a Screen Time passcode that someone else knows.
- Emergency passes last at least 15 minutes, which is the shortest interval DeviceActivity allows.
