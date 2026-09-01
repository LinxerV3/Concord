import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";

/* Crop / zoom / pan editor. shape="circle" for avatars, "rect" for banners.
   Outputs a JPEG Blob. Keeps the object URL alive for the whole edit so the
   preview always renders (the earlier version revoked it too early -> black box). */

interface Props {
  file: File;
  shape: "circle" | "rect";
  boxW?: number;
  boxH?: number;
  outW: number;
  outH: number;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}

export default function CropEditor({ file, shape, boxW = 280, boxH, outW, outH, onCancel, onDone }: Props) {
  const bW = boxW;
  const bH = boxH ?? (shape === "circle" ? boxW : Math.round(boxW * (outH / outW)));
  const [url, setUrl] = useState<string>("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const objUrl = URL.createObjectURL(file);
    setUrl(objUrl);
    const im = new Image();
    im.onload = () => { setImg(im); setZoom(1); setOffset({ x: 0, y: 0 }); };
    im.src = objUrl;
    return () => URL.revokeObjectURL(objUrl); // revoke only when the editor closes
  }, [file]);

  if (!img || !url) return <div className="cropLoading">Loading…</div>;

  const coverScale = Math.max(bW / img.width, bH / img.height);
  const eff = coverScale * zoom;
  const drawW = img.width * eff;
  const drawH = img.height * eff;

  const clamp = (o: { x: number; y: number }) => {
    const maxX = Math.max(0, (drawW - bW) / 2);
    const maxY = Math.max(0, (drawH - bH) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, o.x)), y: Math.max(-maxY, Math.min(maxY, o.y)) };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }));
  };
  const onPointerUp = () => { drag.current = null; };

  const confirm = () => {
    const canvas = document.createElement("canvas");
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    const k = outW / bW;
    const dW = drawW * k, dH = drawH * k;
    const dx = (outW - dW) / 2 + offset.x * k;
    const dy = (outH - dH) / 2 + offset.y * k;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, dx, dy, dW, dH);
    canvas.toBlob((b) => b && onDone(b), "image/jpeg", 0.85);
  };

  const imgStyle: CSSProperties = {
    position: "absolute",
    width: drawW, height: drawH,
    left: (bW - drawW) / 2 + offset.x,
    top: (bH - drawH) / 2 + offset.y,
    userSelect: "none", pointerEvents: "none", maxWidth: "none",
  };

  return (
    <div className="cropEditor">
      <div className={"cropBox " + (shape === "circle" ? "circle" : "rect")}
        style={{ width: bW, height: bH }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <img src={url} style={imgStyle} alt="" draggable={false} />
        <div className={"cropRing " + (shape === "circle" ? "circle" : "rect")} />
      </div>
      <div className="cropControls">
        <span>🔍</span>
        <input type="range" min={1} max={4} step={0.01} value={zoom}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setZoom(Number(e.target.value)); setOffset((o) => clamp(o)); }} />
      </div>
      <div className="cropHint">Drag to move · slide to zoom</div>
      <div className="pActions">
        <button className="btn" onClick={confirm}>Use image</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
