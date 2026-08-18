const mark = (v) => (v ? "✅" : "⬜");

export function bowlKeyboard(state) {
  return {
    inline_keyboard: [
      [
        { text: `${mark(state.water)} Water bowl`, callback_data: "bowl:water" },
        { text: `${mark(state.food)} Food bowl`, callback_data: "bowl:food" },
      ],
    ],
  };
}

export function bathKeyboard(done) {
  return {
    inline_keyboard: [
      [{ text: done ? "✅ Bathed!" : "⬜ Bath the dog", callback_data: "bath:done" }],
    ],
  };
}
