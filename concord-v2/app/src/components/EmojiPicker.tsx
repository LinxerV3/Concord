import { useMemo, useState } from "react";
import { EMOJI_CATEGORIES, SHORTCODES } from "../lib/emoji";

interface Props {
  onPick: (emoji: string) => void;      // unicode emoji chosen
  onPickCustom?: (name: string) => void; // custom emoji chosen -> inserts :name:
  customEmojis?: Record<string, string>;
  onClose?: () => void;
}

export default function EmojiPicker({ onPick, onPickCustom, customEmojis = {}, onClose }: Props) {
  const [cat, setCat] = useState(EMOJI_CATEGORIES[0].id);
  const [q, setQ] = useState("");

  const customList = Object.entries(customEmojis);
  const hasCustom = customList.length > 0;

  const searchResults = useMemo(() => {
    if (!q.trim()) return null;
    const query = q.toLowerCase();
    // match unicode by shortcode name
    const uni = Object.entries(SHORTCODES)
      .filter(([name]) => name.includes(query))
      .map(([, e]) => e);
    // dedupe
    return [...new Set(uni)];
  }, [q]);

  const customMatches = useMemo(() => {
    if (!q.trim()) return [];
    return customList.filter(([name]) => name.toLowerCase().includes(q.toLowerCase()));
  }, [q, customEmojis]);

  const active = EMOJI_CATEGORIES.find((c) => c.id === cat)!;

  return (
    <div className="emojiPicker" onMouseLeave={onClose}>
      <input className="emojiSearch" placeholder="Search emoji…" value={q} autoFocus
        onChange={(e) => setQ(e.target.value)} />

      {!q && (
        <div className="emojiTabs">
          {hasCustom && (
            <button className={"emojiTab" + (cat === "custom" ? " active" : "")} title="Custom"
              onClick={() => setCat("custom")}>🖼️</button>
          )}
          {EMOJI_CATEGORIES.map((c) => (
            <button key={c.id} className={"emojiTab" + (cat === c.id ? " active" : "")} title={c.name}
              onClick={() => setCat(c.id)}>{c.icon}</button>
          ))}
        </div>
      )}

      <div className="emojiGrid">
        {q ? (
          <>
            {customMatches.map(([name, url]) => (
              <button key={"c" + name} title={`:${name}:`} onClick={() => onPickCustom?.(name)}>
                <img className="customEmoji" src={url} alt={name} />
              </button>
            ))}
            {searchResults?.map((e, i) => (
              <button key={"u" + i} onClick={() => onPick(e)}>{e}</button>
            ))}
            {!customMatches.length && !searchResults?.length && (
              <div className="emojiEmpty">No emoji match “{q}”.</div>
            )}
          </>
        ) : cat === "custom" ? (
          customList.length ? customList.map(([name, url]) => (
            <button key={name} title={`:${name}:`} onClick={() => onPickCustom?.(name)}>
              <img className="customEmoji" src={url} alt={name} />
            </button>
          )) : <div className="emojiEmpty">No custom emoji yet.</div>
        ) : (
          active.emojis.map((e, i) => (
            <button key={i} onClick={() => onPick(e)}>{e}</button>
          ))
        )}
      </div>
    </div>
  );
}
