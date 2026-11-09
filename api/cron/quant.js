import { getQuant } from "../lib/db.js";
import { quantKeyboard } from "../lib/keyboard.js";
import { CHAT_ID, prettyDate, tg, todayKey } from "../lib/util.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  const date = todayKey();
  const state = await getQuant(date);
  await tg("sendMessage", {
    chat_id: CHAT_ID,
    text: `${prettyDate()} - Read a Quant textbook for 30 minutes: 📈`,
    reply_markup: quantKeyboard(state, date),
  });
  return res.status(200).json({ ok: true });
}
