// Loaded via `node --import` (see package.json) so env is set before any api/ module.

process.env.TURSO_DATABASE_URL = ":memory:";
process.env.TURSO_AUTH_TOKEN = "";
process.env.TELEGRAM_BOT_TOKEN = "TOKEN";
process.env.TELEGRAM_WEBHOOK_SECRET = "hook-secret";
process.env.CRON_SECRET = "cron-secret";
process.env.TELEGRAM_CHAT_ID = "12345";
process.env.TZ_OFFSET_HOURS = "8";

/** Records every Telegram call as { method, payload }. */
export const calls = [];
globalThis.fetch = async (url, opts) => {
  const method = url.split("/").pop();
  calls.push({ method, payload: JSON.parse(opts.body) });
  return { json: async () => ({ ok: true, result: {} }) };
};

export function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.end = () => res;
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
}
