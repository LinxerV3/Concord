/* Emoji shortcodes — type :fire: and it renders 🔥.
   Also exports a curated set for the reaction/emoji picker. */

export const SHORTCODES: Record<string, string> = {
  smile: "😄", grin: "😁", joy: "😂", rofl: "🤣", sob: "😭", cry: "😢",
  heart: "❤️", broken_heart: "💔", sparkling_heart: "💖", fire: "🔥",
  skull: "💀", ghost: "👻", clown: "🤡", sunglasses: "😎", nerd: "🤓",
  thinking: "🤔", eyes: "👀", pray: "🙏", clap: "👏", wave: "👋",
  ok_hand: "👌", thumbsup: "👍", thumbsdown: "👎", fist: "✊", muscle: "💪",
  100: "💯", tada: "🎉", party: "🥳", rocket: "🚀", star: "⭐", zap: "⚡",
  boom: "💥", sparkles: "✨", crown: "👑", gem: "💎", moneybag: "💰",
  cool: "🆒", warning: "⚠️", check: "✅", x: "❌", question: "❓",
  exclamation: "❗", zzz: "💤", poop: "💩", alien: "👽", robot: "🤖",
  cat: "🐱", dog: "🐶", pizza: "🍕", burger: "🍔", coffee: "☕",
  gamepad: "🎮", trophy: "🏆", music: "🎵", headphones: "🎧", brain: "🧠",
  wink: "😉", smirk: "😏", flushed: "😳", pleading: "🥺", cursed: "😩",
  angry: "😠", rage: "😡", cold: "🥶", hot: "🥵", dizzy: "😵",
  salute: "🫡", handshake: "🤝", peace: "✌️", crossed: "🤞", metal: "🤘",
  goat: "🐐", snake: "🐍", frog: "🐸", monkey: "🐵", bear: "🐻",
  jojo: "🗿", stand: "🌟", menacing: "🇾🇾", ora: "👊",
};

/** Reaction picker — a compact, useful set (not the whole unicode table). */
export const QUICK_REACTIONS = [
  "👍","❤️","😂","😮","😢","🔥","💯","🎉","👀","💀","🙏","✨","🗿","👑","🤝","🧠",
];

/** Split a string into text + emoji parts, replacing :code: with the emoji. */
export function renderShortcodes(text: string): string {
  return text.replace(/:([a-z0-9_]+):/gi, (whole, code) => {
    const key = code.toLowerCase();
    return SHORTCODES[key] || whole;
  });
}

/** For an autocomplete hint: does the text end in an in-progress :code ? */
export function shortcodeSuggestions(text: string): string[] {
  const m = text.match(/:([a-z0-9_]{1,})$/i);
  if (!m) return [];
  const q = m[1].toLowerCase();
  return Object.keys(SHORTCODES).filter((k) => k.startsWith(q)).slice(0, 6);
}
