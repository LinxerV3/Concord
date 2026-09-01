/* Emoji system:
   - SHORTCODES: :name: -> unicode emoji
   - EMOJI_CATEGORIES: categorized set for the Discord-style picker
   - custom emojis are loaded at runtime from Firestore and merged in
   - autocomplete + render helpers                                        */

export const EMOJI_CATEGORIES: { id: string; name: string; icon: string; emojis: string[] }[] = [
  { id: "faces", name: "Smileys", icon: "😀", emojis: [
    "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙",
    "😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥",
    "😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓",
    "🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞",
    "😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","💩","🤡","👹","👺","👻","👽","🤖","🎃",
  ]},
  { id: "people", name: "People", icon: "👋", emojis: [
    "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎",
    "✊","👊","🤛","🤜","👏","🙌","👐","🤲","🙏","✍️","💅","🤳","💪","🦾","🦵","🦶","👂","👃","🧠","🫀",
    "👀","👁️","👅","👄","🫦","👶","🧒","👦","👧","🧑","👨","👩","🧔","👴","👵","🙍","🙎","🙅","🙆","💁",
    "🙋","🧏","🙇","🤦","🤷","👮","🕵️","💂","🧑‍🍳","🧑‍🎓","🧑‍🎤","🧑‍💻","🧑‍🚀","🦸","🦹","🧙","🧚","🧛","🧜","🧝",
  ]},
  { id: "nature", name: "Animals", icon: "🐶", emojis: [
    "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔",
    "🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🦂",
    "🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓",
    "🌵","🎄","🌲","🌳","🌴","🌱","🌿","☘️","🍀","🎋","🍃","🍂","🍁","🍄","🐚","🌸","🌷","🌹","🌺","🌻",
  ]},
  { id: "food", name: "Food", icon: "🍔", emojis: [
    "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑",
    "🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈",
    "🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🥪","🌮","🌯","🫔","🥙","🧆","🍝","🍜","🍲","🍣",
    "🍱","🍛","🍚","🍙","🍘","🍥","🥟","🦪","🍤","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬",
    "🍭","🍮","🍯","🍼","🥛","☕","🍵","🧃","🥤","🧋","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾",
  ]},
  { id: "activity", name: "Activities", icon: "⚽", emojis: [
    "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🥅","⛳","🪁",
    "🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🏋️","🤼","🤸","⛹️","🤺","🏇",
    "🧘","🏄","🏊","🤽","🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎫","🎟️","🎪","🎭","🎨",
    "🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🪕","🎻","🎲","♟️","🎯","🎳","🎮","🎰","🧩","🕹️",
  ]},
  { id: "travel", name: "Travel", icon: "🚗", emojis: [
    "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🦯","🦽","🦼","🛴","🚲","🛵",
    "🏍️","🛺","🚨","🚔","🚍","🚘","🚖","🚡","🚠","🚟","🚃","🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇",
    "🚊","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶","⛵","🚤","🛥️","🛳️","⛴️","🚢","⚓","🗺️",
    "🗿","🗽","🗼","🏰","🏯","🏟️","🎡","🎢","🎠","⛲","⛱️","🏖️","🏝️","🏜️","🌋","⛰️","🏔️","🗻","🏕️","⛺",
  ]},
  { id: "objects", name: "Objects", icon: "💡", emojis: [
    "⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","🕹️","💽","💾","💿","📀","📷","📸","📹","🎥","📞","☎️","📟","📠",
    "📺","📻","🎙️","⏱️","⏰","🕰️","⌛","⏳","📡","🔋","🔌","💡","🔦","🕯️","🧯","🛢️","💸","💵","💴","💶",
    "💷","🪙","💰","💳","💎","⚖️","🪜","🧰","🔧","🔨","⚒️","🛠️","⛏️","🔩","⚙️","🧱","⛓️","🧲","🔫","💣",
    "🧨","🪓","🔪","🗡️","⚔️","🛡️","🚬","⚰️","🪦","🏺","🔮","📿","🧿","💈","⚗️","🔭","🔬","🕳️","💊","💉",
    "🩸","🧬","🦠","🧫","🧪","🌡️","🧹","🧺","🧻","🚽","🚰","🚿","🛁","🛀","🧼","🪥","🧽","🧴","🔑","🗝️",
  ]},
  { id: "symbols", name: "Symbols", icon: "❤️", emojis: [
    "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️",
    "✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐",
    "♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️",
    "💯","🔥","✨","⭐","🌟","💫","💥","💢","💨","💦","💤","🕐","✅","❌","❓","❗","⚠️","🔞","🚫","💠",
    "🔴","🟠","🟡","🟢","🔵","🟣","🟤","⚫","⚪","🟥","🟧","🟨","🟩","🟦","🟪","🟫","⬛","⬜","🔶","🔷",
  ]},
];

