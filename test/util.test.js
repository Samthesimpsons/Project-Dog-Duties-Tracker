import assert from "node:assert/strict";
import { test } from "node:test";
import { bathWeek, isoWeek, prettyDate, todayKey, weekKey, weekStartOf } from "../api/lib/util.js";

test("todayKey flips at Singapore midnight, not UTC", () => {
  // 2026-08-18 15:59 UTC = 23:59 SGT  -> still the 18th
  assert.equal(todayKey(new Date("2026-08-18T15:59:00Z")), "2026-08-18");
  // 2026-08-18 16:00 UTC = 00:00 SGT (19th)
  assert.equal(todayKey(new Date("2026-08-18T16:00:00Z")), "2026-08-19");
});

test("bowl cron time (01:00 UTC) lands on the same SGT day", () => {
  assert.equal(todayKey(new Date("2026-08-18T01:00:00Z")), "2026-08-18");
});

test("weekKey: bath weeks run Sat..Fri", () => {
  // Sat 2026-08-22 01:00 UTC (bath cron) starts a new week...
  assert.equal(weekKey(new Date("2026-08-22T01:00:00Z")), "2026-W35");
  assert.equal(weekKey(new Date("2026-08-23T12:00:00Z")), "2026-W35");
  // ...that runs through the following Mon..Fri
  assert.equal(weekKey(new Date("2026-08-24T01:00:00Z")), "2026-W35");
  assert.equal(weekKey(new Date("2026-08-28T12:00:00Z")), "2026-W35");
  // the next Saturday flips to a new week
  assert.equal(weekKey(new Date("2026-08-29T01:00:00Z")), "2026-W36");
});

test("prettyDate uses the local (SGT) day", () => {
  // 17:00 UTC Tue 18 Aug = 01:00 SGT Wed 19 Aug
  assert.equal(prettyDate(new Date("2026-08-18T17:00:00Z")), "Wed 19 Aug");
});

test("bathWeek accepts date strings; weekStartOf gives the week's Saturday", () => {
  assert.equal(isoWeek("2026-08-18"), "2026-W34");
  assert.equal(bathWeek("2026-08-22"), "2026-W35"); // Saturday joins the week ahead
  assert.equal(bathWeek("2026-08-28"), "2026-W35"); // through the following Friday
  assert.equal(weekStartOf("2026-W35"), "2026-08-22");
  assert.equal(weekStartOf("2026-W01"), "2025-12-27");
  assert.equal(weekStartOf(bathWeek("2027-01-02")), "2027-01-02"); // a Saturday starts its own week
});
