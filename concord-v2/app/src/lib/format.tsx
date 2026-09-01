import { ReactNode } from "react";
import { SHORTCODES, CUSTOM_EMOJIS } from "./emoji";

/* Turn raw message text into React nodes:
   - **bold**  *italic*  __underline__  ~~strike~~  `code`
   - :shortcode: (unicode) and :customname: (image)
   - @username mentions (highlight, and flag if it's you)
   Order matters: we tokenize emoji/mentions first, then apply inline styles per text run. */

export interface FormatCtx {
  myUsername?: string;
  usernames?: Set<string>; // known usernames for @mention validation (lowercased)
  onMention?: (username: string) => void;
}

function applyInline(text: string, keyBase: string): ReactNode[] {
  // very small markdown: process code first (so styles inside code are literal)
  const out: ReactNode[] = [];
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*]+\*)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={keyBase + i} className="mdCode">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={keyBase + i}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("__")) out.push(<u key={keyBase + i}>{tok.slice(2, -2)}</u>);
    else if (tok.startsWith("~~")) out.push(<s key={keyBase + i}>{tok.slice(2, -2)}</s>);
    else if (tok.startsWith("*")) out.push(<em key={keyBase + i}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length; i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function formatMessage(text: string, ctx: FormatCtx = {}): ReactNode[] {
  const nodes: ReactNode[] = [];
  // token regex for emoji + mentions
  const tokenRe = /(:[a-z0-9_+-]+:)|(@[a-zA-Z0-9_]{2,20})/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  const pushText = (s: string) => { if (s) nodes.push(...applyInline(s, `t${k++}_`)); };

  while ((m = tokenRe.exec(text))) {
    if (m.index > last) pushText(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith(":")) {
      const name = tok.slice(1, -1);
      const lower = name.toLowerCase();
      if (CUSTOM_EMOJIS[name] || CUSTOM_EMOJIS[lower]) {
        const url = CUSTOM_EMOJIS[name] || CUSTOM_EMOJIS[lower];
        nodes.push(<img key={`e${k++}`} className="customEmoji" src={url} alt={tok} title={tok} />);
      } else if (SHORTCODES[lower]) {
        nodes.push(SHORTCODES[lower]);
      } else {
        nodes.push(tok);
      }
    } else {
      // mention
      const uname = tok.slice(1);
      const known = !ctx.usernames || ctx.usernames.has(uname.toLowerCase());
      const isMe = ctx.myUsername && uname.toLowerCase() === ctx.myUsername.toLowerCase();
      if (known) {
        nodes.push(
          <span key={`m${k++}`} className={"mention" + (isMe ? " meMention" : "")}
            onClick={() => ctx.onMention?.(uname)}>@{uname}</span>
        );
      } else {
        nodes.push(tok);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) pushText(text.slice(last));
  return nodes;
}

/** Does this message @mention the given username? */
export function mentionsUser(text: string, username: string): boolean {
  const re = new RegExp(`@${username}\\b`, "i");
  return re.test(text);
}
EOF
