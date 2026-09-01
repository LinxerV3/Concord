import { ReactNode } from "react";
import { SHORTCODES, CUSTOM_EMOJIS } from "./emoji";

/* Message formatting -> React nodes:
   ```code block```  ||spoiler||  `inline`  **bold**  *italic*  __underline__  ~~strike~~
   :emoji: / :customemoji:   @mentions   > quote (line start)                       */

export interface FormatCtx {
  myUsername?: string;
  usernames?: Set<string>;
  onMention?: (username: string) => void;
}

function inline(text: string, kb: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\|\|[^|]+\|\|)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*]+\*)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...emojiAndMentions(text.slice(last, m.index), kb + "p" + i));
    const t = m[0];
    if (t.startsWith("`")) out.push(<code key={kb + i} className="mdCode">{t.slice(1, -1)}</code>);
    else if (t.startsWith("||")) out.push(
      <span key={kb + i} className="spoiler" onClick={(e) => e.currentTarget.classList.toggle("revealed")}>{t.slice(2, -2)}</span>);
    else if (t.startsWith("**")) out.push(<strong key={kb + i}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("__")) out.push(<u key={kb + i}>{t.slice(2, -2)}</u>);
    else if (t.startsWith("~~")) out.push(<s key={kb + i}>{t.slice(2, -2)}</s>);
    else out.push(<em key={kb + i}>{t.slice(1, -1)}</em>);
    last = m.index + t.length; i++;
  }
  if (last < text.length) out.push(...emojiAndMentions(text.slice(last), kb + "e"));
  return out;
}

function emojiAndMentions(text: string, kb: string, ctx?: FormatCtx): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(:[a-z0-9_+-]+:)|(@[a-zA-Z0-9_]{2,20})/gi;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith(":")) {
      const name = t.slice(1, -1), lower = name.toLowerCase();
      if (CUSTOM_EMOJIS[name] || CUSTOM_EMOJIS[lower])
        nodes.push(<img key={kb + k} className="customEmoji" src={CUSTOM_EMOJIS[name] || CUSTOM_EMOJIS[lower]} alt={t} title={t} />);
      else if (SHORTCODES[lower]) nodes.push(SHORTCODES[lower]);
      else nodes.push(t);
    } else {
      const uname = t.slice(1);
      const known = !FMT_CTX?.usernames || FMT_CTX.usernames.has(uname.toLowerCase());
      const isMe = FMT_CTX?.myUsername && uname.toLowerCase() === FMT_CTX.myUsername.toLowerCase();
      if (known) nodes.push(
        <span key={kb + k} className={"mention" + (isMe ? " meMention" : "")}
          onClick={() => FMT_CTX?.onMention?.(uname)}>@{uname}</span>);
      else nodes.push(t);
    }
    last = m.index + t.length; k++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// module-level ctx so the inline/emoji helpers can see mentions without threading params
let FMT_CTX: FormatCtx | undefined;

export function formatMessage(text: string, ctx: FormatCtx = {}): ReactNode[] {
  FMT_CTX = ctx;
  const blocks: ReactNode[] = [];
  // split on ``` fenced code blocks
  const parts = text.split(/```/);
  let key = 0;
  parts.forEach((part, idx) => {
    if (idx % 2 === 1) {
      // inside a fence
      blocks.push(<pre key={"cb" + key++} className="codeBlock"><code>{part.replace(/^\n/, "")}</code></pre>);
    } else if (part) {
      // process line by line for > quotes
      const lines = part.split("\n");
      lines.forEach((line, li) => {
        if (line.startsWith("> ")) {
          blocks.push(<blockquote key={"q" + key++} className="quote">{inline(line.slice(2), "q" + key + "_")}</blockquote>);
        } else {
          blocks.push(<span key={"l" + key++}>{inline(line, "l" + key + "_")}</span>);
          if (li < lines.length - 1) blocks.push(<br key={"br" + key++} />);
        }
      });
    }
  });
  return blocks;
}

export function mentionsUser(text: string, username: string): boolean {
  return new RegExp(`@${username}\\b`, "i").test(text);
}
