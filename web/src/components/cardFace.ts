// Standard playing-card pip layouts. Coordinates are fractions of card
// width/height. Pips below center are drawn rotated 180° like real cards.
// The layout is deliberately chosen so that peeking only the right (or left)
// column from a long-edge fold exposes exactly the pip count documented in
// docs/dev-plan.html's "pips visible -> rank group" table: 4 -> 9/10,
// 3 -> 6/7/8, 2 -> 4/5, 0 -> A/2/3 (A/2/3's pips sit in the center column,
// out of reach of a capped long-edge peek).
const xL = 0.3, xC = 0.5, xR = 0.7;
const yA = 0.17, yB = 0.335, yC = 0.5, yD = 0.665, yE = 0.83;
const y1 = 0.145, y2 = 0.315, yU = 0.41, yL = 0.59, y3 = 0.685, y4 = 0.855;

type Pt = [number, number];

const PIP_LAYOUTS: Record<string, Pt[]> = {
  A: [[xC, yC]],
  '2': [[xC, yA], [xC, yE]],
  '3': [[xC, yA], [xC, yC], [xC, yE]],
  '4': [[xL, yA], [xR, yA], [xL, yE], [xR, yE]],
  '5': [[xL, yA], [xR, yA], [xC, yC], [xL, yE], [xR, yE]],
  '6': [[xL, yA], [xR, yA], [xL, yC], [xR, yC], [xL, yE], [xR, yE]],
  '7': [[xL, yA], [xR, yA], [xC, yB], [xL, yC], [xR, yC], [xL, yE], [xR, yE]],
  '8': [[xL, yA], [xR, yA], [xC, yB], [xL, yC], [xR, yC], [xC, yD], [xL, yE], [xR, yE]],
  '9': [[xL, y1], [xR, y1], [xL, y2], [xR, y2], [xC, yC], [xL, y3], [xR, y3], [xL, y4], [xR, y4]],
  '10': [[xL, y1], [xR, y1], [xL, y2], [xR, y2], [xC, yU], [xC, yL], [xL, y3], [xR, y3], [xL, y4], [xR, y4]]
};

const FACE_RANKS = new Set(['J', 'Q', 'K']);

type AssetRecord = { image: HTMLImageElement; ready: boolean; listeners: Set<() => void> };
const assetCache = new Map<string, AssetRecord>();
const SUIT_CODE: Record<string, string> = { '♣': 'C', '♦': 'D', '♥': 'H', '♠': 'S' };

function asset(path: string, onReady?: () => void): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let record = assetCache.get(path);
  if (!record) {
    const image = new Image();
    record = { image, ready: false, listeners: new Set() };
    assetCache.set(path, record);
    image.onload = () => {
      record!.ready = true;
      for (const listener of record!.listeners) listener();
      record!.listeners.clear();
    };
    image.onerror = () => record!.listeners.clear();
    image.decoding = 'async';
    image.src = path;
  }
  if (!record.ready && onReady) record.listeners.add(onReady);
  return record.ready ? record.image : null;
}

