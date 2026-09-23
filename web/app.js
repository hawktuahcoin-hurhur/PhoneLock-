// PhoneLock Web: gamified daily study with reminders. No build step; plain browser JavaScript.
(function () {
  "use strict";

  const DATA = window.PL_DATA;
  const GEN = window.PL_GENERATORS;
  const STORAGE_KEY = "phonelock.web.v1";
  const MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];
  const FREEZE_COST = 150;

  // ---------- Subjects ----------

  const SUBJECTS = [
    ["satMath", "SAT Math", "∑", "#8b6cff"],
    ["satReading", "SAT Reading & Writing", "¶", "#ff6fa8"],
    ["vocab", "Vocabulary", "Aa", "#ffc94d"],
    ["math", "Math", "√", "#4fd8f7"],
    ["science", "Science", "⌬", "#46e8a3"],
    ["history", "History & Civics", "Ⅲ", "#f59a52"],
    ["geography", "Geography", "◍", "#5aa9ff"],
    ["languages", "Languages", "文", "#d98bff"],
    ["humanities", "Arts & Humanities", "♮", "#ff8a80"],
    ["tech", "Computer Science", "</>", "#6ff0d6"],
    ["social", "Social Sciences", "Ψ", "#f2c078"],
    ["business", "Business & Econ", "$", "#9be070"],
    ["custom", "My Topics", "✎", "#e7e4ff"],
  ].map(([key, label, glyph, color]) => ({ key, label, glyph, color }));
  const SUBJECT = Object.fromEntries(SUBJECTS.map((s) => [s.key, s]));

  // ---------- Catalog ----------

  const aiId = (name) => "ai." + name.toLowerCase().replace(/[^a-z0-9]/g, "-");

  const BUILT_IN = [
    ...GEN.satMath.map(([id, name, make]) => ({ id, name, subject: "satMath", kind: "gen", make })),
    ...DATA.readingWriting.map((t) => ({ id: t.id, name: t.name, subject: "satReading", kind: "bank", questions: t.questions })),
    ...GEN.general.map(([id, name, make]) => ({ id, name, subject: "math", kind: "gen", make })),
    ...DATA.decks.map((d) => ({ id: d.id, name: d.name, subject: d.subject, kind: "deck", deck: d })),
    ...DATA.aiTopics.flatMap((g) => g.names.map((name) => ({ id: aiId(name), name, subject: g.subject, kind: "ai", prompt: name }))),
  ];

  const isSAT = (t) => t.subject === "satMath" || t.subject === "satReading" || t.id.startsWith("sat.");
  const OFFLINE = BUILT_IN.filter((t) => t.kind !== "ai");
  const SAT_TOPICS = OFFLINE.filter(isSAT);

  function allTopics() {
    return [
      ...BUILT_IN,
      ...state.customDecks.map((d) => ({ id: "custom." + d.id, name: d.name, subject: "custom", kind: "deck",
        deck: { forward: "%@", reverse: "Which term matches: %@", pairs: d.pairs } })),
      ...state.customAI.map((name) => ({ id: aiId(name), name, subject: "custom", kind: "ai", prompt: name })),
    ];
  }
  const topicById = (id) => allTopics().find((t) => t.id === id);

  function badge(t) {
    if (t.kind === "gen") return "Unlimited questions";
    if (t.kind === "bank") return `${t.questions.length} questions`;
    if (t.kind === "deck") return `${t.deck.pairs.length} cards`;
    return "Written by Claude";
  }

  // ---------- Questions ----------

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function makeQuestion(topicId, q, id) {
    const seen = new Set([q.answer]);
    const wrong = [];
    for (const d of q.wrong || []) {
      if (!seen.has(d)) { seen.add(d); wrong.push(d); }
      if (wrong.length === 3) break;
    }
    const choices = GEN.shuffle([...wrong, q.answer]);
    return { id: id || `${topicId}|${uid()}`, topicId, prompt: q.prompt, choices, answerIndex: choices.indexOf(q.answer), explanation: q.explanation || "" };
  }

  function reshuffle(q) {
    const answer = q.choices[q.answerIndex];
    const choices = GEN.shuffle(q.choices);
    return { ...q, choices, answerIndex: choices.indexOf(answer) };
  }

  function fromDeck(deck, topicId) {
    const pair = GEN.pick(deck.pairs);
    const rev = !!deck.reverse && Math.random() < 0.5;
    const [cue, answer, side] = rev ? [pair[1], pair[0], 0] : [pair[0], pair[1], 1];
    const template = rev ? deck.reverse : deck.forward;
    const wrong = GEN.shuffle(deck.pairs).map((p) => p[side]).filter((v) => v !== answer);
    return makeQuestion(topicId, { prompt: template.replace("%@", cue), answer, wrong }, `${topicId}|${rev ? "r" : "f"}|${pair[0]}`);
  }

  function oneFrom(t) {
    if (t.kind === "gen") return makeQuestion(t.id, t.make());
    if (t.kind === "bank") { const q = GEN.pick(t.questions); return makeQuestion(t.id, q, q.id); }
    if (t.kind === "deck") return fromDeck(t.deck, t.id);
    return null;
  }

  function fromBank(t, count) {
    const out = [];
    while (out.length < count) {
      for (const q of GEN.shuffle(t.questions)) {
        if (out.length >= count) break;
        out.push(makeQuestion(t.id, q, q.id));
      }
    }
    return out;
  }

  async function buildSession(mode) {
    const count = state.settings.sessionLength;
    const fill = (pool) => Array.from({ length: count }, () => oneFrom(GEN.pick(pool))).filter(Boolean);
    if (mode.type === "sat") return fill(SAT_TOPICS);
    if (mode.type === "mistakes") return GEN.shuffle(state.mistakes).slice(0, count).map(reshuffle);
    if (mode.type === "daily") {
      const studied = Object.entries(state.topics)
        .filter(([, s]) => s.answered > 0)
        .sort((a, b) => mastery(a[1]) - mastery(b[1]))
        .slice(0, 8)
        .map(([id]) => OFFLINE.find((t) => t.id === id))
        .filter(Boolean);
      return fill(studied.length ? [...studied, ...GEN.shuffle(SAT_TOPICS).slice(0, 4)] : OFFLINE);
    }
    const t = mode.topic;
    if (t.kind === "bank") return fromBank(t, count);
    if (t.kind === "ai") return aiSession(t, count);
    return Array.from({ length: count }, () => oneFrom(t));
  }

  // ---------- Claude API (AI topics) ----------

  const AI_SCHEMA = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            choices: { type: "array", items: { type: "string" } },
            answer_index: { type: "integer" },
            explanation: { type: "string" },
          },
          required: ["prompt", "choices", "answer_index", "explanation"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };

  async function aiSession(t, count) {
    let pool = state.aiCache[t.id] || [];
    if (pool.length < count) {
      const recent = pool.map((q) => q.prompt).concat(state.mistakes.filter((q) => q.topicId === t.id).map((q) => q.prompt));
      pool = pool.concat(await generateAI(t, Math.max(count, 15), recent));
    }
    state.aiCache[t.id] = pool.slice(count);
    save();
    return pool.slice(0, count);
  }

  async function generateAI(t, count, recent) {
    const key = (state.settings.apiKey || "").trim();
    if (!key) throw new Error("Add your Anthropic API key in Settings → AI topics to study AI-written topics.");
    const model = state.settings.aiModel;
    const avoid = recent.slice(-30).map((p) => `- ${p}`).join("\n");
    const prompt = `Write ${count} multiple-choice study questions on: ${t.prompt}.

Requirements:
- Exactly 4 choices each, exactly one unambiguously correct; answer_index is its 0-based index.
- Vary the position of the correct answer.
- Mix difficulty from medium to hard, testing real understanding rather than trivia wording.
- Keep prompts under 300 characters and choices under 100 characters. Plain text only, no markdown.
- explanation: one or two sentences on why the answer is right.${avoid ? `\n\nDo not repeat these recent questions:\n${avoid}` : ""}`;

    const body = {
      model,
      max_tokens: 16000,
      system: "You are an expert teacher and test writer creating accurate, exam-quality practice questions for a student's daily study session.",
      messages: [{ role: "user", content: prompt }],
      output_config: { format: { type: "json_schema", schema: AI_SCHEMA } },
    };
    if (model !== "claude-haiku-4-5") body.output_config.effort = "low";
    const headers = {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    if (model === "claude-opus-5") {
      // Re-run a safety-declined request on Anthropic's recommended fallback model instead of failing.
      headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
      body.fallbacks = "default";
    }

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error("Couldn't reach the Claude API. Check your connection and try again.");
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Claude API error ${res.status}: ${json?.error?.message || "request failed"}`);
    if (json.stop_reason === "refusal") throw new Error("Claude declined to write questions for this topic.");
    const text = (json.content || []).find((b) => b.type === "text")?.text;
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { throw new Error("Couldn't read the generated questions. Try again."); }
    const qs = (parsed.questions || [])
      .filter((q) => Array.isArray(q.choices) && q.choices.length >= 2 && q.answer_index >= 0 && q.answer_index < q.choices.length)
      .map((q) => ({ id: `${t.id}|${uid()}`, topicId: t.id, prompt: q.prompt, choices: q.choices, answerIndex: q.answer_index, explanation: q.explanation }));
    if (!qs.length) throw new Error("Couldn't read the generated questions. Try again.");
    return qs;
  }

  // ---------- State ----------

  const DEFAULT_SETTINGS = {
    dailyGoal: 30, satMinimum: 10, strictMode: false, sessionLength: 10,
    aiModel: "claude-opus-5", apiKey: "", reminders: ["16:00", "20:00"], vapidKey: "",
  };
  const DEFAULT_STATE = {
    onboarded: false, xp: 0, coins: 0, streak: 0, bestStreak: 0, freezes: 0, lastGoalDay: null,
    totalAnswered: 0, totalCorrect: 0, bestCombo: 0, perfectSessions: 0,
    days: {}, topics: {}, mistakes: [], unlocked: [], customDecks: [], customAI: [], aiCache: {}, fired: {},
    settings: DEFAULT_SETTINGS,
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) return { ...DEFAULT_STATE, ...saved, settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) } };
    } catch (e) { /* storage unavailable: start fresh */ }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  let state = load();

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    shareStateWithServiceWorker();
    updateAppBadge();
  }

  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseDay = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);

  const today = () => state.days[dayKey()] || { correct: 0, satCorrect: 0, answered: 0, xp: 0, goalMet: false };
  const setToday = (d) => { state.days[dayKey()] = d; };
  const remainingCorrect = () => Math.max(0, state.settings.dailyGoal - today().correct);
  const remainingSAT = () => Math.max(0, state.settings.satMinimum - today().satCorrect);
  const goalMet = () => today().goalMet;
  const mastery = (s) => Math.min(1, s.correct / 40) * (0.4 + 0.6 * (s.answered ? s.correct / s.answered : 0));

  function goalFraction() {
    const s = state.settings, d = today();
    const need = s.dailyGoal + s.satMinimum;
    if (!need) return 1;
    return Math.min(1, (Math.min(d.correct, s.dailyGoal) + Math.min(d.satCorrect, s.satMinimum)) / need);
  }

  function currentStreak() {
    if (!state.lastGoalDay) return 0;
    const gap = daysBetween(state.lastGoalDay, dayKey());
    if (gap <= 1) return state.streak;
    return gap - 1 <= state.freezes ? state.streak : 0;
  }

  function remainingText() {
    if (goalMet()) return "Daily goal complete.";
    const parts = [];
    if (remainingCorrect()) parts.push(`${remainingCorrect()} more correct`);
    if (remainingSAT()) parts.push(`${remainingSAT()} more SAT`);
    return `Still to go today: ${parts.join(" and ")}.`;
  }

  // ---------- Leveling & achievements ----------

  const xpFor = (l) => 50 * (l - 1) * l;
  const levelFor = (xp) => { let l = 1; while (xpFor(l + 1) <= xp) l++; return l; };
  function levelProgress(xp) { const l = levelFor(xp), base = xpFor(l); return { level: l, into: xp - base, needed: xpFor(l + 1) - base }; }
  function levelTitle(l) {
    if (l < 3) return "Rookie"; if (l < 6) return "Apprentice"; if (l < 10) return "Scholar"; if (l < 15) return "Honor Roll";
    if (l < 20) return "Valedictorian"; if (l < 30) return "Professor"; if (l < 45) return "Sage"; return "1600 Legend";
  }

  const satTotal = (p) => Object.values(p.days).reduce((s, d) => s + (d.satCorrect || 0), 0);
  const ACHIEVEMENTS = [
    ["first", "First Steps", "Answer your first question", 10, (p) => p.totalAnswered >= 1],
    ["c100", "Century", "100 correct answers", 50, (p) => p.totalCorrect >= 100],
    ["c1000", "Grinder", "1,000 correct answers", 200, (p) => p.totalCorrect >= 1000],
    ["c5000", "Unstoppable", "5,000 correct answers", 500, (p) => p.totalCorrect >= 5000],
    ["goal1", "Goal Getter", "Hit your daily goal", 25, (p) => Object.values(p.days).some((d) => d.goalMet)],
    ["s3", "Hat Trick", "3-day streak", 30, (p) => p.bestStreak >= 3],
    ["s7", "Week Warrior", "7-day streak", 75, (p) => p.bestStreak >= 7],
    ["s30", "Iron Will", "30-day streak", 300, (p) => p.bestStreak >= 30],
    ["s100", "Centurion", "100-day streak", 1000, (p) => p.bestStreak >= 100],
    ["combo10", "On Fire", "10-answer combo", 40, (p) => p.bestCombo >= 10],
    ["combo25", "Blazing", "25-answer combo", 120, (p) => p.bestCombo >= 25],
    ["perfect", "Flawless", "Perfect round", 40, (p) => p.perfectSessions >= 1],
    ["perfect10", "Precision", "10 perfect rounds", 150, (p) => p.perfectSessions >= 10],
    ["topics10", "Explorer", "Study 10 different topics", 60, (p) => Object.keys(p.topics).length >= 10],
    ["topics50", "Polymath", "Study 50 different topics", 250, (p) => Object.keys(p.topics).length >= 50],
    ["master", "Master", "Fully master a topic", 100, (p) => Object.values(p.topics).some((s) => mastery(s) >= 0.99)],
    ["sat500", "SAT Ready", "500 correct SAT answers", 250, (p) => satTotal(p) >= 500],
    ["lvl10", "Double Digits", "Reach level 10", 100, (p) => levelFor(p.xp) >= 10],
    ["early", "Early Bird", "Finish your goal before noon", 60, () => goalMet() && new Date().getHours() < 12],
  ].map(([id, title, detail, reward, earned]) => ({ id, title, detail, reward, earned }));

  // ---------- Game actions ----------

  const events = [];

  function record(q, correct, combo) {
    const oldLevel = levelFor(state.xp);
    const topic = topicById(q.topicId);
    const sat = topic ? isSAT(topic) : q.topicId.startsWith("sat.");
    const day = { ...today() };
    const stat = { ...(state.topics[q.topicId] || { answered: 0, correct: 0 }) };
    state.totalAnswered++; day.answered++; stat.answered++;
    let xp = 0;
    if (correct) {
      xp = 10 + Math.min(combo, 10);
      if (sat) xp = Math.floor((xp * 3) / 2);
      state.totalCorrect++; state.coins++;
      day.correct++; if (sat) day.satCorrect++;
      stat.correct++;
      state.bestCombo = Math.max(state.bestCombo, combo);
      state.mistakes = state.mistakes.filter((m) => m.id !== q.id);
    } else {
      if (state.settings.strictMode && day.correct > 0) day.correct--;
      if (!state.mistakes.some((m) => m.id === q.id)) state.mistakes = [...state.mistakes, q].slice(-150);
    }
    state.xp += xp; day.xp += xp;
    state.topics[q.topicId] = stat;
    setToday(day);
    const lvl = levelFor(state.xp);
    if (lvl > oldLevel) { state.coins += 20 * lvl; events.push({ type: "level", level: lvl }); }
    checkGoal();
    checkAchievements();
    save();
    return xp;
  }

  function checkGoal() {
    if (goalMet() || remainingCorrect() > 0 || remainingSAT() > 0) return;
    const todayKey = dayKey();
    if (state.lastGoalDay) {
      const missed = daysBetween(state.lastGoalDay, todayKey) - 1;
      if (missed <= 0) state.streak++;
      else if (missed <= state.freezes) { state.freezes -= missed; state.streak++; }
      else state.streak = 1;
    } else state.streak = 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.lastGoalDay = todayKey;
    state.coins += 25 + Math.min(state.streak, 30);
    setToday({ ...today(), goalMet: true });
    events.push({ type: "goal" });
  }

  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (!state.unlocked.includes(a.id) && a.earned(state)) {
        state.unlocked.push(a.id);
        state.coins += a.reward;
        events.push({ type: "achievement", id: a.id });
      }
    }
  }

  // ---------- Notifications, badge, service worker ----------

  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const notifySupported = () => "Notification" in window && "serviceWorker" in navigator;

  let swReg = null;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then((r) => { swReg = r; shareStateWithServiceWorker(); }).catch(() => {});
  }

  async function shareStateWithServiceWorker() {
    if (!("caches" in window)) return;
    try {
      const cache = await caches.open("pl-state");
      const snapshot = { date: dayKey(), goalMet: goalMet(), remainingCorrect: remainingCorrect(), remainingSAT: remainingSAT(),
        dailyGoal: state.settings.dailyGoal, satMinimum: state.settings.satMinimum, streak: currentStreak() };
      await cache.put("state.json", new Response(JSON.stringify(snapshot), { headers: { "content-type": "application/json" } }));
    } catch (e) { /* cache unavailable */ }
  }

  function updateAppBadge() {
    try {
      const left = goalMet() ? 0 : remainingCorrect() + remainingSAT();
      if (left > 0 && navigator.setAppBadge) navigator.setAppBadge(Math.min(left, 99)).catch(() => {});
      else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    } catch (e) { /* unsupported */ }
  }

  async function notify(title, body) {
    if (!notifySupported() || Notification.permission !== "granted") return false;
    const options = { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "phonelock-reminder", data: { url: "./" } };
    try {
      const reg = swReg || (await navigator.serviceWorker.ready);
      await reg.showNotification(title, options);
      return true;
    } catch (e) {
      try { new Notification(title, options); return true; } catch (e2) { return false; }
    }
  }

  function reminderMessage() {
    const streak = currentStreak();
    const left = remainingText().replace("Still to go today: ", "");
    return streak > 1 ? `Your ${streak}-day streak is on the line. ${left}` : `Time to study. ${left}`;
  }

  /// Fires today's reminder times while the app is open or suspended in the background.
  function checkReminders() {
    const now = new Date(), key = dayKey(now);
    const mins = now.getHours() * 60 + now.getMinutes();
    let changed = false;
    for (const t of state.settings.reminders) {
      const [h, m] = t.split(":").map(Number);
      const id = `${key} ${t}`;
      if (mins >= h * 60 + m && !state.fired[id]) {
        state.fired[id] = true;
        changed = true;
        // Only nudge for reminders that came due in the last hour, and only when the goal isn't done.
        if (!goalMet() && mins - (h * 60 + m) <= 60) notify("PhoneLock", reminderMessage());
      }
    }
    for (const id of Object.keys(state.fired)) if (!id.startsWith(key)) { delete state.fired[id]; changed = true; }
    if (changed) save();
  }
  setInterval(checkReminders, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkReminders(); render(); } });

  function urlB64ToUint8Array(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  // ---------- Rendering helpers ----------

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const haptic = (ms = 10) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* no-op */ } };

  const ICONS = {
    today: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1.2 2.6 2.3 2.9C10.6 9 11 6 12 3z"/>',
    study: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5zM14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14z"/>',
    trophies: '<path d="M7 4h10v3a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 12v4M8 20h8M9.5 16h5v4h-5z"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1.2 2.6 2.3 2.9C10.6 9 11 6 12 3z"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M7 7l10 10M17 7L7 17"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  };
  const icon = (name, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  function ring(fraction, size, stroke, cls = "") {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <defs><linearGradient id="rg${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--violet)"/><stop offset="1" stop-color="var(--cyan)"/></linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
      <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#rg${size})" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0.002, Math.min(1, fraction)))}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
  }

  const bar = (v, color = "var(--violet)") => `<div class="bar"><span style="width:${Math.max(3, Math.min(100, v * 100))}%;background:${color}"></span></div>`;

  // ---------- Views ----------

  let tab = "today";
  let studyFilter = null;
  let studySearch = "";
  let settingsNote = "";
  let subscriptionJSON = "";
  let generatedPrivateKey = "";

  function render() {
    if (!state.onboarded) { $("#app").innerHTML = onboardingView(); return; }
    const views = { today: todayView, study: studyView, trophies: trophiesView, settings: settingsView };
    const scroll = window.scrollY;
    $("#app").innerHTML = `<main class="view" id="view-${tab}">${views[tab]()}</main>${tabBar()}`;
    window.scrollTo(0, scroll);
  }

  function tabBar() {
    const tabs = [["today", "Today"], ["study", "Study"], ["trophies", "Trophies"], ["settings", "Settings"]];
    return `<nav class="tabbar" aria-label="Sections">${tabs.map(([k, label]) =>
      `<button class="tab ${tab === k ? "on" : ""}" data-action="tab" data-tab="${k}" aria-current="${tab === k ? "page" : "false"}">${icon(k)}<span>${label}</span></button>`).join("")}</nav>`;
  }

  function onboardingView() {
    const s = state.settings;
    return `<main class="view onboarding">
      <div class="brand-mark">${icon("lock")}</div>
      <p class="eyebrow">PhoneLock</p>
      <h1>Earn your screen time.</h1>
      <p class="lede">Set a daily study goal: SAT prep plus hundreds of topics. PhoneLock reminds you until it's done and rewards you with XP, streaks and trophies.</p>
      <section class="card stack">
        <div class="field"><span>Correct answers per day</span>
          <div class="stepper"><button data-action="ob-step" data-k="dailyGoal" data-d="-5" aria-label="Fewer">−</button><output>${s.dailyGoal}</output><button data-action="ob-step" data-k="dailyGoal" data-d="5" aria-label="More">+</button></div></div>
        <div class="field"><span>of which SAT</span>
          <div class="stepper"><button data-action="ob-step" data-k="satMinimum" data-d="-5" aria-label="Fewer">−</button><output>${s.satMinimum}</output><button data-action="ob-step" data-k="satMinimum" data-d="5" aria-label="More">+</button></div></div>
      </section>
      <button class="btn primary" data-action="start">Start studying</button>
      <p class="fine">Tip: add PhoneLock to your Home Screen so it opens like an app and can send reminders.</p>
    </main>`;
  }

  function todayView() {
    const s = state.settings, d = today(), lp = levelProgress(state.xp);
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(); date.setDate(date.getDate() - (6 - i));
      const log = state.days[dayKey(date)];
      const label = date.toLocaleDateString(undefined, { weekday: "narrow" });
      const cls = log?.goalMet ? "met" : log?.correct ? "some" : "";
      return `<div class="day ${cls} ${i === 6 ? "is-today" : ""}"><span>${label}</span><i>${log?.goalMet ? icon("flame") : log?.correct || ""}</i></div>`;
    }).join("");

    return `
      <header class="top">
        <div><p class="muted">${greet}</p><h2>Level ${lp.level} · ${levelTitle(lp.level)}</h2></div>
        <div class="pills"><span class="pill gold">${icon("flame")}${currentStreak()}</span><span class="pill cyan">${icon("coin")}${state.coins}</span></div>
      </header>
      <div class="xp">${bar(lp.into / lp.needed)}<div class="xp-meta"><span>${lp.into} / ${lp.needed} XP</span><span>${d.xp} XP today</span></div></div>

      ${installCard()}

      <section class="card goal">
        <div class="ring-wrap">${ring(goalFraction(), 200, 18, goalMet() ? "done" : "")}
          <div class="ring-label"><strong>${Math.min(d.correct, s.dailyGoal)}</strong><span>of ${s.dailyGoal} correct</span></div>
        </div>
        ${s.satMinimum ? `<div class="req"><div class="req-row"><span>SAT requirement</span><b>${Math.min(d.satCorrect, s.satMinimum)}/${s.satMinimum}</b></div>${bar(d.satCorrect / s.satMinimum, "var(--pink)")}</div>` : ""}
        <p class="muted center">${goalMet() ? "Goal complete. Extra rounds still earn XP and coins." : esc(remainingText())}</p>
        <button class="btn primary" data-action="session" data-mode="daily">${goalMet() ? "Bonus round" : "Continue studying"}</button>
      </section>

      <p class="section-label">Quick start</p>
      <div class="tiles">
        ${tile("sat", "SAT Sprint", `${s.sessionLength} mixed SAT questions`, "∑", "var(--violet)")}
        ${tile("mistakes", "Mistakes", `${state.mistakes.length} to review`, "↺", "var(--pink)")}
        ${tile("browse", "Browse", `${allTopics().length} topics`, "▦", "var(--cyan)")}
        ${tile("trophies", "Trophies", `${state.unlocked.length}/${ACHIEVEMENTS.length} earned`, "★", "var(--gold)")}
      </div>

      <p class="section-label">This week</p>
      <section class="card week">${week}</section>`;
  }

  function installCard() {
    if (standalone()) {
      if (notifySupported() && Notification.permission === "default") {
        return `<section class="card hint">${icon("bell")}<div><b>Turn on reminders</b><p class="muted">Get a nudge at your reminder times when the goal isn't done.</p></div><button class="btn small" data-action="enable-notifs">Enable</button></section>`;
      }
      return "";
    }
    const how = isIOS() ? `In Safari, tap ${icon("share", "inline")} Share, then <b>Add to Home Screen</b>.` : "Use your browser menu and choose <b>Install app</b> or <b>Add to Home Screen</b>.";
    return `<section class="card hint">${icon("share")}<div><b>Add PhoneLock to your Home Screen</b><p class="muted">${how} It opens full-screen, works offline, and can send reminders.</p></div></section>`;
  }

  function tile(mode, title, sub, glyph, color) {
    return `<button class="tile" data-action="tile" data-mode="${mode}"><span class="glyph" style="background:${color}">${esc(glyph)}</span><b>${esc(title)}</b><span class="muted">${esc(sub)}</span></button>`;
  }

  function studyView() {
    const chips = [`<button class="chip ${!studyFilter ? "on" : ""}" data-action="filter" data-subject="">All</button>`,
      ...SUBJECTS.map((s) => `<button class="chip ${studyFilter === s.key ? "on" : ""}" data-action="filter" data-subject="${s.key}"><i style="color:${s.color}">${esc(s.glyph)}</i>${esc(s.label)}</button>`)].join("");
    return `
      <header class="top"><h1>Study</h1></header>
      <div class="search-row">
        <input id="search" type="search" placeholder="Search ${allTopics().length} topics" value="${esc(studySearch)}" autocomplete="off" aria-label="Search topics">
        <button class="btn small ghost" data-action="custom-ai" title="Study any topic with AI">${icon("spark")}Any topic</button>
      </div>
      <div class="chips">${chips}</div>
      <div id="results">${studyResults()}</div>`;
  }

  function studyResults() {
    const q = studySearch.trim().toLowerCase();
    const topics = allTopics().filter((t) => (!studyFilter || t.subject === studyFilter) &&
      (!q || t.name.toLowerCase().includes(q) || SUBJECT[t.subject].label.toLowerCase().includes(q)));
    const sections = SUBJECTS.map((s) => {
      const list = topics.filter((t) => t.subject === s.key);
      if (!list.length) return "";
      return `<section class="subject"><h3><i style="color:${s.color}">${esc(s.glyph)}</i>${esc(s.label)}<span>${list.length}</span></h3>
        ${list.map(topicRow).join("")}</section>`;
    }).join("");
    return `${sections || `<div class="empty"><b>No matches</b><p class="muted">Tap “Any topic” to have Claude write questions on “${esc(studySearch)}”.</p></div>`}`;
  }

  function topicRow(t) {
    const s = state.topics[t.id], sub = SUBJECT[t.subject];
    const meta = s && s.answered
      ? `<div class="row-meta">${bar(mastery(s), sub.color)}<span>${Math.round((s.correct / s.answered) * 100)}%</span></div>`
      : `<span class="muted small">${badge(t)}</span>`;
    return `<button class="topic" data-action="topic" data-id="${esc(t.id)}">
      <span class="glyph soft" style="--c:${sub.color}">${t.kind === "ai" ? icon("spark") : esc(sub.glyph)}</span>
      <span class="topic-main"><b>${esc(t.name)}</b>${meta}</span><span class="chev">›</span></button>`;
  }

  function trophiesView() {
    const lp = levelProgress(state.xp);
    const acc = state.totalAnswered ? Math.round((state.totalCorrect / state.totalAnswered) * 100) : 0;
    const stats = [["Streak", currentStreak()], ["Best streak", state.bestStreak], ["Freezes", state.freezes],
      ["Correct", state.totalCorrect.toLocaleString()], ["Accuracy", acc + "%"], ["Best combo", state.bestCombo]];
    return `
      <header class="top"><h1>Trophies</h1></header>
      <section class="card level">
        <div class="ring-wrap small">${ring(lp.into / lp.needed, 96, 10)}<div class="ring-label"><strong>${lp.level}</strong></div></div>
        <div><h2>${levelTitle(lp.level)}</h2><p class="muted">${state.xp.toLocaleString()} total XP</p><p class="accent">${lp.needed - lp.into} XP to level ${lp.level + 1}</p></div>
      </section>
      <div class="stats">${stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("")}</div>
      <p class="section-label">Study history</p>
      <section class="card">${heatmap()}</section>
      <p class="section-label">Achievements · ${state.unlocked.length}/${ACHIEVEMENTS.length}</p>
      <div class="badges">${ACHIEVEMENTS.map((a) => {
        const on = state.unlocked.includes(a.id);
        return `<div class="badge ${on ? "on" : ""}"><span class="medal">${on ? "★" : icon("lock")}</span><b>${esc(a.title)}</b><span>${esc(a.detail)}</span><em>+${a.reward}</em></div>`;
      }).join("")}</div>`;
  }

  function heatmap() {
    const weeks = 15, now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - now.getDay() - (weeks - 1) * 7);
    let cells = "";
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(start); date.setDate(start.getDate() + w * 7 + d);
        const log = state.days[dayKey(date)];
        let cls = "";
        if (date > now) cls = "future";
        else if (log?.goalMet) cls = "met";
        else if (log?.correct) cls = log.correct >= state.settings.dailyGoal / 2 ? "l2" : "l1";
        cells += `<i class="${cls}" style="grid-column:${w + 1};grid-row:${d + 1}" title="${dayKey(date)}: ${log?.correct || 0} correct"></i>`;
      }
    }
    return `<div class="heat">${cells}</div><div class="legend"><span>Less</span><i></i><i class="l1"></i><i class="l2"></i><span>More</span><i class="met"></i><span>Goal met</span></div>`;
  }

  function settingsView() {
    const s = state.settings;
    const perm = notifySupported() ? Notification.permission : "unsupported";
    const permText = { granted: "On", denied: "Blocked in browser settings", default: "Off", unsupported: isIOS() && !standalone() ? "Add to Home Screen first" : "Not supported here" }[perm];
    return `
      <header class="top"><h1>Settings</h1></header>
      ${settingsNote ? `<p class="note">${esc(settingsNote)}</p>` : ""}

      <p class="section-label">Daily intake</p>
      <section class="card list">
        ${stepRow("Correct answers per day", "dailyGoal", s.dailyGoal)}
        ${stepRow("of which SAT", "satMinimum", s.satMinimum)}
        ${stepRow("Questions per round", "sessionLength", s.sessionLength)}
        <label class="row"><span>Strict mode<small>Each wrong answer takes one correct answer off today's progress.</small></span>
          <input type="checkbox" class="switch" data-action="toggle" data-k="strictMode" ${s.strictMode ? "checked" : ""}></label>
      </section>

      <p class="section-label">Reminders</p>
      <section class="card list">
        <div class="row"><span>Notifications<small>${permText}</small></span>
          ${perm === "default" || perm === "unsupported" ? `<button class="btn small" data-action="enable-notifs">Enable</button>` : perm === "granted" ? `<button class="btn small ghost" data-action="test-notif">Test</button>` : ""}</div>
        ${s.reminders.map((t, i) => `<div class="row"><span>Reminder ${i + 1}</span><span class="inline">
          <input type="time" id="rem-${i}" data-action="reminder" data-i="${i}" value="${esc(t)}"><button class="icon-btn" data-action="del-reminder" data-i="${i}" aria-label="Remove reminder">${icon("x")}</button></span></div>`).join("")}
        ${s.reminders.length < 6 ? `<button class="row link" data-action="add-reminder">+ Add reminder time</button>` : ""}
      </section>
      <p class="fine">Reminders fire while PhoneLock is open or in the background. The Home Screen icon badge shows how many answers you still need. For reminders when the app is fully closed, set up background push below.</p>

      <p class="section-label">Shop</p>
      <section class="card list">
        <div class="row"><span>Coins</span><b>${state.coins}</b></div>
        <div class="row"><span>Streak freeze (${state.freezes}/3)<small>Covers one missed day.</small></span>
          <button class="btn small" data-action="buy-freeze" ${state.coins < FREEZE_COST || state.freezes >= 3 ? "disabled" : ""}>${FREEZE_COST} coins</button></div>
      </section>

      <p class="section-label">AI topics</p>
      <section class="card list">
        <label class="row col"><span>Anthropic API key<small>Stored only in this browser. Requests go straight to the Claude API.</small></span>
          <input type="password" id="api-key" placeholder="sk-ant-…" value="${esc(s.apiKey)}" autocomplete="off"></label>
        <label class="row"><span>Model</span><select id="ai-model">${MODELS.map((m) => `<option ${m === s.aiModel ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      </section>
      <p class="fine">${DATA.aiTopics.reduce((n, g) => n + g.names.length, 0)} AI topics, plus anything you type under Study → Any topic. Get a key at console.anthropic.com.</p>

      <p class="section-label">My decks</p>
      <section class="card list">
        ${state.customDecks.map((d) => `<div class="row"><span>${esc(d.name)}<small>${d.pairs.length} cards</small></span><button class="icon-btn" data-action="del-deck" data-id="${esc(d.id)}" aria-label="Delete deck">${icon("x")}</button></div>`).join("")}
        ${state.customAI.map((n) => `<div class="row"><span>${esc(n)}<small>AI topic</small></span><button class="icon-btn" data-action="del-ai" data-name="${esc(n)}" aria-label="Delete topic">${icon("x")}</button></div>`).join("")}
        <details class="row col"><summary>+ New flashcard deck</summary>
          <input id="deck-name" placeholder="Deck name, e.g. AP Bio Unit 3">
          <textarea id="deck-text" rows="7" placeholder="One card per line:&#10;mitochondria | powerhouse of the cell&#10;ribosome | makes proteins"></textarea>
          <button class="btn small" data-action="save-deck">Save deck</button>
        </details>
      </section>

      <p class="section-label">Background push (optional)</p>
      <section class="card list">
        <button class="row link" data-action="gen-keys">Generate push keys</button>
        ${generatedPrivateKey ? `<label class="row col"><span>Private key: copy it now<small>Save it as the VAPID_PRIVATE_KEY secret in GitHub. It isn't stored here and won't be shown again.</small></span>
          <textarea id="priv-key" rows="2" readonly>${esc(generatedPrivateKey)}</textarea><button class="btn small" data-action="copy-priv">Copy private key</button></label>` : ""}
        <label class="row col"><span>VAPID public key<small>Save it as the VAPID_PUBLIC_KEY secret too. See the README's “Background reminders” section.</small></span>
          <input id="vapid" placeholder="BExample…" value="${esc(s.vapidKey)}" autocomplete="off"></label>
        <button class="row link" data-action="subscribe-push">Create push subscription</button>
        ${subscriptionJSON ? `<label class="row col"><span>Your subscription<small>Save it as the PUSH_SUBSCRIPTIONS secret in GitHub.</small></span>
          <textarea id="sub-json" rows="4" readonly>${esc(subscriptionJSON)}</textarea><button class="btn small" data-action="copy-sub">Copy</button></label>` : ""}
      </section>

      <p class="section-label">Data</p>
      <section class="card list">
        <button class="row link" data-action="export">Copy backup to clipboard</button>
        <details class="row col"><summary>Restore from backup</summary>
          <textarea id="import-text" rows="4" placeholder="Paste a backup here"></textarea>
          <button class="btn small" data-action="import">Restore</button></details>
        <details class="row col danger"><summary>Reset progress</summary>
          <p class="muted">This clears XP, streaks and stats. Settings and decks stay.</p>
          <button class="btn small danger" data-action="reset">Reset progress</button></details>
      </section>
      <p class="fine center">PhoneLock Web · progress is saved on this device</p>`;
  }

  function stepRow(label, key, value) {
    return `<div class="row"><span>${label}</span><div class="stepper"><button data-action="step" data-k="${key}" data-d="-5" aria-label="Decrease">−</button><output>${value}</output><button data-action="step" data-k="${key}" data-d="5" aria-label="Increase">+</button></div></div>`;
  }

  const LIMITS = { dailyGoal: [5, 500], satMinimum: [0, 500], sessionLength: [5, 30] };
  function clampSetting(k, v) {
    const [lo, hi] = LIMITS[k];
    v = Math.max(lo, Math.min(hi, v));
    if (k === "satMinimum") v = Math.min(v, state.settings.dailyGoal);
    return v;
  }

  // ---------- Quiz ----------

  let quiz = null;

  async function openSession(mode) {
    haptic();
    quiz = { mode, questions: [], index: 0, selected: null, combo: quiz?.combo || 0, best: 0, correct: 0, xp: 0, loading: true, error: "", done: false };
    document.body.classList.add("quiz-open");
    renderQuiz();
    try {
      const qs = await buildSession(mode);
      if (!qs.length) throw new Error(mode.type === "mistakes" ? "No mistakes to review. Nice work." : "No questions available for this topic.");
      Object.assign(quiz, { questions: qs, loading: false, enter: true });
    } catch (e) {
      Object.assign(quiz, { loading: false, error: e.message });
    }
    renderQuiz();
  }

  function modeTitle(m) {
    return { sat: "SAT Sprint", daily: "Daily Mix", mistakes: "Mistake Review" }[m.type] || m.topic.name;
  }

  function closeQuiz() {
    quiz = null;
    document.body.classList.remove("quiz-open");
    $("#quiz").innerHTML = "";
    $("#quiz").hidden = true;
    render();
  }

  function renderQuiz() {
    const el = $("#quiz");
    el.hidden = false;
    const q = quiz.questions[quiz.index];
    const enter = quiz.enter;
    quiz.enter = false;
    const progress = quiz.questions.length ? (quiz.index + (quiz.selected == null ? 0 : 1)) / quiz.questions.length : 0;
    let body;
    if (quiz.loading) {
      body = `<div class="center-fill"><div class="spinner"></div><p class="muted">${quiz.mode.topic?.kind === "ai" ? "Claude is writing your questions…" : "Loading…"}</p></div>`;
    } else if (quiz.error) {
      body = `<div class="center-fill"><b>Couldn't start</b><p class="muted">${esc(quiz.error)}</p><button class="btn primary" data-action="retry">Try again</button></div>`;
    } else if (quiz.done) {
      body = summaryView();
    } else {
      const letters = "ABCDEF";
      const answered = quiz.selected != null;
      body = `
        <div class="q-head"><span>${esc(modeTitle(quiz.mode))}</span><span>${quiz.index + 1} / ${quiz.questions.length}</span></div>
        <div class="q-scroll">
          <div class="prompt card ${enter ? "enter" : ""}">${esc(q.prompt)}${quiz.float ? `<span class="float-xp">+${quiz.float} XP</span>` : ""}</div>
          <div class="answers ${quiz.shake ? "shake" : ""}">
            ${q.choices.map((c, i) => {
              let cls = "";
              if (answered) cls = i === q.answerIndex ? "correct" : i === quiz.selected ? "wrong" : "dim";
              return `<button class="answer ${cls}" data-action="answer" data-i="${i}" ${answered ? "disabled" : ""}><span class="letter">${letters[i] || "•"}</span><span>${esc(c)}</span>${cls === "correct" ? icon("check") : cls === "wrong" ? icon("x") : ""}</button>`;
            }).join("")}
          </div>
          ${answered && quiz.selected !== q.answerIndex && q.explanation ? `<div class="explain card">${icon("bulb")}<p>${esc(q.explanation)}</p></div>` : ""}
        </div>
        ${answered ? `<button class="btn primary ${quiz.selected === q.answerIndex ? "good" : ""}" data-action="next">${quiz.index + 1 < quiz.questions.length ? "Continue" : "Finish"}</button>` : ""}`;
    }
    el.innerHTML = `
      <div class="quiz-inner">
        <div class="q-top">
          <button class="icon-btn" data-action="close-quiz" aria-label="Close">${icon("close")}</button>
          ${bar(progress, "var(--cyan)")}
          <span class="combo ${quiz.combo >= 3 ? "hot" : ""}">${icon("flame")}${quiz.combo}</span>
        </div>
        ${body}
      </div>`;
  }

  function answer(i) {
    const q = quiz.questions[quiz.index];
    if (quiz.selected != null) return;
    const correct = i === q.answerIndex;
    quiz.selected = i;
    if (correct) { quiz.combo++; quiz.best = Math.max(quiz.best, quiz.combo); quiz.correct++; haptic(15); }
    else { quiz.combo = 0; quiz.shake = true; haptic([30, 40, 30]); }
    const xp = record(q, correct, quiz.combo);
    quiz.xp += xp;
    quiz.float = xp || 0;
    renderQuiz();
    quiz.shake = false;
    setTimeout(() => { if (quiz) { quiz.float = 0; const f = document.querySelector(".float-xp"); if (f) f.remove(); } }, 900);
    flushEvents();
  }

  function next() {
    haptic();
    if (quiz.index + 1 < quiz.questions.length) {
      quiz.index++; quiz.selected = null; quiz.enter = true;
    } else {
      if (quiz.questions.length >= 5 && quiz.correct === quiz.questions.length) { state.perfectSessions++; checkAchievements(); save(); }
      quiz.done = true;
    }
    renderQuiz();
    $("#quiz").scrollTop = 0;
    flushEvents();
  }

  function summaryView() {
    const n = quiz.questions.length, acc = n ? quiz.correct / n : 0;
    const title = acc === 1 ? "Flawless round" : acc >= 0.8 ? "Great round" : acc >= 0.5 ? "Solid work" : "Keep pushing";
    return `<div class="summary">
      <div class="ring-wrap">${ring(acc, 160, 14, "done")}<div class="ring-label"><strong>${Math.round(acc * 100)}%</strong><span>accuracy</span></div></div>
      <h2>${title}</h2>
      <div class="stats three"><div class="stat"><b>${quiz.correct}/${n}</b><span>correct</span></div><div class="stat"><b>+${quiz.xp}</b><span>XP</span></div><div class="stat"><b>${quiz.best}</b><span>best combo</span></div></div>
      <div class="card req"><div class="req-row"><span>Daily goal</span><b>${goalMet() ? "Complete" : Math.round(goalFraction() * 100) + "%"}</b></div>${bar(goalFraction(), goalMet() ? "var(--mint)" : "var(--violet)")}
        ${goalMet() ? "" : `<p class="muted small">${esc(remainingText())}</p>`}</div>
      <button class="btn primary" data-action="again">Another round</button>
      <button class="btn ghost" data-action="close-quiz">Done</button>
    </div>`;
  }

  // ---------- Toasts & confetti ----------

  let toastBusy = false;
  function flushEvents() {
    if (toastBusy || !events.length) return;
    const e = events.shift();
    toastBusy = true;
    let title, sub;
    if (e.type === "level") { title = `Level ${e.level}: ${levelTitle(e.level)}`; sub = `+${20 * e.level} coins`; }
    else if (e.type === "goal") { title = "Daily goal complete"; sub = `Streak: ${currentStreak()} ${currentStreak() === 1 ? "day" : "days"}. Coins added.`; confetti(); }
    else { const a = ACHIEVEMENTS.find((x) => x.id === e.id); title = `Trophy: ${a.title}`; sub = `${a.detail} · +${a.reward} coins`; }
    const t = $("#toast");
    t.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`;
    t.classList.add("show");
    haptic([10, 30, 10]);
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => { toastBusy = false; flushEvents(); }, 350);
    }, e.type === "goal" ? 3200 : 2300);
  }

  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = $("#confetti"), ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ["#8b6cff", "#4fd8f7", "#ff6fa8", "#ffc94d", "#46e8a3"];
    const bits = Array.from({ length: 140 }, () => ({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4,
      vy: 3 + Math.random() * 4, vx: -1.5 + Math.random() * 3, s: 6 + Math.random() * 6, a: Math.random() * 6, va: -0.2 + Math.random() * 0.4, c: colors[Math.floor(Math.random() * 5)] }));
    const startT = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.a += b.va;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
      }
      if (t - startT < 3500) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(startT);
  }

  // ---------- Events ----------

  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-action]");
    if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    const a = el.dataset.action;
    switch (a) {
      case "tab": tab = el.dataset.tab; settingsNote = ""; haptic(); render(); window.scrollTo(0, 0); break;
      case "ob-step": case "step": {
        const k = el.dataset.k;
        state.settings[k] = clampSetting(k, state.settings[k] + Number(el.dataset.d));
        if (state.settings.satMinimum > state.settings.dailyGoal) state.settings.satMinimum = state.settings.dailyGoal;
        checkGoal(); save(); render(); flushEvents(); break;
      }
      case "start": state.onboarded = true; save(); render(); break;
      case "session": openSession({ type: el.dataset.mode }); break;
      case "tile": {
        const m = el.dataset.mode;
        if (m === "browse") { tab = "study"; render(); window.scrollTo(0, 0); }
        else if (m === "trophies") { tab = "trophies"; render(); window.scrollTo(0, 0); }
        else if (m === "mistakes" && !state.mistakes.length) { el.classList.add("nudge"); setTimeout(() => el.classList.remove("nudge"), 400); }
        else openSession({ type: m });
        break;
      }
      case "topic": { const t = topicById(el.dataset.id); if (t) openSession({ type: "topic", topic: t }); break; }
      case "filter": studyFilter = el.dataset.subject || null; haptic(); render(); break;
      case "custom-ai": {
        const name = studySearch.trim();
        if (!name) { $("#search").focus(); $("#search").placeholder = "Type any topic, then tap Any topic"; break; }
        if (!state.customAI.includes(name)) state.customAI.push(name);
        save();
        openSession({ type: "topic", topic: { id: aiId(name), name, subject: "custom", kind: "ai", prompt: name } });
        break;
      }
      case "answer": answer(Number(el.dataset.i)); break;
      case "next": next(); break;
      case "again": case "retry": openSession(quiz.mode); break;
      case "close-quiz": closeQuiz(); break;
      case "enable-notifs": {
        if (!notifySupported()) {
          settingsNote = isIOS() && !standalone() ? "On iPhone, notifications only work after you add PhoneLock to your Home Screen and open it from there." : "This browser doesn't support notifications.";
          tab = "settings"; render(); break;
        }
        const p = await Notification.requestPermission();
        settingsNote = p === "granted" ? "Reminders are on." : "Notifications are blocked. You can allow them in your browser or iOS Settings.";
        if (p === "granted") notify("PhoneLock", "Reminders are on. You'll get a nudge at your reminder times.");
        render(); break;
      }
      case "test-notif": {
        const ok = await notify("PhoneLock", reminderMessage());
        settingsNote = ok ? "Test notification sent." : "Couldn't show a notification. Check your notification settings.";
        render(); break;
      }
      case "add-reminder": state.settings.reminders = [...state.settings.reminders, "21:00"]; save(); render(); break;
      case "del-reminder": state.settings.reminders = state.settings.reminders.filter((_, i) => i !== Number(el.dataset.i)); save(); render(); break;
      case "buy-freeze":
        if (state.coins >= FREEZE_COST && state.freezes < 3) { state.coins -= FREEZE_COST; state.freezes++; settingsNote = "Streak freeze added."; save(); }
        render(); break;
      case "del-deck": state.customDecks = state.customDecks.filter((d) => d.id !== el.dataset.id); save(); render(); break;
      case "del-ai": state.customAI = state.customAI.filter((n) => n !== el.dataset.name); save(); render(); break;
      case "save-deck": {
        const name = $("#deck-name").value.trim() || "My deck";
        const pairs = parseDeck($("#deck-text").value);
        if (pairs.length < 4) { settingsNote = `Found ${pairs.length} cards. A deck needs at least 4 lines like “term | definition”.`; render(); break; }
        state.customDecks.push({ id: uid(), name, pairs });
        settingsNote = `Saved “${name}” with ${pairs.length} cards. Find it under Study → My Topics.`;
        save(); render(); break;
      }
      case "subscribe-push": await subscribePush(); render(); break;
      case "gen-keys": {
        try {
          const keys = await generateVapidKeys();
          state.settings.vapidKey = keys.publicKey;
          generatedPrivateKey = keys.privateKey;
          subscriptionJSON = "";
          settingsNote = "New push keys created. Copy the private key now, then tap Create push subscription.";
          save();
        } catch (e) { settingsNote = "This browser can't generate keys. Run npx web-push generate-vapid-keys on a computer instead."; }
        render(); break;
      }
      case "copy-priv": copyText(generatedPrivateKey, "#priv-key"); settingsNote = "Private key copied."; render(); break;
      case "copy-sub": copyText(subscriptionJSON, "#sub-json"); settingsNote = "Subscription copied."; render(); break;
      case "export": {
        const backup = JSON.stringify({ ...state, settings: { ...state.settings, apiKey: "" } });
        copyText(backup);
        settingsNote = "Backup copied. Your API key is not included."; render(); break;
      }
      case "import": {
        try {
          const data = JSON.parse($("#import-text").value);
          const key = state.settings.apiKey;
          state = { ...DEFAULT_STATE, ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}), apiKey: key } };
          settingsNote = "Backup restored."; save();
        } catch (e) { settingsNote = "That doesn't look like a PhoneLock backup. Paste the full text you copied."; }
        render(); break;
      }
      case "reset": {
        const keep = { settings: state.settings, customDecks: state.customDecks, customAI: state.customAI, onboarded: true };
        state = { ...JSON.parse(JSON.stringify(DEFAULT_STATE)), ...keep };
        settingsNote = "Progress reset."; save(); render(); break;
      }
    }
  });

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.id === "search") {
      studySearch = t.value;
      $("#results").innerHTML = studyResults();
    }
  });

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.action === "toggle") { state.settings[t.dataset.k] = t.checked; save(); }
    else if (t.dataset.action === "reminder") {
      const list = [...state.settings.reminders]; list[Number(t.dataset.i)] = t.value || "20:00";
      state.settings.reminders = list; save();
    }
    else if (t.id === "api-key") { state.settings.apiKey = t.value.trim(); save(); settingsNote = t.value ? "API key saved on this device." : "API key removed."; render(); }
    else if (t.id === "ai-model") { state.settings.aiModel = t.value; save(); }
    else if (t.id === "vapid") { state.settings.vapidKey = t.value.trim(); save(); }
  });

  function parseDeck(text) {
    return text.split("\n").map((line) => {
      for (const sep of ["|", " - ", " — ", "\t", ":"]) {
        const i = line.indexOf(sep);
        if (i > 0) {
          const a = line.slice(0, i).trim(), b = line.slice(i + sep.length).trim();
          if (a && b) return [a, b];
        }
      }
      return null;
    }).filter(Boolean);
  }

  function copyText(text, selectEl) {
    const fallback = () => { const el = selectEl && $(selectEl); if (el) { el.focus(); el.select(); } };
    try { navigator.clipboard.writeText(text).catch(fallback); } catch (e) { fallback(); }
  }

  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  /// VAPID keys are a P-256 key pair: public = uncompressed point (65 bytes), private = the 32-byte scalar, both base64url.
  async function generateVapidKeys() {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    return { publicKey: b64url(raw), privateKey: jwk.d };
  }

  async function subscribePush() {
    const key = state.settings.vapidKey;
    if (!key) { settingsNote = "Paste your VAPID public key first."; return; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      settingsNote = isIOS() && !standalone() ? "Open PhoneLock from your Home Screen to set up push." : "This browser doesn't support push notifications.";
      return;
    }
    try {
      if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") {
        settingsNote = "Allow notifications first."; return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const current = sub?.options?.applicationServerKey;
      if (sub && current && b64url(new Uint8Array(current)) !== key) { await sub.unsubscribe(); sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
      subscriptionJSON = JSON.stringify(sub);
      settingsNote = "Push subscription created. Copy it into GitHub as described in the README.";
    } catch (e) {
      settingsNote = `Couldn't subscribe: ${e.message}`;
    }
  }

  // ---------- Boot ----------

  render();
  checkReminders();
  updateAppBadge();
  if (new URLSearchParams(location.search).get("start") === "daily" && state.onboarded) openSession({ type: "daily" });
})();
