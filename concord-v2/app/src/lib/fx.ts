export function confetti(n = 140) {
  const colors = ["#7c6cff", "#4ea1ff", "#3ddc84", "#ffc857", "#f25c5c", "#ff8ee6"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div");
    c.className = "confetto";
    const s = 6 + Math.random() * 8;
    c.style.cssText = `left:${Math.random() * 100}vw;width:${s}px;height:${s * 1.4}px;background:${
      colors[i % colors.length]
    };animation-duration:${2 + Math.random() * 2.5}s;animation-delay:${Math.random() * 1.2}s;border-radius:2px`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 6000);
  }
}

export function emojiRain(emoji: string, n = 60) {
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div");
    c.className = "confetto";
    c.textContent = emoji;
    c.style.cssText = `left:${Math.random() * 100}vw;font-size:${16 + Math.random() * 26}px;animation-duration:${
      2.5 + Math.random() * 3
    }s;animation-delay:${Math.random() * 1.5}s`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 7500);
  }
}

export function shake() {
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 1600);
}

export function disco() {
  document.body.classList.add("disco");
  setTimeout(() => document.body.classList.remove("disco"), 6200);
}

export function flip() {
  document.body.style.transition = "transform .6s";
  document.body.style.transform = "rotate(180deg)";
  setTimeout(() => {
    document.body.style.transform = "";
  }, 5000);
}

let toastRoot: HTMLDivElement | null = null;
export function toast(text: string) {
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    document.body.appendChild(toastRoot);
  }
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = text;
  toastRoot.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}