function cardAssetPath(rank: string, suit: string) {
  const rankCode = rank === '10' ? 'T' : rank;
  return `/cards/${rankCode}${SUIT_CODE[suit]}.svg`;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function suitColor(suit: string): string {
  return suit === '♥' || suit === '♦' ? '#B23B3B' : '#1a1a1a';
}

export function drawCardFront(c: CanvasRenderingContext2D, w: number, h: number, rank: string, suit: string, onReady?: () => void) {
  const image = asset(cardAssetPath(rank, suit), onReady);
  if (image) {
    c.drawImage(image, 0, 0, w, h);
    return;
  }
  c.fillStyle = '#FBF9F4';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(0,0,0,0.15)';
  c.lineWidth = 3;
  c.strokeRect(1.5, 1.5, w - 3, h - 3);

  const color = suitColor(suit);
  c.fillStyle = color;
  c.textBaseline = 'top';
  c.font = '700 ' + w * 0.075 + 'px Georgia, serif';
  c.fillText(rank, w * 0.05, h * 0.022);
  c.font = w * 0.058 + 'px Georgia, serif';
  c.fillText(suit, w * 0.055, h * 0.022 + w * 0.085);

  c.save();
  c.translate(w * 0.95, h * 0.978);
  c.rotate(Math.PI);
  c.fillStyle = color;
  c.textBaseline = 'top';
  c.font = '700 ' + w * 0.075 + 'px Georgia, serif';
  c.fillText(rank, 0, 0);
  c.font = w * 0.058 + 'px Georgia, serif';
  c.fillText(suit, -w * 0.004, w * 0.085);
  c.restore();

  if (FACE_RANKS.has(rank)) {
    const inset = w * 0.14;
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, w * 0.012);
    roundRect(c, inset, h * 0.12, w - inset * 2, h * 0.76, w * 0.06);
    c.stroke();
    c.save();
    c.translate(w / 2, h / 2);
    c.font = '700 ' + w * 0.28 + 'px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = color;
    c.globalAlpha = 0.85;
    c.fillText(rank, 0, 0);
    c.restore();
    return;
  }

  function pip(fx: number, fy: number) {
    const px = fx * w, py = fy * h, sz = w * 0.115;
    c.save();
    c.translate(px, py);
    c.rotate(Math.PI / 4);
    c.fillStyle = color;
    roundRect(c, -sz / 2, -sz / 2, sz, sz, sz * 0.16);
    c.fill();
    c.restore();
  }
  const layout = PIP_LAYOUTS[rank] || PIP_LAYOUTS['9'];
  for (const [fx, fy] of layout) pip(fx, fy);
}

export function drawCardBack(c: CanvasRenderingContext2D, w: number, h: number, onReady?: () => void) {
  const image = asset('/cards/Back.svg?v=inspire-1', onReady);
  if (image) {
    c.drawImage(image, 0, 0, w, h);
    return;
  }
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#241a3d');
  g.addColorStop(1, '#0c0a15');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const rg = c.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.42, w * 0.65);
  rg.addColorStop(0, 'rgba(216,177,92,0.30)');
  rg.addColorStop(1, 'rgba(216,177,92,0)');
  c.fillStyle = rg;
  c.fillRect(0, 0, w, h);
  const lw = Math.max(4, w * 0.02);
  c.strokeStyle = '#D8B15C';
  c.lineWidth = lw;
  c.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
  const inset = w * 0.05;
  c.strokeStyle = 'rgba(216,177,92,0.5)';
  c.lineWidth = 2;
  c.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  c.save();
  c.beginPath();
  c.rect(inset, inset, w - inset * 2, h - inset * 2);
  c.clip();
  c.strokeStyle = 'rgba(216,177,92,0.12)';
  c.lineWidth = 1.5;
  const step = w * 0.055;
  for (let x = -h; x < w + h; x += step) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h, h); c.stroke();
    c.beginPath(); c.moveTo(x, h); c.lineTo(x + h, 0); c.stroke();
  }
  c.restore();
  c.save();
  c.translate(w / 2, h * 0.42);
  c.rotate(Math.PI / 4);
  const sz = w * 0.17;
  const eg = c.createLinearGradient(-sz, -sz, sz, sz);
  eg.addColorStop(0, '#F3D98A');
  eg.addColorStop(0.55, '#D8B15C');
  eg.addColorStop(1, '#7A5A22');
  c.fillStyle = eg;
  roundRect(c, -sz / 2, -sz / 2, sz, sz, sz * 0.15);
  c.fill();
  c.restore();
}

// What a spectator (or the squeezer, before this card is theirs to peek)
// sees on the flap surface: motion is real, the value never is.
export function drawMystery(c: CanvasRenderingContext2D, w: number, h: number) {
  drawCardBack(c, w, h);
  c.save();
  c.translate(w / 2, h / 2);
  c.font = '700 ' + w * 0.3 + 'px Georgia, serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(216,177,92,0.55)';
  c.fillText('?', 0, 0);
  c.restore();
}
