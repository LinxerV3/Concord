import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { db, fmtTime, isOnline, statusLabel } from "../lib/firebase";
import { RoomSocket } from "../lib/socket";
import { QUICK_REACTIONS, shortcodeSuggestions } from "../lib/emoji";
import { formatMessage, mentionsUser } from "../lib/format";
import type { ChannelDoc, Message, ReplyRef, ServerDoc, UserDoc, View, WsIn } from "../types";
import { BADGES } from "../types";
import Avatar from "./Avatar";
import EmojiPicker from "./EmojiPicker";

interface Props {
  roomId: string | null;
  colSegments: string[] | null;
  view: View;
  me: UserDoc;
  myUid: string;
  allUsers: Record<string, UserDoc>;
  servers: Record<string, ServerDoc>;
  channels: ChannelDoc[];
  customEmojis: Record<string, string>;
  bannedWords: string[];
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
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyRef | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showPinned, setShowPinned] = useState(false);
  const [acIndex, setAcIndex] = useState(0);
  const socketRef = useRef<RoomSocket | null>(null);
  const lastTypingSent = useRef(0);
  const lastSentAt = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const col = p.colSegments ? collection(db, p.colSegments[0], ...p.colSegments.slice(1)) : null;
  const usernameSet = useMemo(
    () => new Set(Object.values(p.allUsers).map((u) => u.username.toLowerCase())),
    [p.allUsers]
  );

  const channel = p.view.type === "server" ? p.channels.find((c) => p.view.type === "server" && c.id === p.view.cid) : null;
  const timedOut = (p.me.timeoutUntil || 0) > Date.now();
  const channelLocked = !!channel?.locked && !p.me.isAdmin;

  /* Firestore history */
  useEffect(() => {
    if (!col) { setFsMsgs([]); return; }
    return onSnapshot(query(col, orderBy("ts", "desc"), limit(80)), (snap) => {
      const msgs: Message[] = [];
      snap.forEach((d) => {
        const data = d.data({ serverTimestamps: "estimate" }) as any;
        msgs.push({
          id: d.id, uid: data.uid, username: data.username, text: data.text,
          isAdmin: data.isAdmin, system: data.system, reactions: data.reactions || {},
          replyTo: data.replyTo || null, editedAt: data.editedAt || null, pinned: !!data.pinned,
          tsMillis: data.ts?.toDate ? data.ts.toDate().getTime() : Date.now(),
        });
      });
      msgs.reverse();
      setFsMsgs(msgs);
    });
  }, [p.roomId]);

  /* WebSocket */
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
      if (ev.type === "typing" && ev.uid !== p.myUid)
        setTypers((t) => ({ ...t, [ev.uid]: { name: ev.name, exp: Date.now() + 3000 } }));
    });
    socketRef.current = sock;
    return () => { sock.destroy(); socketRef.current = null; setLiveUids(new Set()); setLiveMsgs([]); setTypers({}); };
  }, [p.roomId]);

  useEffect(() => {
    const t = setInterval(() => {
      setTypers((old) => {
        const now = Date.now(); const n: typeof old = {}; let ch = false;
        for (const [k, v] of Object.entries(old)) { if (v.exp > now) n[k] = v; else ch = true; }
        return ch ? n : old;
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

  const pinned = useMemo(() => merged.filter((m) => m.pinned), [merged]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [merged.length, p.roomId]);

  const suggestions = useMemo(() => shortcodeSuggestions(input), [input]);
  useEffect(() => setAcIndex(0), [suggestions.length]);

  /* send */
  const censor = (t: string) => {
    let out = t;
    for (const w of p.bannedWords) {
      if (!w) continue;
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, (m) => "*".repeat(m.length));
    }
    return out;
  };
  const send = async () => {
    let text = input.trim();
    if (!text || !col) return;
    if (timedOut) return;
    if (channelLocked) return;
    text = censor(text);
    // slow mode
    const slow = (channel?.slowMode || 0) * 1000;
    if (slow && !p.me.isAdmin && Date.now() - lastSentAt.current < slow) return;
    lastSentAt.current = Date.now();
    setInput(""); setEmojiOpen(false);
    const reply = replyingTo; setReplyingTo(null);
    const id = crypto.randomUUID();
    socketRef.current?.send({ type: "msg", id, text, isAdmin: !!p.me.isAdmin });
    await setDoc(doc(col, id), {
      uid: p.myUid, username: p.me.username, text, isAdmin: !!p.me.isAdmin,
      reactions: {}, replyTo: reply || null, ts: serverTimestamp(),
    });
    if (p.view.type === "home" && p.view.dmId)
      updateDoc(doc(db, "dms", p.view.dmId), { lastTs: serverTimestamp() }).catch(() => {});
  };

  const onType = (v: string) => {
    setInput(v);
    const now = Date.now();
    if (v && now - lastTypingSent.current > 1500) { lastTypingSent.current = now; socketRef.current?.send({ type: "typing" }); }
  };

  const acceptSuggestion = (s: { code: string; isCustom: boolean }) => {
    setInput((v) => v.replace(/:([a-z0-9_+-]+)$/i, `:${s.code}:`) + " ");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAcIndex((i) => (i + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setAcIndex((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === "Tab" || (e.key === "Enter" && suggestions.length)) {
        if (e.key === "Tab" || suggestions.length) { e.preventDefault(); acceptSuggestion(suggestions[acIndex]); return; }
      }
      if (e.key === "Escape") { setInput((v) => v); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const insertEmoji = (em: string) => { setInput((v) => v + em); inputRef.current?.focus(); };
  const insertCustom = (name: string) => { setInput((v) => v + `:${name}:`); inputRef.current?.focus(); };

  /* reactions */
  const toggleReaction = async (m: Message, emoji: string) => {
    if (!col) return;
    setPickerFor(null);
    const cur = m.reactions?.[emoji] || [];
    const mine = cur.includes(p.myUid);
    const next = mine ? cur.filter((u) => u !== p.myUid) : [...cur, p.myUid];
    const reactions = { ...(m.reactions || {}) };
    if (next.length) reactions[emoji] = next; else delete reactions[emoji];
    setFsMsgs((ms) => ms.map((x) => (x.id === m.id ? { ...x, reactions } : x)));
    await updateDoc(doc(col, m.id), { reactions }).catch(() => {});
  };

  const startReply = (m: Message) =>
    setReplyingTo({ id: m.id, username: m.username, text: m.text.slice(0, 120) });
  const startEdit = (m: Message) => { setEditingId(m.id); setEditText(m.text); };
  const saveEdit = async (m: Message) => {
    if (!col) return;
    const t = editText.trim();
    setEditingId(null);
    if (t && t !== m.text) await updateDoc(doc(col, m.id), { text: t, editedAt: Date.now() }).catch(() => {});
  };
  const togglePin = async (m: Message) => {
    if (!col) return;
    await updateDoc(doc(col, m.id), { pinned: !m.pinned }).catch(() => {});
  };

  /* header */
  let title = "", topic = "", hash = "#";
  if (p.view.type === "server") {
    title = channel?.name ?? "…"; topic = channel?.topic ?? "";
  } else if (p.view.dmId && p.view.otherUid) {
    hash = "@";
    const u = p.allUsers[p.view.otherUid];
    title = u?.username ?? "unknown";
    topic = statusLabel(u?.statusMode) || (liveUids.has(p.view.otherUid) ? "In this chat now" : isOnline(u) ? "Online" : "Offline");
  } else { hash = "💬"; title = "Direct Messages"; topic = "Pick a conversation or find someone (👥)."; }

  /* members */
  let memberUids = Object.keys(p.allUsers);
  if (p.view.type === "server" && p.servers[p.view.sid] && !p.servers[p.view.sid].isGlobal) {
    const sid = p.view.sid;
    memberUids = memberUids.filter((u) => p.allUsers[u].joinedServers?.includes(sid));
  }
  memberUids.sort((a, b) => {
    const oa = isOnline(p.allUsers[a], liveUids, a) ? 0 : 1, ob = isOnline(p.allUsers[b], liveUids, b) ? 0 : 1;
    return oa - ob || p.allUsers[a].username.localeCompare(p.allUsers[b].username);
  });

  const typerNames = Object.values(typers).map((t) => t.name);
  const fmtCtx = { myUsername: p.me.username, usernames: usernameSet, onMention: (u: string) => {
    const uid = Object.keys(p.allUsers).find((k) => p.allUsers[k].username.toLowerCase() === u.toLowerCase());
    if (uid) p.openProfile(uid);
  }};

  return (
    <>
      <div className="main">
        {p.announcement && (
          <div className="announceBar"><span>📣</span><span>{p.announcement}</span>
            <button onClick={p.dismissAnnouncement}>✕</button></div>
        )}
        <div className="chatHeader">
          <button className="mobileNav" onClick={() => document.body.classList.toggle("sideOpen")}>☰</button>
          <span className="hash">{hash}</span>
          <span className="chatTitle">{title}</span>
          {channel?.locked && <span title="Locked" style={{ fontSize: 13 }}>🔒</span>}
          {!!channel?.slowMode && <span title={`Slow mode: ${channel.slowMode}s`} style={{ fontSize: 13 }}>🐌</span>}
          {topic && <span className="chatTopic">{topic}</span>}
          <span className="spacer" />
          {pinned.length > 0 && (
            <button className="iconBtn" title="Pinned messages" onClick={() => setShowPinned((s) => !s)}>📌 {pinned.length}</button>
          )}
          <button className="iconBtn" title="Find people" onClick={p.openDirectory}>👥</button>
        </div>

        {showPinned && pinned.length > 0 && (
          <div className="pinnedPanel">
            <div className="pinnedHead">📌 Pinned</div>
            {pinned.map((m) => (
              <div key={m.id} className="pinnedItem">
                <b>{m.username}:</b> <span>{formatMessage(m.text, fmtCtx)}</span>
                {(p.me.isAdmin) && <button className="unpinBtn" onClick={() => togglePin(m)}>unpin</button>}
              </div>
            ))}
          </div>
        )}

        <div className="messages" ref={scrollRef}>
          {merged.map((m, i) => {
            const prev = merged[i - 1];
            const cont = prev && prev.uid === m.uid && !m.system && !prev.system &&
              m.tsMillis - prev.tsMillis < 300_000 && !m.replyTo;
            const u = p.allUsers[m.uid];
            const rx = Object.entries(m.reactions || {}).filter(([, uids]) => uids.length);
            const mentionsMe = !m.system && mentionsUser(m.text, p.me.username);
            const badges = u?.badges || [];
            return (
              <div key={m.id} className={"msg " + (cont ? "cont" : "firstOfGroup") +
                (mentionsMe ? " mentioned" : "") + (m.pinned ? " isPinned" : "") +
                (m.pending && !fsMsgs.find((f) => f.id === m.id) ? " pendingMsg" : "")}>
                <div className="msgAvatar" onClick={() => !m.system && p.openProfile(m.uid)}>
                  {m.system ? "📣" : u?.avatarUrl ? <img src={u.avatarUrl} alt="" /> : (u?.avatarEmoji || "🙂")}
                </div>
                <div className="msgBody">
                  {m.replyTo && (
                    <div className="replyPreview">
                      <span className="replyArrow">↰</span>
                      <b>{m.replyTo.username}</b>
                      <span className="replyText">{formatMessage(m.replyTo.text, fmtCtx)}</span>
                    </div>
                  )}
                  {!cont && (
                    <div className="msgHead">
                      <span className={"msgUser" + (u?.nameEffect === "rainbow" ? " rainbow" : "")}
                        style={{ color: m.system ? "var(--gold)" : u?.accent || "var(--txt)" }}
                        onClick={() => !m.system && p.openProfile(m.uid)}>
                        {m.system ? "SYSTEM" : m.username || u?.username || "unknown"}
                      </span>
                      {m.system ? <span className="badge sys">SYSTEM</span>
                        : (u?.isAdmin || m.isAdmin) ? <span className="badge">ADMIN</span> : null}
                      {badges.map((b) => BADGES[b] && (
                        <span key={b} className="userBadge" title={BADGES[b].label}
                          style={{ color: BADGES[b].color }}>{BADGES[b].emoji}</span>
                      ))}
                      <span className="msgTime">{fmtTime(m.tsMillis)}</span>
                      {m.pinned && <span className="pinTag">📌</span>}
                    </div>
                  )}
                  {editingId === m.id ? (
                    <div className="editRow">
                      <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(m); if (e.key === "Escape") setEditingId(null); }} />
                      <button className="btn sm" onClick={() => saveEdit(m)}>Save</button>
                      <button className="btn sm ghost" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="msgText">
                      {formatMessage(m.text, fmtCtx)}
                      {m.editedAt && <span className="editedTag" title="edited">(edited)</span>}
                    </div>
                  )}
                  {rx.length > 0 && (
                    <div className="reactions">
                      {rx.map(([emoji, uids]) => (
                        <button key={emoji} className={"reaction" + (uids.includes(p.myUid) ? " mine" : "")}
                          onClick={() => toggleReaction(m, emoji)}>{emoji} <span>{uids.length}</span></button>
                      ))}
                      <button className="reaction addRx" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}>＋</button>
                    </div>
                  )}
                </div>
                {!m.system && (
                  <div className="msgActions">
                    <button className="msgAct" title="React" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}>😊</button>
                    <button className="msgAct" title="Reply" onClick={() => startReply(m)}>↩️</button>
                    {m.uid === p.myUid && <button className="msgAct" title="Edit" onClick={() => startEdit(m)}>✏️</button>}
                    {p.me.isAdmin && <button className="msgAct" title={m.pinned ? "Unpin" : "Pin"} onClick={() => togglePin(m)}>📌</button>}
                    {(m.uid === p.myUid || p.me.isAdmin) && col && (
                      <button className="msgAct" title="Delete" onClick={() => deleteDoc(doc(col, m.id))}>🗑</button>
                    )}
                  </div>
                )}
                {pickerFor === m.id && (
                  <div className="rxPicker" onMouseLeave={() => setPickerFor(null)}>
                    {QUICK_REACTIONS.map((e) => <button key={e} onClick={() => toggleReaction(m, e)}>{e}</button>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="composer">
          {replyingTo && (
            <div className="replyingBar">
              <span>Replying to <b>{replyingTo.username}</b></span>
              <button onClick={() => setReplyingTo(null)}>✕</button>
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="acDropdown">
              {suggestions.map((s, i) => (
                <button key={s.code} className={"acItem" + (i === acIndex ? " active" : "")}
                  onMouseEnter={() => setAcIndex(i)} onClick={() => acceptSuggestion(s)}>
                  {s.isCustom ? <img className="customEmoji" src={s.display} alt="" /> : <span>{s.display}</span>}
                  <span className="acCode">:{s.code}:</span>
                </button>
              ))}
            </div>
          )}
          {emojiOpen && (
            <EmojiPicker onPick={insertEmoji} onPickCustom={insertCustom}
              customEmojis={p.customEmojis} onClose={() => {}} />
          )}
          {timedOut ? (
            <div className="composerLocked">⏳ You're timed out until {new Date(p.me.timeoutUntil!).toLocaleTimeString()}.</div>
          ) : channelLocked ? (
            <div className="composerLocked">🔒 This channel is locked. Only admins can post.</div>
          ) : (
            <div className="composerInner">
              <button className="emojiToggle" title="Emoji" onClick={() => setEmojiOpen((o) => !o)}>😊</button>
              <input ref={inputRef} value={input} maxLength={1500}
                placeholder={`Message ${hash === "#" ? "#" + title : title}   (**bold** :fire: @name)`}
                onChange={(e) => onType(e.target.value)} onKeyDown={onKeyDown} />
              <button className="sendBtn" onClick={send}>Send</button>
            </div>
          )}
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
                <div className={"dmName" + (u.nameEffect === "rainbow" ? " rainbow" : "")}
                  style={{ color: u.isAdmin && u.nameEffect !== "rainbow" ? "var(--accent-h)" : undefined }}>
                  {u.username}
                  {(u.badges || []).slice(0, 3).map((b) => BADGES[b] && (
                    <span key={b} className="userBadge" style={{ color: BADGES[b].color }}>{BADGES[b].emoji}</span>
                  ))}
                </div>
                {sub && <div className="memSub">{sub}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