export const SHORTCODES: Record<string, string> = {
  smile: "😄", grin: "😁", joy: "😂", rofl: "🤣", sob: "😭", cry: "😢",
  heart: "❤️", broken_heart: "💔", sparkling_heart: "💖", fire: "🔥",
  skull: "💀", ghost: "👻", clown: "🤡", sunglasses: "😎", nerd: "🤓",
  thinking: "🤔", eyes: "👀", pray: "🙏", clap: "👏", wave: "👋",
  ok_hand: "👌", thumbsup: "👍", thumbsdown: "👎", fist: "✊", muscle: "💪",
  "100": "💯", tada: "🎉", party: "🥳", rocket: "🚀", star: "⭐", zap: "⚡",
  boom: "💥", sparkles: "✨", crown: "👑", gem: "💎", moneybag: "💰",
  cool: "🆒", warning: "⚠️", check: "✅", x: "❌", question: "❓",
  exclamation: "❗", zzz: "💤", poop: "💩", alien: "👽", robot: "🤖",
  cat: "🐱", dog: "🐶", pizza: "🍕", burger: "🍔", coffee: "☕",
  gamepad: "🎮", trophy: "🏆", music: "🎵", headphones: "🎧", brain: "🧠",
  wink: "😉", smirk: "😏", flushed: "😳", pleading: "🥺", cursed: "😩",
  angry: "😠", rage: "😡", cold: "🥶", hot: "🥵", dizzy: "😵",
  salute: "🫡", handshake: "🤝", peace: "✌️", crossed: "🤞", metal: "🤘",
  goat: "🐐", snake: "🐍", frog: "🐸", monkey: "🐵", bear: "🐻",
  jojo: "🗿", ora: "👊", yes: "✅", no: "❌", up: "👆", down: "👇",
  laugh: "😆", sad: "😔", love: "😍", kiss: "😘", cool_face: "😎",
};

export const QUICK_REACTIONS = [
  "👍","❤️","😂","😮","😢","🔥","💯","🎉","👀","💀","🙏","✨","🗿","👑","🤝","🧠",
];

/** Custom emojis loaded at runtime: name -> image url. Set by App. */
export let CUSTOM_EMOJIS: Record<string, string> = {};
export function setCustomEmojis(map: Record<string, string>) { CUSTOM_EMOJIS = map; }

/** Replace :code: with unicode emoji (custom emojis handled separately in render). */
export function renderShortcodes(text: string): string {
  return text.replace(/:([a-z0-9_+-]+):/gi, (whole, code) => {
    const key = code.toLowerCase();
    return SHORTCODES[key] || whole; // leave custom :name: for the JSX renderer
  });
}

/** Autocomplete: text ends in an in-progress :query — return matches. */
export interface EmojiSuggestion { code: string; display: string; isCustom: boolean; }
export function shortcodeSuggestions(text: string): EmojiSuggestion[] {
  const m = text.match(/(?:^|\s):([a-z0-9_+-]{1,})$/i);
  if (!m) return [];
  const q = m[1].toLowerCase();
  const uni = Object.keys(SHORTCODES)
    .filter((k) => k.startsWith(q))
    .map((k) => ({ code: k, display: SHORTCODES[k], isCustom: false }));
  const custom = Object.keys(CUSTOM_EMOJIS)
    .filter((k) => k.toLowerCase().startsWith(q))
    .map((k) => ({ code: k, display: CUSTOM_EMOJIS[k], isCustom: true }));
  return [...custom, ...uni].slice(0, 8);
}
