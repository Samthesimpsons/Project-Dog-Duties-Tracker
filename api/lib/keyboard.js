const mark = (v) => (v ? "✅" : "⬜");

export function bowlKeyboard(state, date) {
  return {
    inline_keyboard: [
      [
        { text: `${mark(state.water)} Water bowl`, callback_data: `bowl:water:${date}` },
        { text: `${mark(state.food)} Food bowl`, callback_data: `bowl:food:${date}` },
      ],
    ],
  };
}

export function bathKeyboard(done, week) {
  return {
    inline_keyboard: [
      [{ text: done ? "✅ Bathed!" : "⬜ Bath the dog", callback_data: `bath:done:${week}` }],
    ],
  };
}
