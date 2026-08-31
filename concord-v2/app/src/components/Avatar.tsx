import type { UserDoc } from "../types";

export default function Avatar({
  user, size = 30, online, dot = true,
}: { user?: UserDoc | null; size?: number; online?: boolean; dot?: boolean }) {
  return (
    <div className="dmAvatar" style={{ width: size, height: size, fontSize: size * 0.5 }}>
      <div className="av">
        {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : (user?.avatarEmoji || "🙂")}
      </div>
      {dot && <div className={"dot" + (online ? " on" : "")} />}
    </div>
  );
}
