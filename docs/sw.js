// PhoneLock service worker: offline app shell + push reminders.
const VERSION = "phonelock-v2";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "data.js",
  "generators.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "pl-state").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: open instantly from cache, refresh in the background.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "api.anthropic.com") return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: url.origin === location.origin });
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

async function readState() {
  try {
    const res = await (await caches.open("pl-state")).match("state.json");
    return res ? await res.json() : null;
  } catch (e) {
    return null;
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Push reminders: the server only says "remind"; the text comes from the progress saved on this device.
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = { body: event.data && event.data.text() }; }
    const s = await readState();
    let title = "PhoneLock";
    let body = payload.body || "Time to study.";
    if (s) {
      const fresh = s.date === todayKey();
      const done = fresh && s.goalMet;
      const left = fresh ? s.remainingCorrect : s.dailyGoal;
      const sat = fresh ? s.remainingSAT : s.satMinimum;
      if (done) {
        title = "Goal complete";
        body = s.streak > 1 ? `Your ${s.streak}-day streak is safe. A bonus round still earns XP.` : "Nice work today. A bonus round still earns XP.";
      } else {
        const parts = [];
        if (left) parts.push(`${left} correct answers`);
        if (sat) parts.push(`${sat} SAT answers`);
        body = `${s.streak > 1 ? `Keep your ${s.streak}-day streak. ` : ""}Still to go: ${parts.join(" and ") || "a few answers"}.`;
      }
      if (self.navigator.setAppBadge && !done) self.navigator.setAppBadge(Math.min(99, (left || 0) + (sat || 0))).catch(() => {});
    }
    await self.registration.showNotification(title, {
      body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "phonelock-reminder",
      data: { url: "./?start=daily" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) return c.focus();
    }
    return self.clients.openWindow(target);
  })());
});
