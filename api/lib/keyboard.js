const mark = (v) => (v ? "✅" : "⬜");

export function bowlKeyboard(state, date) {
  return {
    inline_keyboard: [
      [
        { text: `${mark(state.water)} Water bowl`, callback_data: `bowl:water:${date}` },
        { text: `${mark(state.food)} Food bowl`, callback_data: `bowl:food:${date}` },
      ],
      [{ text: `${mark(state.skipped)} Skip today`, callback_data: `bowl:skip:${date}` }],
    ],
  };
}

export function bathKeyboard(state, week) {
  return {
    inline_keyboard: [
      [{ text: state.done ? "✅ Bathed!" : "⬜ Bath the dog", callback_data: `bath:done:${week}` }],
      [{ text: `${mark(state.skipped)} Skip this week`, callback_data: `bath:skip:${week}` }],
    ],
  };
}
