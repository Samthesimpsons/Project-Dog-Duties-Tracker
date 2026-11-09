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

export function leetcodeKeyboard(state, date) {
  return {
    inline_keyboard: [
      [
        {
          text: state.done ? "✅ LeetCode done!" : "⬜ Do a LeetCode question",
          callback_data: `leetcode:done:${date}`,
        },
      ],
      [{ text: `${mark(state.skipped)} Skip today`, callback_data: `leetcode:skip:${date}` }],
    ],
  };
}

export function bibleKeyboard(state, date) {
  return {
    inline_keyboard: [
      [
        {
          text: state.done ? "✅ Bible read!" : "⬜ Read the bible",
          callback_data: `bible:done:${date}`,
        },
      ],
      [{ text: `${mark(state.skipped)} Skip today`, callback_data: `bible:skip:${date}` }],
    ],
  };
}

export function quantKeyboard(state, date) {
  return {
    inline_keyboard: [
      [
        {
          text: state.done ? "✅ Quant textbook read!" : "⬜ Read Quant textbook (30 min)",
          callback_data: `quant:done:${date}`,
        },
      ],
      [{ text: `${mark(state.skipped)} Skip today`, callback_data: `quant:skip:${date}` }],
    ],
  };
}
