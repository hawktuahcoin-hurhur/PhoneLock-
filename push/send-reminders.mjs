// Sends a study-reminder push to each saved subscription. Run by .github/workflows/study-reminders.yml.
// The notification text is written on the phone by the service worker from your saved progress,
// so this script only needs to say "remind".
import webpush from "web-push";

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTIONS, VAPID_SUBJECT, GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTIONS) {
  console.log("Push secrets are not set (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTIONS). Nothing to send.");
  process.exit(0);
}

// Apple requires a mailto: or https: subject that identifies the sender.
const subject = VAPID_SUBJECT || (GITHUB_REPOSITORY ? `${GITHUB_SERVER_URL || "https://github.com"}/${GITHUB_REPOSITORY}` : "mailto:reminders@phonelock.invalid");
webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY.trim(), VAPID_PRIVATE_KEY.trim());

let subs;
try {
  subs = JSON.parse(PUSH_SUBSCRIPTIONS);
} catch (e) {
  console.error("PUSH_SUBSCRIPTIONS isn't valid JSON. Paste the subscription exactly as the app shows it.");
  process.exit(1);
}
if (!Array.isArray(subs)) subs = [subs];

let sent = 0;
for (const [i, sub] of subs.entries()) {
  try {
    await webpush.sendNotification(sub, JSON.stringify({ type: "reminder" }), { TTL: 3600, urgency: "high" });
    sent++;
    console.log(`Subscription ${i + 1}: sent`);
  } catch (err) {
    const gone = err.statusCode === 404 || err.statusCode === 410;
    console.error(`Subscription ${i + 1}: failed (${err.statusCode || err.message})${gone ? " - expired; create a new one in the app and update the secret" : ""}`);
  }
}
if (!sent) process.exit(1);
