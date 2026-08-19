import { getBath } from "../lib/db.js";
import { bathKeyboard } from "../lib/keyboard.js";
import { CHAT_ID, prettyDate, tg, weekKey } from "../lib/util.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  const week = weekKey();
  const done = await getBath(week);
  await tg("sendMessage", {
    chat_id: CHAT_ID,
    text: `🛁 ${prettyDate()} - bath time:`,
    reply_markup: bathKeyboard(done, week),
  });
  return res.status(200).json({ ok: true });
}
