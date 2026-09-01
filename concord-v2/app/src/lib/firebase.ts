import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import type { UserDoc } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyCq7Omsqj_go59piCJiHRHlQUY4S7BWweg",
  authDomain: "mygamestorefun.firebaseapp.com",
  projectId: "mygamestorefun",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const GLOBAL_ID = "global";
export const ADMIN_TRIGGER = "123abc";
export const EMAIL_DOMAIN = "@concord.chat";

export const esc = (s: string) => s; // React escapes by default — kept for clarity

export const isOnline = (u?: UserDoc | null, liveUids?: Set<string>, uid?: string) => {
  if (uid && liveUids?.has(uid)) return true;
  if (!u?.lastSeen) return false;
  return Date.now() - u.lastSeen.toDate().getTime() < 70_000;
};

export const STATUS_PRESETS = [
  { type: "in_class", emoji: "📚", label: "In class", needsDetail: true, detailLabel: "Which class?" },
  { type: "gaming",   emoji: "🎮", label: "Gaming",   needsDetail: true, detailLabel: "Playing what? (optional)" },
  { type: "afk",      emoji: "😴", label: "Away",      needsDetail: false },
  { type: "dnd",      emoji: "🔕", label: "Do Not Disturb", needsDetail: false },
  { type: "custom",   emoji: "💬", label: "Custom",    needsDetail: true, detailLabel: "Status text" },
] as const;

export function statusLabel(s?: { type: string; detail?: string; emoji?: string } | null): string {
  if (!s) return "";
  const preset = STATUS_PRESETS.find((p) => p.type === s.type);
  const emoji = s.emoji || preset?.emoji || "";
  if (s.type === "in_class") return `${emoji} In ${s.detail || "class"}`;
  if (s.type === "gaming") return `${emoji} ${s.detail ? "Playing " + s.detail : "Gaming"}`;
  if (s.type === "afk") return `${emoji} Away`;
  if (s.type === "dnd") return `${emoji} Do Not Disturb`;
  return `${emoji} ${s.detail || "Custom"}`;
}

export const fmtTime = (millis: number) => {
  if (!millis) return "";
  const d = new Date(millis);
  const now = new Date();
  const hm = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === now.toDateString()
    ? `Today at ${hm}`
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + hm;
};
