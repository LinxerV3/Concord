import { ReactNode, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch, arrayRemove, arrayUnion,
} from "firebase/firestore";
import { db, isOnline } from "../lib/firebase";
import { toast } from "../lib/fx";
import type { ServerDoc, UserDoc, View } from "../types";
import Avatar from "./Avatar";

function Modal({ children, onClose, raw }: { children: ReactNode; onClose: () => void; raw?: boolean }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {raw ? children : <div className="modal">{children}</div>}
    </div>
  );
}

/* =========================================================
   Profile card
========================================================= */
export function ProfileModal({ uid, me, myUid, allUsers, onClose, onMessage, onEdit }: {
  uid: string; me: UserDoc; myUid: string; allUsers: Record<string, UserDoc>;
  onClose: () => void; onMessage: (uid: string) => void; onEdit: () => void;
}) {
  const u = allUsers[uid];
  if (!u) return null;
  const created = u.createdAt
    ? u.createdAt.toDate().toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })
    : "—";
  return (
    <Modal onClose={onClose} raw>
      <div className="pCard">
        <div className="pBanner" style={{ background: u.banner || "#7c6cff" }} />
        <div className="pBody">
          <div className="pAvatar">{u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : (u.avatarEmoji || "🙂")}</div>
          <div className="pName" style={{ color: u.accent || "#e6e7ec" }}>
            {u.username} {u.isAdmin && <span className="badge">ADMIN</span>}
          </div>
          <div className="pTag">{isOnline(u) ? "🟢 Online" : "⚫ Offline"}{u.pronouns ? " · " + u.pronouns : ""}</div>
          {u.customStatus && (
            <div className="pBox"><div className="lbl">STATUS</div><div className="val">{u.customStatus}</div></div>
          )}
          <div className="pBox"><div className="lbl">ABOUT ME</div>
            <div className="val">{u.bio || <span className="pEmpty">Nothing here yet.</span>}</div>
          </div>
          <div className="pBox"><div className="lbl">MEMBER SINCE</div><div className="val">{created}</div></div>
          <div className="pActions">
            {uid !== myUid
              ? <button className="btn" onClick={() => onMessage(uid)}>Message</button>
              : <button className="btn" onClick={() => { onClose(); onEdit(); }}>Edit profile</button>}
            <button className="btn ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================
   Settings / profile editor
========================================================= */
export function SettingsModal({ me, myUid, onClose }: { me: UserDoc; myUid: string; onClose: () => void }) {
  const [f, setF] = useState({
    username: me.username, avatarEmoji: me.avatarEmoji || "", avatarUrl: me.avatarUrl || "",
    pronouns: me.pronouns || "", banner: me.banner || "#7c6cff", accent: me.accent || "#e6e7ec",
    customStatus: me.customStatus || "", bio: me.bio || "",
  });
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  const save = async () => {
    const name = f.username.trim();
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(name)) return toast("Username: 2–20 letters/numbers/_");
    if (name.toLowerCase() !== me.usernameLower) {
      const q = await getDocs(query(collection(db, "users"),
        where("usernameLower", "==", name.toLowerCase()), limit(1)));
      if (!q.empty) return toast("That username is taken.");
    }
    await updateDoc(doc(db, "users", myUid), {
      username: name, usernameLower: name.toLowerCase(),
      avatarEmoji: f.avatarEmoji.trim() || "🙂", avatarUrl: f.avatarUrl.trim(),
      pronouns: f.pronouns.trim(), banner: f.banner, accent: f.accent,
      customStatus: f.customStatus.trim(), bio: f.bio.trim(),
    });
    onClose(); toast("Profile saved");
  };

  return (
    <Modal onClose={onClose}>
      <button className="modalClose" onClick={onClose}>✕</button>
      <h2>Your profile</h2>
      <p className="modalSub">How you show up everywhere on Concord.</p>
      <div className="field"><label>USERNAME</label>
        <input value={f.username} maxLength={20} onChange={(e) => set("username", e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>AVATAR EMOJI</label>
          <input value={f.avatarEmoji} maxLength={4} onChange={(e) => set("avatarEmoji", e.target.value)} /></div>
        <div className="field"><label>PRONOUNS</label>
          <input value={f.pronouns} maxLength={20} onChange={(e) => set("pronouns", e.target.value)} /></div>
      </div>
      <div className="field"><label>AVATAR IMAGE URL (overrides emoji)</label>
        <input value={f.avatarUrl} placeholder="https://…" onChange={(e) => set("avatarUrl", e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>BANNER COLOR</label>
          <input type="color" value={f.banner} style={{ height: 42, padding: 4 }}
            onChange={(e) => set("banner", e.target.value)} /></div>
        <div className="field"><label>NAME COLOR</label>
          <input type="color" value={f.accent} style={{ height: 42, padding: 4 }}
            onChange={(e) => set("accent", e.target.value)} /></div>
      </div>
      <div className="field"><label>CUSTOM STATUS</label>
        <input value={f.customStatus} maxLength={60} placeholder="watching JoJo…"
          onChange={(e) => set("customStatus", e.target.value)} /></div>
      <div className="field"><label>ABOUT ME</label>
        <textarea rows={3} maxLength={300} value={f.bio} onChange={(e) => set("bio", e.target.value)} /></div>
      <button className="btn" onClick={save}>Save changes</button>
    </Modal>
  );
}

/* =========================================================
   Directory — every user, searchable
========================================================= */
export function DirectoryModal({ allUsers, onClose, onPick }: {
  allUsers: Record<string, UserDoc>; onClose: () => void; onPick: (uid: string) => void;
}) {
  const [q, setQ] = useState("");
  const uids = Object.keys(allUsers)
    .filter((u) => allUsers[u].username.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => allUsers[a].username.localeCompare(allUsers[b].username));
  return (
    <Modal onClose={onClose}>
      <button className="modalClose" onClick={onClose}>✕</button>
      <h2>Everyone on Concord</h2>
      <p className="modalSub">All accounts on the platform.</p>
      <input className="dirSearch" placeholder="Search usernames…" value={q}
        onChange={(e) => setQ(e.target.value)} />
      <div className="dirList">
        {uids.length === 0 && <p className="modalSub">No one matches that search.</p>}
        {uids.map((uid) => {
          const u = allUsers[uid];
          return (
            <div key={uid} className="memItem" onClick={() => onPick(uid)}>
              <Avatar user={u} online={isOnline(u)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dmName">{u.username} {u.isAdmin && <span className="badge">ADMIN</span>}</div>
                <div className="memSub">{u.banned ? "🚫 banned" : u.customStatus || u.bio || ""}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* =========================================================
   Server browser / create
========================================================= */
export function ServerBrowserModal({ servers, me, myUid, allUsers, onClose, onOpenServer }: {
  servers: Record<string, ServerDoc>; me: UserDoc; myUid: string;
  allUsers: Record<string, UserDoc>; onClose: () => void; onOpenServer: (sid: string) => void;
}) {
  const list = Object.values(servers).filter((s) => !s.isGlobal);

  const create = async () => {
    const name = prompt("Server name:"); if (!name) return;
    const icon = prompt("Icon emoji (e.g. 🎮):") || "🟣";
    const ref = await addDoc(collection(db, "servers"), {
      name: name.trim().slice(0, 30), icon: icon.trim().slice(0, 4),
      ownerId: myUid, isGlobal: false, createdAt: serverTimestamp(),
    });
    await addDoc(collection(ref, "channels"), { name: "general", topic: "", createdAt: serverTimestamp() });
    await updateDoc(doc(db, "users", myUid), { joinedServers: arrayUnion(ref.id) });
    onOpenServer(ref.id);
  };
  const join = async (sid: string) => {
    await updateDoc(doc(db, "users", myUid), { joinedServers: arrayUnion(sid) });
    onOpenServer(sid);
  };
  const leave = async (sid: string) => {
    await updateDoc(doc(db, "users", myUid), { joinedServers: arrayRemove(sid) });
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <button className="modalClose" onClick={onClose}>✕</button>
      <h2>Servers</h2>
      <p className="modalSub">Join one, or start your own.</p>
      <button className="btn" onClick={create}>＋ Create a server</button>
      <div style={{ height: 16 }} />
      {list.length === 0 && <p className="modalSub">No custom servers yet — be the first.</p>}
      {list.map((sv) => {
        const joined = me.joinedServers?.includes(sv.id);
        return (
          <div key={sv.id} className="adminRow">
            <div className="dmAvatar"><div className="av">{sv.icon || "🟣"}</div></div>
            <div style={{ flex: 1 }}>
              <div className="dmName">{sv.name}</div>
              <div className="mini">by {allUsers[sv.ownerId]?.username || "?"}</div>
            </div>
            <button className={"btn sm" + (joined ? " ghost" : "")}
              onClick={() => (joined ? leave(sv.id) : join(sv.id))}>
              {joined ? "Leave" : "Join"}
            </button>
          </div>
        );
      })}
    </Modal>
  );
}

/* =========================================================
   Admin panel
========================================================= */
export function AdminModal({ me, myUid, allUsers, view, servers, colSegments, onClose, onServerDeleted }: {
  me: UserDoc; myUid: string; allUsers: Record<string, UserDoc>;
  view: View; servers: Record<string, ServerDoc>; colSegments: string[] | null;
  onClose: () => void; onServerDeleted: () => void;
}) {
  const [tab, setTab] = useState<"users" | "cast" | "fun" | "danger">("users");
  const [q, setQ] = useState("");
  const [castText, setCastText] = useState("");
  const [sysText, setSysText] = useState("");

  const col = colSegments ? collection(db, colSegments[0], ...colSegments.slice(1)) : null;

  const fireEvent = async (type: string, extra: Record<string, unknown> = {}) => {
    await setDoc(doc(db, "system", "event"), { type, ...extra, by: me.username, ts: serverTimestamp() });
    toast("Fired: " + type);
  };

  const purge = async () => {
    if (!col || !confirm("Delete every loaded message in this channel?")) return;
    const snap = await getDocs(query(col, orderBy("ts", "desc"), limit(200)));
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    toast(`Purged ${snap.size} messages`);
  };

  const deleteServer = async () => {
    if (view.type !== "server") return toast("Open a server first");
    if (servers[view.sid]?.isGlobal) return toast("Can't delete Global");
    if (!confirm(`Delete ${servers[view.sid].name} for everyone?`)) return;
    await deleteDoc(doc(db, "servers", view.sid));
    onClose(); onServerDeleted(); toast("Server deleted");
  };

  return (
    <Modal onClose={onClose}>
      <button className="modalClose" onClick={onClose}>✕</button>
      <h2>🛡️ Admin panel</h2>
      <p className="modalSub">With great power…</p>
      <div className="tabs">
        {(["users", "cast", "fun", "danger"] as const).map((t) => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {{ users: "Users", cast: "Broadcast", fun: "Fun", danger: "Danger" }[t]}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <>
          <input className="dirSearch" placeholder="Search users…" value={q}
            onChange={(e) => setQ(e.target.value)} />
          <div className="dirList">
            {Object.keys(allUsers)
              .filter((uid) => allUsers[uid].username.toLowerCase().includes(q.toLowerCase()))
              .sort((a, b) => allUsers[a].username.localeCompare(allUsers[b].username))
              .map((uid) => {
                const u = allUsers[uid];
                return (
                  <div key={uid} className="adminRow">
                    <Avatar user={u} dot={false} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="dmName">
                        {u.username}{" "}
                        {u.isAdmin && <span className="chip purple">ADMIN</span>}{" "}
                        {u.banned && <span className="chip red">BANNED</span>}
                      </div>
                      <div className="mini">{uid === myUid ? "(you)" : ""}</div>
                    </div>
                    {uid !== myUid && (
                      <>
                        <button className={"btn sm" + (u.banned ? " ghost" : " danger")}
                          onClick={async () => {
                            await updateDoc(doc(db, "users", uid), { banned: !u.banned });
                            toast(u.banned ? "Unbanned" : "Banned");
                          }}>
                          {u.banned ? "Unban" : "Ban"}
                        </button>
                        <button className="btn sm ghost"
                          onClick={async () => {
                            await updateDoc(doc(db, "users", uid), { isAdmin: !u.isAdmin });
                            toast("Done");
                          }}>
                          {u.isAdmin ? "Demote" : "Promote"}
                        </button>
                      </>
                    )}
                    <button className="btn sm ghost"
                      onClick={async () => {
                        const n = prompt("New username:", u.username); if (!n) return;
                        if (!/^[a-zA-Z0-9_]{2,20}$/.test(n)) return toast("Invalid name");
                        await updateDoc(doc(db, "users", uid), { username: n, usernameLower: n.toLowerCase() });
                        toast("Renamed");
                      }}>
                      Rename
                    </button>
                  </div>
                );
              })}
          </div>
        </>
      )}

      {tab === "cast" && (
        <>
          <div className="field"><label>📣 SITE-WIDE ANNOUNCEMENT (banner on everyone's screen)</label>
            <textarea rows={2} value={castText} placeholder="School's out — hop on later"
              onChange={(e) => setCastText(e.target.value)} /></div>
          <button className="btn" onClick={async () => {
            const t = castText.trim(); if (!t) return;
            await setDoc(doc(db, "system", "announcement"),
              { text: t, by: me.username, ts: serverTimestamp() });
            setCastText(""); toast("Announcement sent");
          }}>Send announcement</button>
          <div style={{ height: 14 }} />
          <div className="field"><label>🤖 SYSTEM MESSAGE (posts in the channel you have open)</label>
            <input value={sysText} placeholder="The server will restart in 5 minutes…"
              onChange={(e) => setSysText(e.target.value)} /></div>
          <button className="btn ghost" onClick={async () => {
            const t = sysText.trim(); if (!t || !col) return;
            await addDoc(col, { uid: "system", username: "SYSTEM", system: true, text: t, ts: serverTimestamp() });
            setSysText(""); toast("Posted");
          }}>Post as SYSTEM</button>
        </>
      )}

      {tab === "fun" && (
        <>
          <p className="modalSub">These fire on <b>everyone's</b> screen who's online. Use responsibly. Or don't.</p>
          <div className="funGrid">
            <button className="btn" onClick={() => fireEvent("confetti")}>🎉 Confetti storm</button>
            <button className="btn" onClick={() => {
              const e = prompt("Which emoji should rain?", "🍕");
              if (e) fireEvent("emojirain", { emoji: e.slice(0, 4) });
            }}>🌧️ Emoji rain</button>
            <button className="btn" onClick={() => fireEvent("shake")}>📳 Screen shake</button>
            <button className="btn" onClick={() => fireEvent("disco")}>🪩 Disco mode</button>
            <button className="btn" onClick={() => fireEvent("flip")}>🙃 Flip screens (5s)</button>
            <button className="btn" onClick={() => {
              const t = prompt("Toast text?"); if (t) fireEvent("toastwave", { text: t });
            }}>💬 Toast everyone</button>
          </div>
        </>
      )}

      {tab === "danger" && (
        <>
          <p className="modalSub">No undo on any of these.</p>
          <button className="btn danger" onClick={purge}>🧹 Purge current channel (delete all loaded messages)</button>
          <div style={{ height: 10 }} />
          <button className="btn danger" onClick={deleteServer}>💥 Delete current server</button>
        </>
      )}
    </Modal>
  );
}
