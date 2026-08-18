import assert from "node:assert/strict";
import { test } from "node:test";
import { db, getBowl, getStats, toggleBath, toggleBowl } from "../api/lib/db.js";

test.beforeEach(async () => {
  await db.batch(["DELETE FROM bowls", "DELETE FROM baths"], "write").catch(() => {});
});

test("getBowl creates a blank row; toggleBowl flips items independently", async () => {
  assert.deepEqual({ ...(await getBowl("2026-08-18")) }, { water: 0, food: 0 });
  let s = await toggleBowl("2026-08-18", "water");
  assert.equal(s.water, 1);
  assert.equal(s.food, 0);
  s = await toggleBowl("2026-08-18", "food");
  assert.equal(s.water, 1);
  assert.equal(s.food, 1);
  s = await toggleBowl("2026-08-18", "water");
  assert.equal(s.water, 0);
  assert.equal(s.food, 1);
});

test("toggleBath flips per week", async () => {
  assert.equal(await toggleBath("2026-W34"), true);
  assert.equal(await toggleBath("2026-W34"), false);
  assert.equal(await toggleBath("2026-W35"), true);
});

test("getStats: null with no data, otherwise one session per day", async () => {
  assert.equal(await getStats("2026-08-18"), null);

  await toggleBowl("2026-08-16", "water");
  await toggleBowl("2026-08-16", "food"); // done
  await toggleBowl("2026-08-17", "water"); // half -> missed
  await getBowl("2026-08-18"); // untouched -> missed
  await toggleBath("2026-W34");

  const s = await getStats("2026-08-18");
  assert.equal(s.start, "2026-08-16");
  assert.equal(s.trackedDays, 3);
  assert.equal(s.doneDays, 1);
  assert.equal(s.missedDays, 2);
  assert.equal(s.donePct, 33);
  assert.equal(s.missedPct, 67);
  // 2026-08-16 (Sun, W33) .. 2026-08-18 (Tue, W34) -> 2 weeks tracked, 1 bathed
  assert.equal(s.trackedWeeks, 2);
  assert.equal(s.bathsDone, 1);
  assert.equal(s.bathsMissed, 1);
  assert.equal(s.bathDonePct, 50);
});

test("getStats: bath in the same week as the first bowl does not add missed bowl days", async () => {
  await toggleBowl("2026-08-18", "water");
  await toggleBowl("2026-08-18", "food");
  await toggleBath("2026-W34"); // Mon 2026-08-17, before the first bowl day
  const s = await getStats("2026-08-18");
  assert.equal(s.start, "2026-08-18");
  assert.equal(s.trackedDays, 1);
  assert.equal(s.doneDays, 1);
  assert.equal(s.trackedWeeks, 1);
  assert.equal(s.bathsDone, 1);
});

test("getStats: earlier baths widen the week range but not the day range", async () => {
  await toggleBath("2026-W33"); // Mon 2026-08-10
  await getBowl("2026-08-18");
  const s = await getStats("2026-08-18");
  assert.equal(s.start, "2026-08-18");
  assert.equal(s.trackedDays, 1);
  assert.equal(s.trackedWeeks, 2); // W33, W34
  assert.equal(s.bathsDone, 1);
  assert.equal(s.bathsMissed, 1);
});

test("getStats: bath before any bowl starts the window; baths outside 30 days ignored", async () => {
  await toggleBath("2026-W33"); // Mon 2026-08-10
  await toggleBath("2026-W20"); // long ago -> outside 30-day window
  const s = await getStats("2026-08-18");
  assert.equal(s.start, "2026-07-20"); // clamped to the 30-day window
  assert.equal(s.trackedWeeks, 5); // W30..W34
  assert.equal(s.bathsDone, 1);
  assert.equal(s.bathsMissed, 4);
});

test("getStats window is capped at 30 days", async () => {
  await toggleBowl("2026-01-01", "water");
  const s = await getStats("2026-08-18");
  assert.equal(s.trackedDays, 30);
  assert.equal(s.start, "2026-07-20");
});
