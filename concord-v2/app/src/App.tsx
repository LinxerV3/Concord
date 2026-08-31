import { useEffect, useMemo, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  arrayUnion,
} from "firebase/firestore";
import { auth, db, ADMIN_TRIGGER, EMAIL_DOMAIN, GLOBAL_ID, isOnline } from "./lib/firebase";
import { confetti, disco, emojiRain, flip, shake, toast } from "./lib/fx";
import type { ChannelDoc, DmThread, ServerDoc, UserDoc, View } from "./types";
import ChatArea from "./components/ChatArea";
import {
  AdminModal, DirectoryModal, ProfileModal, ServerBrowserModal, SettingsModal,
} from "./components/Modals";
import Avatar from "./components/Avatar";

type ModalState =
  | { kind: "none" }
  | { kind: "profile"; uid: string }
  | { kind: "settings" }
  | { kind: "directory" }
  | { kind: "browser" }
  | { kind: "admin" };

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [me, setMe] = useState<UserDoc | null>(null);
  const [allUsers, setAllUsers] = useState<Record<string, UserDoc>>({});
  const [servers, setServers] = useState<Record<string, ServerDoc>>({});
  const [channels, setChannels] = useState<ChannelDoc[]>([]);
  const [dmThreads, setDmThreads] = useState<DmThread[]>([]);
  const [view, setView] = useState<View>({ type: "server", sid: GLOBAL_ID, cid: null });
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const lastEventTs = useRef(0);
  const lastAnnounceTs = useRef(0);
  const appStart = useRef(Date.now());

  /* ---------- auth ---------- */
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setMyUid(u ? u.uid : null);
      setAuthReady(true);
      if (u) await ensureGlobal();
    });
  }, []);

  /* ---------- my doc (live bans / renames / promotions) ---------- */
  useEffect(() => {
    if (!myUid) { setMe(null); return; }
    return onSnapshot(doc(db, "users", myUid), (s) => {
      if (!s.exists()) return;
      const data = s.data() as UserDoc;
      if (data.banned) { toast("You've been banned."); signOut(auth); return; }
      setMe(data);
    });
  }, [myUid]);

  /* ---------- global collections ---------- */
  useEffect(() => {
    if (!myUid) return;
    const un1 = onSnapshot(collection(db, "users"), (snap) => {
      const m: Record<string, UserDoc> = {};
      snap.forEach((d) => (m[d.id] = d.data() as UserDoc));
      setAllUsers(m);
    });
    const un2 = onSnapshot(collection(db, "servers"), (snap) => {
      const m: Record<string, ServerDoc> = {};
      snap.forEach((d) => (m[d.id] = { id: d.id, ...(d.data() as any) }));
      setServers(m);
    });
    const un3 = onSnapshot(
      query(collection(db, "dms"), where("users", "array-contains", myUid)),
      (snap) => {
        const t: DmThread[] = [];
        snap.forEach((d) => t.push({ id: d.id, ...(d.data() as any) }));
        t.sort((a, b) => (b.lastTs?.seconds || 0) - (a.lastTs?.seconds || 0));
        setDmThreads(t);
      }
    );
    const un4 = onSnapshot(doc(db, "system", "announcement"), (s) => {
      const a = s.data() as any;
      if (!a?.ts) return;
      const t = a.ts.toDate().getTime();
      if (t > lastAnnounceTs.current) { lastAnnounceTs.current = t; setAnnouncement(a.text); }
    });
    const un5 = onSnapshot(doc(db, "system", "event"), (s) => {
      const e = s.data() as any;
      if (!e?.ts) return;
      const t = e.ts.toDate().getTime();
      if (t <= lastEventTs.current || t < appStart.current - 8000) {
        lastEventTs.current = Math.max(lastEventTs.current, t);
        return;
      }
      lastEventTs.current = t;
      if (e.type === "confetti") confetti();
      if (e.type === "emojirain") emojiRain(e.emoji || "🍕");
      if (e.type === "shake") shake();
      if (e.type === "disco") disco();
      if (e.type === "flip") flip();
      if (e.type === "toastwave" && e.text) toast("📣 " + e.text);
    });
    // directory-wide presence heartbeat
    const beat = () =>
      updateDoc(doc(db, "users", myUid), { lastSeen: serverTimestamp() }).catch(() => {});
    beat();
    const hb = setInterval(beat, 30_000);
    return () => { un1(); un2(); un3(); un4(); un5(); clearInterval(hb); };
  }, [myUid]);

  /* ---------- channels for current server ---------- */
  useEffect(() => {
    if (view.type !== "server") { setChannels([]); return; }
    const sid = view.sid;
    return onSnapshot(
      query(collection(db, "servers", sid, "channels"), orderBy("createdAt")),
      (snap) => {
        const c: ChannelDoc[] = [];
        snap.forEach((d) => c.push({ id: d.id, ...(d.data() as any) }));
        setChannels(c);
        setView((v) => {
          if (v.type !== "server" || v.sid !== sid) return v;
          if (!v.cid || !c.find((x) => x.id === v.cid)) return { ...v, cid: c[0]?.id ?? null };
          return v;
        });
      }
    );
  }, [view.type === "server" ? view.sid : null]);

  /* redirect if current server was deleted */
  useEffect(() => {
    if (view.type === "server" && Object.keys(servers).length && !servers[view.sid]) {
      setView({ type: "server", sid: GLOBAL_ID, cid: null });
    }
  }, [servers]);

  if (!authReady) return null;
  if (!myUid) return <AuthScreen />;
  if (!me) return null;

  const myServers = Object.values(servers)
    .filter((s) => s.isGlobal || me.joinedServers?.includes(s.id))
    .sort((a, b) => (a.isGlobal ? -1 : 1) - (b.isGlobal ? -1 : 1) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  const openServer = (sid: string) => {
    setView({ type: "server", sid, cid: null });
    document.body.classList.remove("sideOpen");
  };
  const openHome = () => {
    setView({ type: "home", dmId: null, otherUid: null });
    document.body.classList.remove("sideOpen");
  };
  const openDM = async (otherUid: string) => {
    const dmId = [myUid, otherUid].sort().join("_");
    const ref = doc(db, "dms", dmId);
    const s = await getDoc(ref);
    if (!s.exists()) await setDoc(ref, { users: [myUid, otherUid], lastTs: serverTimestamp() });
    setView({ type: "home", dmId, otherUid });
    document.body.classList.remove("sideOpen");
  };
  const openProfile = (uid: string) => setModal({ kind: "profile", uid });

  const sv = view.type === "server" ? servers[view.sid] : null;
  const canManage = !!sv && (sv.ownerId === myUid || me.isAdmin);

  const addChannel = async () => {
    if (view.type !== "server") return;
    const name = prompt("Channel name:");
    if (!name) return;
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
    if (!clean) return;
    await addDoc(collection(db, "servers", view.sid, "channels"), {
      name: clean, topic: "", createdAt: serverTimestamp(),
    });
  };

  /* message-collection path for the open room (shared with admin tools) */
  const colSegments: string[] | null =
    view.type === "server" && view.cid
      ? ["servers", view.sid, "channels", view.cid, "messages"]
      : view.type === "home" && view.dmId
      ? ["dms", view.dmId, "messages"]
      : null;

  const roomId =
    view.type === "server" && view.cid ? `s_${view.sid}_${view.cid}`
    : view.type === "home" && view.dmId ? `dm_${view.dmId}`
    : null;

  return (
    <div className="app">
      {/* ===== server rail ===== */}
      <div className="rail">
        <button className={"railBtn" + (view.type === "home" ? " active" : "")} title="Direct messages" onClick={openHome}>💬</button>
        <div className="railSep" />
        {myServers.map((s) => (
          <button key={s.id}
            className={"railBtn" + (view.type === "server" && view.sid === s.id ? " active" : "")}
            title={s.name} onClick={() => openServer(s.id)}>
            {s.icon || "🟣"}
          </button>
        ))}
        <button className="railBtn add" title="Add or browse servers" onClick={() => setModal({ kind: "browser" })}>＋</button>
      </div>

      {/* ===== sidebar ===== */}
      <div className="sidebar">
        <div className="sidebarHeader">
          <span>{view.type === "server" ? sv?.name ?? "…" : "Direct Messages"}</span>
          <div className="hdrBtns">
            {view.type === "server" && canManage && (
              <button className="iconBtn" title="New channel" onClick={addChannel}>＋</button>
            )}
          </div>
        </div>
        <div className="channelList">
          {view.type === "server" ? (
            <>
              <div className="chLabel">TEXT CHANNELS</div>
              {channels.map((ch) => (
                <div key={ch.id}
                  className={"chItem" + (view.cid === ch.id ? " active" : "")}
                  onClick={() => setView({ ...view, cid: ch.id })}>
                  <span className="hash">#</span> {ch.name}
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="chLabel">CONVERSATIONS</div>
              {dmThreads.length === 0 && (
                <div className="chItem" style={{ cursor: "default", color: "var(--txt3)" }}>No DMs yet</div>
              )}
              {dmThreads.map((t) => {
                const other = t.users.find((u) => u !== myUid)!;
                const u = allUsers[other];
                return (
                  <div key={t.id}
                    className={"chItem" + (view.type === "home" && view.dmId === t.id ? " active" : "")}
                    onClick={() => openDM(other)}>
                    <Avatar user={u} size={30} online={isOnline(u)} />
                    <span className="dmName">{u?.username ?? "unknown"}</span>
                  </div>
                );
              })}
              <div className="chItem" onClick={() => setModal({ kind: "directory" })}>
                <span className="hash">＋</span> Find people
              </div>
            </>
          )}
        </div>
        <div className="userBar">
          <div onClick={() => openProfile(myUid)}>
            <Avatar user={me} size={34} online />
          </div>
          <div className="userBarInfo" onClick={() => setModal({ kind: "settings" })} title="Edit profile">
            <div className="n">{me.username} {me.isAdmin && <span className="badge">ADMIN</span>}</div>
            <div className="s">{me.customStatus || "Online"}</div>
          </div>
          {me.isAdmin && (
            <button className="iconBtn" title="Admin panel" onClick={() => setModal({ kind: "admin" })}>🛡️</button>
          )}
          <button className="iconBtn" title="Settings" onClick={() => setModal({ kind: "settings" })}>⚙️</button>
          <button className="iconBtn" title="Log out" onClick={() => signOut(auth)}>⏻</button>
        </div>
      </div>

      {/* ===== chat + members ===== */}
      <ChatArea
        key={roomId ?? "empty"}
        roomId={roomId}
        colSegments={colSegments}
        view={view}
        me={me}
        myUid={myUid}
        allUsers={allUsers}
        servers={servers}
        channels={channels}
        announcement={announcement}
        dismissAnnouncement={() => setAnnouncement(null)}
        openProfile={openProfile}
        openDirectory={() => setModal({ kind: "directory" })}
      />

      {/* ===== modals ===== */}
      {modal.kind === "profile" && (
        <ProfileModal uid={modal.uid} me={me} myUid={myUid} allUsers={allUsers}
          onClose={() => setModal({ kind: "none" })}
          onMessage={(uid) => { setModal({ kind: "none" }); openDM(uid); }}
          onEdit={() => setModal({ kind: "settings" })} />
      )}
      {modal.kind === "settings" && (
        <SettingsModal me={me} myUid={myUid} onClose={() => setModal({ kind: "none" })} />
      )}
      {modal.kind === "directory" && (
        <DirectoryModal allUsers={allUsers} onClose={() => setModal({ kind: "none" })}
          onPick={(uid) => setModal({ kind: "profile", uid })} />
      )}
      {modal.kind === "browser" && (
        <ServerBrowserModal servers={servers} me={me} myUid={myUid} allUsers={allUsers}
          onClose={() => setModal({ kind: "none" })}
          onOpenServer={(sid) => { setModal({ kind: "none" }); setTimeout(() => openServer(sid), 300); }} />
      )}
      {modal.kind === "admin" && me.isAdmin && (
        <AdminModal me={me} myUid={myUid} allUsers={allUsers} view={view} servers={servers}
          colSegments={colSegments}
          onClose={() => setModal({ kind: "none" })}
          onServerDeleted={() => openServer(GLOBAL_ID)} />
      )}
    </div>
  );
}

/* =========================================================
   Global server bootstrap
========================================================= */
async function ensureGlobal() {
  const ref = doc(db, "servers", GLOBAL_ID);
  const s = await getDoc(ref);
  if (!s.exists()) {
    await setDoc(ref, {
      name: "Global", icon: "🌍", ownerId: "system", isGlobal: true, createdAt: serverTimestamp(),
    });
    await addDoc(collection(ref, "channels"), {
      name: "general", topic: "Everyone's here. Say hi!", createdAt: serverTimestamp(),
    });
  }
}

/* =========================================================
   Auth screen (with the 123abc admin trigger)
========================================================= */
function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [adminSignup, setAdminSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [keyConfirm, setKeyConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onUserInput = (v: string) => {
    if (v.trim() === ADMIN_TRIGGER) {
      setUsername("");
      setAdminSignup(true);
      setMode("signup");
      return;
    }
    setUsername(v);
  };

  const submit = async () => {
    setErr("");
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) return setErr("Username: 2–20 letters, numbers, or _");
    if (pass.length < 6) return setErr("Password needs at least 6 characters.");
    if (adminSignup && keyConfirm.trim() !== ADMIN_TRIGGER) return setErr("Admin key doesn't match.");
    const email = username.toLowerCase() + EMAIL_DOMAIN;
    setBusy(true);
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        let grantAdmin = false;
        if (adminSignup) {
          const q = await getDocs(query(collection(db, "users"), where("isAdmin", "==", true), limit(1)));
          grantAdmin = q.empty;
        }
        await setDoc(doc(db, "users", cred.user.uid), {
          username, usernameLower: username.toLowerCase(),
          bio: "", pronouns: "", customStatus: "",
          avatarEmoji: "🙂", avatarUrl: "", banner: "#7c6cff", accent: "#7c6cff",
          isAdmin: grantAdmin, banned: false,
          joinedServers: [GLOBAL_ID],
          createdAt: serverTimestamp(), lastSeen: serverTimestamp(),
        });
        if (grantAdmin) toast("🛡️ Admin seat claimed. It's yours.");
        else if (adminSignup) toast("Admin seat already taken — account created as a regular user.");
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (e: any) {
      const msgMap: Record<string, string> = {
        "auth/invalid-credential": "Wrong username or password.",
        "auth/user-not-found": "No account with that username.",
        "auth/wrong-password": "Wrong password.",
        "auth/email-already-in-use": "That username is taken.",
      };
      setErr(msgMap[e.code] || e.message || "Something went wrong.");
    }
    setBusy(false);
  };

  return (
    <div className="authScreen">
      <div className="authCard">
        <div className="logo"><div className="logoMark">⌁</div><h1>Concord</h1></div>
        <p className="authSub">
          {adminSignup
            ? "🛡️ Admin signup unlocked. Choose your admin username + password, and confirm the key."
            : mode === "login"
            ? "Log in to keep the conversation going."
            : "Pick a username. No email needed."}
        </p>
        {err && <div className="authErr">{err}</div>}
        <div className="field"><label>USERNAME</label>
          <input value={username} maxLength={20} autoComplete="username"
            onChange={(e) => onUserInput(e.target.value)} />
        </div>
        <div className="field"><label>PASSWORD</label>
          <input type="password" value={pass} autoComplete="current-password"
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        {adminSignup && (
          <div className="field"><label>ADMIN KEY (confirm)</label>
            <input value={keyConfirm} placeholder="Re-type the key"
              onChange={(e) => setKeyConfirm(e.target.value)} />
          </div>
        )}
        <button className="btn" disabled={busy} onClick={submit}>
          {busy ? "…" : adminSignup ? "Create ADMIN account" : mode === "login" ? "Log in" : "Create account"}
        </button>
        <div className="authSwitch">
          {adminSignup ? (
            <a onClick={() => { setAdminSignup(false); setMode("login"); }}>Back to normal login</a>
          ) : mode === "login" ? (
            <>Need an account? <a onClick={() => setMode("signup")}>Sign up</a></>
          ) : (
            <>Already have one? <a onClick={() => setMode("login")}>Log in</a></>
          )}
        </div>
      </div>
    </div>
  );
}
