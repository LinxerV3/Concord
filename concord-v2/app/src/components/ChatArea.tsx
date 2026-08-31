import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { db, fmtTime, isOnline } from "../lib/firebase";
import { RoomSocket } from "../lib/socket";
import type { ChannelDoc, Message, ServerDoc, UserDoc, View, WsIn } from "../types";
import Avatar from "./Avatar";

interface Props {
  roomId: string | null;
  colSegments: string[] | null;
  view: View;
  me: UserDoc;
  myUid: string;
  allUsers: Record<string, UserDoc>;
  servers: Record<string, ServerDoc>;
  channels: ChannelDoc[];
  announcement: string | null;
  dismissAnnouncement: () => void;
  openProfile: (uid: string) => void;
  openDirectory: () => void;
}

export default function ChatArea(p: Props) {
  const [fsMsgs, setFsMsgs] = useState<Message[]>([]);
  const [liveMsgs, setLiveMsgs] = useState<Message[]>([]);
  const [liveUids, setLiveUids] = useState<Set<string>>(new Set());
  const [typers, setTypers] = useState<Record<string, { name: string; exp: number }>>({});
  const [input, setInput] = useState("");
  const socketRef = useRef<RoomSocket | null>(null);
  const lastTypingSent = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const col = p.colSegments
    ? collection(db, p.colSegments[0], ...p.colSegments.slice(1))
    : null;

  /* ---------- Firestore history (persistence layer) ---------- */
  useEffect(() => {
    if (!col) { setFsMsgs([]); return; }
    return onSnapshot(query(col, orderBy("ts", "desc"), limit(80)), (snap) => {
      const msgs: Message[] = [];
      snap.forEach((d) => {
        const data = d.data({ serverTimestamps: "estimate" }) as any;
        msgs.push({
          id: d.id, uid: data.uid, username: data.username, text: data.text,
          isAdmin: data.isAdmin, system: data.system,
          tsMillis: data.ts?.toDate ? data.ts.toDate().getTime() : Date.now(),
        });
      });
      msgs.reverse();
      setFsMsgs(msgs);
    });
  }, [p.roomId]);

  /* ---------- WebSocket room (speed layer) ---------- */
  useEffect(() => {
    if (!p.roomId) return;
    const sock = new RoomSocket(p.roomId, p.myUid, p.me.username, (ev: WsIn) => {
      if (ev.type === "roster") setLiveUids(new Set(ev.users.map((u) => u.uid)));
      if (ev.type === "join") setLiveUids((s) => new Set([...s, ev.uid]));
      if (ev.type === "leave") setLiveUids((s) => { const n = new Set(s); n.delete(ev.uid); return n; });
      if (ev.type === "msg") {
        setLiveMsgs((m) => [...m.slice(-120), {
          id: ev.id, uid: ev.uid, username: ev.username, text: ev.text,
          isAdmin: ev.isAdmin, tsMillis: ev.ts, pending: true,
        }]);
        setTypers((t) => { const n = { ...t }; delete n[ev.uid]; return n; });
      }
      if (ev.type === "typing" && ev.uid !== p.myUid) {
        setTypers((t) => ({ ...t, [ev.uid]: { name: ev.name, exp: Date.now() + 3000 } }));
      }
    });
    socketRef.current = sock;
    return () => { sock.destroy(); socketRef.current = null; setLiveUids(new Set()); setLiveMsgs([]); setTypers({}); };
  }, [p.roomId]);

  /* prune expired typers */
  useEffect(() => {
    const t = setInterval(() => {
      setTypers((old) => {
        const now = Date.now();
        const n: typeof old = {};
        let changed = false;
        for (const [k, v] of Object.entries(old)) {
          if (v.exp > now) n[k] = v; else changed = true;
        }
        return changed ? n : old;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* ---------- merge: Firestore wins, WS fills the gap ---------- */
  const merged = useMemo(() => {
    const seen = new Set(fsMsgs.map((m) => m.id));
    const extra = liveMsgs.filter((m) => !seen.has(m.id));
    return [...fsMsgs, ...extra].sort((a, b) => a.tsMillis - b.tsMillis);
  }, [fsMsgs, liveMsgs]);

  /* stick to bottom */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [merged.length, p.roomId]);

  /* ---------- send ---------- */
  const send = async () => {
    const text = input.trim();
    if (!text || !col) return;
    setInput("");
    const id = crypto.randomUUID();
    // 1. instant fanout over WebSocket (everyone sees it in ~50ms)
    socketRef.current?.send({ type: "msg", id, text, isAdmin: !!p.me.isAdmin });
    // 2. durable write to Firestore (history / cloud save)
    await setDoc(doc(col, id), {
      uid: p.myUid, username: p.me.username, text,
      isAdmin: !!p.me.isAdmin, ts: serverTimestamp(),
    });
    if (p.view.type === "home" && p.view.dmId) {
      updateDoc(doc(db, "dms", p.view.dmId), { lastTs: serverTimestamp() }).catch(() => {});
    }
  };

  const onType = (v: string) => {
    setInput(v);
    const now = Date.now();
    if (v && now - lastTypingSent.current > 1500) {
      lastTypingSent.current = now;
      socketRef.current?.send({ type: "typing" });
    }
  };

  /* ---------- header text ---------- */
  let title = "", topic = "", hash = "#";
  if (p.view.type === "server") {
    const ch = p.channels.find((c) => p.view.type === "server" && c.id === p.view.cid);
    title = ch?.name ?? "…"; topic = ch?.topic ?? "";
  } else if (p.view.dmId && p.view.otherUid) {
    hash = "@";
    const u = p.allUsers[p.view.otherUid];
    title = u?.username ?? "unknown";
    topic = liveUids.has(p.view.otherUid) ? "In this chat now" : isOnline(u) ? "Online" : "Offline";
  } else {
    hash = "💬"; title = "Direct Messages";
    topic = "Pick a conversation or find someone in the directory (👥).";
  }

  /* ---------- members ---------- */
  let memberUids = Object.keys(p.allUsers);
  if (p.view.type === "server" && p.servers[p.view.sid] && !p.servers[p.view.sid].isGlobal) {
    const sid = p.view.sid;
    memberUids = memberUids.filter((u) => p.allUsers[u].joinedServers?.includes(sid));
  }
  memberUids.sort((a, b) => {
    const oa = isOnline(p.allUsers[a], liveUids, a) ? 0 : 1;
    const ob = isOnline(p.allUsers[b], liveUids, b) ? 0 : 1;
    return oa - ob || p.allUsers[a].username.localeCompare(p.allUsers[b].username);
  });

  const typerNames = Object.values(typers).map((t) => t.name);

  return (
    <>
      <div className="main">
        {p.announcement && (
          <div className="announceBar">
            <span>📣</span><span>{p.announcement}</span>
            <button onClick={p.dismissAnnouncement}>✕</button>
          </div>
        )}
        <div className="chatHeader">
          <button className="mobileNav" onClick={() => document.body.classList.toggle("sideOpen")}>☰</button>
          <span className="hash">{hash}</span>
          <span className="chatTitle">{title}</span>
          {topic && <span className="chatTopic">{topic}</span>}
          <span className="spacer" />
          <button className="iconBtn" title="Find people" onClick={p.openDirectory}>👥</button>
        </div>

        <div className="messages" ref={scrollRef}>
          {merged.map((m, i) => {
            const prev = merged[i - 1];
            const cont = prev && prev.uid === m.uid && !m.system && !prev.system &&
              m.tsMillis - prev.tsMillis < 300_000;
            const u = p.allUsers[m.uid];
            return (
              <div key={m.id} className={"msg " + (cont ? "cont" : "firstOfGroup") + (m.pending && !fsMsgs.find(f => f.id === m.id) ? " pendingMsg" : "")}>
                <div className="msgAvatar" onClick={() => !m.system && p.openProfile(m.uid)}>
                  {m.system ? "📣" : u?.avatarUrl ? <img src={u.avatarUrl} alt="" /> : (u?.avatarEmoji || "🙂")}
                </div>
                <div className="msgBody">
                  {!cont && (
                    <div className="msgHead">
                      <span className="msgUser"
                        style={{ color: m.system ? "var(--gold)" : u?.accent || "#e6e7ec" }}
                        onClick={() => !m.system && p.openProfile(m.uid)}>
                        {m.system ? "SYSTEM" : m.username || u?.username || "unknown"}
                      </span>
                      {m.system ? <span className="badge sys">SYSTEM</span>
                        : (u?.isAdmin || m.isAdmin) ? <span className="badge">ADMIN</span> : null}
                      <span className="msgTime">{fmtTime(m.tsMillis)}</span>
                    </div>
                  )}
                  <div className="msgText">{m.text}</div>
                </div>
                {(m.uid === p.myUid || p.me.isAdmin) && col && (
                  <button className="msgDel" onClick={() => deleteDoc(doc(col, m.id))}>🗑</button>
                )}
              </div>
            );
          })}
        </div>

        <div className="composer">
          <div className="composerInner">
            <input value={input} maxLength={1500} placeholder={`Message ${hash === "#" ? "#" + title : title}`}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="sendBtn" onClick={send}>Send</button>
          </div>
          <div className="typingNote">
            {typerNames.length > 0 && (
              <span>
                <b>{typerNames.slice(0, 3).join(", ")}</b>
                {typerNames.length === 1 ? " is" : " are"} typing<span className="dots" />
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="members">
        <div className="chLabel">MEMBERS — {memberUids.length}</div>
        {memberUids.map((uid) => {
          const u = p.allUsers[uid];
          const here = liveUids.has(uid);
          return (
            <div key={uid} className="memItem" onClick={() => p.openProfile(uid)}>
              <Avatar user={u} online={isOnline(u, liveUids, uid)} />
              <div style={{ minWidth: 0 }}>
                <div className="dmName" style={{ color: u.isAdmin ? "var(--accent-h)" : undefined }}>
                  {u.username}
                </div>
                {(here || u.customStatus) && (
                  <div className="memSub">{here ? "👀 in this chat" : u.customStatus}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
