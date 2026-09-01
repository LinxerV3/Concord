import { useEffect } from "react";

/* Click a chat image -> full-screen lightbox. Esc or click backdrop to close. */
export default function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose}>
      <img src={url} alt="" onClick={(e) => e.stopPropagation()} />
      <a className="lightboxOpen" href={url} target="_blank" rel="noreferrer"
        onClick={(e) => e.stopPropagation()}>Open original ↗</a>
    </div>
  );
}
