'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { drawCardBack, drawCardFront, drawMystery } from './cardFace';
import type { Edge } from '@/lib/types';

interface Pt { x: number; y: number; }

const LONG_EDGES = new Set<Edge>(['left', 'right']);
const LONG_EDGE_CAP_FRAC = 0.40; // peek depth never exceeds 40% of the card's short side
const LONG_EDGE_BAND = [0.15, 0.85]; // corner ~15% strips never fold, on purpose (hides the index)
const SHORT_EDGE_REVEAL_FRAC = 0.55; // short-edge drag-and-release threshold for a full reveal

export interface SqueezeCanvasProps {
  mode: 'interactive' | 'remote';
  revealed: boolean;
  rank?: string; // only ever populated when this viewer is authorized (server-enforced)
  suit?: string;
  remoteEdge?: Edge | null;
  remotePct?: number;
  onProgress?: (edge: Edge, pct: number) => void;
  onRelease?: (edge: Edge, pct: number, willReveal: boolean) => void;
}

function cardExtentFor(edge: Edge, W: number, H: number) {
  return edge === 'left' || edge === 'right' ? W : H;
}
function capFracFor(edge: Edge) {
  return LONG_EDGES.has(edge) ? LONG_EDGE_CAP_FRAC : SHORT_EDGE_REVEAL_FRAC;
}

function clipHalfPlane(poly: Pt[], mx: number, my: number, nx: number, ny: number, keepPos: boolean): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) {
    const cur = poly[i], prev = poly[(i + n - 1) % n];
    const sCur = (cur.x - mx) * nx + (cur.y - my) * ny;
    const sPrev = (prev.x - mx) * nx + (prev.y - my) * ny;
    const curIn = keepPos ? sCur >= 0 : sCur < 0;
    const prevIn = keepPos ? sPrev >= 0 : sPrev < 0;
    if (curIn) {
      if (!prevIn) {
        const t = sPrev / (sPrev - sCur);
        out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t });
      }
      out.push(cur);
    } else if (prevIn) {
      const t2 = sPrev / (sPrev - sCur);
      out.push({ x: prev.x + (cur.x - prev.x) * t2, y: prev.y + (cur.y - prev.y) * t2 });
    }
  }
  return out;
}

function clipByConvex(subject: Pt[], clip: Pt[]): Pt[] {
  if (clip.length < 3) return [];
  let cx = 0, cy = 0;
  for (const p of clip) { cx += p.x; cy += p.y; }
  cx /= clip.length; cy /= clip.length;
  let result = subject;
  for (let e = 0; e < clip.length && result.length > 0; e++) {
    const p0 = clip[e], p1 = clip[(e + 1) % clip.length];
    let nx = -(p1.y - p0.y), ny = p1.x - p0.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    if ((cx - p0.x) * nx + (cy - p0.y) * ny < 0) { nx = -nx; ny = -ny; }
    result = clipHalfPlane(result, p0.x, p0.y, nx, ny, true);
  }
  return result;
}

function affine(
  dx0: number, dy0: number, dx1: number, dy1: number, dx2: number, dy2: number,
  u0: number, v0: number, u1: number, v1: number, u2: number, v2: number
): [number, number, number, number, number, number] | null {
  const den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
  if (Math.abs(den) < 1e-6) return null;
  const a = (dx0 * (v1 - v2) + dx1 * (v2 - v0) + dx2 * (v0 - v1)) / den;
  const b = (dy0 * (v1 - v2) + dy1 * (v2 - v0) + dy2 * (v0 - v1)) / den;
  const c = (dx0 * (u2 - u1) + dx1 * (u0 - u2) + dx2 * (u1 - u0)) / den;
  const d = (dy0 * (u2 - u1) + dy1 * (u0 - u2) + dy2 * (u1 - u0)) / den;
  const e = (dx0 * (u1 * v2 - u2 * v1) + dx1 * (u2 * v0 - u0 * v2) + dx2 * (u0 * v1 - u1 * v0)) / den;
  const f = (dy0 * (u1 * v2 - u2 * v1) + dy1 * (u2 * v0 - u0 * v2) + dy2 * (u0 * v1 - u1 * v0)) / den;
  return [a, b, c, d, e, f];
}

