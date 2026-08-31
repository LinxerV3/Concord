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
  createdAt?: Timestamp;
  lastSeen?: Timestamp;
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
  createdAt?: Timestamp;
}

export interface Message {
  id: string;
  uid: string;
  username: string;
  text: string;
  isAdmin?: boolean;
  system?: boolean;
  /** millis — normalized from Firestore Timestamp or WS Date.now() */
  tsMillis: number;
  pending?: boolean;
}

export interface DmThread {
  id: string;
  users: string[];
  lastTs?: Timestamp;
}

export type View =
  | { type: "server"; sid: string; cid: string | null }
  | { type: "home"; dmId: string | null; otherUid: string | null };

/* WebSocket protocol */
export type WsIn =
  | { type: "roster"; users: { uid: string; name: string }[] }
  | { type: "join"; uid: string; name: string }
  | { type: "leave"; uid: string }
  | { type: "msg"; id: string; uid: string; username: string; text: string; isAdmin: boolean; ts: number }
  | { type: "typing"; uid: string; name: string }
  | { type: "pong" };
