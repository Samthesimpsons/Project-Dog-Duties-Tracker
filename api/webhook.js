import { getBath, getBowl, getStats, toggleBath, toggleBowl } from "./lib/db.js";
import { bathKeyboard, bowlKeyboard } from "./lib/keyboard.js";
import {
  bathWeek,
  CHAT_ID,
  parseDateArg,
  prettyKey,
  tg,
  todayKey,
  weekKey,
  weekStartOf,
} from "./lib/util.js";

async function handleCallback(cb) {
  try {
    const msg = cb.message;
    if (!msg) return;
    if (CHAT_ID && String(msg.chat.id) !== String(CHAT_ID)) return;

    const [kind, item, key] = (cb.data ?? "").split(":");
    const base = (msg.text ?? "").replace(/ (?:🎉|⏭️)$/u, "");
    // Skip wins over 🎉 when both apply - it's the more informative signal.
    const marker = (done, skipped) => (skipped ? " ⏭️" : done ? " 🎉" : "");

    if (kind === "bath") {
      const week = key || weekKey();
      const state = await toggleBath(week, item);
      await tg("editMessageText", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        text: base + marker(state.done, state.skipped),
        reply_markup: bathKeyboard(state, week),
      });
    } else if (kind === "bowl") {
      const date = key || todayKey();
      const state = await toggleBowl(date, item);
      await tg("editMessageText", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        text:
          base +
          marker(state.water && state.food && state.bible && state.leetcode, state.skipped),
        reply_markup: bowlKeyboard(state, date),
      });
    }
  } finally {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
  }
}

const HELP = [
  "🐶 Commands",
  "",
  "/bowls - today's daily checklist",
  "/bowls YYYY-MM-DD - daily checklist for that day",
  "/bath - this week's bath checklist",
  "/bath YYYY-MM-DD - bath checklist for the week (Sat-Fri) containing that day",
  "/status - bowl & bath stats for the last 30 days",
  "/id - show your chat id",
  "/help - this list",
].join("\n");

async function handleStatus(chatId) {
  const stats = await getStats(todayKey());
  if (!stats) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "No data yet - tick your first checklist and check back!",
    });
    return;
  }
  const bar = (pct) => {
    const filled = Math.round(pct / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  };
  const text = [
    `📊 Last ${stats.trackedDays} day(s) (since ${stats.start})`,
    ``,
    `Bowls done: ${stats.doneDays}/${stats.trackedDays} days`,
    `${bar(stats.donePct)} ${stats.donePct}% done`,
    `Missed: ${stats.missedDays} days (${stats.missedPct}%)`,
    `Skipped: ${stats.skippedDays} days (${stats.skippedPct}%)`,
    ``,
    `🛁 Baths done: ${stats.bathsDone}/${stats.trackedWeeks} weeks`,
    `${bar(stats.bathDonePct)} ${stats.bathDonePct}% done`,
    `Missed: ${stats.bathsMissed} weeks (${stats.bathMissedPct}%)`,
    `Skipped: ${stats.bathsSkipped} weeks (${stats.bathSkippedPct}%)`,
  ].join("\n");
  await tg("sendMessage", { chat_id: chatId, text });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).end();
  }

  const update = req.body;

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message?.text) {
      const chatId = update.message.chat.id;

      if (CHAT_ID && String(chatId) !== String(CHAT_ID)) {
        return res.status(200).json({ ok: true });
      }

      // "/bowls 2026-08-18" -> cmd "/bowls", arg "2026-08-18"; bare "/bowls" -> arg undefined
      const [cmd, arg] = update.message.text.trim().split(/\s+/);
      const date = arg === undefined ? todayKey() : parseDateArg(arg);

      if (cmd === "/status" || cmd === "/stats") {
        await handleStatus(chatId);
      } else if (cmd === "/bowls") {
        if (!date) {
          await tg("sendMessage", { chat_id: chatId, text: "Usage: /bowls [YYYY-MM-DD]" });
        } else {
          const state = await getBowl(date);
          await tg("sendMessage", {
            chat_id: chatId,
            text: `☀️ ${prettyKey(date)} - daily checklist:`,
            reply_markup: bowlKeyboard(state, date),
          });
        }
      } else if (cmd === "/bath") {
        if (!date) {
          await tg("sendMessage", { chat_id: chatId, text: "Usage: /bath [YYYY-MM-DD]" });
        } else {
          const week = bathWeek(date);
          const state = await getBath(week);
          await tg("sendMessage", {
            chat_id: chatId,
            text: `🛁 Week of ${prettyKey(weekStartOf(week))} - bath time:`,
            reply_markup: bathKeyboard(state, week),
          });
        }
      } else if (cmd === "/help") {
        await tg("sendMessage", { chat_id: chatId, text: HELP });
      } else if (cmd === "/id") {
        await tg("sendMessage", { chat_id: chatId, text: `Your chat id: ${chatId}` });
      }
    }
  } catch (err) {
    console.error(err);
  }

  return res.status(200).json({ ok: true });
}
