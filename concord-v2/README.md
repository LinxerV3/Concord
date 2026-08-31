# Concord v2 ⌁

Discord-style chat. React + TypeScript frontend, Firebase for auth/profiles/history,
Cloudflare Durable Objects for the realtime layer (instant messages, typing
indicators, live presence).

## How the hybrid architecture works

```
you type a message
   ├─► WebSocket → Durable Object → everyone in the room (~50ms)   [speed]
   └─► Firestore setDoc (same message id)                          [history]
```

Clients dedupe by message id: the WS copy shows instantly (slightly faded =
"pending"), then the Firestore copy replaces it when the snapshot arrives.
Typing indicators and "in this chat" presence are pure WebSocket — they never
touch the database. If the worker is down or not deployed yet, everything
still works through Firestore alone, just without the instant layer.

Each channel and DM gets its own Durable Object room (`s_<server>_<channel>`
or `dm_<pairId>`), so fanout only goes to people actually in that room.

## Setup — Part 1: the realtime worker (5 min)

```bash
cd worker
npx wrangler login        # first time only
npx wrangler deploy
```

Wrangler prints a URL like `https://concord-realtime.<your-subdomain>.workers.dev`.

Open `app/src/lib/socket.ts` and set:

```ts
export const WORKER_WS_URL = "wss://concord-realtime.<your-subdomain>.workers.dev";
```

(https → **wss**, that's the only change.)

Durable Objects work on the **free** Workers plan (SQLite-backed classes,
which this uses). ~100k requests/day free; WebSocket messages count 20:1,
outgoing messages are free, and the Hibernation API means idle rooms cost
nothing.

## Setup — Part 2: the app

```bash
cd app
npm install
npm run dev       # local dev at http://localhost:5173
npm run build     # production build → app/dist/
```

## Setup — Part 3: hosting (pick one)

**Cloudflare Pages (recommended — same dashboard as your worker):**
1. Push this repo to GitHub
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo
3. Build command: `npm run build` · Build output: `dist` · Root directory: `app`
4. Every git push auto-deploys. Done.

**Firebase Hosting (keeps everything in mygamestorefun):**
```bash
cd app && npm run build
firebase deploy --only hosting     # with hosting "public" set to app/dist
```

**Netlify Drop:** drag the `app/dist` folder in. Works, but you re-drag every update.

## Firebase console checklist (already done if v1 works)

- Authentication → Sign-in method → **Email/Password enabled**
- Firestore rules: at minimum `allow read, write: if request.auth != null;`
  (or the stricter admin-protected rules from our chat)

## Firestore layout (unchanged from v1 — your existing data carries over)

```
users/{uid}                                  profiles, isAdmin, banned, joinedServers
servers/{sid}/channels/{cid}/messages/{mid}  channel history
dms/{pairId}/messages/{mid}                  DM history
system/announcement · system/event           admin broadcasts + fun effects
```

## Admin

Type `123abc` in the username field on the login screen → admin signup unlocks.
First-come-first-serve: only works while zero admins exist. Promote co-admins
from the panel afterwards.

## Honest security notes

- The WebSocket trusts the uid/name you pass it (same trust level as your
  open Firestore rules — fine for a friend group). The upgrade path is
  sending a Firebase ID token and verifying its JWT in the worker.
- The `123abc` trigger is visible in the bundled JS. Change `ADMIN_TRIGGER`
  in `app/src/lib/firebase.ts` before deploying if your friends read source.
