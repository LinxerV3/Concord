import { useEffect, useRef, useState } from "react";

/* Crop / zoom / pan editor.
   shape="circle" for avatars, "rect" for banners. Outputs a JPEG Blob. */

interface Props {
  file: File;
  shape: "circle" | "rect";
  /** on-screen editor box size */
  boxW?: number;
  boxH?: number;
  /** output pixel size */
  outW: number;
  outH: number;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}

export default function CropEditor({ file, shape, boxW = 280, boxH, outW, outH, onCancel, onDone }: Props) {
  const bW = boxW;
  const bH = boxH ?? (shape === "circle" ? boxW : Math.round(boxW * (outH / outW)));
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { setImg(im); setZoom(1); setOffset({ x: 0, y: 0 }); URL.revokeObjectURL(url); };
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!img) return <div className="cropLoading">Loading…</div>;

  // "cover" the box at zoom=1
  const coverScale = Math.max(bW / img.width, bH / img.height);
  const eff = coverScale * zoom;
  const drawW = img.width * eff;
  const drawH = img.height * eff;

  // clamp offset so the image always covers the box
  const clamp = (o: { x: number; y: number }) => {
    const maxX = Math.max(0, (drawW - bW) / 2);
    const maxY = Math.max(0, (drawH - bH) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, o.x)), y: Math.max(-maxY, Math.min(maxY, o.y)) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const nx = drag.current.ox + (e.clientX - drag.current.x);
    const ny = drag.current.oy + (e.clientY - drag.current.y);
    setOffset(clamp({ x: nx, y: ny }));
  };
  const onPointerUp = () => { drag.current = null; };

  const confirm = () => {
    const canvas = document.createElement("canvas");
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    const k = outW / bW; // box -> output scale
    const dW = drawW * k, dH = drawH * k;
    const dx = (outW - dW) / 2 + offset.x * k;
    const dy = (outH - dH) / 2 + offset.y * k;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, dx, dy, dW, dH);
    canvas.toBlob((b) => b && onDone(b), "image/jpeg", 0.85);
  };

  const imgStyle: React.CSSProperties = {
    position: "absolute",
    width: drawW, height: drawH,
    left: (bW - drawW) / 2 + offset.x,
    top: (bH - drawH) / 2 + offset.y,
    userSelect: "none", pointerEvents: "none",
  };

  return (
    <div className="cropEditor">
      <div className={"cropBox " + (shape === "circle" ? "circle" : "rect")}
        style={{ width: bW, height: bH }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <img src={img.src} style={imgStyle} alt="" draggable={false} />
        <div className={"cropMask " + (shape === "circle" ? "circle" : "rect")} />
      </div>
      <div className="cropControls">
        <span>🔍</span>
        <input type="range" min={1} max={4} step={0.01} value={zoom}
          onChange={(e) => { setZoom(Number(e.target.value)); setOffset((o) => clamp(o)); }} />
      </div>
      <div className="cropHint">Drag to move · slide to zoom</div>
      <div className="pActions">
        <button className="btn" onClick={confirm}>Use image</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
