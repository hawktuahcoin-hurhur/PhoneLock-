# PhoneLock 🔒📚

An iPhone app that locks the apps you choose every morning. They stay locked until you finish your daily study goal: SAT prep plus 350+ topics.

- **Real app locking**: uses Apple's Screen Time API (FamilyControls / ManagedSettings / DeviceActivity). You pick apps, categories, or websites. They get the system shield until you hit your goal, and a background extension locks them again at midnight even if PhoneLock is closed.
- **Daily intake**: a set number of correct answers per day, with a minimum number of SAT answers.
- **Commitment mode**: while apps are locked, you can't lower goals, remove apps, or pause the lock.
- **Strict mode**: each wrong answer takes one correct answer off today's progress, so guessing doesn't pay.
- **Gamification**: XP and levels ("Rookie" → "1600 Legend"), combo multipliers, coins, a daily streak with streak freezes, 19 achievements, a 15-week study heatmap, confetti, and haptics.
- **Emergency pass**: spend coins to unlock for 15 minutes. Apps lock again on their own when it runs out.

## Content

| Source | Topics | Needs internet? |
|---|---|---|
| SAT Math generators (linear, systems, quadratics, trig, circles, stats, …) | 28 topics, unlimited questions | No |
| SAT Reading & Writing (boundaries, agreement, transitions, words in context, evidence, …) | 7 topics | No |
| General math generators (arithmetic → calculus, binary, combinatorics) | 15 | No |
| Flashcard decks (SAT vocab, roots, capitals, elements, languages, history, literature, CS, psych, econ, …) | 41 | No |
| AI topics written by Claude (AP courses, college subjects, languages, coding, …) | 261, plus anything you type with ✨ | Yes (your Anthropic API key) |
| Your own decks (paste `term | definition` lines) | unlimited | No |

SAT Math, SAT Reading & Writing, and SAT Vocab count toward the SAT minimum.

## Build & run

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

### AI topics (optional)

Go to Settings → AI topics and paste an Anthropic API key from [console.anthropic.com](https://console.anthropic.com). The key is stored in the iOS Keychain, and requests go straight from the phone to the Claude API. The default model is `claude-opus-5`; you can switch to `claude-sonnet-5` or `claude-haiku-4-5` for lower cost. Questions are generated 15 at a time and cached per topic.

## Project layout

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
```

## Honest limits

- iOS lets you revoke PhoneLock's Screen Time permission in the Settings app. That removes the lock. Apple doesn't let an individual-authorization app prevent this. To make it harder, set a Screen Time passcode that someone else knows.
- Emergency passes last at least 15 minutes, which is the shortest interval DeviceActivity allows.
