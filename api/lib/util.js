export const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Your UTC offset in hours (e.g. 8 = Singapore, -4 = New York in summer),
// so "today" flips at YOUR midnight, not UTC's.
const TZ_OFFSET_HOURS = Number(process.env.TZ_OFFSET_HOURS ?? 0);

function localNow(base = new Date()) {
  return new Date(base.getTime() + TZ_OFFSET_HOURS * 3600000);
}

/** YYYY-MM-DD in the user's local day */
export function todayKey(base = new Date()) {
  return localNow(base).toISOString().slice(0, 10);
}

/** YYYY-Www ISO week key for a UTC calendar date (or "YYYY-MM-DD" string) */
export function isoWeek(d) {
  if (typeof d === "string") d = new Date(d);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * YYYY-Www key of the bath week containing `d`. Bath weeks run Sat..Fri
 * (the weekend starts the week), keyed by the ISO week the shifted date
 * lands in: Sat/Sun map forward into the same ISO week as the Mon..Fri
 * that follow them.
 */
export function bathWeek(d) {
  if (typeof d === "string") d = new Date(d);
  return isoWeek(new Date(d.getTime() + 2 * 86400000));
}

/** YYYY-Www bath-week key (Sat..Fri) for the weekly bath, in the user's local day */
export function weekKey(base = new Date()) {
  return bathWeek(localNow(base));
}

/** "YYYY-MM-DD" of the Saturday that starts bath week `key` (e.g. "2026-W35") */
export function weekStartOf(key) {
  const [y, w] = key.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4)); // always in ISO week 1
  const mon = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000);
  mon.setUTCDate(mon.getUTCDate() + (w - 1) * 7 - 2); // back up to the Saturday
  return mon.toISOString().slice(0, 10);
}

/** Human date like "Tue 18 Aug" in the user's local day */
export function prettyDate(base = new Date()) {
  return localNow(base).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Minimal Telegram Bot API caller */
export async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!data.ok) console.error(`Telegram ${method} failed:`, data);
  return data;
}
