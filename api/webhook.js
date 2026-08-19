import { getBath, getBowl, getStats, toggleBath, toggleBowl } from "./lib/db.js";
import { bathKeyboard, bowlKeyboard } from "./lib/keyboard.js";
import { CHAT_ID, tg, todayKey, weekKey } from "./lib/util.js";

async function handleCallback(cb) {
  try {
    const msg = cb.message;
    if (!msg) return;
    if (CHAT_ID && String(msg.chat.id) !== String(CHAT_ID)) return;

    const [kind, item, key] = (cb.data ?? "").split(":");
    const base = (msg.text ?? "").replace(/ 🎉$/, "");

    if (kind === "bath") {
      const week = key || weekKey();
      const done = await toggleBath(week);
      await tg("editMessageText", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        text: done ? `${base} 🎉` : base,
        reply_markup: bathKeyboard(done, week),
      });
    } else if (kind === "bowl") {
      const date = key || todayKey();
      const state = await toggleBowl(date, item);
      const allDone = state.water && state.food;
      await tg("editMessageText", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        text: allDone ? `${base} 🎉` : base,
        reply_markup: bowlKeyboard(state, date),
      });
    }
  } finally {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
  }
}

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
    `Bowls washed: ${stats.doneDays}/${stats.trackedDays} days`,
    `${bar(stats.donePct)} ${stats.donePct}% done`,
    `Missed: ${stats.missedDays} days (${stats.missedPct}%)`,
    ``,
    `🛁 Baths done: ${stats.bathsDone}/${stats.trackedWeeks} weeks`,
    `${bar(stats.bathDonePct)} ${stats.bathDonePct}% done`,
    `Missed: ${stats.bathsMissed} weeks (${stats.bathMissedPct}%)`,
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

      const text = update.message.text.trim();
      if (text === "/status" || text === "/stats") {
        await handleStatus(chatId);
      } else if (text === "/bowls") {
        const date = todayKey();
        const state = await getBowl(date);
        await tg("sendMessage", {
          chat_id: chatId,
          text: "☀️ Wash the bowls:",
          reply_markup: bowlKeyboard(state, date),
        });
      } else if (text === "/bath") {
        const week = weekKey();
        const done = await getBath(week);
        await tg("sendMessage", {
          chat_id: chatId,
          text: "🛁 Bath time:",
          reply_markup: bathKeyboard(done, week),
        });
      } else if (text === "/id") {
        await tg("sendMessage", { chat_id: chatId, text: `Your chat id: ${chatId}` });
      }
    }
  } catch (err) {
    console.error(err);
  }

  return res.status(200).json({ ok: true });
}
