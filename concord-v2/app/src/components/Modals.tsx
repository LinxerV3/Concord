import { ReactNode, useEffect, useRef, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch, arrayRemove, arrayUnion,
} from "firebase/firestore";
import { db, isOnline, statusLabel, STATUS_PRESETS } from "../lib/firebase";
import { toast } from "../lib/fx";
import { PRESET_THEMES, DEFAULT_THEME_ID, applyTheme, resolveTheme } from "../lib/theme";
import { uploadAvatar, uploadEmoji } from "../lib/storage";
import type { ChannelDoc, ServerDoc, StatusMode, UserDoc, View } from "../types";
import { BADGES } from "../types";
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
  const status = statusLabel(u.statusMode);
  return (
    <Modal onClose={onClose} raw>
      <div className="pCard">
        <div className="pBanner" style={{ background: u.banner || "#7c6cff" }} />
        <div className="pBody">
          <div className="pAvatar">{u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : (u.avatarEmoji || "🙂")}</div>
          <div className="pName" style={{ color: u.accent || "var(--txt)" }}>
            {u.username} {u.isAdmin && <span className="badge">ADMIN</span>}
          </div>
          <div className="pTag">{isOnline(u) ? "🟢 Online" : "⚫ Offline"}{u.pronouns ? " · " + u.pronouns : ""}</div>
          {status && <div className="pBox"><div className="lbl">STATUS</div><div className="val">{status}</div></div>}
          {u.customStatus && !status && (
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
   Settings — profile, status, theme, avatar upload
========================================================= */
export function SettingsModal({ me, myUid, onClose }: { me: UserDoc; myUid: string; onClose: () => void }) {
  const [tab, setTab] = useState<"profile" | "status" | "theme">("profile");
  const [f, setF] = useState({
    username: me.username, avatarEmoji: me.avatarEmoji || "", avatarUrl: me.avatarUrl || "",
    pronouns: me.pronouns || "", banner: me.banner || "#7c6cff", accent: me.accent || "#e6e7ec",
    customStatus: me.customStatus || "", bio: me.bio || "",
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  const pickFile = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(myUid, file);
      set("avatarUrl", url);
      toast("Picture uploaded");
    } catch (err: any) {
      toast(err.message || "Upload failed — is Storage enabled?");
    }
    setUploading(false);
  };

  const saveProfile = async () => {
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
      <h2>Settings</h2>
      <div className="tabs">
        {(["profile", "status", "theme"] as const).map((t) => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {{ profile: "Profile", status: "Status", theme: "Theme" }[t]}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <>
          <div className="avatarRow">
            <div className="pAvatar" style={{ margin: 0, width: 72, height: 72, fontSize: 34, borderWidth: 3 }}>
              {f.avatarUrl ? <img src={f.avatarUrl} alt="" /> : (f.avatarEmoji || "🙂")}
            </div>
            <div style={{ flex: 1 }}>
              <button className="btn sm" onClick={pickFile} disabled={uploading}>
                {uploading ? "Uploading…" : "📷 Upload picture"}
              </button>
              {f.avatarUrl && (
                <button className="btn sm ghost" style={{ marginLeft: 8 }} onClick={() => set("avatarUrl", "")}>Remove</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              <div className="mini" style={{ marginTop: 6 }}>Or use an emoji below. Upload wins if both are set.</div>
            </div>
          </div>
          <div className="field"><label>USERNAME</label>
            <input value={f.username} maxLength={20} onChange={(e) => set("username", e.target.value)} /></div>
          <div className="row">
            <div className="field"><label>AVATAR EMOJI</label>
              <input value={f.avatarEmoji} maxLength={4} onChange={(e) => set("avatarEmoji", e.target.value)} /></div>
            <div className="field"><label>PRONOUNS</label>
              <input value={f.pronouns} maxLength={20} onChange={(e) => set("pronouns", e.target.value)} /></div>
          </div>
          <div className="row">
            <div className="field"><label>BANNER COLOR</label>
              <input type="color" value={f.banner} style={{ height: 42, padding: 4 }}
                onChange={(e) => set("banner", e.target.value)} /></div>
            <div className="field"><label>NAME COLOR</label>
              <input type="color" value={f.accent} style={{ height: 42, padding: 4 }}
                onChange={(e) => set("accent", e.target.value)} /></div>
          </div>
          <div className="field"><label>ABOUT ME</label>
            <textarea rows={3} maxLength={300} value={f.bio} onChange={(e) => set("bio", e.target.value)} /></div>
          <button className="btn" onClick={saveProfile}>Save changes</button>
        </>
      )}

      {tab === "status" && <StatusTab me={me} myUid={myUid} onClose={onClose} />}
      {tab === "theme" && <ThemeTab me={me} myUid={myUid} />}
    </Modal>
  );
}

/* ---------- Status tab ---------- */
function StatusTab({ me, myUid, onClose }: { me: UserDoc; myUid: string; onClose: () => void }) {
  const [type, setType] = useState<StatusMode["type"] | "none">(me.statusMode?.type || "none");
  const [detail, setDetail] = useState(me.statusMode?.detail || "");
  const preset = STATUS_PRESETS.find((p) => p.type === type);

  const save = async () => {
    const statusMode: StatusMode | null =
      type === "none" ? null : { type, detail: detail.trim(), emoji: preset?.emoji };
    await updateDoc(doc(db, "users", myUid), { statusMode });
    onClose(); toast(statusMode ? "Status set" : "Status cleared");
  };

  return (
    <>
      <p className="modalSub">Your status sticks even after you close the app — it stays until you clear it. Great for “📚 In Chemistry.”</p>
      <div className="statusGrid">
        <button className={"statusOpt" + (type === "none" ? " active" : "")} onClick={() => setType("none")}>
          <span className="e">🟢</span> Just online
        </button>
        {STATUS_PRESETS.map((p) => (
          <button key={p.type} className={"statusOpt" + (type === p.type ? " active" : "")} onClick={() => setType(p.type as any)}>
            <span className="e">{p.emoji}</span> {p.label}
          </button>
        ))}
      </div>
      {preset && "needsDetail" in preset && preset.needsDetail && (
        <div className="field" style={{ marginTop: 14 }}>
          <label>{(preset as any).detailLabel?.toUpperCase() || "DETAIL"}</label>
          <input value={detail} maxLength={40} autoFocus placeholder={type === "in_class" ? "Chemistry" : ""}
            onChange={(e) => setDetail(e.target.value)} />
        </div>
      )}
      <div className="previewLine">Preview: <b>{type === "none" ? "🟢 Online" : statusLabel({ type: type as any, detail, emoji: preset?.emoji })}</b></div>
      <button className="btn" onClick={save}>Save status</button>
    </>
  );
}

/* ---------- Theme tab ---------- */
function ThemeTab({ me, myUid }: { me: UserDoc; myUid: string }) {
  const currentId = typeof me.theme === "string" ? me.theme : me.theme?.vars ? "custom" : DEFAULT_THEME_ID;
  const [custom, setCustom] = useState(() => resolveTheme(me.theme));

  const pickPreset = async (id: string) => {
    applyTheme(id);
    await updateDoc(doc(db, "users", myUid), { theme: id });
    toast("Theme applied");
  };
  const saveCustom = async () => {
    const theme = { vars: custom };
    applyTheme(theme);
    await updateDoc(doc(db, "users", myUid), { theme });
    toast("Custom theme saved");
  };
  const setV = (k: string, v: string) => { const next = { ...custom, [k]: v }; setCustom(next); applyTheme({ vars: next }); };

  return (
    <>
      <p className="modalSub">Themes follow your account across devices. Tap one to apply instantly.</p>
      <div className="themeGrid">
        {PRESET_THEMES.map((t) => (
          <button key={t.id} className={"themeCard" + (currentId === t.id ? " active" : "")} onClick={() => pickPreset(t.id)}>
            <div className="themeSwatch">
              <span style={{ background: t.vars.bg1 }} />
              <span style={{ background: t.vars.bg3 }} />
              <span style={{ background: t.vars.accent }} />
            </div>
            <div className="themeName">{t.emoji} {t.name}</div>
          </button>
        ))}
      </div>
      <div className="customTheme">
        <div className="lbl" style={{ marginBottom: 8 }}>🎨 MAKE YOUR OWN</div>
        <div className="colorRow">
          {[
            ["bg1", "Background"], ["bg2", "Panels"], ["bg3", "Raised"],
            ["accent", "Accent"], ["txt", "Text"], ["txt2", "Muted text"],
          ].map(([k, label]) => (
            <label key={k} className="colorPick">
              <input type="color" value={(custom as any)[k]} onChange={(e) => setV(k, e.target.value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={saveCustom}>Save custom theme</button>
      </div>
    </>
  );
}

/* =========================================================
   Directory
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
              <Avatar user={u} online={isOnline(u)} showStatus />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dmName">{u.username} {u.isAdmin && <span className="badge">ADMIN</span>}</div>
                <div className="memSub">{u.banned ? "🚫 banned" : statusLabel(u.statusMode) || u.customStatus || u.bio || ""}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* =========================================================
   Server browser
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
   Custom emoji manager (used inside Admin)
========================================================= */
function EmojiManager({ myUid }: { myUid: string }) {
  const [list, setList] = useState<{ id: string; name: string; url: string }[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return onSnapshot(collection(db, "customEmojis"), (snap) => {
      const arr: any[] = []; snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      arr.sort((a, b) => a.name.localeCompare(b.name));
      setList(arr);
    });
  }, []);

  const add = async (file: File) => {
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!clean) return toast("Give the emoji a name first (letters/numbers/_).");
    if (list.find((e) => e.name === clean)) return toast("That name is taken.");
    setBusy(true);
    try {
      const url = await uploadEmoji(myUid, clean, file);
      await addDoc(collection(db, "customEmojis"), { name: clean, url, by: myUid, ts: serverTimestamp() });
      setName(""); toast(`:${clean}: added`);
    } catch (e: any) { toast(e.message || "Upload failed — is Storage enabled?"); }
    setBusy(false);
  };

  return (
    <>
      <p className="modalSub">Upload custom emoji. Use them anywhere by typing <code className="mdCode">:name:</code> or from the picker.</p>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}><label>EMOJI NAME</label>
          <input value={name} placeholder="e.g. pog" maxLength={20}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} /></div>
        <button className="btn" style={{ flex: "0 0 auto", width: "auto", padding: "10px 16px" }}
          disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "…" : "＋ Upload"}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) add(f); }} />
      </div>
      <div className="emojiManageGrid">
        {list.length === 0 && <p className="modalSub" style={{ gridColumn: "1/-1" }}>No custom emoji yet.</p>}
        {list.map((e) => (
          <div key={e.id} className="emojiManageItem">
            <img src={e.url} alt={e.name} />
            <div className="emName">:{e.name}:</div>
            <button className="emDel" title="Delete" onClick={async () => {
              if (confirm(`Delete :${e.name}:?`)) await deleteDoc(doc(db, "customEmojis", e.id));
            }}>✕</button>
          </div>
        ))}
      </div>
    </>
  );
}

/* =========================================================
   Admin panel (expanded)
========================================================= */
export function AdminModal({ me, myUid, allUsers, view, servers, channels, colSegments, onClose, onServerDeleted }: {
  me: UserDoc; myUid: string; allUsers: Record<string, UserDoc>;
  view: View; servers: Record<string, ServerDoc>; channels: ChannelDoc[];
  colSegments: string[] | null; onClose: () => void; onServerDeleted: () => void;
}) {
  type Tab = "stats" | "users" | "emojis" | "channel" | "cast" | "fun" | "filter" | "danger";
  const [tab, setTab] = useState<Tab>("stats");
  const [q, setQ] = useState("");
  const [castText, setCastText] = useState("");
  const [sysText, setSysText] = useState("");
  const [wordInput, setWordInput] = useState("");
  const [bannedWords, setBannedWords] = useState<string[]>([]);
  const col = colSegments ? collection(db, colSegments[0], ...colSegments.slice(1)) : null;
  const currentChannel = view.type === "server" ? channels.find((c) => view.type === "server" && c.id === view.cid) : null;

  useEffect(() => {
    return onSnapshot(doc(db, "system", "config"), (s) => {
      const c = s.data() as any; setBannedWords(Array.isArray(c?.bannedWords) ? c.bannedWords : []);
    });
  }, []);

  const users = Object.values(allUsers);
  const onlineCount = users.filter((u) => isOnline(u)).length;
  const adminCount = users.filter((u) => u.isAdmin).length;
  const bannedCount = users.filter((u) => u.banned).length;
  const serverCount = Object.values(servers).filter((s) => !s.isGlobal).length;

  const fireEvent = async (type: string, extra: Record<string, unknown> = {}) => {
    await setDoc(doc(db, "system", "event"), { type, ...extra, by: me.username, ts: serverTimestamp() });
    toast("Fired: " + type);
  };
  const setChannelField = async (field: string, value: any) => {
    if (view.type !== "server" || !view.cid) return toast("Open a channel first");
    await updateDoc(doc(db, "servers", view.sid, "channels", view.cid), { [field]: value });
    toast("Updated");
  };
  const purge = async () => {
    if (!col || !confirm("Delete every loaded message in this channel?")) return;
    const snap = await getDocs(query(col, orderBy("ts", "desc"), limit(200)));
    const batch = writeBatch(db); snap.forEach((d) => batch.delete(d.ref)); await batch.commit();
    toast(`Purged ${snap.size} messages`);
  };
  const deleteServer = async () => {
    if (view.type !== "server") return toast("Open a server first");
    if (servers[view.sid]?.isGlobal) return toast("Can't delete Global");
    if (!confirm(`Delete ${servers[view.sid].name} for everyone?`)) return;
    await deleteDoc(doc(db, "servers", view.sid));
    onClose(); onServerDeleted(); toast("Server deleted");
  };
  const saveWords = async (words: string[]) => {
    await setDoc(doc(db, "system", "config"), { bannedWords: words }, { merge: true });
  };
  const timeoutUser = async (uid: string, minutes: number) => {
    await updateDoc(doc(db, "users", uid), { timeoutUntil: minutes ? Date.now() + minutes * 60000 : 0 });
    toast(minutes ? `Timed out ${minutes}m` : "Timeout cleared");
  };
  const toggleBadge = async (uid: string, badge: string) => {
    const u = allUsers[uid]; const has = (u.badges || []).includes(badge);
    await updateDoc(doc(db, "users", uid), { badges: has ? arrayRemove(badge) : arrayUnion(badge) });
  };
  const toggleRainbow = async (uid: string) => {
    const u = allUsers[uid];
    await updateDoc(doc(db, "users", uid), { nameEffect: u.nameEffect === "rainbow" ? "" : "rainbow" });
    toast("Toggled rainbow name");
  };

  const tabs: [Tab, string][] = [
    ["stats", "Stats"], ["users", "Users"], ["emojis", "Emojis"], ["channel", "Channel"],
    ["cast", "Broadcast"], ["fun", "Fun"], ["filter", "Filter"], ["danger", "Danger"],
  ];

  return (
    <Modal onClose={onClose}>
      <button className="modalClose" onClick={onClose}>✕</button>
      <h2>🛡️ Admin panel</h2>
      <p className="modalSub">With great power…</p>
      <div className="tabs">
        {tabs.map(([t, label]) => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {tab === "stats" && (
        <div className="statGrid">
          <div className="statCard"><div className="statNum">{users.length}</div><div className="statLbl">Total users</div></div>
          <div className="statCard"><div className="statNum">{onlineCount}</div><div className="statLbl">Online now</div></div>
          <div className="statCard"><div className="statNum">{serverCount}</div><div className="statLbl">Custom servers</div></div>
          <div className="statCard"><div className="statNum">{adminCount}</div><div className="statLbl">Admins</div></div>
          <div className="statCard"><div className="statNum">{bannedCount}</div><div className="statLbl">Banned</div></div>
          <div className="statCard"><div className="statNum">{Object.keys(servers).length}</div><div className="statLbl">Servers total</div></div>
        </div>
      )}

      {tab === "users" && (
        <>
          <input className="dirSearch" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="dirList">
            {Object.keys(allUsers)
              .filter((uid) => allUsers[uid].username.toLowerCase().includes(q.toLowerCase()))
              .sort((a, b) => allUsers[a].username.localeCompare(allUsers[b].username))
              .map((uid) => {
                const u = allUsers[uid];
                const isTimedOut = (u.timeoutUntil || 0) > Date.now();
                return (
                  <div key={uid} className="adminUserRow">
                    <div className="adminUserTop">
                      <Avatar user={u} dot={false} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dmName">
                          {u.username}{" "}
                          {u.isAdmin && <span className="chip purple">ADMIN</span>}{" "}
                          {u.banned && <span className="chip red">BANNED</span>}{" "}
                          {isTimedOut && <span className="chip red">TIMEOUT</span>}
                        </div>
                        <div className="mini">{uid === myUid ? "(you)" : (u.badges || []).map((b) => BADGES[b]?.emoji).join(" ")}</div>
                      </div>
                    </div>
                    <div className="adminBtnRow">
                      {uid !== myUid && (
                        <>
                          <button className={"btn sm" + (u.banned ? " ghost" : " danger")}
                            onClick={async () => { await updateDoc(doc(db, "users", uid), { banned: !u.banned }); toast(u.banned ? "Unbanned" : "Banned"); }}>
                            {u.banned ? "Unban" : "Ban"}</button>
                          <button className="btn sm ghost" onClick={async () => { await updateDoc(doc(db, "users", uid), { isAdmin: !u.isAdmin }); toast("Done"); }}>
                            {u.isAdmin ? "Demote" : "Promote"}</button>
                          <button className="btn sm ghost" onClick={() => { const min = Number(prompt("Timeout minutes (0 to clear):", "10")); if (!isNaN(min)) timeoutUser(uid, min); }}>
                            {isTimedOut ? "Retime" : "Timeout"}</button>
                          <button className="btn sm ghost" onClick={() => toggleRainbow(uid)}>🌈 Name</button>
                        </>
                      )}
                      <button className="btn sm ghost" onClick={async () => {
                        const n = prompt("New username:", u.username); if (!n) return;
                        if (!/^[a-zA-Z0-9_]{2,20}$/.test(n)) return toast("Invalid name");
                        await updateDoc(doc(db, "users", uid), { username: n, usernameLower: n.toLowerCase() });
                        toast("Renamed");
                      }}>Rename</button>
                    </div>
                    <div className="badgePicker">
                      {Object.entries(BADGES).map(([id, b]) => {
                        const has = (u.badges || []).includes(id);
                        return (
                          <button key={id} className={"badgeChip" + (has ? " on" : "")} title={b.label}
                            onClick={() => toggleBadge(uid, id)} style={{ color: has ? b.color : undefined }}>
                            {b.emoji}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}

      {tab === "emojis" && <EmojiManager myUid={myUid} />}

      {tab === "channel" && (
        <>
          {currentChannel ? (
            <>
              <p className="modalSub">Settings for <b>#{currentChannel.name}</b>.</p>
              <div className="field"><label>🐌 SLOW MODE (seconds between messages, 0 = off)</label>
                <input type="number" min={0} max={600} defaultValue={currentChannel.slowMode || 0}
                  onBlur={(e) => setChannelField("slowMode", Math.max(0, Number(e.target.value) || 0))} /></div>
              <button className={"btn" + (currentChannel.locked ? "" : " ghost")}
                onClick={() => setChannelField("locked", !currentChannel.locked)}>
                {currentChannel.locked ? "🔓 Unlock channel" : "🔒 Lock channel (admins only)"}</button>
              <div style={{ height: 10 }} />
              <div className="field"><label>CHANNEL TOPIC</label>
                <input defaultValue={currentChannel.topic || ""} placeholder="What's this channel about?"
                  onBlur={(e) => setChannelField("topic", e.target.value)} /></div>
            </>
          ) : <p className="modalSub">Open a channel first to manage it.</p>}
        </>
      )}

      {tab === "cast" && (
        <>
          <div className="field"><label>📣 SITE-WIDE ANNOUNCEMENT</label>
            <textarea rows={2} value={castText} placeholder="School's out — hop on later" onChange={(e) => setCastText(e.target.value)} /></div>
          <button className="btn" onClick={async () => {
            const t = castText.trim(); if (!t) return;
            await setDoc(doc(db, "system", "announcement"), { text: t, by: me.username, ts: serverTimestamp() });
            setCastText(""); toast("Announcement sent");
          }}>Send announcement</button>
          <div style={{ height: 8 }} />
          <button className="btn ghost" onClick={async () => {
            if (!confirm("Clear the current announcement for everyone?")) return;
            await deleteDoc(doc(db, "system", "announcement")); toast("Announcement cleared");
          }}>Clear current announcement</button>
          <div style={{ height: 14 }} />
          <div className="field"><label>🤖 SYSTEM MESSAGE (posts in the open channel)</label>
            <input value={sysText} placeholder="The server will restart in 5 minutes…" onChange={(e) => setSysText(e.target.value)} /></div>
          <button className="btn ghost" onClick={async () => {
            const t = sysText.trim(); if (!t || !col) return;
            await addDoc(col, { uid: "system", username: "SYSTEM", system: true, text: t, reactions: {}, ts: serverTimestamp() });
            setSysText(""); toast("Posted");
          }}>Post as SYSTEM</button>
        </>
      )}

      {tab === "fun" && (
        <>
          <p className="modalSub">These fire on <b>everyone's</b> screen who's online.</p>
          <div className="funGrid">
            <button className="btn" onClick={() => fireEvent("confetti")}>🎉 Confetti storm</button>
            <button className="btn" onClick={() => { const e = prompt("Which emoji should rain?", "🍕"); if (e) fireEvent("emojirain", { emoji: e.slice(0, 4) }); }}>🌧️ Emoji rain</button>
            <button className="btn" onClick={() => fireEvent("shake")}>📳 Screen shake</button>
            <button className="btn" onClick={() => fireEvent("disco")}>🪩 Disco mode</button>
            <button className="btn" onClick={() => fireEvent("flip")}>🙃 Flip screens (5s)</button>
            <button className="btn" onClick={() => { const t = prompt("Toast text?"); if (t) fireEvent("toastwave", { text: t }); }}>💬 Toast everyone</button>
          </div>
        </>
      )}

      {tab === "filter" && (
        <>
          <p className="modalSub">Words here get auto-censored to <code className="mdCode">****</code> when anyone sends them.</p>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}><label>ADD A WORD</label>
              <input value={wordInput} onChange={(e) => setWordInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && wordInput.trim()) { saveWords([...bannedWords, wordInput.trim().toLowerCase()]); setWordInput(""); } }} /></div>
            <button className="btn" style={{ width: "auto", flex: "0 0 auto", padding: "10px 16px" }}
              onClick={() => { if (wordInput.trim()) { saveWords([...bannedWords, wordInput.trim().toLowerCase()]); setWordInput(""); } }}>Add</button>
          </div>
          <div className="wordList">
            {bannedWords.length === 0 && <p className="modalSub">No filtered words.</p>}
            {bannedWords.map((w, i) => (
              <span key={i} className="wordChip">{w} <button onClick={() => saveWords(bannedWords.filter((x) => x !== w))}>✕</button></span>
            ))}
          </div>
        </>
      )}

      {tab === "danger" && (
        <>
          <p className="modalSub">No undo on any of these.</p>
          <button className="btn danger" onClick={purge}>🧹 Purge current channel</button>
          <div style={{ height: 10 }} />
          <button className="btn danger" onClick={deleteServer}>💥 Delete current server</button>
        </>
      )}
    </Modal>
  );
}
