/* Theme system — each theme is a set of CSS variable overrides.
   Presets ship built-in; a "custom" theme stores the user's own colors. */

export interface ThemeVars {
  bg0: string; bg1: string; bg2: string; bg3: string; bg4: string;
  txt: string; txt2: string; txt3: string;
  accent: string; accentH: string;
}

export interface Theme {
  id: string;
  name: string;
  emoji: string;
  vars: ThemeVars;
}

export const PRESET_THEMES: Theme[] = [
  {
    id: "midnight", name: "Midnight", emoji: "🌙",
    vars: { bg0:"#191a21", bg1:"#22232d", bg2:"#2b2c37", bg3:"#353644", bg4:"#3f4152",
            txt:"#e6e7ec", txt2:"#a5a8b6", txt3:"#6f7284", accent:"#7c6cff", accentH:"#8e80ff" },
  },
  {
    id: "abyss", name: "Abyss", emoji: "🌑",
    vars: { bg0:"#0a0a0f", bg1:"#12131a", bg2:"#171822", bg3:"#20222e", bg4:"#2b2d3b",
            txt:"#e8e8f0", txt2:"#9a9db0", txt3:"#5f6276", accent:"#00d4ff", accentH:"#4ce0ff" },
  },
  {
    id: "sunset", name: "Sunset", emoji: "🌅",
    vars: { bg0:"#1a1116", bg1:"#251820", bg2:"#2f1f28", bg3:"#3d2833", bg4:"#4a323f",
            txt:"#ffeae0", txt2:"#d0a89c", txt3:"#8f6b62", accent:"#ff7a59", accentH:"#ff9576" },
  },
  {
    id: "forest", name: "Forest", emoji: "🌲",
    vars: { bg0:"#0f1613", bg1:"#16211c", bg2:"#1c2a23", bg3:"#26382f", bg4:"#31473b",
            txt:"#e2f0e8", txt2:"#9dc0ac", txt3:"#628072", accent:"#3ddc84", accentH:"#5fe89d" },
  },
  {
    id: "vaporwave", name: "Vaporwave", emoji: "🌸",
    vars: { bg0:"#160f1f", bg1:"#20162e", bg2:"#2a1d3b", bg3:"#39284f", bg4:"#4a3565",
            txt:"#f5e6ff", txt2:"#c9a8e0", txt3:"#8f6bab", accent:"#ff6ec7", accentH:"#ff8fd6" },
  },
  {
    id: "crimson", name: "Crimson", emoji: "🩸",
    vars: { bg0:"#160b0d", bg1:"#211114", bg2:"#2b171b", bg3:"#3a2025", bg4:"#4a2a30",
            txt:"#ffe4e6", txt2:"#d0a0a6", txt3:"#8f636a", accent:"#ff3b5c", accentH:"#ff6178" },
  },
  {
    id: "gold", name: "Royal", emoji: "👑",
    vars: { bg0:"#14120a", bg1:"#1e1b10", bg2:"#282316", bg3:"#372f1e", bg4:"#463c27",
            txt:"#fff6e0", txt2:"#d0c39a", txt3:"#8f8462", accent:"#ffc857", accentH:"#ffd67e" },
  },
  {
    id: "light", name: "Daylight", emoji: "☀️",
    vars: { bg0:"#e8eaf0", bg1:"#f2f3f7", bg2:"#ffffff", bg3:"#e0e2ea", bg4:"#cfd2dd",
            txt:"#1a1b22", txt2:"#4a4d5c", txt3:"#787c8c", accent:"#6858ff", accentH:"#5544ff" },
  },
];

export const DEFAULT_THEME_ID = "midnight";

export function resolveTheme(themeVal: any): ThemeVars {
  // themeVal can be a preset id (string) or a custom {vars} object
  if (themeVal && typeof themeVal === "object" && themeVal.vars) return themeVal.vars;
  const preset = PRESET_THEMES.find((t) => t.id === themeVal) || PRESET_THEMES[0];
  return preset.vars;
}

export function applyTheme(themeVal: any) {
  const v = resolveTheme(themeVal);
  const r = document.documentElement.style;
  r.setProperty("--bg0", v.bg0);
  r.setProperty("--bg1", v.bg1);
  r.setProperty("--bg2", v.bg2);
  r.setProperty("--bg3", v.bg3);
  r.setProperty("--bg4", v.bg4);
  r.setProperty("--txt", v.txt);
  r.setProperty("--txt2", v.txt2);
  r.setProperty("--txt3", v.txt3);
  r.setProperty("--accent", v.accent);
  r.setProperty("--accent-h", v.accentH);
}
