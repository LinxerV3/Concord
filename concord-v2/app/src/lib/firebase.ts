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

export const fmtTime = (millis: number) => {
  if (!millis) return "";
  const d = new Date(millis);
  const now = new Date();
  const hm = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === now.toDateString()
    ? `Today at ${hm}`
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + hm;
};
