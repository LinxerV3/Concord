import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { db, fmtTime, isOnline, statusLabel } from "../lib/firebase";
import { RoomSocket } from "../lib/socket";
import { renderShortcodes, QUICK_REACTIONS } from "../lib/emoji";
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
  const [pickerFor, setPickerFor] = useState<string | null>(null); // msg id showing reaction picker
  const [emojiOpen, setEmojiOpen] = useState(false);
  const socketRef = useRef<RoomSocket | null>(null);
  const lastTypingSent = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const col = p.colSegments
    ? collection(db, p.colSegments[0], ...p.colSegments.slice(1))
    : null;

  /* ---------- Firestore history ---------- */
  useEffect(() => {
    if (!col) { setFsMsgs([]); return; }
    return onSnapshot(query(col, orderBy("ts", "desc"), limit(80)), (snap) => {
      const msgs: Message[] = [];
      snap.forEach((d) => {
        const data = d.data({ serverTimestamps: "estimate" }) as any;
        msgs.push({
          id: d.id, uid: data.uid, username: data.username, text: data.text,
          isAdmin: data.isAdmin, system: data.system, reactions: data.reactions || {},
          tsMillis: data.ts?.toDate ? data.ts.toDate().getTime() : Date.now(),
        });
      });
      msgs.reverse();
      setFsMsgs(msgs);
    });
  }, [p.roomId]);

  /* ---------- WebSocket ---------- */
  useEffect(() => {
    if (!p.roomId) return;
    const sock = new RoomSocket(p.roomId, p.myUid, p.me.username, (ev: WsIn) => {
      if (ev.type === "roster") setLiveUids(new Set(ev.users.map((u) => u.uid)));
      if (ev.type === "join") setLiveUids((s) => new Set([...s, ev.uid]));
      if (ev.type === "leave") setLiveUids((s) => { const n = new Set(s); n.delete(ev.uid); return n; });
      if (ev.type === "msg") {
        setLiveMsgs((m) => [...m.slice(-120), {
          id: ev.id, uid: ev.uid, username: ev.username, text: ev.text,
          isAdmin: ev.isAdmin, tsMillis: ev.ts, pending: true, reactions: {},
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

  useEffect(() => {
    const t = setInterval(() => {
      setTypers((old) => {
        const now = Date.now(); const n: typeof old = {}; let changed = false;
        for (const [k, v] of Object.entries(old)) { if (v.exp > now) n[k] = v; else changed = true; }
        return changed ? n : old;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const merged = useMemo(() => {
    const byId = new Map<string, Message>();
    for (const m of fsMsgs) byId.set(m.id, m);
    for (const m of liveMsgs) if (!byId.has(m.id)) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.tsMillis - b.tsMillis);
  }, [fsMsgs, liveMsgs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [merged.length, p.roomId]);

  /* ---------- send ---------- */
  const send = async () => {
    const text = input.trim();
    if (!text || !col) return;
    setInput(""); setEmojiOpen(false);
    const id = crypto.randomUUID();
    socketRef.current?.send({ type: "msg", id, text, isAdmin: !!p.me.isAdmin });
    await setDoc(doc(col, id), {
      uid: p.myUid, username: p.me.username, text,
      isAdmin: !!p.me.isAdmin, reactions: {}, ts: serverTimestamp(),
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

  const insertEmoji = (e: string) => {
    setInput((v) => v + e);
    inputRef.current?.focus();
  };

  /* ---------- reactions ---------- */
  const toggleReaction = async (m: Message, emoji: string) => {
    if (!col) return;
    setPickerFor(null);
    const current = (m.reactions?.[emoji] || []);
    const mine = current.includes(p.myUid);
    const next = mine ? current.filter((u) => u !== p.myUid) : [...current, p.myUid];
    const reactions = { ...(m.reactions || {}) };
    if (next.length) reactions[emoji] = next; else delete reactions[emoji];
    // optimistic
    setFsMsgs((ms) => ms.map((x) => (x.id === m.id ? { ...x, reactions } : x)));
    await updateDoc(doc(col, m.id), { reactions }).catch(() => {});
  };

  /* ---------- header ---------- */
  let title = "", topic = "", hash = "#";
  if (p.view.type === "server") {
    const ch = p.channels.find((c) => p.view.type === "server" && c.id === p.view.cid);
    title = ch?.name ?? "…"; topic = ch?.topic ?? "";
  } else if (p.view.dmId && p.view.otherUid) {
    hash = "@";
    const u = p.allUsers[p.view.otherUid];
    title = u?.username ?? "unknown";
    topic = statusLabel(u?.statusMode) || (liveUids.has(p.view.otherUid) ? "In this chat now" : isOnline(u) ? "Online" : "Offline");
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
            const rx = Object.entries(m.reactions || {}).filter(([, uids]) => uids.length);
            return (
              <div key={m.id} className={"msg " + (cont ? "cont" : "firstOfGroup") + (m.pending && !fsMsgs.find(f => f.id === m.id) ? " pendingMsg" : "")}>
                <div className="msgAvatar" onClick={() => !m.system && p.openProfile(m.uid)}>
                  {m.system ? "📣" : u?.avatarUrl ? <img src={u.avatarUrl} alt="" /> : (u?.avatarEmoji || "🙂")}
                </div>
                <div className="msgBody">
                  {!cont && (
                    <div className="msgHead">
                      <span className="msgUser"
                        style={{ color: m.system ? "var(--gold)" : u?.accent || "var(--txt)" }}
                        onClick={() => !m.system && p.openProfile(m.uid)}>
                        {m.system ? "SYSTEM" : m.username || u?.username || "unknown"}
                      </span>
                      {m.system ? <span className="badge sys">SYSTEM</span>
                        : (u?.isAdmin || m.isAdmin) ? <span className="badge">ADMIN</span> : null}
                      <span className="msgTime">{fmtTime(m.tsMillis)}</span>
                    </div>
                  )}
                  <div className="msgText">{renderShortcodes(m.text)}</div>
                  {rx.length > 0 && (
                    <div className="reactions">
                      {rx.map(([emoji, uids]) => (
                        <button key={emoji}
                          className={"reaction" + (uids.includes(p.myUid) ? " mine" : "")}
                          onClick={() => toggleReaction(m, emoji)}>
                          {emoji} <span>{uids.length}</span>
                        </button>
                      ))}
                      <button className="reaction addRx" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}>＋</button>
                    </div>
                  )}
                </div>
                {!m.system && (
                  <div className="msgActions">
                    <button className="msgAct" title="React" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}>😊</button>
                    {(m.uid === p.myUid || p.me.isAdmin) && col && (
                      <button className="msgAct" title="Delete" onClick={() => deleteDoc(doc(col, m.id))}>🗑</button>
                    )}
                  </div>
                )}
                {pickerFor === m.id && (
                  <div className="rxPicker" onMouseLeave={() => setPickerFor(null)}>
                    {QUICK_REACTIONS.map((e) => (
                      <button key={e} onClick={() => toggleReaction(m, e)}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="composer">
          {emojiOpen && (
            <div className="emojiPanel">
              {QUICK_REACTIONS.concat(["😄","😎","🤔","🥺","😭","🤣","😤","🫡","🤝","🐐","🍕","☕","🎧","🏆","⚡","🌟"]).map((e, i) => (
                <button key={e + i} onClick={() => insertEmoji(e)}>{e}</button>
              ))}
            </div>
          )}
          <div className="composerInner">
            <button className="emojiToggle" title="Emoji" onClick={() => setEmojiOpen((o) => !o)}>😊</button>
            <input ref={inputRef} value={input} maxLength={1500}
              placeholder={`Message ${hash === "#" ? "#" + title : title}   (try :fire:)`}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="sendBtn" onClick={send}>Send</button>
          </div>
          <div className="typingNote">
            {typerNames.length > 0 && (
              <span><b>{typerNames.slice(0, 3).join(", ")}</b>{typerNames.length === 1 ? " is" : " are"} typing<span className="dots" /></span>
            )}
          </div>
        </div>
      </div>

      <div className="members">
        <div className="chLabel">MEMBERS — {memberUids.length}</div>
        {memberUids.map((uid) => {
          const u = p.allUsers[uid];
          const here = liveUids.has(uid);
          const sub = statusLabel(u.statusMode) || (here ? "👀 in this chat" : u.customStatus);
          return (
            <div key={uid} className="memItem" onClick={() => p.openProfile(uid)}>
              <Avatar user={u} online={isOnline(u, liveUids, uid)} showStatus />
              <div style={{ minWidth: 0 }}>
                <div className="dmName" style={{ color: u.isAdmin ? "var(--accent-h)" : undefined }}>{u.username}</div>
                {sub && <div className="memSub">{sub}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
