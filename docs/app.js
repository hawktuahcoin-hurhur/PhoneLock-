// PhoneLock Web: a hunter-style study RPG with daily quests, gates and reminders. No build step; plain browser JavaScript.
(function () {
  "use strict";

  const DATA = window.PL_DATA;
  const GEN = window.PL_GENERATORS;
  const STORAGE_KEY = "phonelock.web.v1";
  const MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];
  const FREEZE_COST = 150;
  const POTION_COST = 60;

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

  async function buildSession(mode, count = state.settings.sessionLength) {
    const fill = (pool) => Array.from({ length: count }, () => oneFrom(GEN.pick(pool))).filter(Boolean);
    if (mode.type === "sat" || mode.type === "penalty") return fill(SAT_TOPICS);
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
    dailyGoal: 30, satMinimum: 10, strictMode: false, sessionLength: 10, requireGate: true,
    aiModel: "claude-opus-5", apiKey: "", reminders: ["16:00", "20:00"], vapidKey: "",
  };
  const DEFAULT_HUNTER = {
    name: "", stats: { str: 10, agi: 10, vit: 10, int: 10, sen: 10 }, points: 0,
    job: null, title: null, shadows: [], potions: 2,
  };
  const DEFAULT_STATE = {
    onboarded: false, xp: 0, coins: 0, streak: 0, bestStreak: 0, freezes: 0, lastGoalDay: null,
    totalAnswered: 0, totalCorrect: 0, bestCombo: 0, perfectSessions: 0, gatesCleared: 0, bossesSlain: 0,
    days: {}, topics: {}, mistakes: [], unlocked: [], customDecks: [], customAI: [], aiCache: {}, fired: {},
    penalty: null, lastSeenDay: null,
    settings: DEFAULT_SETTINGS, hunter: DEFAULT_HUNTER,
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) {
        const hunter = { ...clone(DEFAULT_HUNTER), ...(saved.hunter || {}) };
        hunter.stats = { ...DEFAULT_HUNTER.stats, ...(hunter.stats || {}) };
        return { ...clone(DEFAULT_STATE), ...saved, settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) }, hunter };
      }
    } catch (e) { /* storage unavailable: start fresh */ }
    return clone(DEFAULT_STATE);
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

  const EMPTY_DAY = { correct: 0, satCorrect: 0, answered: 0, xp: 0, goalMet: false, gates: [], claimed: false };
  const today = () => ({ ...EMPTY_DAY, ...(state.days[dayKey()] || {}) });
  const setToday = (d) => { state.days[dayKey()] = d; };
  const mastery = (s) => Math.min(1, s.correct / 40) * (0.4 + 0.6 * (s.answered ? s.correct / s.answered : 0));

  // ---------- Hunter: level, rank, stats, jobs ----------

  const xpFor = (l) => 50 * (l - 1) * l;
  const levelFor = (xp) => { let l = 1; while (xpFor(l + 1) <= xp) l++; return l; };
  function levelProgress(xp) { const l = levelFor(xp), base = xpFor(l); return { level: l, into: xp - base, needed: xpFor(l + 1) - base }; }
  const level = () => levelFor(state.xp);

  const RANKS = ["E", "D", "C", "B", "A", "S"];
  const RANK_COLORS = { E: "#9aa4b8", D: "#45d98f", C: "#3cc8f4", B: "#5a82ff", A: "#b16bff", S: "#ffc54a" };
  const rankIndexFor = (l) => (l < 10 ? 0 : l < 20 ? 1 : l < 35 ? 2 : l < 50 ? 3 : l < 70 ? 4 : 5);
  const hunterRank = () => RANKS[rankIndexFor(level())];

  const JOBS = {
    arcanist: { name: "Arcanist", perk: "+10% EXP from every answer" },
    blademaster: { name: "Blademaster", perk: "+25% damage in gates" },
    phantom: { name: "Phantom", perk: "+10% critical and dodge chance" },
    guardian: { name: "Guardian", perk: "+50 max HP in gates" },
    oracle: { name: "Oracle", perk: "+2 Detect uses per gate" },
  };
  const hasJob = (j) => state.hunter.job === j;

  const STATS = [
    ["str", "STR", "Damage dealt in gates"],
    ["agi", "AGI", "Critical hit and dodge chance"],
    ["vit", "VIT", "Max HP in gates"],
    ["int", "INT", "Bonus EXP from answers"],
    ["sen", "SEN", "Detect uses and gold found"],
  ];
  const S = (k) => state.hunter.stats[k];
  const shadowBonus = () => Math.min(0.25, state.hunter.shadows.length * 0.01);
  const derived = () => ({
    xpMult: 1 + (S("int") - 10) * 0.01 + shadowBonus() + (hasJob("arcanist") ? 0.1 : 0),
    maxHp: 100 + (S("vit") - 10) * 8 + (hasJob("guardian") ? 50 : 0),
    damage: Math.round((20 + (S("str") - 10) * 2) * (hasJob("blademaster") ? 1.25 : 1)),
    crit: Math.min(0.5, 0.05 + (S("agi") - 10) * 0.008 + (hasJob("phantom") ? 0.1 : 0)),
    dodge: Math.min(0.45, 0.05 + (S("agi") - 10) * 0.008 + (hasJob("phantom") ? 0.1 : 0)),
    detect: 1 + Math.floor((S("sen") - 10) / 8) + (hasJob("oracle") ? 2 : 0),
    goldMult: 1 + (S("sen") - 10) * 0.01,
  });

  // ---------- Daily quest ----------

  function questObjectives() {
    const s = state.settings, d = today();
    const list = [
      { id: "solve", label: "Solve problems", have: Math.min(d.correct, s.dailyGoal), need: s.dailyGoal },
    ];
    if (s.satMinimum) list.push({ id: "sat", label: "SAT drills", have: Math.min(d.satCorrect, s.satMinimum), need: s.satMinimum });
    if (s.requireGate) list.push({ id: "gate", label: "Clear a gate", have: Math.min(d.gates.length, 1), need: 1 });
    if (penaltyActive() || (state.penalty?.day === dayKey())) list.push({ id: "penalty", label: "Survive the Penalty Zone", have: state.penalty.cleared ? 1 : 0, need: 1, danger: true });
    return list;
  }
  const questDone = () => questObjectives().every((o) => o.have >= o.need);
  const goalMet = () => today().goalMet;
  const penaltyActive = () => state.penalty && state.penalty.day === dayKey() && !state.penalty.cleared;

  function questFraction() {
    const objs = questObjectives();
    return objs.reduce((s, o) => s + o.have / o.need, 0) / objs.length;
  }

  function remainingText() {
    if (goalMet()) return "Daily quest complete.";
    const left = questObjectives().filter((o) => o.have < o.need).map((o) =>
      o.id === "solve" ? `${o.need - o.have} problems` : o.id === "sat" ? `${o.need - o.have} SAT drills` : o.id === "gate" ? "1 gate" : "the Penalty Zone");
    return `Remaining: ${left.join(", ")}.`;
  }
  const remainingCount = () => (goalMet() ? 0 : questObjectives().reduce((s, o) => s + Math.max(0, o.need - o.have), 0));

  function currentStreak() {
    if (!state.lastGoalDay) return 0;
    const gap = daysBetween(state.lastGoalDay, dayKey());
    if (gap <= 1) return state.streak;
    return gap - 1 <= state.freezes ? state.streak : 0;
  }

  /// A missed daily quest (or a skipped day) issues today's Penalty Quest.
  function evaluatePenalty() {
    const key = dayKey();
    if (!state.onboarded) return;
    if (!state.lastSeenDay) { state.lastSeenDay = key; save(); return; }
    if (state.lastSeenDay === key) return;
    const prev = state.days[state.lastSeenDay];
    const missed = !prev?.goalMet || daysBetween(state.lastSeenDay, key) > 1;
    if (missed) {
      state.penalty = { day: key, cleared: false };
      events.push({ type: "penalty" });
    }
    state.lastSeenDay = key;
    save();
  }

  // ---------- Titles (achievements) ----------

  const satTotal = (p) => Object.values(p.days).reduce((s, d) => s + (d.satCorrect || 0), 0);
  const ACHIEVEMENTS = [
    ["first", "The Awakened", "Answer your first question", 10, (p) => p.totalAnswered >= 1],
    ["c100", "Hundred Cuts", "100 correct answers", 50, (p) => p.totalCorrect >= 100],
    ["c1000", "Thousand Blades", "1,000 correct answers", 200, (p) => p.totalCorrect >= 1000],
    ["c5000", "Unbreakable Mind", "5,000 correct answers", 500, (p) => p.totalCorrect >= 5000],
    ["goal1", "Quest Taker", "Complete a daily quest", 25, (p) => Object.values(p.days).some((d) => d.goalMet)],
    ["s3", "Persistent", "3-day streak", 30, (p) => p.bestStreak >= 3],
    ["s7", "Week of Trials", "7-day streak", 75, (p) => p.bestStreak >= 7],
    ["s30", "Iron Will", "30-day streak", 300, (p) => p.bestStreak >= 30],
    ["s100", "Unyielding", "100-day streak", 1000, (p) => p.bestStreak >= 100],
    ["combo10", "Chain Striker", "10-answer combo", 40, (p) => p.bestCombo >= 10],
    ["combo25", "Relentless", "25-answer combo", 120, (p) => p.bestCombo >= 25],
    ["gate1", "Gate Breaker", "Clear your first gate", 30, (p) => p.gatesCleared >= 1],
    ["gate25", "Dungeon Crawler", "Clear 25 gates", 200, (p) => p.gatesCleared >= 25],
    ["boss10", "Boss Hunter", "Slay 10 bosses", 150, (p) => p.bossesSlain >= 10],
    ["shadow1", "Commander", "Extract your first shadow", 60, (p) => p.hunter.shadows.length >= 1],
    ["shadow10", "Legion", "Command 10 shadows", 250, (p) => p.hunter.shadows.length >= 10],
    ["penalty", "Survivor", "Survive the Penalty Zone", 80, (p) => p.penalty?.cleared === true],
    ["sat500", "SAT Slayer", "500 correct SAT answers", 250, (p) => satTotal(p) >= 500],
    ["lvl10", "Job Qualified", "Reach level 10", 100, (p) => levelFor(p.xp) >= 10],
    ["rankb", "B-Rank Hunter", "Reach B rank", 300, (p) => levelFor(p.xp) >= 35],
    ["topics25", "Polymath", "Study 25 different topics", 150, (p) => Object.keys(p.topics).length >= 25],
  ].map(([id, title, detail, reward, earned]) => ({ id, title, detail, reward, earned }));

  // ---------- Game actions ----------

  const events = [];

  function gainXp(amount) {
    const before = level();
    state.xp += amount;
    const after = level();
    if (after > before) {
      state.hunter.points += 3 * (after - before);
      state.coins += 20 * after;
      events.push({ type: "level", level: after, rankUp: rankIndexFor(after) > rankIndexFor(before) });
    }
  }

  function record(q, correct, combo) {
    const topic = topicById(q.topicId);
    const sat = topic ? isSAT(topic) : q.topicId.startsWith("sat.");
    const day = today();
    const stat = { ...(state.topics[q.topicId] || { answered: 0, correct: 0 }) };
    state.totalAnswered++; day.answered++; stat.answered++;
    let xp = 0;
    if (correct) {
      xp = 10 + Math.min(combo, 10);
      if (sat) xp = Math.floor((xp * 3) / 2);
      xp = Math.round(xp * derived().xpMult);
      state.totalCorrect++; state.coins++;
      day.correct++; if (sat) day.satCorrect++;
      stat.correct++;
      state.bestCombo = Math.max(state.bestCombo, combo);
      state.mistakes = state.mistakes.filter((m) => m.id !== q.id);
    } else {
      if (state.settings.strictMode && day.correct > 0) day.correct--;
      if (!state.mistakes.some((m) => m.id === q.id)) state.mistakes = [...state.mistakes, q].slice(-150);
    }
    day.xp += xp;
    state.topics[q.topicId] = stat;
    setToday(day);
    gainXp(xp);
    checkGoal();
    checkAchievements();
    save();
    return xp;
  }

  function checkGoal() {
    if (goalMet() || !questDone()) return;
    const todayKey = dayKey();
    if (state.lastGoalDay && state.lastGoalDay !== todayKey) {
      const missed = daysBetween(state.lastGoalDay, todayKey) - 1;
      if (missed <= 0) state.streak++;
      else if (missed <= state.freezes) { state.freezes -= missed; state.streak++; }
      else state.streak = 1;
    } else if (!state.lastGoalDay) state.streak = 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.lastGoalDay = todayKey;
    setToday({ ...today(), goalMet: true });
    events.push({ type: "goal" });
  }

  function questReward() {
    const ri = rankIndexFor(level());
    return { points: 3, gold: Math.round((100 + ri * 50 + Math.min(currentStreak(), 30) * 5) * derived().goldMult), potions: 1 };
  }

  function claimQuest() {
    const d = today();
    if (!d.goalMet || d.claimed) return;
    const r = questReward();
    state.hunter.points += r.points;
    state.coins += r.gold;
    state.hunter.potions += r.potions;
    setToday({ ...d, claimed: true });
    events.push({ type: "reward", text: `+${r.points} stat points · +${r.gold} gold · +${r.potions} potion` });
    save();
  }

  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (!state.unlocked.includes(a.id) && a.earned(state)) {
        state.unlocked.push(a.id);
        state.coins += a.reward;
        events.push({ type: "title", id: a.id });
      }
    }
  }

  // ---------- Gates ----------

  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const GATE_SLOTS = [[16, 26], [52, 18], [84, 30], [30, 52], [70, 55], [14, 80], [48, 82], [86, 78]];
  const MINIONS = [["slime", "Slime"], ["goblin", "Goblin"], ["wolf", "Frost Wolf"], ["golem", "Stone Golem"]];
  const BOSSES = [["knight", "Fallen Knight"], ["demon", "Horned Demon"]];
  const RANK_PREFIX = ["Lesser", "Wild", "Savage", "Elite", "Ancient", "Monarch-class"];

  function gateConfig(ri, seed, kind) {
    const r = rng(seed);
    const q = [5, 6, 8, 10, 12, 15][ri] + (kind === "penalty" ? 3 : 0);
    const hits = Math.ceil(q * 0.7);
    const total = Math.round(hits * 20 * (1 + ri * 0.12));
    const count = q >= 10 ? 3 : 2;
    const boss = BOSSES[Math.floor(r() * BOSSES.length)];
    const monsters = [];
    for (let i = 0; i < count - 1; i++) {
      const m = MINIONS[Math.min(MINIONS.length - 1, Math.floor(r() * (2 + ri)) % MINIONS.length)];
      monsters.push({ kind: m[0], name: `${RANK_PREFIX[ri]} ${m[1]}`, boss: false, hp: Math.round((total * 0.55) / (count - 1)) });
    }
    monsters.push({ kind: boss[0], name: kind === "penalty" ? "Warden of the Penalty Zone" : kind === "job" ? "Trial Guardian" : `${boss[1]} (Boss)`, boss: true, hp: Math.round(total * 0.45) });
    return {
      questions: q,
      maxQuestions: q * 2,
      atk: [10, 13, 16, 20, 24, 30][ri] + (kind === "penalty" ? 6 : 0),
      xp: 25 * (ri + 1) + (kind === "penalty" ? 60 : kind === "job" ? 120 : 0),
      gold: 40 * (ri + 1),
      monsters: monsters.map((m) => ({ ...m, maxHp: m.hp, color: kind === "penalty" ? "#ff4058" : RANK_COLORS[RANKS[ri]] })),
    };
  }

  function todaysGates() {
    const key = dayKey();
    const seed = hashStr(key + "|" + (state.hunter.name || "hunter"));
    const r = rng(seed);
    const ri = rankIndexFor(level());
    // deterministic slot order for the day
    const order = GATE_SLOTS.map((_, i) => ({ i, k: rng(seed + i)() })).sort((a, b) => a.k - b.k).map((o) => o.i);
    const offsets = [-1, 0, 0, 1];
    const gates = offsets.map((off, n) => {
      const gri = Math.max(0, Math.min(5, ri + off));
      const pool = n === 0 ? SAT_TOPICS : OFFLINE;
      const topic = pool[Math.floor(r() * pool.length)];
      const [x, y] = GATE_SLOTS[order[n]];
      const id = `${key}#${n}`;
      return { id, kind: "gate", rank: RANKS[gri], ri: gri, topic, x, y, seed: seed + n * 97, cleared: today().gates.includes(id) };
    });
    if (penaltyActive()) {
      const [x, y] = GATE_SLOTS[order[4]];
      gates.unshift({ id: `${key}#penalty`, kind: "penalty", rank: RANKS[Math.min(5, ri + 1)], ri: Math.min(5, ri + 1), topic: null, x, y, seed: seed + 777, cleared: false });
    }
    if (level() >= 10 && !state.hunter.job) {
      const [x, y] = GATE_SLOTS[order[5]];
      gates.push({ id: "job-change", kind: "job", rank: "B", ri: 3, topic: null, x, y, seed: seed + 999, cleared: false });
    }
    return gates;
  }

  function gateTitle(g) {
    if (g.kind === "penalty") return "Penalty Zone";
    if (g.kind === "job") return "Job Change Trial";
    return `${g.rank}-Rank Gate`;
  }
  const gateTopicName = (g) => (g.kind === "penalty" ? "Mixed SAT" : g.kind === "job" ? "Mixed SAT" : g.topic.name);

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
      const objs = questObjectives();
      const get = (id) => objs.find((o) => o.id === id);
      const snapshot = { date: dayKey(), goalMet: goalMet(),
        remainingCorrect: get("solve") ? get("solve").need - get("solve").have : 0,
        remainingSAT: get("sat") ? get("sat").need - get("sat").have : 0,
        gateNeeded: !!get("gate") && get("gate").have < 1, penalty: penaltyActive(),
        dailyGoal: state.settings.dailyGoal, satMinimum: state.settings.satMinimum, streak: currentStreak() };
      await cache.put("state.json", new Response(JSON.stringify(snapshot), { headers: { "content-type": "application/json" } }));
    } catch (e) { /* cache unavailable */ }
  }

  function updateAppBadge() {
    try {
      const left = remainingCount();
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
    const left = remainingText();
    if (penaltyActive()) return `Penalty Quest active. ${left}`;
    return streak > 1 ? `Daily Quest: your ${streak}-day streak is on the line. ${left}` : `Daily Quest waiting. ${left}`;
  }

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
        if (!goalMet() && mins - (h * 60 + m) <= 60) notify("[ SYSTEM ]", reminderMessage());
      }
    }
    for (const id of Object.keys(state.fired)) if (!id.startsWith(key)) { delete state.fired[id]; changed = true; }
    if (changed) save();
  }
  setInterval(checkReminders, 30000);
  setInterval(() => { const c = document.getElementById("quest-timer"); if (c) c.textContent = timeLeft(); }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { evaluatePenalty(); checkReminders(); if (!raid && !quiz) render(); flushEvents(); }
  });

  function timeLeft() {
    const now = new Date(), end = new Date(now); end.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((end - now) / 1000));
    return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

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
    system: '<path d="M4 5h16v11H4zM9 20h6M12 16v4"/><path d="M8 10h3M8 12.5h6"/>',
    gates: '<ellipse cx="12" cy="12" rx="6" ry="8.5"/><ellipse cx="12" cy="12" rx="2.5" ry="4.5"/>',
    library: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5zM14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14z"/>',
    hunter: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1.2 2.6 2.3 2.9C10.6 9 11 6 12 3z"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/>',
    x: '<path d="M7 7l10 10M17 7L7 17"/>',
    potion: '<path d="M10 3h4M10.5 3v5L6 16a3.5 3.5 0 0 0 3 5h6a3.5 3.5 0 0 0 3-5l-4.5-8V3"/><path d="M8 15h8"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  };
  const icon = (name, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const gauge = (cls, label, have, max, text) =>
    `<div class="sys-gauge ${cls}"><b>${label}</b><div class="sys-track"><i style="width:${Math.max(0, Math.min(100, (have / Math.max(1, max)) * 100))}%"></i></div><span>${text ?? `${have}/${max}`}</span></div>`;
  const rankBadge = (r, cls = "") => `<span class="sys-rank ${cls}" data-rank="${r}">${r}</span>`;
  const tagBar = (text, bang = true) => `<div class="sys-tag">${bang ? '<span class="sys-bang">!</span>' : ""}<span>${esc(text)}</span></div>`;
  const bar = (v, color = "var(--glow)") => `<div class="sys-track"><i style="width:${Math.max(3, Math.min(100, v * 100))}%;--c:${color}"></i></div>`;

  // ---------- Views ----------

  let tab = "system";
  let studyFilter = null;
  let studySearch = "";
  let settingsNote = "";
  let subscriptionJSON = "";
  let generatedPrivateKey = "";
  let selectedGate = null;

  function render() {
    if (!state.onboarded) { $("#app").innerHTML = onboardingView(); return; }
    const views = { system: systemView, gates: gatesView, library: libraryView, hunter: hunterView, settings: settingsView };
    const scroll = window.scrollY;
    $("#app").innerHTML = `<main class="view" id="view-${tab}">${views[tab]()}</main>${tabBar()}${selectedGate ? gateModal(selectedGate) : ""}`;
    window.scrollTo(0, scroll);
  }

  function tabBar() {
    const tabs = [["system", "System"], ["gates", "Gates"], ["library", "Library"], ["hunter", "Hunter"], ["settings", "Settings"]];
    return `<nav class="tabbar" aria-label="Sections">${tabs.map(([k, label]) =>
      `<button class="tab ${tab === k ? "on" : ""}" data-action="tab" data-tab="${k}" aria-current="${tab === k ? "page" : "false"}">${icon(k)}<span>${label}</span>${k === "hunter" && state.hunter.points ? `<em class="dot">${state.hunter.points}</em>` : ""}</button>`).join("")}</nav>`;
  }

  function onboardingView() {
    const s = state.settings;
    return `<main class="view onboarding">
      <section class="sys-window">
        ${tagBar("Notification")}
        <p class="ob-lead">You have been chosen by the System.</p>
        <p class="muted center">Complete your Daily Quest to grow stronger. Clear gates, raise your rank from E to S, and build your shadow army.</p>
        <label class="field col" for="ob-name"><span class="sys-label">Hunter name</span>
          <input id="ob-name" maxlength="20" placeholder="Enter your name" value="${esc(state.hunter.name)}" autocomplete="off"></label>
        <div class="field"><span>Problems per day</span>
          <div class="stepper"><button data-action="ob-step" data-k="dailyGoal" data-d="-5" aria-label="Fewer">−</button><output class="sys-data">${s.dailyGoal}</output><button data-action="ob-step" data-k="dailyGoal" data-d="5" aria-label="More">+</button></div></div>
        <div class="field"><span>of which SAT</span>
          <div class="stepper"><button data-action="ob-step" data-k="satMinimum" data-d="-5" aria-label="Fewer">−</button><output class="sys-data">${s.satMinimum}</output><button data-action="ob-step" data-k="satMinimum" data-d="5" aria-label="More">+</button></div></div>
        <p class="sys-warning">Missing a Daily Quest issues a Penalty Quest the next day.</p>
        <div class="row-2">
          <button class="sys-btn is-primary" data-action="start">Accept</button>
          <button class="sys-btn is-ghost" data-action="decline">Decline</button>
        </div>
        <p class="muted center small" id="decline-note" hidden>Declining is not an option.</p>
      </section>
    </main>`;
  }

  function systemView() {
    const lp = levelProgress(state.xp), d = derived(), r = hunterRank(), h = state.hunter;
    const objs = questObjectives();
    const day = today();
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(); date.setDate(date.getDate() - (6 - i));
      const log = state.days[dayKey(date)];
      const label = date.toLocaleDateString(undefined, { weekday: "narrow" });
      const cls = log?.goalMet ? "met" : state.penalty?.day === dayKey(date) ? "pen" : log?.correct ? "some" : "";
      return `<div class="day ${cls} ${i === 6 ? "is-today" : ""}"><span>${label}</span><i>${log?.goalMet ? "✓" : log?.correct || ""}</i></div>`;
    }).join("");

    return `
      <section class="sys-window status-mini">
        <div class="status-head">
          ${rankBadge(r)}
          <div class="status-id">
            <span class="sys-label">Player</span>
            <h1 class="sys-title">${esc(h.name || "Hunter")}</h1>
            <div class="chips">${h.job ? `<span class="sys-chip">${esc(JOBS[h.job].name)}</span>` : `<span class="sys-chip">No job</span>`}${h.title ? `<span class="sys-chip is-gold">${esc(ACHIEVEMENTS.find((a) => a.id === h.title)?.title || "")}</span>` : ""}</div>
          </div>
          <div class="lv"><span class="sys-label">Level</span><b class="sys-data">${lp.level}</b></div>
        </div>
        ${gauge("is-hp", "HP", d.maxHp, d.maxHp)}
        ${gauge("is-mp", "MP", d.detect, d.detect, `${d.detect} DET`)}
        ${gauge("is-exp", "EXP", lp.into, lp.needed)}
        <div class="status-foot">
          <span class="sys-chip is-gold">${icon("coin")}${state.coins} G</span>
          <span class="sys-chip">${icon("flame")}${currentStreak()}-day streak</span>
          ${h.shadows.length ? `<span class="sys-chip is-shadow">${h.shadows.length} shadows</span>` : ""}
          ${h.points ? `<button class="sys-chip is-gold as-btn" data-action="tab" data-tab="hunter">+${h.points} stat points</button>` : ""}
        </div>
      </section>

      ${installCard()}

      ${penaltyActive() ? `<section class="sys-window is-danger">
        ${tagBar("Penalty Quest")}
        <p class="center"><b>You failed yesterday's Daily Quest.</b><br><span class="muted">Survive the Penalty Zone to complete today's quest.</span></p>
        <button class="sys-btn is-danger is-block" data-action="open-gate" data-id="${esc(dayKey())}#penalty">Enter the Penalty Zone</button>
      </section>` : ""}

      <section class="sys-window quest">
        ${tagBar("Daily Quest")}
        <p class="quest-name">Training of the Mind</p>
        <p class="sys-label center">Goals</p>
        <div class="objectives">
          ${objs.map((o) => `<div class="sys-objective ${o.have >= o.need ? "is-done" : ""} ${o.danger ? "is-danger" : ""}"><span class="sys-check">✓</span><span class="obj-label">${esc(o.label)}</span><span class="sys-data">[${o.have}/${o.need}]</span></div>`).join("")}
        </div>
        ${day.goalMet
          ? day.claimed
            ? `<p class="center ok">Quest complete. Reward claimed.</p>`
            : `<button class="sys-btn is-primary is-block pulse" data-action="claim">Claim reward</button>`
          : `<p class="center muted small">Time remaining <span class="sys-data" id="quest-timer">${timeLeft()}</span></p>
             <p class="sys-warning">Failing to complete the Daily Quest will issue a Penalty Quest.</p>`}
        <div class="row-2">
          <button class="sys-btn ${day.goalMet ? "" : "is-primary"}" data-action="session" data-mode="daily">Train</button>
          <button class="sys-btn" data-action="tab" data-tab="gates">Find a gate</button>
        </div>
      </section>

      <div class="row-2">
        <button class="tile" data-action="session" data-mode="sat"><span class="sys-label">Drill</span><b>SAT Sprint</b><span class="muted small">${state.settings.sessionLength} mixed SAT</span></button>
        <button class="tile" data-action="tile" data-mode="mistakes"><span class="sys-label">Review</span><b>Mistakes</b><span class="muted small">${state.mistakes.length} to redo</span></button>
      </div>

      <p class="section-label">Quest log</p>
      <section class="sys-window week">${week}</section>`;
  }

  function installCard() {
    if (standalone()) {
      if (notifySupported() && Notification.permission === "default") {
        return `<section class="sys-window hint">${icon("bell")}<div><b>Allow System notifications</b><p class="muted small">Get a Daily Quest reminder at your chosen times.</p></div><button class="sys-btn is-small" data-action="enable-notifs">Allow</button></section>`;
      }
      return "";
    }
    const how = isIOS() ? `In Safari, tap ${icon("share", "inline")} Share, then <b>Add to Home Screen</b>.` : "Use your browser menu and choose <b>Install app</b> or <b>Add to Home Screen</b>.";
    return `<section class="sys-window hint">${icon("share")}<div><b>Install the System</b><p class="muted small">${how} It opens full-screen, works offline, and can send quest reminders.</p></div></section>`;
  }

  function gatesView() {
    const gates = todaysGates();
    const lp = level();
    return `
      <header class="top"><h1 class="sys-title">Gates</h1><span class="sys-chip">Hunter rank ${rankBadge(hunterRank(), "is-sm")}</span></header>
      <section class="sys-window map-wrap">
        ${tagBar("Gate Detection", false)}
        ${mapSvg(gates)}
        <p class="muted small center">New gates open every day at midnight. Clear one to finish today's quest.</p>
      </section>
      <div class="gate-list">
        ${gates.map((g) => `<button class="gate-row ${g.cleared ? "is-cleared" : ""} ${g.kind}" data-action="select-gate" data-id="${esc(g.id)}">
          ${rankBadge(g.rank, "is-sm")}
          <span class="gate-main"><b>${esc(gateTitle(g))}</b><span class="muted small">${esc(gateTopicName(g))}</span></span>
          <span class="sys-chip ${g.cleared ? "" : g.kind === "penalty" ? "is-danger" : g.kind === "job" ? "is-gold" : ""}">${g.cleared ? "Cleared" : g.kind === "penalty" ? "Required" : g.kind === "job" ? "Trial" : "Open"}</span>
        </button>`).join("")}
      </div>
      ${lp < 10 ? `<p class="fine">Reach level 10 to unlock the Job Change Trial.</p>` : ""}`;
  }

  function mapSvg(gates) {
    // a stylized city grid, gates as glowing portals
    const blocks = [];
    const r = rng(hashStr(dayKey() + "map"));
    for (let x = 0; x < 6; x++) for (let y = 0; y < 5; y++) {
      if (r() < 0.18) continue;
      const w = 10 + r() * 4, h = 12 + r() * 5;
      blocks.push(`<rect x="${x * 17 + 2 + r() * 2}" y="${y * 20 + 2 + r() * 2}" width="${w}" height="${h}" class="blk"/>`);
    }
    const portals = gates.map((g) => {
      const c = g.kind === "penalty" ? "#ff4058" : g.kind === "job" ? "#ffc54a" : RANK_COLORS[g.rank];
      return `<g class="portal ${g.cleared ? "is-cleared" : ""}" data-action="select-gate" data-id="${esc(g.id)}" transform="translate(${g.x} ${g.y})" style="--c:${c}" role="button" tabindex="0" aria-label="${esc(gateTitle(g))}">
        <ellipse class="p-glow" rx="7" ry="9" fill="${c}"/>
        <ellipse class="p-ring" rx="4.6" ry="6.4" fill="#04060d" stroke="${c}"/>
        <ellipse class="p-core" rx="2.4" ry="3.8" fill="${c}"/>
        <text y="-11" text-anchor="middle" fill="${c}">${g.kind === "penalty" ? "!" : g.kind === "job" ? "J" : g.rank}</text>
      </g>`;
    }).join("");
    return `<svg class="map" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map of today's gates">
      <defs><pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#1a3a6b" stroke-width=".2"/></pattern></defs>
      <rect width="100" height="100" fill="#050a18"/><rect width="100" height="100" fill="url(#grid)"/>
      <path d="M-5 64 C 20 58, 36 74, 60 66 S 90 58, 105 68" class="river"/>
      ${blocks.join("")}
      <circle class="you" cx="50" cy="44" r="1.6"/><circle class="you-ring" cx="50" cy="44" r="4"/>
      ${portals}
    </svg>`;
  }

  function gateModal(id) {
    const g = todaysGates().find((x) => x.id === id);
    if (!g) return "";
    const cfg = gateConfig(g.ri, g.seed, g.kind);
    const danger = g.kind === "penalty";
    return `<div class="modal" data-action="close-modal"><section class="sys-window ${danger ? "is-danger" : g.kind === "job" ? "is-shadow" : ""} modal-card" data-stop>
      ${tagBar(danger ? "Penalty Zone" : g.kind === "job" ? "Job Change" : "Gate Detected")}
      <div class="gate-head">${rankBadge(g.rank)}<div><h2 class="sys-title">${esc(gateTitle(g))}</h2><span class="muted">${esc(gateTopicName(g))}</span></div></div>
      <div class="kv"><span>Questions</span><b class="sys-data">${cfg.questions}+</b></div>
      <div class="kv"><span>Enemies</span><b>${cfg.monsters.map((m) => esc(m.name)).join(", ")}</b></div>
      <div class="kv"><span>Enemy attack</span><b class="sys-data">${cfg.atk} dmg per wrong answer</b></div>
      <div class="kv"><span>Reward</span><b class="sys-data">${Math.round(cfg.xp * derived().xpMult)} EXP · ${Math.round(cfg.gold * derived().goldMult)} G</b></div>
      ${g.kind === "job" ? `<p class="muted small">Clear the trial to choose a job. Each job gives a permanent bonus.</p>` : ""}
      ${danger ? `<p class="sys-warning">You can't leave the Penalty Zone early without failing it.</p>` : ""}
      ${g.cleared ? `<p class="center ok">Gate cleared today.</p>` : ""}
      <div class="row-2">
        <button class="sys-btn ${danger ? "is-danger" : "is-primary"}" data-action="enter-gate" data-id="${esc(g.id)}" ${g.cleared ? "disabled" : ""}>Enter</button>
        <button class="sys-btn is-ghost" data-action="close-modal">Back</button>
      </div>
    </section></div>`;
  }

  function libraryView() {
    const chips = [`<button class="chip ${!studyFilter ? "on" : ""}" data-action="filter" data-subject="">All</button>`,
      ...SUBJECTS.map((s) => `<button class="chip ${studyFilter === s.key ? "on" : ""}" data-action="filter" data-subject="${s.key}"><i style="color:${s.color}">${esc(s.glyph)}</i>${esc(s.label)}</button>`)].join("");
    return `
      <header class="top"><h1 class="sys-title">Library</h1><span class="sys-chip">${allTopics().length} skills</span></header>
      <p class="muted small">Train any skill here. Training counts toward the Daily Quest.</p>
      <div class="search-row">
        <input id="search" type="search" placeholder="Search ${allTopics().length} topics" value="${esc(studySearch)}" autocomplete="off" aria-label="Search topics">
        <button class="sys-btn is-small" data-action="custom-ai" title="Study any topic with AI">${icon("spark")}Any topic</button>
      </div>
      <div class="chips scroll">${chips}</div>
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
    const lvl = s ? Math.min(10, Math.floor(mastery(s) * 10)) : 0;
    const meta = s && s.answered
      ? `<div class="row-meta">${bar(mastery(s), sub.color)}<span class="sys-data">Lv.${lvl}</span></div>`
      : `<span class="muted small">${badge(t)}</span>`;
    return `<button class="topic" data-action="topic" data-id="${esc(t.id)}">
      <span class="glyph" style="--c:${sub.color}">${t.kind === "ai" ? icon("spark") : esc(sub.glyph)}</span>
      <span class="topic-main"><b>${esc(t.name)}</b>${meta}</span><span class="chev">›</span></button>`;
  }

  function hunterView() {
    const h = state.hunter, d = derived(), lp = levelProgress(state.xp);
    const acc = state.totalAnswered ? Math.round((state.totalCorrect / state.totalAnswered) * 100) : 0;
    const effects = {
      str: `${d.damage} dmg`, agi: `${Math.round(d.crit * 100)}% crit · ${Math.round(d.dodge * 100)}% dodge`,
      vit: `${d.maxHp} HP`, int: `+${Math.round((d.xpMult - 1) * 100)}% EXP`, sen: `${d.detect} detect · +${Math.round((d.goldMult - 1) * 100)}% G`,
    };
    return `
      <section class="sys-window">
        ${tagBar("Status", false)}
        <div class="status-head">
          ${rankBadge(hunterRank())}
          <div class="status-id"><span class="sys-label">Name</span><h1 class="sys-title">${esc(h.name || "Hunter")}</h1>
            <span class="muted small">Job: ${h.job ? esc(JOBS[h.job].name) : "None"} · Title: ${h.title ? esc(ACHIEVEMENTS.find((a) => a.id === h.title)?.title) : "None"}</span></div>
          <div class="lv"><span class="sys-label">Level</span><b class="sys-data">${lp.level}</b></div>
        </div>
        ${gauge("is-exp", "EXP", lp.into, lp.needed)}
        <div class="stats">
          ${STATS.map(([k, label, what]) => `<div class="sys-stat"><b>${label}</b><small>${what}<br><span class="eff">${effects[k]}</span></small><span class="sys-data">${h.stats[k]}</span>
            <button class="sys-plus" data-action="stat" data-k="${k}" aria-label="Add a point to ${label}" ${h.points ? "" : "disabled"}>+</button></div>`).join("")}
        </div>
        <p class="center ${h.points ? "gold" : "muted"}">Available points: <b class="sys-data">${h.points}</b></p>
      </section>

      ${level() >= 10 && !h.job ? `<section class="sys-window is-shadow">${tagBar("Job Change")}<p class="center">You qualify for a job. Clear the Job Change Trial on the Gates map to choose one.</p><button class="sys-btn is-shadow is-block" data-action="tab" data-tab="gates">Go to Gates</button></section>` : ""}

      <p class="section-label">Shadow army · ${h.shadows.length}</p>
      <section class="sys-window is-shadow">
        ${h.shadows.length ? `<div class="shadows">${h.shadows.slice().reverse().map((s) => `<div class="shadow-row"><span class="sys-rank is-sm" data-rank="${s.rank}">${s.rank}</span><b>${esc(s.name)}</b><span class="muted small">${esc(s.date)}</span></div>`).join("")}</div>
          <p class="muted small">Each shadow grants +1% EXP (max 25%). Up to three fight beside you in gates.</p>`
          : `<p class="muted center">Defeat a gate boss and use extraction to raise your first shadow.</p>`}
      </section>

      <p class="section-label">Inventory & shop</p>
      <section class="sys-window list">
        <div class="row"><span>Gold</span><b class="sys-data gold">${state.coins} G</b></div>
        <div class="row"><span>Healing potion × ${h.potions}<small>Restores 50 HP inside a gate.</small></span><button class="sys-btn is-small" data-action="buy-potion" ${state.coins < POTION_COST ? "disabled" : ""}>${POTION_COST} G</button></div>
        <div class="row"><span>Streak shield (${state.freezes}/3)<small>Protects your streak for one missed day.</small></span><button class="sys-btn is-small" data-action="buy-freeze" ${state.coins < FREEZE_COST || state.freezes >= 3 ? "disabled" : ""}>${FREEZE_COST} G</button></div>
      </section>

      <p class="section-label">Records</p>
      <div class="stats-grid">${[["Streak", currentStreak()], ["Best streak", state.bestStreak], ["Gates", state.gatesCleared], ["Bosses", state.bossesSlain], ["Correct", state.totalCorrect.toLocaleString()], ["Accuracy", acc + "%"]].map(([k, v]) => `<div class="stat-box"><b class="sys-data">${v}</b><span>${k}</span></div>`).join("")}</div>
      <section class="sys-window">${heatmap()}</section>

      <p class="section-label">Titles · ${state.unlocked.length}/${ACHIEVEMENTS.length}</p>
      <div class="titles">${ACHIEVEMENTS.map((a) => {
        const on = state.unlocked.includes(a.id), eq = h.title === a.id;
        return `<button class="title-row ${on ? "on" : ""} ${eq ? "eq" : ""}" data-action="equip" data-id="${a.id}" ${on ? "" : "disabled"}>
          <b>${on ? esc(a.title) : "???"}</b><span class="muted small">${esc(a.detail)}</span><span class="sys-chip ${eq ? "is-gold" : ""}">${eq ? "Equipped" : on ? "Equip" : `+${a.reward} G`}</span></button>`;
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
    return `${tagBar("Quest history", false)}<div class="heat">${cells}</div><div class="legend"><span>Less</span><i></i><i class="l1"></i><i class="l2"></i><span>More</span><i class="met"></i><span>Quest done</span></div>`;
  }

  function settingsView() {
    const s = state.settings;
    const perm = notifySupported() ? Notification.permission : "unsupported";
    const permText = { granted: "On", denied: "Blocked in browser settings", default: "Off", unsupported: isIOS() && !standalone() ? "Add to Home Screen first" : "Not supported here" }[perm];
    return `
      <header class="top"><h1 class="sys-title">Settings</h1></header>
      ${settingsNote ? `<p class="note">${esc(settingsNote)}</p>` : ""}

      <p class="section-label">Hunter</p>
      <section class="sys-window list">
        <label class="row col" for="hunter-name"><span>Hunter name</span><input id="hunter-name" maxlength="20" value="${esc(state.hunter.name)}" autocomplete="off"></label>
      </section>

      <p class="section-label">Daily quest</p>
      <section class="sys-window list">
        ${stepRow("Problems per day", "dailyGoal", s.dailyGoal)}
        ${stepRow("of which SAT", "satMinimum", s.satMinimum)}
        ${stepRow("Questions per training", "sessionLength", s.sessionLength)}
        <label class="row"><span>Require a gate clear<small>The quest also needs one cleared gate.</small></span>
          <input type="checkbox" class="switch" data-action="toggle" data-k="requireGate" ${s.requireGate ? "checked" : ""}></label>
        <label class="row"><span>Strict mode<small>Each wrong answer takes one solved problem off today's count.</small></span>
          <input type="checkbox" class="switch" data-action="toggle" data-k="strictMode" ${s.strictMode ? "checked" : ""}></label>
      </section>

      <p class="section-label">Reminders</p>
      <section class="sys-window list">
        <div class="row"><span>Notifications<small>${permText}</small></span>
          ${perm === "default" || perm === "unsupported" ? `<button class="sys-btn is-small" data-action="enable-notifs">Enable</button>` : perm === "granted" ? `<button class="sys-btn is-small is-ghost" data-action="test-notif">Test</button>` : ""}</div>
        ${s.reminders.map((t, i) => `<div class="row"><span>Reminder ${i + 1}</span><span class="inline">
          <input type="time" id="rem-${i}" data-action="reminder" data-i="${i}" value="${esc(t)}"><button class="icon-btn" data-action="del-reminder" data-i="${i}" aria-label="Remove reminder">${icon("x")}</button></span></div>`).join("")}
        ${s.reminders.length < 6 ? `<button class="row link" data-action="add-reminder">+ Add reminder time</button>` : ""}
      </section>
      <p class="fine">Reminders fire while the app is open or in the background. The Home Screen badge shows what's left. For reminders when the app is fully closed, set up background push below.</p>

      <p class="section-label">AI topics</p>
      <section class="sys-window list">
        <label class="row col" for="api-key"><span>Anthropic API key<small>Stored only in this browser. Requests go straight to the Claude API.</small></span>
          <input type="password" id="api-key" placeholder="sk-ant-…" value="${esc(s.apiKey)}" autocomplete="off"></label>
        <label class="row" for="ai-model"><span>Model</span><select id="ai-model">${MODELS.map((m) => `<option ${m === s.aiModel ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      </section>

      <p class="section-label">My decks</p>
      <section class="sys-window list">
        ${state.customDecks.map((d) => `<div class="row"><span>${esc(d.name)}<small>${d.pairs.length} cards</small></span><button class="icon-btn" data-action="del-deck" data-id="${esc(d.id)}" aria-label="Delete deck">${icon("x")}</button></div>`).join("")}
        ${state.customAI.map((n) => `<div class="row"><span>${esc(n)}<small>AI topic</small></span><button class="icon-btn" data-action="del-ai" data-name="${esc(n)}" aria-label="Delete topic">${icon("x")}</button></div>`).join("")}
        <details class="row col"><summary>+ New flashcard deck</summary>
          <input id="deck-name" placeholder="Deck name, e.g. AP Bio Unit 3">
          <textarea id="deck-text" rows="7" placeholder="One card per line:&#10;mitochondria | powerhouse of the cell&#10;ribosome | makes proteins"></textarea>
          <button class="sys-btn is-small" data-action="save-deck">Save deck</button>
        </details>
      </section>

      <p class="section-label">Background push (optional)</p>
      <section class="sys-window list">
        <button class="row link" data-action="gen-keys">Generate push keys</button>
        ${generatedPrivateKey ? `<label class="row col" for="priv-key"><span>Private key: copy it now<small>Save it as the VAPID_PRIVATE_KEY secret in GitHub. It isn't stored here and won't be shown again.</small></span>
          <textarea id="priv-key" rows="2" readonly>${esc(generatedPrivateKey)}</textarea><button class="sys-btn is-small" data-action="copy-priv">Copy private key</button></label>` : ""}
        <label class="row col" for="vapid"><span>VAPID public key<small>Save it as the VAPID_PUBLIC_KEY secret too. See the README's “Background reminders” section.</small></span>
          <input id="vapid" placeholder="BExample…" value="${esc(s.vapidKey)}" autocomplete="off"></label>
        <button class="row link" data-action="subscribe-push">Create push subscription</button>
        ${subscriptionJSON ? `<label class="row col" for="sub-json"><span>Your subscription<small>Save it as the PUSH_SUBSCRIPTIONS secret in GitHub.</small></span>
          <textarea id="sub-json" rows="4" readonly>${esc(subscriptionJSON)}</textarea><button class="sys-btn is-small" data-action="copy-sub">Copy</button></label>` : ""}
      </section>

      <p class="section-label">Data</p>
      <section class="sys-window list">
        <button class="row link" data-action="export">Copy backup to clipboard</button>
        <details class="row col"><summary>Restore from backup</summary>
          <textarea id="import-text" rows="4" placeholder="Paste a backup here"></textarea>
          <button class="sys-btn is-small" data-action="import">Restore</button></details>
        <details class="row col danger"><summary>Reset progress</summary>
          <p class="muted">This clears levels, stats, shadows and history. Settings and decks stay.</p>
          <button class="sys-btn is-small is-danger" data-action="reset">Reset progress</button></details>
      </section>
      <p class="fine center">PhoneLock · progress is saved on this device</p>`;
  }

  function stepRow(label, key, value) {
    return `<div class="row"><span>${label}</span><div class="stepper"><button data-action="step" data-k="${key}" data-d="-5" aria-label="Decrease">−</button><output class="sys-data">${value}</output><button data-action="step" data-k="${key}" data-d="5" aria-label="Increase">+</button></div></div>`;
  }

  const LIMITS = { dailyGoal: [5, 500], satMinimum: [0, 500], sessionLength: [5, 30] };
  function clampSetting(k, v) {
    const [lo, hi] = LIMITS[k];
    v = Math.max(lo, Math.min(hi, v));
    if (k === "satMinimum") v = Math.min(v, state.settings.dailyGoal);
    return v;
  }

  // ---------- Training (plain quiz) ----------

  let quiz = null;

  async function openSession(mode) {
    haptic();
    quiz = { mode, questions: [], index: 0, selected: null, combo: quiz?.combo || 0, best: 0, correct: 0, xp: 0, loading: true, error: "", done: false };
    document.body.classList.add("overlay-open");
    renderQuiz();
    try {
      const qs = await buildSession(mode);
      if (!qs.length) throw new Error(mode.type === "mistakes" ? "No mistakes to review." : "No questions available for this topic.");
      Object.assign(quiz, { questions: qs, loading: false, enter: true });
    } catch (e) {
      Object.assign(quiz, { loading: false, error: e.message });
    }
    renderQuiz();
  }

  function modeTitle(m) {
    return { sat: "SAT Sprint", daily: "Daily Training", mistakes: "Mistake Review" }[m.type] || m.topic.name;
  }

  function closeOverlay() {
    if (raid?.scene) raid.scene.destroy();
    quiz = null; raid = null;
    document.body.classList.remove("overlay-open");
    $("#quiz").innerHTML = "";
    $("#quiz").hidden = true;
    render();
    flushEvents();
  }

  function optionsHtml(q, selected, detected = []) {
    const letters = "ABCDEF";
    const answered = selected != null;
    return q.choices.map((c, i) => {
      let cls = "";
      if (answered) cls = i === q.answerIndex ? "is-correct" : i === selected ? "is-wrong" : "is-dim";
      else if (detected.includes(i)) cls = "is-detected";
      return `<button class="sys-option ${cls}" data-action="answer" data-i="${i}" ${answered || detected.includes(i) ? "disabled" : ""}><i>${letters[i] || "•"}</i><span>${esc(c)}</span></button>`;
    }).join("");
  }

  function renderQuiz() {
    const el = $("#quiz");
    el.hidden = false;
    const q = quiz.questions[quiz.index];
    const enter = quiz.enter; quiz.enter = false;
    const progress = quiz.questions.length ? (quiz.index + (quiz.selected == null ? 0 : 1)) / quiz.questions.length : 0;
    let body;
    if (quiz.loading) {
      body = `<div class="center-fill"><div class="spinner"></div><p class="muted">${quiz.mode.topic?.kind === "ai" ? "The System is generating your questions…" : "Loading…"}</p></div>`;
    } else if (quiz.error) {
      body = `<div class="center-fill"><section class="sys-window">${tagBar("Error")}<p>${esc(quiz.error)}</p></section><button class="sys-btn is-primary" data-action="retry">Try again</button></div>`;
    } else if (quiz.done) {
      body = trainingSummary();
    } else {
      const answered = quiz.selected != null;
      body = `
        <div class="q-head"><span class="sys-label">${esc(modeTitle(quiz.mode))}</span><span class="sys-data">${quiz.index + 1}/${quiz.questions.length}</span></div>
        <section class="sys-window prompt ${enter ? "enter" : ""}">${esc(q.prompt)}${quiz.float ? `<span class="float-xp">+${quiz.float} EXP</span>` : ""}</section>
        <div class="answers ${quiz.shake ? "shake" : ""}">${optionsHtml(q, quiz.selected)}</div>
        ${answered && quiz.selected !== q.answerIndex && q.explanation ? `<section class="sys-window explain">${tagBar("Analysis", false)}<p>${esc(q.explanation)}</p></section>` : ""}
        <div class="grow"></div>
        ${answered ? `<button class="sys-btn is-primary is-block" data-action="next">${quiz.index + 1 < quiz.questions.length ? "Continue" : "Finish"}</button>` : ""}`;
    }
    el.innerHTML = `<div class="overlay-inner">
        <div class="q-top">
          <button class="icon-btn" data-action="close-overlay" aria-label="Close">${icon("close")}</button>
          <div class="sys-track"><i style="width:${progress * 100}%"></i></div>
          <span class="combo ${quiz.combo >= 3 ? "hot" : ""}">${icon("flame")}<b class="sys-data">${quiz.combo}</b></span>
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

  function trainingSummary() {
    const n = quiz.questions.length, acc = n ? quiz.correct / n : 0;
    return `<div class="summary">
      <section class="sys-window">
        ${tagBar("Training complete")}
        <div class="kv"><span>Correct</span><b class="sys-data">${quiz.correct}/${n} (${Math.round(acc * 100)}%)</b></div>
        <div class="kv"><span>EXP gained</span><b class="sys-data gold">+${quiz.xp}</b></div>
        <div class="kv"><span>Best combo</span><b class="sys-data">${quiz.best}</b></div>
      </section>
      ${questMini()}
      <button class="sys-btn is-primary is-block" data-action="again">Train again</button>
      <button class="sys-btn is-ghost is-block" data-action="close-overlay">Return</button>
    </div>`;
  }

  function questMini() {
    return `<section class="sys-window">${tagBar("Daily Quest", false)}${questObjectives().map((o) => `<div class="sys-objective ${o.have >= o.need ? "is-done" : ""}"><span class="sys-check">✓</span><span class="obj-label">${esc(o.label)}</span><span class="sys-data">[${o.have}/${o.need}]</span></div>`).join("")}</section>`;
  }

  // ---------- Gate raid ----------

  let raid = null;

  async function enterGate(id) {
    const g = todaysGates().find((x) => x.id === id);
    if (!g || g.cleared) return;
    selectedGate = null;
    render();
    const cfg = gateConfig(g.ri, g.seed, g.kind);
    const d = derived();
    raid = { gate: g, cfg, monsters: cfg.monsters.map((m) => ({ ...m })), mIndex: 0, hp: d.maxHp, maxHp: d.maxHp, mp: d.detect, maxMp: d.detect,
      questions: [], qIndex: 0, selected: null, detected: [], busy: true, over: null, correct: 0, xp: 0, combo: 0, answered: 0, loading: true, error: "", extract: null };
    document.body.classList.add("overlay-open");
    const el = $("#quiz");
    el.hidden = false;
    el.innerHTML = `<div class="overlay-inner raid">
      <div class="q-top">
        <button class="icon-btn" data-action="close-overlay" aria-label="Leave gate">${icon("close")}</button>
        <span class="sys-label raid-name">${rankBadge(g.rank, "is-sm")} ${esc(gateTitle(g))}</span>
        <span class="combo" id="raid-combo">${icon("flame")}<b class="sys-data">0</b></span>
      </div>
      <div class="arena">
        <canvas id="arena" aria-label="Battle scene"></canvas>
        <div class="enemy-hud" id="enemy-hud"></div>
      </div>
      <div id="raid-ui"></div>
    </div>`;
    raid.scene = window.PL_Battle.create($("#arena"), { color: g.kind === "penalty" ? "#ff4058" : RANK_COLORS[g.rank], shadows: state.hunter.shadows.length });
    renderRaid();
    try {
      const mode = g.kind === "gate" ? { type: "topic", topic: g.topic } : { type: "penalty" };
      raid.questions = await buildSession(mode, cfg.maxQuestions);
      raid.loading = false;
    } catch (e) {
      raid.loading = false; raid.error = e.message;
    }
    renderRaid();
    if (raid && !raid.error) { await raid.scene.spawn(raid.monsters[0]); raid.busy = false; renderRaid(); }
  }

  function renderEnemyHud() {
    const m = raid.monsters[raid.mIndex];
    const hud = $("#enemy-hud");
    if (!hud) return;
    hud.innerHTML = m ? `<span class="sys-label">${esc(m.name)}</span><div class="sys-track enemy"><i style="width:${(m.hp / m.maxHp) * 100}%;--c:${m.boss ? "#ff4058" : m.color}"></i></div>
      <span class="wave sys-data">${raid.mIndex + 1}/${raid.monsters.length}</span>` : "";
    const c = $("#raid-combo b"); if (c) c.textContent = raid.combo;
  }

  function renderRaid() {
    if (!raid) return;
    renderEnemyHud();
    const ui = $("#raid-ui");
    if (!ui) return;
    const hero = `<div class="hero-hud">${gauge("is-hp", "HP", Math.max(0, raid.hp), raid.maxHp)}${gauge("is-mp", "MP", raid.mp, raid.maxMp, `${raid.mp} DET`)}</div>`;
    if (raid.loading) { ui.innerHTML = `${hero}<div class="center-fill"><div class="spinner"></div><p class="muted">Entering the gate…</p></div>`; return; }
    if (raid.error) { ui.innerHTML = `<section class="sys-window">${tagBar("Error")}<p>${esc(raid.error)}</p></section><button class="sys-btn is-ghost is-block" data-action="close-overlay">Return</button>`; return; }
    if (raid.over) { ui.innerHTML = raidResult(); return; }
    const q = raid.questions[raid.qIndex];
    const answered = raid.selected != null;
    ui.innerHTML = `${hero}
      <div class="raid-actions">
        <button class="sys-btn is-small" data-action="potion" ${raid.busy || answered || !state.hunter.potions || raid.hp >= raid.maxHp ? "disabled" : ""}>${icon("potion")}Potion ×${state.hunter.potions}</button>
        <button class="sys-btn is-small" data-action="detect" ${raid.busy || answered || !raid.mp || raid.detected.length ? "disabled" : ""}>${icon("eye")}Detect</button>
        <span class="sys-data muted small">Q${raid.answered + 1} · ${raid.cfg.maxQuestions - raid.answered} left</span>
      </div>
      <section class="sys-window prompt">${esc(q.prompt)}</section>
      <div class="answers">${optionsHtml(q, raid.selected, raid.detected)}</div>
      ${answered && raid.selected !== q.answerIndex && q.explanation ? `<section class="sys-window explain">${tagBar("Analysis", false)}<p>${esc(q.explanation)}</p></section>` : ""}
      ${answered && !raid.busy && raid.selected !== q.answerIndex ? `<button class="sys-btn is-primary is-block" data-action="raid-next">Continue</button>` : ""}`;
  }

  async function raidAnswer(i) {
    if (!raid || raid.busy || raid.selected != null) return;
    const q = raid.questions[raid.qIndex];
    const correct = i === q.answerIndex;
    raid.selected = i; raid.busy = true; raid.answered++;
    raid.combo = correct ? raid.combo + 1 : 0;
    if (correct) raid.correct++;
    raid.xp += record(q, correct, raid.combo);
    renderRaid();
    flushEvents();
    const d = derived();
    const m = raid.monsters[raid.mIndex];
    if (correct) {
      haptic(15);
      const crit = Math.random() < d.crit;
      const dmg = Math.round(d.damage * (crit ? 2 : 1) * (0.9 + Math.random() * 0.2));
      await raid.scene.attack({ damage: dmg, crit });
      m.hp = Math.max(0, m.hp - dmg);
      renderEnemyHud();
      if (m.hp <= 0) {
        await raid.scene.kill();
        if (m.boss) { state.bossesSlain++; return finishRaid(true); }
        raid.mIndex++;
        renderEnemyHud();
        await raid.scene.spawn(raid.monsters[raid.mIndex]);
      }
    } else {
      haptic([30, 40, 30]);
      const dodged = Math.random() < d.dodge;
      const dmg = dodged ? 0 : raid.cfg.atk;
      await raid.scene.hurt({ damage: dmg, dodged });
      raid.hp -= dmg;
      if (raid.hp <= 0) { raid.hp = 0; await raid.scene.die(); return finishRaid(false, "You fell in battle."); }
    }
    if (!raid) return;
    raid.busy = false;
    if (raid.answered >= raid.cfg.maxQuestions) return finishRaid(false, "The gate closed before the boss fell.");
    if (correct) setTimeout(() => raidNext(), 350);
    else renderRaid();
  }

  function raidNext() {
    if (!raid || raid.over) return;
    raid.qIndex = (raid.qIndex + 1) % raid.questions.length;
    raid.selected = null; raid.detected = [];
    renderRaid();
  }

  async function finishRaid(won, reason = "") {
    if (!raid) return;
    const g = raid.gate, d = derived();
    raid.busy = true;
    if (won) {
      await raid.scene.victory();
      const xp = Math.round(raid.cfg.xp * d.xpMult);
      const gold = Math.round(raid.cfg.gold * d.goldMult);
      const potion = Math.random() < 0.3;
      state.coins += gold;
      if (potion) state.hunter.potions++;
      state.gatesCleared++;
      const day = today();
      if (g.kind === "penalty") state.penalty.cleared = true;
      day.gates = [...day.gates, g.id];
      setToday(day);
      gainXp(xp);
      raid.over = { won: true, xp, gold, potion, canExtract: g.kind !== "penalty" && Math.random() < 0.6, job: g.kind === "job" };
      checkGoal();
      checkAchievements();
    } else {
      raid.over = { won: false, reason, penalty: g.kind === "penalty" };
    }
    save();
    raid.busy = false;
    renderRaid();
    flushEvents();
  }

  function raidResult() {
    const o = raid.over;
    if (!o.won) {
      return `<section class="sys-window is-danger">${tagBar(o.penalty ? "Penalty Zone" : "Raid failed")}
        <p class="center">${esc(o.reason)}</p>
        <p class="center muted small">Answers you got right still count toward your Daily Quest. The gate stays open today.</p></section>
        <button class="sys-btn is-primary is-block" data-action="retry-gate">Try again</button>
        <button class="sys-btn is-ghost is-block" data-action="close-overlay">Retreat</button>`;
    }
    const boss = raid.monsters[raid.monsters.length - 1];
    return `<section class="sys-window">${tagBar("Gate cleared")}
        <div class="kv"><span>Accuracy</span><b class="sys-data">${raid.correct}/${raid.answered}</b></div>
        <div class="kv"><span>EXP</span><b class="sys-data gold">+${o.xp + raid.xp}</b></div>
        <div class="kv"><span>Gold</span><b class="sys-data gold">+${o.gold} G</b></div>
        ${o.potion ? `<div class="kv"><span>Item</span><b>Healing potion</b></div>` : ""}
      </section>
      ${o.job ? `<section class="sys-window is-shadow">${tagBar("Job Change")}
          <p class="center">Choose your job. This can't be changed.</p>
          <div class="jobs">${Object.entries(JOBS).map(([k, j]) => `<button class="job" data-action="choose-job" data-id="${k}"><b>${j.name}</b><span class="muted small">${j.perk}</span></button>`).join("")}</div>
        </section>` : ""}
      ${o.canExtract && !o.extracted ? `<section class="sys-window is-shadow">${tagBar("Extraction")}
          <p class="center">The ${esc(boss.name.replace(" (Boss)", ""))}'s shadow lingers. Command it to rise?</p>
          <button class="sys-btn is-shadow is-block arise" data-action="arise">Arise</button></section>` : ""}
      ${o.extracted ? `<p class="center ${o.extracted === "ok" ? "shadow-ok" : "muted"}">${o.extracted === "ok" ? `${esc(boss.name.replace(" (Boss)", ""))} joined your shadow army.` : "Extraction failed. The shadow faded."}</p>` : ""}
      ${questMini()}
      <button class="sys-btn is-ghost is-block" data-action="close-overlay" ${o.job && !state.hunter.job ? "disabled" : ""}>Return</button>`;
  }

  async function arise() {
    const o = raid?.over;
    if (!o || o.extracted) return;
    const boss = raid.monsters[raid.monsters.length - 1];
    const ok = Math.random() < 0.7;
    raid.busy = true;
    if (ok) {
      await raid.scene.extract();
      state.hunter.shadows.push({ name: boss.name.replace(" (Boss)", ""), rank: raid.gate.rank, date: dayKey() });
      checkAchievements();
      save();
    }
    o.extracted = ok ? "ok" : "fail";
    raid.busy = false;
    renderRaid();
    flushEvents();
  }

  // ---------- System notices & confetti ----------

  let toastBusy = false;
  function flushEvents() {
    if (toastBusy || !events.length) return;
    const e = events.shift();
    toastBusy = true;
    let tag = "Notification", body, danger = false, long = false;
    if (e.type === "level") { body = `<strong>LEVEL UP!</strong><p>You reached level ${e.level}. +3 stat points.</p>${e.rankUp ? `<p>Hunter rank is now <b>${hunterRank()}</b>.</p>` : ""}`; long = e.rankUp; }
    else if (e.type === "goal") { body = `<strong>DAILY QUEST COMPLETE</strong><p>Claim your reward in the quest window.</p>`; confetti(); long = true; }
    else if (e.type === "reward") { tag = "Reward"; body = `<p>${esc(e.text)}</p>`; }
    else if (e.type === "penalty") { tag = "Penalty Quest"; danger = true; long = true; body = `<p>You failed to complete the Daily Quest.</p><p>Survive the Penalty Zone today.</p>`; }
    else { const a = ACHIEVEMENTS.find((x) => x.id === e.id); tag = "Title acquired"; body = `<strong>${esc(a.title)}</strong><p>${esc(a.detail)} · +${a.reward} G</p>`; }
    const t = $("#toast");
    t.className = `sys-window sys-notice ${danger ? "is-danger" : ""}`;
    t.innerHTML = `${tagBar(tag)}${body}`;
    requestAnimationFrame(() => t.classList.add("show"));
    haptic([10, 30, 10]);
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => { toastBusy = false; flushEvents(); }, 350);
    }, long ? 3200 : 2300);
  }

  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = $("#confetti"), ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ["#4db4ff", "#bfe6ff", "#ffc54a", "#8a6bff", "#3ee6a0"];
    const bits = Array.from({ length: 110 }, () => ({ x: Math.random() * innerWidth, y: innerHeight + Math.random() * 40,
      vy: -(4 + Math.random() * 6), vx: -1 + Math.random() * 2, s: 1.5 + Math.random() * 2.5, c: colors[Math.floor(Math.random() * 5)] }));
    const startT = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.vy += 0.06;
        ctx.globalAlpha = Math.max(0, 1 - (t - startT) / 2600);
        ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, b.s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (t - startT < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(startT);
  }

  // ---------- Events ----------

  document.addEventListener("click", async (ev) => {
    if (ev.target.closest("[data-stop]") && !ev.target.closest("[data-action]:not(.modal)")) return;
    const el = ev.target.closest("[data-action]");
    if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    const a = el.dataset.action;
    switch (a) {
      case "tab": tab = el.dataset.tab; settingsNote = ""; selectedGate = null; haptic(); render(); window.scrollTo(0, 0); break;
      case "ob-step": case "step": {
        const k = el.dataset.k;
        state.settings[k] = clampSetting(k, state.settings[k] + Number(el.dataset.d));
        if (state.settings.satMinimum > state.settings.dailyGoal) state.settings.satMinimum = state.settings.dailyGoal;
        if (a === "ob-step") state.hunter.name = ($("#ob-name")?.value || "").trim();
        checkGoal(); save(); render(); flushEvents(); break;
      }
      case "start": state.hunter.name = ($("#ob-name")?.value || "").trim() || "Hunter"; state.onboarded = true; state.lastSeenDay = dayKey(); save(); render(); break;
      case "decline": { const n = $("#decline-note"); if (n) n.hidden = false; haptic([20, 30, 20]); break; }
      case "session": openSession({ type: el.dataset.mode }); break;
      case "tile": {
        if (el.dataset.mode === "mistakes" && !state.mistakes.length) { el.classList.add("nudge"); setTimeout(() => el.classList.remove("nudge"), 400); }
        else openSession({ type: el.dataset.mode });
        break;
      }
      case "claim": claimQuest(); render(); flushEvents(); break;
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
      case "select-gate": selectedGate = el.dataset.id; haptic(); render(); break;
      case "open-gate": tab = "gates"; selectedGate = el.dataset.id; render(); break;
      case "close-modal": if (ev.target === el || el.tagName === "BUTTON") { selectedGate = null; render(); } break;
      case "enter-gate": enterGate(el.dataset.id); break;
      case "retry-gate": { const id = raid.gate.id; raid.scene.destroy(); raid = null; enterGate(id); break; }
      case "answer": if (raid) raidAnswer(Number(el.dataset.i)); else answer(Number(el.dataset.i)); break;
      case "next": next(); break;
      case "raid-next": raidNext(); break;
      case "potion":
        if (raid && state.hunter.potions > 0 && !raid.busy) {
          state.hunter.potions--; const heal = Math.min(50, raid.maxHp - raid.hp); raid.hp += heal; save();
          raid.busy = true; renderRaid(); await raid.scene.heal(heal); raid.busy = false; renderRaid();
        }
        break;
      case "detect":
        if (raid && raid.mp > 0 && !raid.busy) {
          const q = raid.questions[raid.qIndex];
          const wrong = GEN.shuffle(q.choices.map((_, i) => i).filter((i) => i !== q.answerIndex)).slice(0, Math.max(1, q.choices.length - 2));
          raid.mp--; raid.detected = wrong; raid.scene.detect(); renderRaid();
        }
        break;
      case "arise": arise(); break;
      case "choose-job":
        if (!state.hunter.job) { state.hunter.job = el.dataset.id; state.hunter.points += 5; events.push({ type: "reward", text: `Job: ${JOBS[el.dataset.id].name}. +5 stat points.` }); save(); renderRaid(); flushEvents(); }
        break;
      case "again": case "retry": openSession(quiz.mode); break;
      case "close-overlay": closeOverlay(); break;
      case "stat":
        if (state.hunter.points > 0) { state.hunter.points--; state.hunter.stats[el.dataset.k]++; haptic(12); save(); render(); }
        break;
      case "equip": state.hunter.title = state.hunter.title === el.dataset.id ? null : el.dataset.id; save(); render(); break;
      case "buy-potion": if (state.coins >= POTION_COST) { state.coins -= POTION_COST; state.hunter.potions++; save(); render(); } break;
      case "buy-freeze":
        if (state.coins >= FREEZE_COST && state.freezes < 3) { state.coins -= FREEZE_COST; state.freezes++; save(); }
        render(); break;
      case "enable-notifs": {
        if (!notifySupported()) {
          settingsNote = isIOS() && !standalone() ? "On iPhone, notifications only work after you add PhoneLock to your Home Screen and open it from there." : "This browser doesn't support notifications.";
          tab = "settings"; render(); break;
        }
        const p = await Notification.requestPermission();
        settingsNote = p === "granted" ? "Reminders are on." : "Notifications are blocked. You can allow them in your browser or iOS Settings.";
        if (p === "granted") notify("[ SYSTEM ]", "Notifications enabled. Daily Quest reminders will arrive at your chosen times.");
        render(); break;
      }
      case "test-notif": {
        const ok = await notify("[ SYSTEM ]", reminderMessage());
        settingsNote = ok ? "Test notification sent." : "Couldn't show a notification. Check your notification settings.";
        render(); break;
      }
      case "add-reminder": state.settings.reminders = [...state.settings.reminders, "21:00"]; save(); render(); break;
      case "del-reminder": state.settings.reminders = state.settings.reminders.filter((_, i) => i !== Number(el.dataset.i)); save(); render(); break;
      case "del-deck": state.customDecks = state.customDecks.filter((d) => d.id !== el.dataset.id); save(); render(); break;
      case "del-ai": state.customAI = state.customAI.filter((n) => n !== el.dataset.name); save(); render(); break;
      case "save-deck": {
        const name = $("#deck-name").value.trim() || "My deck";
        const pairs = parseDeck($("#deck-text").value);
        if (pairs.length < 4) { settingsNote = `Found ${pairs.length} cards. A deck needs at least 4 lines like “term | definition”.`; render(); break; }
        state.customDecks.push({ id: uid(), name, pairs });
        settingsNote = `Saved “${name}” with ${pairs.length} cards. Find it under Library → My Topics.`;
        save(); render(); break;
      }
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
      case "subscribe-push": await subscribePush(); render(); break;
      case "copy-sub": copyText(subscriptionJSON, "#sub-json"); settingsNote = "Subscription copied."; render(); break;
      case "export": {
        copyText(JSON.stringify({ ...state, settings: { ...state.settings, apiKey: "" } }));
        settingsNote = "Backup copied. Your API key is not included."; render(); break;
      }
      case "import": {
        try {
          const data = JSON.parse($("#import-text").value);
          const key = state.settings.apiKey;
          state = { ...clone(DEFAULT_STATE), ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}), apiKey: key },
            hunter: { ...clone(DEFAULT_HUNTER), ...(data.hunter || {}) } };
          settingsNote = "Backup restored."; save();
        } catch (e) { settingsNote = "That doesn't look like a PhoneLock backup. Paste the full text you copied."; }
        render(); break;
      }
      case "reset": {
        const keep = { settings: state.settings, customDecks: state.customDecks, customAI: state.customAI, onboarded: true, lastSeenDay: dayKey(),
          hunter: { ...clone(DEFAULT_HUNTER), name: state.hunter.name } };
        state = { ...clone(DEFAULT_STATE), ...keep };
        settingsNote = "Progress reset."; save(); render(); break;
      }
    }
  });

  document.addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches("g.portal")) { selectedGate = ev.target.dataset.id; render(); }
    if (ev.key === "Escape" && selectedGate) { selectedGate = null; render(); }
  });

  document.addEventListener("input", (ev) => {
    if (ev.target.id === "search") { studySearch = ev.target.value; $("#results").innerHTML = studyResults(); }
  });

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.action === "toggle") { state.settings[t.dataset.k] = t.checked; checkGoal(); save(); flushEvents(); }
    else if (t.dataset.action === "reminder") {
      const list = [...state.settings.reminders]; list[Number(t.dataset.i)] = t.value || "20:00";
      state.settings.reminders = list; save();
    }
    else if (t.id === "api-key") { state.settings.apiKey = t.value.trim(); save(); settingsNote = t.value ? "API key saved on this device." : "API key removed."; render(); }
    else if (t.id === "ai-model") { state.settings.aiModel = t.value; save(); }
    else if (t.id === "vapid") { state.settings.vapidKey = t.value.trim(); save(); }
    else if (t.id === "hunter-name") { state.hunter.name = t.value.trim() || "Hunter"; save(); settingsNote = "Name updated."; render(); }
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

  evaluatePenalty();
  render();
  checkReminders();
  updateAppBadge();
  flushEvents();
  if (new URLSearchParams(location.search).get("start") === "daily" && state.onboarded) openSession({ type: "daily" });
})();
