import assert from "node:assert/strict";
import { test } from "node:test";
import { isoWeek, mondayOf, prettyDate, todayKey, weekKey } from "../api/lib/util.js";

test("todayKey flips at Singapore midnight, not UTC", () => {
  // 2026-08-18 15:59 UTC = 23:59 SGT  -> still the 18th
  assert.equal(todayKey(new Date("2026-08-18T15:59:00Z")), "2026-08-18");
  // 2026-08-18 16:00 UTC = 00:00 SGT (19th)
  assert.equal(todayKey(new Date("2026-08-18T16:00:00Z")), "2026-08-19");
});

test("bowl cron time (13:00 UTC) lands on the same SGT day", () => {
  assert.equal(todayKey(new Date("2026-08-18T13:00:00Z")), "2026-08-18");
});

test("weekKey is ISO week and stable across the weekend", () => {
  // Sat 2026-08-22 01:00 UTC (bath cron) and Sun 2026-08-23 -> same week
  assert.equal(weekKey(new Date("2026-08-22T01:00:00Z")), "2026-W34");
  assert.equal(weekKey(new Date("2026-08-23T12:00:00Z")), "2026-W34");
  // Monday starts a new ISO week
  assert.equal(weekKey(new Date("2026-08-24T01:00:00Z")), "2026-W35");
});

test("prettyDate uses the local (SGT) day", () => {
  // 17:00 UTC Tue 18 Aug = 01:00 SGT Wed 19 Aug
  assert.equal(prettyDate(new Date("2026-08-18T17:00:00Z")), "Wed 19 Aug");
});

test("isoWeek accepts date strings; mondayOf inverts it", () => {
  assert.equal(isoWeek("2026-08-18"), "2026-W34");
  assert.equal(mondayOf("2026-W34"), "2026-08-17");
  assert.equal(isoWeek("2026-01-01"), "2026-W01");
  assert.equal(mondayOf("2026-W01"), "2025-12-29");
  assert.equal(mondayOf(isoWeek("2027-01-03")), "2026-12-28"); // 2027-01-03 is in 2026-W53
});
