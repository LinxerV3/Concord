import type { StatusMode, UserDoc } from "../types";
import { STATUS_PRESETS } from "../lib/firebase";

export default function Avatar({
  user, size = 30, online, dot = true, showStatus = false,
}: { user?: UserDoc | null; size?: number; online?: boolean; dot?: boolean; showStatus?: boolean }) {
  const sm: StatusMode | null | undefined = user?.statusMode;
  const statusEmoji = sm ? (sm.emoji || STATUS_PRESETS.find((p) => p.type === sm.type)?.emoji) : null;
  const dnd = sm?.type === "dnd";
  return (
    <div className="dmAvatar" style={{ width: size, height: size, fontSize: size * 0.5 }}>
      <div className="av">
        {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : (user?.avatarEmoji || "🙂")}
      </div>
      {dot && !(showStatus && statusEmoji) && (
        <div className={"dot" + (online ? (dnd ? " dnd" : " on") : "")} />
      )}
      {showStatus && statusEmoji && (
        <div className="statusBadge" title={sm?.detail || ""}>{statusEmoji}</div>
      )}
    </div>
  );
}
