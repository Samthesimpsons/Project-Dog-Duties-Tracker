import { createClient } from "@libsql/client";
import { bathWeek, weekStartOf } from "./util.js";

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// One bowl session per day (morning). The `slot` column is kept for schema
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
         skipped INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (date, slot)
       )`,
      `CREATE TABLE IF NOT EXISTS baths (
         week TEXT PRIMARY KEY,
         done INTEGER NOT NULL DEFAULT 0,
         skipped INTEGER NOT NULL DEFAULT 0
       )`,
    ],
    "write",
  );
  // Databases created before the skip feature lack the column; add it in place.
  for (const table of ["bowls", "baths"]) {
    const info = await db.execute(`PRAGMA table_info(${table})`);
    if (!info.rows.some((r) => r.name === "skipped")) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0`);
    }
  }
  ready = true;
}

/** Ensure a row exists for `date`, then flip one item. Returns new state. */
export async function toggleBowl(date, item) {
  await ensureSchema();
  // Fall back to "food" so buttons in older Telegram messages keep working.
  const col = { water: "water", food: "food", skip: "skipped" }[item] ?? "food";
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
    sql: "SELECT water, food, skipped FROM bowls WHERE date = ? AND slot = ?",
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
    sql: "SELECT water, food, skipped FROM bowls WHERE date = ? AND slot = ?",
    args: [date, SLOT],
  });
  return r.rows[0];
}

export async function getBath(week) {
  await ensureSchema();
  await db.execute({ sql: "INSERT OR IGNORE INTO baths (week) VALUES (?)", args: [week] });
  const r = await db.execute({
    sql: "SELECT done, skipped FROM baths WHERE week = ?",
    args: [week],
  });
  return { done: r.rows[0].done === 1, skipped: r.rows[0].skipped === 1 };
}

export async function toggleBath(week, item) {
  await ensureSchema();
  const col = item === "skip" ? "skipped" : "done";
  await db.batch(
    [
      { sql: "INSERT OR IGNORE INTO baths (week) VALUES (?)", args: [week] },
      { sql: `UPDATE baths SET ${col} = 1 - ${col} WHERE week = ?`, args: [week] },
    ],
    "write",
  );
  const r = await db.execute({
    sql: "SELECT done, skipped FROM baths WHERE week = ?",
    args: [week],
  });
  return { done: r.rows[0].done === 1, skipped: r.rows[0].skipped === 1 };
}

/**
 * Stats over the last `days` days (default 30), starting no earlier than the
 * first day the bot was used - so untracked history doesn't count as "missed".
 * A day counts as done if BOTH bowls were ticked or the day was skipped
 * (a day that is both ticked and skipped counts once); skipped days and weeks
 * are also tallied separately. Bath weeks are the Sat..Fri weeks touched by
 * the same window.
 */
export async function getStats(todayStr, days = 30) {
  await ensureSchema();

  const firstBowl = (await db.execute("SELECT MIN(date) AS d FROM bowls")).rows[0]?.d;
  const firstBathWeek = (await db.execute("SELECT MIN(week) AS w FROM baths")).rows[0]?.w;
  // Days are tracked from the first bowl checklist; if there is none yet, from
  // the week of the first bath. Weeks additionally reach back to the first bath.
  const firstDate = firstBowl ?? (firstBathWeek && weekStartOf(firstBathWeek));
  if (!firstDate) return null;

  const windowStart = new Date(Date.parse(todayStr) - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const start = firstDate > windowStart ? firstDate : windowStart;

  const trackedDays = Math.round((Date.parse(todayStr) - Date.parse(start)) / 86400000) + 1;
  const done = await db.execute({
    sql: `SELECT
            SUM(CASE WHEN (water = 1 AND food = 1) OR skipped = 1 THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) AS skipped
          FROM bowls WHERE date >= ? AND date <= ?`,
    args: [start, todayStr],
  });
  const doneDays = Number(done.rows[0].done ?? 0);
  const skippedDays = Number(done.rows[0].skipped ?? 0);

  const bathStart = firstBathWeek ? weekStartOf(firstBathWeek) : start;
  const weekStart = [bathStart < start ? bathStart : start, windowStart].sort()[1];
  const weeks = new Set();
  for (let t = Date.parse(weekStart); t <= Date.parse(todayStr); t += 86400000) {
    weeks.add(bathWeek(new Date(t)));
  }
  const bathRows = await db.execute({
    sql: `SELECT
            SUM(CASE WHEN done = 1 OR skipped = 1 THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) AS skipped
          FROM baths WHERE week IN (${[...weeks].map(() => "?").join(",")})`,
    args: [...weeks],
  });
  const trackedWeeks = weeks.size;
  const bathsDone = Number(bathRows.rows[0].done ?? 0);
  const bathsSkipped = Number(bathRows.rows[0].skipped ?? 0);

  return {
    start,
    trackedDays,
    doneDays,
    missedDays: trackedDays - doneDays,
    missedPct: Math.round(((trackedDays - doneDays) / trackedDays) * 100),
    donePct: Math.round((doneDays / trackedDays) * 100),
    skippedDays,
    skippedPct: Math.round((skippedDays / trackedDays) * 100),
    trackedWeeks,
    bathsDone,
    bathsMissed: trackedWeeks - bathsDone,
    bathDonePct: Math.round((bathsDone / trackedWeeks) * 100),
    bathMissedPct: Math.round(((trackedWeeks - bathsDone) / trackedWeeks) * 100),
    bathsSkipped,
    bathSkippedPct: Math.round((bathsSkipped / trackedWeeks) * 100),
  };
}
