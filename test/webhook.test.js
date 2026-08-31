import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../api/lib/db.js";
import { todayKey } from "../api/lib/util.js";
import handler from "../api/webhook.js";
import { calls, mockRes } from "./helpers.js";

const SECRET = { "x-telegram-bot-api-secret-token": "hook-secret" };
const post = (body, headers = SECRET) => {
  const res = mockRes();
  return handler({ method: "POST", headers, body }, res).then(() => res);
};
const msg = (text, chatId = 12345) => ({ message: { chat: { id: chatId }, text } });
const cb = (data, text = "☀️ Tue 18 Aug - wash the bowls:") => ({
  callback_query: { id: "cbid", data, message: { chat: { id: 12345 }, message_id: 7, text } },
});

test.beforeEach(async () => {
  calls.length = 0;
  await db.batch(["DELETE FROM bowls", "DELETE FROM baths"], "write").catch(() => {});
});

test("rejects non-POST and bad secret", async () => {
  const r1 = mockRes();
  await handler({ method: "GET", headers: SECRET }, r1);
  assert.equal(r1.statusCode, 405);
  const r2 = await post(msg("/id"), {});
  assert.equal(r2.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("ignores commands from other chats", async () => {
  await post(msg("/id", 999));
  assert.equal(calls.length, 0);
});

test("/id replies with chat id", async () => {
  await post(msg("/id"));
  assert.equal(calls[0].payload.text, "Your chat id: 12345");
});

test("/bowls sends a single checklist reflecting today's state", async () => {
  await post(cb("bowl:water"));
  calls.length = 0;
  await post(msg("/bowls"));
  assert.equal(calls.length, 1);
  const btns = calls[0].payload.reply_markup.inline_keyboard[0];
  assert.equal(btns[0].text, "✅ Water bowl");
  assert.equal(btns[1].text, "⬜ Food bowl");
});

test("bowl buttons toggle, edit message, add 🎉 when both done", async () => {
  await post(cb("bowl:water"));
  let edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.message_id, 7);
  assert.equal(edit.text, "☀️ Tue 18 Aug - wash the bowls:");
  assert.equal(edit.reply_markup.inline_keyboard[0][0].text, "✅ Water bowl");
  assert.ok(calls.some((c) => c.method === "answerCallbackQuery"));

  calls.length = 0;
  await post(cb("bowl:food"));
  edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.text, "☀️ Tue 18 Aug - wash the bowls: 🎉");

  // untick -> 🎉 removed
  calls.length = 0;
  await post(cb("bowl:food", "☀️ Tue 18 Aug - wash the bowls: 🎉"));
  edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.text, "☀️ Tue 18 Aug - wash the bowls:");

  const row = await db.execute("SELECT water, food FROM bowls WHERE date = ?", [todayKey()]);
  assert.equal(row.rows[0].water, 1);
  assert.equal(row.rows[0].food, 0);
});

test("bath button toggles and edits", async () => {
  await post(cb("bath:done", "🛁 Sat 22 Aug - bath time:"));
  let edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.text, "🛁 Sat 22 Aug - bath time: 🎉");
  assert.equal(edit.reply_markup.inline_keyboard[0][0].text, "✅ Bathed!");
  calls.length = 0;
  await post(cb("bath:done", "🛁 Sat 22 Aug - bath time: 🎉"));
  edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.text, "🛁 Sat 22 Aug - bath time:");
  assert.equal(edit.reply_markup.inline_keyboard[0][0].text, "⬜ Bath the dog");
});

test("/status reports days, not sessions", async () => {
  await post(msg("/status"));
  assert.match(calls[0].payload.text, /No data yet/);
  calls.length = 0;
  await post(cb("bowl:water"));
  await post(cb("bowl:food"));
  calls.length = 0;
  await post(msg("/status"));
  const t = calls[0].payload.text;
  assert.match(t, /Last 1 day\(s\)/);
  assert.match(t, /Bowls done: 1\/1 days/);
  assert.match(t, /100% done/);
  assert.match(t, /Baths done: 0\/1 weeks/);
  assert.match(t, /Missed: 1 weeks \(100%\)/);
});

test("skip button adds ⏭️, removes it on untick, and wins over 🎉", async () => {
  await post(cb("bowl:skip"));
  let edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.text, "☀️ Tue 18 Aug - wash the bowls: ⏭️");
  assert.equal(edit.reply_markup.inline_keyboard[1][0].text, "✅ Skip today");

  // both bowls ticked while skipped -> ⏭️ still wins over 🎉
  await post(cb("bowl:water", "☀️ Tue 18 Aug - wash the bowls: ⏭️"));
  calls.length = 0;
  await post(cb("bowl:food", "☀️ Tue 18 Aug - wash the bowls: ⏭️"));
  edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.text, "☀️ Tue 18 Aug - wash the bowls: ⏭️");

  // unskip -> both bowls are still done, so 🎉 replaces ⏭️
  calls.length = 0;
  await post(cb("bowl:skip", "☀️ Tue 18 Aug - wash the bowls: ⏭️"));
  edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.text, "☀️ Tue 18 Aug - wash the bowls: 🎉");
});

test("bath skip button adds ⏭️ and removes it on untick", async () => {
  await post(cb("bath:skip", "🛁 Sat 22 Aug - bath time:"));
  let edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.text, "🛁 Sat 22 Aug - bath time: ⏭️");
  assert.equal(edit.reply_markup.inline_keyboard[1][0].text, "✅ Skip this week");
  calls.length = 0;
  await post(cb("bath:skip", "🛁 Sat 22 Aug - bath time: ⏭️"));
  edit = calls.find((c) => c.method === "editMessageText").payload;
  assert.equal(edit.text, "🛁 Sat 22 Aug - bath time:");
  assert.equal(edit.reply_markup.inline_keyboard[1][0].text, "⬜ Skip this week");
});

test("/status shows Skipped: lines under the Missed: lines", async () => {
  await post(cb("bowl:skip"));
  await post(cb("bath:skip", "🛁 bath time:"));
  calls.length = 0;
  await post(msg("/status"));
  const t = calls[0].payload.text;
  assert.match(t, /Bowls done: 1\/1 days/);
  assert.match(t, /Missed: 0 days \(0%\)\nSkipped: 1 days \(100%\)/);
  assert.match(t, /Baths done: 1\/1 weeks/);
  assert.match(t, /Missed: 0 weeks \(0%\)\nSkipped: 1 weeks \(100%\)/);
});
