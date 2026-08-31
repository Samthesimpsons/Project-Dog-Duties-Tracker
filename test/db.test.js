import assert from "node:assert/strict";
import { test } from "node:test";
import { db, getBath, getBowl, getStats, toggleBath, toggleBowl } from "../api/lib/db.js";

test.beforeEach(async () => {
  await db.batch(["DELETE FROM bowls", "DELETE FROM baths"], "write").catch(() => {});
});

test("getBowl creates a blank row; toggleBowl flips items independently", async () => {
  assert.deepEqual({ ...(await getBowl("2026-08-18")) }, { water: 0, food: 0, skipped: 0 });
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
  assert.deepEqual(await toggleBath("2026-W34"), { done: true, skipped: false });
  assert.deepEqual(await toggleBath("2026-W34"), { done: false, skipped: false });
  assert.deepEqual(await toggleBath("2026-W35"), { done: true, skipped: false });
});

test("skip toggles independently of done on bowls", async () => {
  let s = await toggleBowl("2026-08-18", "skip");
  assert.deepEqual({ ...s }, { water: 0, food: 0, skipped: 1 });
  s = await toggleBowl("2026-08-18", "water");
  assert.deepEqual({ ...s }, { water: 1, food: 0, skipped: 1 });
  s = await toggleBowl("2026-08-18", "skip");
  assert.deepEqual({ ...s }, { water: 1, food: 0, skipped: 0 });
});

test("toggleBowl falls back to food for unknown items", async () => {
  const s = await toggleBowl("2026-08-18", "mystery");
  assert.deepEqual({ ...s }, { water: 0, food: 1, skipped: 0 });
});

test("skip toggles independently of done on baths", async () => {
  assert.deepEqual(await toggleBath("2026-W34", "skip"), { done: false, skipped: true });
  assert.deepEqual(await toggleBath("2026-W34"), { done: true, skipped: true });
  assert.deepEqual(await toggleBath("2026-W34", "skip"), { done: true, skipped: false });
  assert.deepEqual(await getBath("2026-W34"), { done: true, skipped: false });
});

test("getStats: null with no data, otherwise one session per day", async () => {
  assert.equal(await getStats("2026-08-18"), null);

  await toggleBowl("2026-08-21", "water");
  await toggleBowl("2026-08-21", "food"); // done
  await toggleBowl("2026-08-22", "water"); // half -> missed
  await getBowl("2026-08-23"); // untouched -> missed
  await toggleBath("2026-W35");

  const s = await getStats("2026-08-23");
  assert.equal(s.start, "2026-08-21");
  assert.equal(s.trackedDays, 3);
  assert.equal(s.doneDays, 1);
  assert.equal(s.missedDays, 2);
  assert.equal(s.donePct, 33);
  assert.equal(s.missedPct, 67);
  // 2026-08-21 (Fri, W34) .. 2026-08-23 (Sun, W35: the Sat starts a new week) -> 2 weeks, 1 bathed
  assert.equal(s.trackedWeeks, 2);
  assert.equal(s.bathsDone, 1);
  assert.equal(s.bathsMissed, 1);
  assert.equal(s.bathDonePct, 50);
});

test("getStats: bath in the same week as the first bowl does not add missed bowl days", async () => {
  await toggleBowl("2026-08-18", "water");
  await toggleBowl("2026-08-18", "food");
  await toggleBath("2026-W34"); // week of Sat 2026-08-15, before the first bowl day
  const s = await getStats("2026-08-18");
  assert.equal(s.start, "2026-08-18");
  assert.equal(s.trackedDays, 1);
  assert.equal(s.doneDays, 1);
  assert.equal(s.trackedWeeks, 1);
  assert.equal(s.bathsDone, 1);
});

test("getStats: earlier baths widen the week range but not the day range", async () => {
  await toggleBath("2026-W33"); // week of Sat 2026-08-08
  await getBowl("2026-08-18");
  const s = await getStats("2026-08-18");
  assert.equal(s.start, "2026-08-18");
  assert.equal(s.trackedDays, 1);
  assert.equal(s.trackedWeeks, 2); // W33, W34
  assert.equal(s.bathsDone, 1);
  assert.equal(s.bathsMissed, 1);
});

test("getStats: bath before any bowl starts the window; baths outside 30 days ignored", async () => {
  await toggleBath("2026-W33"); // week of Sat 2026-08-08
  await toggleBath("2026-W20"); // long ago -> outside 30-day window
  const s = await getStats("2026-08-18");
  assert.equal(s.start, "2026-07-20"); // clamped to the 30-day window
  assert.equal(s.trackedWeeks, 5); // W30..W34
  assert.equal(s.bathsDone, 1);
  assert.equal(s.bathsMissed, 4);
});

test("getStats: a skipped day counts as done and is reported separately", async () => {
  await toggleBowl("2026-08-21", "water");
  await toggleBowl("2026-08-21", "food"); // done
  await toggleBowl("2026-08-22", "skip"); // skipped -> counts as done
  await getBowl("2026-08-23"); // untouched -> missed
  const s = await getStats("2026-08-23");
  assert.equal(s.trackedDays, 3);
  assert.equal(s.doneDays, 2);
  assert.equal(s.missedDays, 1);
  assert.equal(s.donePct, 67);
  assert.equal(s.skippedDays, 1);
  assert.equal(s.skippedPct, 33);
});

test("getStats: a day both ticked and skipped counts once", async () => {
  await toggleBowl("2026-08-21", "water");
  await toggleBowl("2026-08-21", "food");
  await toggleBowl("2026-08-21", "skip");
  const s = await getStats("2026-08-21");
  assert.equal(s.trackedDays, 1);
  assert.equal(s.doneDays, 1);
  assert.equal(s.missedDays, 0);
  assert.equal(s.skippedDays, 1);
});

test("getStats: a skipped week counts as a bath done", async () => {
  await toggleBath("2026-W35", "skip"); // week of Sat 2026-08-22
  const s = await getStats("2026-08-23");
  assert.equal(s.trackedWeeks, 1);
  assert.equal(s.bathsDone, 1);
  assert.equal(s.bathsMissed, 0);
  assert.equal(s.bathsSkipped, 1);
  assert.equal(s.bathSkippedPct, 100);
});

test("getStats window is capped at 30 days", async () => {
  await toggleBowl("2026-01-01", "water");
  const s = await getStats("2026-08-18");
  assert.equal(s.trackedDays, 30);
  assert.equal(s.start, "2026-07-20");
});
