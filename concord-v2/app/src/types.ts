import type { Timestamp } from "firebase/firestore";

export interface UserDoc {
  username: string;
  usernameLower: string;
  bio: string;
  pronouns: string;
  customStatus: string;
  avatarEmoji: string;
  avatarUrl: string;
  banner: string;
  accent: string;
  isAdmin: boolean;
  banned: boolean;
  joinedServers: string[];
  theme?: any;
  statusMode?: StatusMode | null;
  /** optional display name shown instead of username */
  displayName?: string;
  /** uploaded banner image (overrides banner color) */
  bannerUrl?: string;
  /** profile links: [{label, url}] */
  links?: { label: string; url: string }[];
  /** free-text "what I'm up to" line on profile */
  activity?: string;
  /** appearance prefs */
  appearance?: { density?: "cozy" | "compact"; fontScale?: number; hue?: number };
  /** array of badge ids, e.g. ["og","vip","dev"] */
  badges?: string[];
  /** special name effect: "rainbow" | "glow" | undefined */
  nameEffect?: string;
  /** epoch millis until which the user is timed out (can't send) */
  timeoutUntil?: number;
  createdAt?: Timestamp;
  lastSeen?: Timestamp;
}

export interface StatusMode {
  type: "in_class" | "gaming" | "afk" | "dnd" | "custom";
  detail?: string;
  emoji?: string;
}

export interface ServerDoc {
  id: string;
  name: string;
  icon: string;
  ownerId: string;
  isGlobal?: boolean;
  createdAt?: Timestamp;
}

export interface ChannelDoc {
  id: string;
  name: string;
  topic?: string;
  /** seconds between messages per user; 0 = off */
  slowMode?: number;
  /** if locked, only admins can post */
  locked?: boolean;
  createdAt?: Timestamp;
}

export interface ReplyRef {
  id: string;
  username: string;
  text: string;
}

export interface Message {
  id: string;
  uid: string;
  username: string;
  text: string;
  isAdmin?: boolean;
  system?: boolean;
  tsMillis: number;
  pending?: boolean;
  reactions?: Record<string, string[]>;
  replyTo?: ReplyRef | null;
  editedAt?: number | null;
  pinned?: boolean;
}

export interface DmThread {
  id: string;
  users: string[];
  lastTs?: Timestamp;
}

export interface CustomEmoji {
  id: string;
  name: string;
  url: string;
  by: string;
}

export type View =
  | { type: "server"; sid: string; cid: string | null }
  | { type: "home"; dmId: string | null; otherUid: string | null };

export type WsIn =
  | { type: "roster"; users: { uid: string; name: string }[] }
  | { type: "join"; uid: string; name: string }
  | { type: "leave"; uid: string }
  | { type: "msg"; id: string; uid: string; username: string; text: string; isAdmin: boolean; ts: number }
  | { type: "typing"; uid: string; name: string }
  | { type: "pong" };

export const BADGES: Record<string, { label: string; emoji: string; color: string }> = {
  og:    { label: "OG",        emoji: "🏛️", color: "#ffc857" },
  vip:   { label: "VIP",       emoji: "💎", color: "#4ea1ff" },
  dev:   { label: "Developer", emoji: "🛠️", color: "#3ddc84" },
  mod:   { label: "Mod",       emoji: "🛡️", color: "#7c6cff" },
  goat:  { label: "GOAT",      emoji: "🐐", color: "#ff8ee6" },
  bug:   { label: "Bug Hunter",emoji: "🐛", color: "#f25c5c" },
  star:  { label: "Star",      emoji: "⭐", color: "#ffd54a" },
  jojo:  { label: "Stand User",emoji: "🗿", color: "#b7adff" },
};
