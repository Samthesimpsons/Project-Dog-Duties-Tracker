import { createClient } from "@libsql/client";
import { isoWeek, mondayOf } from "./util.js";

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// One bowl session per day (nightly). The `slot` column is kept for schema
// compatibility; every row uses SLOT.
const SLOT = "evening";

let ready = false;
export async function ensureSchema() {
  if (ready) return;
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS bowls (
         date  TEXT NOT NULL,
         slot  TEXT NOT NULL CHECK (slot IN ('morning','evening')),
         water INTEGER NOT NULL DEFAULT 0,
         food  INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (date, slot)
       )`,
      `CREATE TABLE IF NOT EXISTS baths (
         week TEXT PRIMARY KEY,
         done INTEGER NOT NULL DEFAULT 0
       )`,
    ],
    "write",
  );
  ready = true;
}

/** Ensure a row exists for `date`, then flip one item. Returns new state. */
export async function toggleBowl(date, item) {
  await ensureSchema();
  const col = item === "water" ? "water" : "food";
  await db.batch(
    [
      {
        sql: "INSERT OR IGNORE INTO bowls (date, slot) VALUES (?, ?)",
        args: [date, SLOT],
      },
      {
        sql: `UPDATE bowls SET ${col} = 1 - ${col} WHERE date = ? AND slot = ?`,
        args: [date, SLOT],
      },
    ],
    "write",
  );
  const r = await db.execute({
    sql: "SELECT water, food FROM bowls WHERE date = ? AND slot = ?",
    args: [date, SLOT],
  });
  return r.rows[0];
}

/** Read (creating if absent) the state for `date` without toggling. */
export async function getBowl(date) {
  await ensureSchema();
  await db.execute({
    sql: "INSERT OR IGNORE INTO bowls (date, slot) VALUES (?, ?)",
    args: [date, SLOT],
  });
  const r = await db.execute({
    sql: "SELECT water, food FROM bowls WHERE date = ? AND slot = ?",
    args: [date, SLOT],
  });
  return r.rows[0];
}

export async function toggleBath(week) {
  await ensureSchema();
  await db.batch(
    [
      { sql: "INSERT OR IGNORE INTO baths (week) VALUES (?)", args: [week] },
      { sql: "UPDATE baths SET done = 1 - done WHERE week = ?", args: [week] },
    ],
    "write",
  );
  const r = await db.execute({
    sql: "SELECT done FROM baths WHERE week = ?",
    args: [week],
  });
  return r.rows[0].done === 1;
}

/**
 * Stats over the last `days` days (default 30), starting no earlier than the
 * first day the bot was used - so untracked history doesn't count as "missed".
 * A day counts as done only if BOTH bowls were ticked. Bath weeks are the ISO
 * weeks touched by the same window.
 */
export async function getStats(todayStr, days = 30) {
  await ensureSchema();

  const firstBowl = (await db.execute("SELECT MIN(date) AS d FROM bowls")).rows[0]?.d;
  const firstBathWeek = (await db.execute("SELECT MIN(week) AS w FROM baths")).rows[0]?.w;
  // Days are tracked from the first bowl checklist; if there is none yet, from
  // the week of the first bath. Weeks additionally reach back to the first bath.
  const firstDate = firstBowl ?? (firstBathWeek && mondayOf(firstBathWeek));
  if (!firstDate) return null;

  const windowStart = new Date(Date.parse(todayStr) - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const start = firstDate > windowStart ? firstDate : windowStart;

  const trackedDays = Math.round((Date.parse(todayStr) - Date.parse(start)) / 86400000) + 1;
  const done = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM bowls
          WHERE date >= ? AND date <= ? AND water = 1 AND food = 1`,
    args: [start, todayStr],
  });
  const doneDays = Number(done.rows[0].n);

  const bathMonday = firstBathWeek ? mondayOf(firstBathWeek) : start;
  const weekStart = [bathMonday < start ? bathMonday : start, windowStart].sort()[1];
  const weeks = new Set();
  for (let t = Date.parse(weekStart); t <= Date.parse(todayStr); t += 86400000) {
    weeks.add(isoWeek(new Date(t)));
  }
  const bathRows = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM baths WHERE done = 1 AND week IN (${[...weeks].map(() => "?").join(",")})`,
    args: [...weeks],
  });
  const trackedWeeks = weeks.size;
  const bathsDone = Number(bathRows.rows[0].n);

  return {
    start,
    trackedDays,
    doneDays,
    missedDays: trackedDays - doneDays,
    missedPct: Math.round(((trackedDays - doneDays) / trackedDays) * 100),
    donePct: Math.round((doneDays / trackedDays) * 100),
    trackedWeeks,
    bathsDone,
    bathsMissed: trackedWeeks - bathsDone,
    bathDonePct: Math.round((bathsDone / trackedWeeks) * 100),
    bathMissedPct: Math.round(((trackedWeeks - bathsDone) / trackedWeeks) * 100),
  };
}
