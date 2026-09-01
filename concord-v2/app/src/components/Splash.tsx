import { useEffect, useState } from "react";

/* Startup splash — logo mark draws in, then fades out.
   Shows a rotating loading line so boot never feels frozen. */

const LINES = [
  "Warming up the servers…",
  "Polishing the pixels…",
  "Loading your world…",
  "Almost there…",
];

export default function Splash({ done }: { done: boolean }) {
  const [line, setLine] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % LINES.length), 1400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (done) { const t = setTimeout(() => setGone(true), 550); return () => clearTimeout(t); }
  }, [done]);

  if (gone) return null;

  return (
    <div className={"splash" + (done ? " leaving" : "")}>
      <div className="splashMark">⌁</div>
      <div className="splashName">Concord</div>
      <div className="splashBar"><div className="splashFill" /></div>
      <div className="splashLine">{LINES[line]}</div>
    </div>
  );
}
