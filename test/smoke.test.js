import assert from "node:assert/strict";
import { test } from "node:test";
import bath from "../api/cron/bath.js";
import bowls from "../api/cron/bowls.js";
import { db } from "../api/lib/db.js";
import { todayKey, weekKey } from "../api/lib/util.js";
import handler from "../api/webhook.js";
import { calls, mockRes } from "./helpers.js";

const SECRET = { "x-telegram-bot-api-secret-token": "hook-secret" };
const CRON = { authorization: "Bearer cron-secret" };
const post = async (body) => {
  const res = mockRes();
  await handler({ method: "POST", headers: SECRET, body }, res);
  return res;
};
const msg = (text, chatId = 12345) => ({ message: { chat: { id: chatId }, text } });
const tap = (data, text = "🌙 wash the bowls:", chatId = 12345) => ({
  callback_query: { id: "cbid", data, message: { chat: { id: chatId }, message_id: 7, text } },
});
const last = (method) => calls.filter((c) => c.method === method).at(-1)?.payload;
const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;

test.beforeEach(async () => {
  calls.length = 0;
  await db.batch(["DELETE FROM bowls", "DELETE FROM baths"], "write").catch(() => {});
});

test("full day: cron message -> tap both buttons -> /status shows 1/1", async () => {
  await bowls({ headers: CRON }, mockRes());
  const sent = last("sendMessage");
  const [water, food] = sent.reply_markup.inline_keyboard[0];

  await post(tap(water.callback_data, sent.text));
  await post(tap(food.callback_data, sent.text));
  const edit = last("editMessageText");
  assert.match(edit.text, /🎉$/);
  assert.equal(edit.reply_markup.inline_keyboard[0][0].text, "✅ Water bowl");
  assert.equal(edit.reply_markup.inline_keyboard[0][1].text, "✅ Food bowl");

  assert.equal(calls.filter((c) => c.method === "answerCallbackQuery").length, 2);

  calls.length = 0;
  await post(msg("/status"));
  assert.match(last("sendMessage").text, /Bowls washed: 1\/1 days/);
});

test("late tap after midnight credits the day printed on the message, not today", async () => {
  await post(tap("bowl:water:2026-08-18"));
  await post(tap("bowl:food:2026-08-18"));
  const r = await rows("SELECT date, water, food FROM bowls");
  assert.deepEqual(
    r.map((x) => ({ ...x })),
    [{ date: "2026-08-18", water: 1, food: 1 }],
  );

  const kb = last("editMessageText").reply_markup.inline_keyboard[0];
  assert.equal(kb[0].callback_data, "bowl:water:2026-08-18");
});

test("bath message tapped the following week credits the message's week", async () => {
  await post(tap("bath:done:2026-W33", "🛁 bath time:"));
  const r = await rows("SELECT week, done FROM baths");
  assert.deepEqual(
    r.map((x) => ({ ...x })),
    [{ week: "2026-W33", done: 1 }],
  );
  assert.equal(
    last("editMessageText").reply_markup.inline_keyboard[0][0].callback_data,
    "bath:done:2026-W33",
  );
});

test("legacy buttons without an embedded key fall back to today / this week", async () => {
  await post(tap("bowl:water"));
  await post(tap("bath:done", "🛁 bath time:"));
  assert.equal((await rows("SELECT date FROM bowls"))[0].date, todayKey());
  assert.equal((await rows("SELECT week FROM baths"))[0].week, weekKey());
});

test("/bowls and /bath on demand mirror DB state and do not create duplicate rows", async () => {
  await post(msg("/bowls"));
  await post(msg("/bowls"));
  await post(msg("/bath"));
  await bowls({ headers: CRON }, mockRes());
  await bath({ headers: CRON }, mockRes());
  assert.equal((await rows("SELECT COUNT(*) AS n FROM bowls"))[0].n, 1);
  assert.equal((await rows("SELECT COUNT(*) AS n FROM baths"))[0].n, 1);

  await post(tap(`bowl:food:${todayKey()}`));
  await post(tap(`bath:done:${weekKey()}`, "🛁 bath time:"));
  calls.length = 0;
  await post(msg("/bowls"));
  await post(msg("/bath"));
  const [bowlsMsg, bathMsg] = calls.filter((c) => c.method === "sendMessage").map((c) => c.payload);
  assert.equal(bowlsMsg.reply_markup.inline_keyboard[0][0].text, "⬜ Water bowl");
  assert.equal(bowlsMsg.reply_markup.inline_keyboard[0][1].text, "✅ Food bowl");
  assert.equal(bathMsg.reply_markup.inline_keyboard[0][0].text, "✅ Bathed!");
});

test("untouched day and untouched week both count as missed in /status", async () => {
  await bowls({ headers: CRON }, mockRes());
  await bath({ headers: CRON }, mockRes());
  calls.length = 0;
  await post(msg("/status"));
  const t = last("sendMessage").text;
  assert.match(t, /Bowls washed: 0\/1 days/);
  assert.match(t, /Missed: 1 days \(100%\)/);
  assert.match(t, /Baths done: 0\/1 weeks/);
});

test("callbacks from other chats are ignored and change nothing", async () => {
  await post(tap(`bowl:water:${todayKey()}`, "🌙", 999));
  assert.equal((await rows("SELECT COUNT(*) AS n FROM bowls"))[0].n, 0);
  assert.ok(!calls.some((c) => c.method === "editMessageText"));
  assert.ok(calls.some((c) => c.method === "answerCallbackQuery"));
});

test("malformed updates never 500 and never leave a spinner", async () => {
  const odd = [
    { callback_query: { id: "x", data: "bowl:water:2026-08-18" } },
    { callback_query: { id: "x", message: { chat: { id: 12345 }, message_id: 1 } } },
    {
      callback_query: {
        id: "x",
        data: "what:ever",
        message: { chat: { id: 12345 }, message_id: 1, text: "" },
      },
    },
    { message: { chat: { id: 12345 } } },
    { message: { chat: { id: 12345 }, text: "hello" } },
    { edited_message: { chat: { id: 12345 }, text: "/bowls" } },
    {},
  ];
  for (const u of odd) {
    calls.length = 0;
    const res = await post(u);
    assert.equal(res.statusCode, 200);
    if (u.callback_query) assert.ok(calls.some((c) => c.method === "answerCallbackQuery"));
  }
  assert.equal((await rows("SELECT COUNT(*) AS n FROM bowls"))[0].n, 0);
});

test("a Telegram API failure is logged, not thrown, and the webhook still returns 200", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => ({ ok: false, description: "boom" }) });
  try {
    const res = await post(msg("/bowls"));
    assert.equal(res.statusCode, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
});
