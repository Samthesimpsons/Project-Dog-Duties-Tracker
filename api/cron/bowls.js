import { getBowl } from "../lib/db.js";
import { bowlKeyboard } from "../lib/keyboard.js";
import { CHAT_ID, prettyDate, tg, todayKey } from "../lib/util.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  const date = todayKey();
  const state = await getBowl(date);
  await tg("sendMessage", {
    chat_id: CHAT_ID,
    text: `🌙 ${prettyDate()} - wash the bowls:`,
    reply_markup: bowlKeyboard(state, date),
  });
  return res.status(200).json({ ok: true });
}
