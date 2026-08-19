import assert from "node:assert/strict";
import { test } from "node:test";
import bath from "../api/cron/bath.js";
import bowls from "../api/cron/bowls.js";
import { toggleBath, toggleBowl } from "../api/lib/db.js";
import { todayKey, weekKey } from "../api/lib/util.js";
import { calls, mockRes } from "./helpers.js";

test.beforeEach(() => (calls.length = 0));

test("crons reject missing/wrong CRON_SECRET", async () => {
  for (const h of [bowls, bath]) {
    const res = mockRes();
    await h({ headers: {} }, res);
    assert.equal(res.statusCode, 401);
    await h({ headers: { authorization: "Bearer nope" } }, res);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(calls.length, 0);
});

test("bowl cron sends checklist with bowl:* callback data to CHAT_ID", async () => {
  const res = mockRes();
  await bowls({ headers: { authorization: "Bearer cron-secret" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  const { method, payload } = calls[0];
  assert.equal(method, "sendMessage");
  assert.equal(payload.chat_id, "12345");
  assert.match(payload.text, /wash the bowls/);
  const data = payload.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  assert.deepEqual(data, [`bowl:water:${todayKey()}`, `bowl:food:${todayKey()}`]);
});

test("bath cron sends checklist with bath:done callback data", async () => {
  const res = mockRes();
  await bath({ headers: { authorization: "Bearer cron-secret" } }, res);
  assert.equal(res.statusCode, 200);
  const { payload } = calls[0];
  assert.match(payload.text, /bath time/);
  assert.equal(payload.reply_markup.inline_keyboard[0][0].callback_data, `bath:done:${weekKey()}`);
});

test("crons reflect state already ticked earlier that day/week", async () => {
  await toggleBowl(todayKey(), "water");
  await toggleBath(weekKey());
  const res = mockRes();
  await bowls({ headers: { authorization: "Bearer cron-secret" } }, res);
  await bath({ headers: { authorization: "Bearer cron-secret" } }, res);
  const [b1, b2] = calls[0].payload.reply_markup.inline_keyboard[0];
  assert.match(b1.text, /✅/);
  assert.match(b2.text, /⬜/);
  assert.match(calls[1].payload.reply_markup.inline_keyboard[0][0].text, /✅/);
});