export default function SqueezeCanvas(props: SqueezeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  useLayoutEffect(() => { propsRef.current = props; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const TW = 480, TH = 800;
    const backTex = document.createElement('canvas');
    backTex.width = TW; backTex.height = TH;
    const frontTex = document.createElement('canvas');
    frontTex.width = TW; frontTex.height = TH;
    const mysteryTex = document.createElement('canvas');
    mysteryTex.width = TW; mysteryTex.height = TH;

    const backCtx = backTex.getContext('2d')!;
    const mysteryCtx = mysteryTex.getContext('2d')!;
    drawCardBack(backCtx, TW, TH);
    drawMystery(mysteryCtx, TW, TH);
    let lastRank = '', lastSuit = '';

    let startZonePx = 44, bumpWidth = 24, bumpHeight = 28;

    const state = {
      dragging: false,
      edge: null as Edge | null,
      F0: null as Pt | null,
      pointer: null as Pt | null,
      target: null as { x: number; y: number; full: boolean } | null,
      revealedLocal: false,
      lastProgressSent: 0
    };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const scale = W / 340;
      startZonePx = Math.max(30, 44 * scale);
      bumpWidth = Math.max(14, 24 * scale);
      bumpHeight = Math.max(16, 28 * scale);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function nearestEdge(x: number, y: number): { edge: Edge; dist: number } {
      const d: Record<Edge, number> = { left: x, right: W - x, top: y, bottom: H - y };
      let best: Edge = 'left', bd = d.left;
      (Object.keys(d) as Edge[]).forEach((k) => { if (d[k] < bd) { bd = d[k]; best = k; } });
      return { edge: best, dist: bd };
    }

    const EDGE_CFG: Record<Edge, { axis: 'x' | 'y'; sign: 1 | -1 }> = {
      right: { axis: 'x', sign: 1 },
      left: { axis: 'x', sign: -1 },
      top: { axis: 'y', sign: -1 },
      bottom: { axis: 'y', sign: 1 }
    };

    function pointerLocal(e: PointerEvent): Pt {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function vibrate(ms: number) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }

    function onDown(e: PointerEvent) {
      if (propsRef.current.mode !== 'interactive' || propsRef.current.revealed) return;
      const p = pointerLocal(e);
      const ne = nearestEdge(p.x, p.y);
      if (ne.dist > startZonePx) return;
      state.dragging = true;
      state.target = null;
      state.edge = ne.edge;
      state.F0 = { x: p.x, y: p.y };
      state.pointer = { x: p.x, y: p.y };
      try { canvas!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    function onMove(e: PointerEvent) {
      if (!state.dragging) return;
      const p = pointerLocal(e);
      state.pointer = {
        x: Math.max(-W * 0.5, Math.min(W * 1.2, p.x)),
        y: Math.max(-H * 0.5, Math.min(H * 1.2, p.y))
      };
    }
    function onUp() {
      if (!state.dragging) return;
      state.dragging = false;
      const geo = computeGeometry();
      if (!geo || !state.edge) {
        state.target = state.F0 ? { x: state.F0.x, y: state.F0.y, full: false } : null;
        return;
      }
      const isFull = !LONG_EDGES.has(state.edge) && geo.depthF0 > cardExtentFor(state.edge, W, H) * capFracFor(state.edge) * 0.999;
      const pct = Math.min(1, geo.depthF0 / (cardExtentFor(state.edge, W, H) * capFracFor(state.edge)));
      propsRef.current.onRelease?.(state.edge, pct, isFull);
      if (isFull) {
        const dirLen = Math.hypot(geo.n.x, geo.n.y) || 1;
        const ux = geo.n.x / dirLen, uy = geo.n.y / dirLen;
        const throwDist = Math.hypot(W, H) * 1.5;
        state.target = { x: geo.F0.x + ux * throwDist, y: geo.F0.y + uy * throwDist, full: true };
        vibrate(28);
      } else {
        state.target = { x: geo.F0.x, y: geo.F0.y, full: false };
        vibrate(10);
      }
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    function computeGeometry() {
      if (!state.F0 || !state.pointer || !state.edge) return null;
      const F0 = state.F0;
      const cfg = EDGE_CFG[state.edge];
      const F0axis = cfg.axis === 'x' ? F0.x : F0.y;
      const ptrAxis = cfg.axis === 'x' ? state.pointer.x : state.pointer.y;
      let depthF0 = Math.max(0, cfg.sign * (F0axis - ptrAxis));
      const maxDepth = cardExtentFor(state.edge, W, H) * capFracFor(state.edge);
      if (LONG_EDGES.has(state.edge)) depthF0 = Math.min(depthF0, maxDepth);
      if (depthF0 < 0.5) return null;
      const effAxis = F0axis - cfg.sign * depthF0;
      const F: Pt = cfg.axis === 'x' ? { x: effAxis, y: state.pointer.y } : { x: state.pointer.x, y: effAxis };
      const dx = F.x - F0.x, dy = F.y - F0.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return null;
      const nx = dx / len, ny = dy / len;
      const tx = -ny, ty = nx;
      const mx = (F0.x + F.x) / 2, my = (F0.y + F.y) / 2;
      return { F0, F, n: { x: nx, y: ny }, t: { x: tx, y: ty }, m: { x: mx, y: my }, depthF0 };
    }

    function curl(depth: number) {
      if (depth >= bumpWidth) return { alongN: depth, z: 0, theta: Math.PI };
      const theta = (depth / bumpWidth) * Math.PI;
      const z = bumpHeight * (1 - Math.cos(theta)) / 2;
      return { alongN: depth, z, theta };
    }

    function drawTri(
      tex: HTMLCanvasElement,
      sx0: number, sy0: number, sx1: number, sy1: number, sx2: number, sy2: number,
      dx0: number, dy0: number, dx1: number, dy1: number, dx2: number, dy2: number
    ) {
      const m = affine(dx0, dy0, dx1, dy1, dx2, dy2, sx0, sy0, sx1, sy1, sx2, sy2);
      if (!m) return;
      ctx!.save();
      ctx!.beginPath();
      ctx!.moveTo(dx0, dy0); ctx!.lineTo(dx1, dy1); ctx!.lineTo(dx2, dy2); ctx!.closePath();
      ctx!.clip();
      ctx!.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx!.drawImage(tex, 0, 0);
      ctx!.restore();
    }

    // Drives the mesh from a synthetic F0/pointer pair for remote (spectator)
    // playback, reconstructed from the broadcast edge+pct only — never the
    // squeezer's real finger path, per the "fold depth only, never the raw
    // gesture" sync contract.
    function applyRemoteState() {
      const p = propsRef.current;
      if (p.mode !== 'remote') return;
      if (!p.remoteEdge || !p.remotePct || p.remotePct <= 0) {
        state.F0 = null; state.pointer = null; state.edge = null;
        return;
      }
      const edge = p.remoteEdge;
      const maxDepth = cardExtentFor(edge, W, H) * capFracFor(edge);
      const depth = Math.max(0, Math.min(1, p.remotePct)) * maxDepth;
      const cfg = EDGE_CFG[edge];
      const F0: Pt = edge === 'left' || edge === 'right' ? { x: cfg.sign > 0 ? W : 0, y: H / 2 } : { x: W / 2, y: cfg.sign > 0 ? H : 0 };
      state.edge = edge;
      state.F0 = F0;
      state.dragging = false;
      state.target = null;
      const F0axis = cfg.axis === 'x' ? F0.x : F0.y;
      const ptrAxis = F0axis - cfg.sign * depth;
      state.pointer = cfg.axis === 'x' ? { x: ptrAxis, y: F0.y } : { x: F0.x, y: ptrAxis };
    }

    function render() {
      if (!canvas || !ctx) return;
      const p = propsRef.current;

      if (p.mode === 'remote') applyRemoteState();

      if ((p.rank && p.rank !== lastRank) || (p.suit && p.suit !== lastSuit)) {
        const fc = frontTex.getContext('2d')!;
        fc.clearRect(0, 0, TW, TH);
        drawCardFront(fc, TW, TH, p.rank!, p.suit!);
        lastRank = p.rank!; lastSuit = p.suit!;
      }
      const activeTex = p.rank && p.suit ? frontTex : mysteryTex;

      ctx.clearRect(0, 0, W, H);

      if (p.revealed) {
        ctx.drawImage(activeTex, 0, 0, TW, TH, 0, 0, W, H);
        requestAnimationFrame(render);
        return;
      }

      if (state.target) {
        state.pointer = state.pointer || { x: state.F0!.x, y: state.F0!.y };
        state.pointer.x += (state.target.x - state.pointer.x) * 0.22;
        state.pointer.y += (state.target.y - state.pointer.y) * 0.22;
        const settleDist = Math.hypot(state.target.x - state.pointer.x, state.target.y - state.pointer.y);
        if (settleDist < 2) {
          if (state.target.full) state.revealedLocal = true;
          else { state.F0 = null; state.pointer = null; state.edge = null; }
          state.target = null;
        }
      }

      if (state.revealedLocal) {
        ctx.drawImage(activeTex, 0, 0, TW, TH, 0, 0, W, H);
        requestAnimationFrame(render);
        return;
      }

      // Base layer: the back everywhere, including the long-edge corner
      // exclusion strips, which the mesh below deliberately never covers.
      ctx.drawImage(backTex, 0, 0, TW, TH, 0, 0, W, H);

      const geo = computeGeometry();
      if (!geo || !state.edge) {
        requestAnimationFrame(render);
        return;
      }

      // Throttled progress broadcast (interactive mode only).
      if (p.mode === 'interactive') {
        const now = performance.now();
        if (now - state.lastProgressSent > 55) {
          state.lastProgressSent = now;
          const pct = Math.min(1, geo.depthF0 / (cardExtentFor(state.edge, W, H) * capFracFor(state.edge)));
          p.onProgress?.(state.edge, pct);
        }
      }

      const { n, t, m } = geo;
      const nx = n.x, ny = n.y, tx = t.x, ty = t.y, mx = m.x, my = m.y;
      const rectPoly: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
      let flapPoly = clipHalfPlane(rectPoly, mx, my, nx, ny, false);

      if (LONG_EDGES.has(state.edge)) {
        const bandTop = H * LONG_EDGE_BAND[0], bandBottom = H * LONG_EDGE_BAND[1];
        const band: Pt[] = [{ x: -1000, y: bandTop }, { x: W + 1000, y: bandTop }, { x: W + 1000, y: bandBottom }, { x: -1000, y: bandBottom }];
        flapPoly = clipByConvex(flapPoly, band);
      }

      const cx = W / 2, cy = H / 2, D = Math.max(W, H) * 2.6;
      function project(x: number, y: number, z: number) {
        const f = D / (D - z);
        return { x: cx + (x - cx) * f, y: cy + (y - cy) * f };
      }
      function vertexAt(px: number, py: number) {
        const vx = px - mx, vy = py - my;
        const depth = vx * -nx + vy * -ny;
        const tt = vx * tx + vy * ty;
        const cu = curl(Math.max(0, depth));
        const wx = mx + cu.alongN * nx + tt * tx;
        const wy = my + cu.alongN * ny + tt * ty;
        const scr = project(wx, wy, cu.z);
        return { sx: px, sy: py, dx: scr.x, dy: scr.y, z: cu.z, theta: cu.theta };
      }

      if (flapPoly.length >= 3) {
        let dMax = 0, tMin = Infinity, tMax = -Infinity;
        for (const pt of flapPoly) {
          const vx = pt.x - mx, vy = pt.y - my;
          const depth = vx * -nx + vy * -ny;
          const tt = vx * tx + vy * ty;
          if (depth > dMax) dMax = depth;
          if (tt < tMin) tMin = tt;
          if (tt > tMax) tMax = tt;
        }
        dMax = Math.max(dMax, 4);
        if (tMax - tMin < 2) { tMin -= 2; tMax += 2; }

        const levels: number[] = [];
        const innerSteps = 10, outerSteps = 7;
        const innerMax = Math.min(dMax, bumpWidth * 1.6);
        for (let i = 0; i <= innerSteps; i++) levels.push((i / innerSteps) * innerMax);
        if (dMax > innerMax) {
          for (let j = 1; j <= outerSteps; j++) levels.push(innerMax + (j / outerSteps) * (dMax - innerMax));
        }
        const TSEG = 8;
        const tStep = (tMax - tMin) / TSEG;

        type Tri = { a: ReturnType<typeof vertexAt>; b: ReturnType<typeof vertexAt>; c: ReturnType<typeof vertexAt>; z: number; theta: number };
        const tris: Tri[] = [];
        for (let li = 0; li < levels.length - 1; li++) {
          const d0 = levels[li], d1 = levels[li + 1];
          for (let ti = 0; ti < TSEG; ti++) {
            const t0 = tMin + ti * tStep, t1 = tMin + (ti + 1) * tStep;
            const cellRest: Pt[] = [
              { x: mx - d0 * nx + t0 * tx, y: my - d0 * ny + t0 * ty },
              { x: mx - d1 * nx + t0 * tx, y: my - d1 * ny + t0 * ty },
              { x: mx - d1 * nx + t1 * tx, y: my - d1 * ny + t1 * ty },
              { x: mx - d0 * nx + t1 * tx, y: my - d0 * ny + t1 * ty }
            ];
            const clipped = clipByConvex(cellRest, flapPoly);
            if (clipped.length < 3) continue;
            for (let k = 1; k < clipped.length - 1; k++) {
              const a = vertexAt(clipped[0].x, clipped[0].y);
              const b = vertexAt(clipped[k].x, clipped[k].y);
              const cc = vertexAt(clipped[k + 1].x, clipped[k + 1].y);
              tris.push({ a, b, c: cc, z: (a.z + b.z + cc.z) / 3, theta: (a.theta + b.theta + cc.theta) / 3 });
            }
          }
        }
        tris.sort((p1, q1) => p1.z - q1.z);

        let maxZ = 0;
        for (const tri of tris) if (tri.z > maxZ) maxZ = tri.z;
        const peak = tris.length ? tris[tris.length - 1] : null;
        if (maxZ > 1 && peak) {
          const shR = Math.max(30, maxZ * 3.2);
          const grad = ctx.createRadialGradient(peak.a.dx, peak.a.dy + shR * 0.25, 2, peak.a.dx, peak.a.dy + shR * 0.25, shR);
          grad.addColorStop(0, 'rgba(0,0,0,0.30)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(peak.a.dx, peak.a.dy + shR * 0.25, shR, shR * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const tri of tris) {
          drawTri(activeTex,
            tri.a.sx / W * TW, tri.a.sy / H * TH,
            tri.b.sx / W * TW, tri.b.sy / H * TH,
            tri.c.sx / W * TW, tri.c.sy / H * TH,
            tri.a.dx, tri.a.dy, tri.b.dx, tri.b.dy, tri.c.dx, tri.c.dy);
          const slopeCue = Math.sin(tri.theta);
          if (slopeCue > 0.05) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(tri.a.dx, tri.a.dy); ctx.lineTo(tri.b.dx, tri.b.dy); ctx.lineTo(tri.c.dx, tri.c.dy); ctx.closePath();
            ctx.fillStyle = `rgba(10,8,14,${0.34 * slopeCue})`;
            ctx.fill();
            ctx.fillStyle = `rgba(255,240,210,${0.16 * slopeCue})`;
            ctx.fill();
            ctx.restore();
          }
        }
      }

      requestAnimationFrame(render);
    }
    const raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />;
}
