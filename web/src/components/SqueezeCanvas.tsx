'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { drawCardBack, drawCardFront, drawMystery } from './cardFace';
import type { Edge } from '@/lib/types';

interface Pt { x: number; y: number; }

const LONG_EDGES = new Set<Edge>(['left', 'right']);
// The reveal still completes at 94%, while the rendered flap is allowed to
// travel beyond the original card boundary into a transparent bleed area.
const REVEAL_FRAC = 0.94;
const MAX_PULL_FRAC = 1.08;
const FLAP_TIP_SCALE = 1.25;

export interface SqueezeCanvasProps {
  mode: 'interactive' | 'remote';
  revealed: boolean;
  rank?: string;
  suit?: string;
  remoteEdge?: Edge | null;
  remotePct?: number;
  remoteGrip?: number;
  showThumbs?: boolean;
  onProgress?: (edge: Edge, pct: number, grip: number) => void;
  onRelease?: (edge: Edge, pct: number, willReveal: boolean, grip: number) => void;
}

function extentFor(edge: Edge, width: number, height: number) {
  return edge === 'left' || edge === 'right' ? width : height;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function SqueezeCanvas(props: SqueezeCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  useLayoutEffect(() => { propsRef.current = props; });

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!canvasNode) return;
    const context = canvasNode.getContext('2d');
    if (!context) return;
    const canvas = canvasNode;
    const ctx = context;

    const textureWidth = 1320;
    const textureHeight = 1920;
    const backTexture = document.createElement('canvas');
    const frontTexture = document.createElement('canvas');
    const mysteryTexture = document.createElement('canvas');
    for (const texture of [backTexture, frontTexture, mysteryTexture]) {
      texture.width = textureWidth;
      texture.height = textureHeight;
    }
    const backContext = backTexture.getContext('2d')!;
    function paintBackTexture() {
      backContext.clearRect(0, 0, textureWidth, textureHeight);
      drawCardBack(backContext, textureWidth, textureHeight, paintBackTexture);
    }
    paintBackTexture();
    drawMystery(mysteryTexture.getContext('2d')!, textureWidth, textureHeight);
    const thumbImage = new Image();
    thumbImage.src = '/ui/thumb.png';

    let width = 1;
    let height = 1;
    let dpr = 1;
    let bleed = 1;
    let startZone = 40;
    let lastRank = '';
    let lastSuit = '';
    let raf = 0;
    let alive = true;

    const state = {
      dragging: false,
      edge: null as Edge | null,
      origin: null as Pt | null,
      pointer: null as Pt | null,
      returning: false,
      revealSent: false,
      lastProgressSent: 0
    };

    function resize() {
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect) return;
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      bleed = Math.ceil(Math.max(width, height) * 0.3);
      dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
      canvas.style.width = `${width + bleed * 2}px`;
      canvas.style.height = `${height + bleed * 2}px`;
      canvas.style.left = `${-bleed}px`;
      canvas.style.top = `${-bleed}px`;
      canvas.width = Math.round((width + bleed * 2) * dpr);
      canvas.height = Math.round((height + bleed * 2) * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, bleed * dpr, bleed * dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      startZone = Math.max(30, 42 * width / 340);
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    function localPoint(event: PointerEvent): Pt {
      const rect = hostRef.current?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function nearestEdge(point: Pt) {
      const distances: [Edge, number][] = [
        ['left', point.x], ['right', width - point.x],
        ['top', point.y], ['bottom', height - point.y]
      ];
      return distances.reduce((best, item) => item[1] < best[1] ? item : best);
    }

    function anchor(edge: Edge, point: Pt): Pt {
      if (edge === 'left') return { x: 0, y: point.y };
      if (edge === 'right') return { x: width, y: point.y };
      if (edge === 'top') return { x: point.x, y: 0 };
      return { x: point.x, y: height };
    }

    function grip(edge: Edge, point: Pt) {
      return edge === 'left' || edge === 'right'
        ? clamp(point.y / height, 0.08, 0.92)
        : clamp(point.x / width, 0.08, 0.92);
    }

    function depth(edge: Edge, origin: Pt, pointer: Pt) {
      const raw = edge === 'left' ? pointer.x - origin.x
        : edge === 'right' ? origin.x - pointer.x
          : edge === 'top' ? pointer.y - origin.y
            : origin.y - pointer.y;
      const max = extentFor(edge, width, height) * MAX_PULL_FRAC;
      return clamp(raw, 0, max);
    }

    function onDown(event: PointerEvent) {
      const current = propsRef.current;
      // Never let the active player peel a placeholder texture. The server
      // sends the true face with squeeze authority; waiting for it guarantees
      // that every visible pip belongs to the card eventually revealed.
      if (current.mode !== 'interactive' || current.revealed || !current.rank || !current.suit) return;
      const point = localPoint(event);
      const [edge, distance] = nearestEdge(point);
      if (distance > startZone) return;
      const origin = anchor(edge, point);
      state.dragging = true;
      state.returning = false;
      state.revealSent = false;
      state.edge = edge;
      state.origin = origin;
      state.pointer = { ...origin };
      try { canvas.setPointerCapture(event.pointerId); } catch { /* browser may have cancelled */ }
    }

    function onMove(event: PointerEvent) {
      if (!state.dragging) return;
      const point = localPoint(event);
      state.pointer = {
        x: clamp(point.x, -width * 0.08, width * 1.08),
        y: clamp(point.y, -height * 0.08, height * 1.08)
      };
      if (state.edge && state.origin && !state.revealSent) {
        const pct = depth(state.edge, state.origin, state.pointer) / extentFor(state.edge, width, height);
        if (pct >= REVEAL_FRAC) {
          state.revealSent = true;
          state.dragging = false;
          propsRef.current.onRelease?.(state.edge, pct, true, grip(state.edge, state.origin));
          try { navigator.vibrate?.(28); } catch { /* unsupported */ }
        }
      }
    }

    function returnToEdge() {
      if (!state.edge || !state.origin) return;
      propsRef.current.onProgress?.(state.edge, 0, grip(state.edge, state.origin));
      state.dragging = false;
      state.returning = true;
    }

    function onUp() {
      if (!state.dragging || !state.edge || !state.origin || !state.pointer) return;
      const edge = state.edge;
      const pct = depth(edge, state.origin, state.pointer) / extentFor(edge, width, height);
      const willReveal = pct >= REVEAL_FRAC;
      propsRef.current.onRelease?.(edge, pct, willReveal, grip(edge, state.origin));
      state.dragging = false;
      if (!willReveal) state.returning = true;
      try { navigator.vibrate?.(willReveal ? 28 : 10); } catch { /* unsupported */ }
    }

    function onCancel() {
      if (state.dragging) returnToEdge();
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('lostpointercapture', onCancel);

    function remoteGeometry() {
      const current = propsRef.current;
      if (current.mode !== 'remote' || !current.remoteEdge || !current.remotePct) return null;
      const edge = current.remoteEdge;
      const g = clamp(current.remoteGrip ?? 0.5, 0.08, 0.92);
      const origin = edge === 'left' ? { x: 0, y: height * g }
        : edge === 'right' ? { x: width, y: height * g }
          : edge === 'top' ? { x: width * g, y: 0 }
            : { x: width * g, y: height };
      const amount = Math.min(current.remotePct * extentFor(edge, width, height), extentFor(edge, width, height) * MAX_PULL_FRAC);
      const pointer = edge === 'left' ? { x: amount, y: origin.y }
        : edge === 'right' ? { x: width - amount, y: origin.y }
          : edge === 'top' ? { x: origin.x, y: amount }
            : { x: origin.x, y: height - amount };
      return { edge, origin, pointer };
    }

    function paintPeel(edge: Edge, origin: Pt, pointer: Pt, face: HTMLCanvasElement) {
      const amount = depth(edge, origin, pointer);
      if (amount < 0.5) return;
      const vertical = edge === 'left' || edge === 'right';
      const tangentSize = vertical ? height : width;
      const step = 2;
      const folds: Pt[] = [];
      const tips: Pt[] = [];

      function pullAt(tangent: number) {
        // Two fingers hold opposite points of the lifted edge. Keep the fold
        // straight between them instead of modelling a single centre grip
        // that makes the middle of the card bulge forward.
        void tangent;
        return { pull: amount, bell: 0 };
      }

      // Map only the physical edge strip onto the flap. The grabbed original
      // edge lands at the moving tip while the inner artwork stays beside the
      // fold. This is a material mapping, not a stationary window into the face.
      for (let tangent = 0; tangent < tangentSize; tangent += step) {
        const { pull } = pullAt(tangent + step * 0.5);
        const foldDepth = pull * (LONG_EDGES.has(edge) ? 0.56 : 0.54);
        const tipDepth = pull * FLAP_TIP_SCALE;
        if (foldDepth < 0.25 || tipDepth - foldDepth < 0.25) continue;

        if (edge === 'left' || edge === 'right') {
          const foldX = edge === 'left' ? foldDepth : width - foldDepth;
          const tipX = edge === 'left' ? tipDepth : width - tipDepth;
          const gapX = edge === 'left' ? 0 : foldX;
          ctx.clearRect(gapX, tangent, foldDepth + 1, step + 1);

          const flapLeft = Math.min(foldX, tipX);
          const flapWidth = Math.abs(tipX - foldX);
          // Baccarat edge reads must expose only the outer pip column. If the
          // source strip reaches the centre column, A/2/3 can falsely resemble
          // the three-side 6/7/8 group before the 94% reveal threshold.
          const sourceDepth = clamp(Math.min(foldDepth / width, 0.4) * textureWidth, 1, textureWidth);
          const sourceX = edge === 'left' ? 0 : textureWidth - sourceDepth;
          const sourceH = (step + 1) / height * textureHeight;
          // Reverse the other axis as well: a one-axis fold is a mirror,
          // while two-axis reversal is a 180° rotation. Playing-card artwork
          // is rotationally symmetric, so ranks stay readable, not mirrored.
          const sourceY = clamp(textureHeight - (tangent / height * textureHeight) - sourceH, 0, textureHeight - sourceH);
          ctx.save();
          ctx.translate(flapLeft * 2 + flapWidth, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(face, sourceX, sourceY, sourceDepth, sourceH, flapLeft, tangent, flapWidth, step + 1);
          ctx.restore();
          folds.push({ x: foldX, y: tangent + step * 0.5 });
          tips.push({ x: tipX, y: tangent + step * 0.5 });
        } else {
          const foldY = edge === 'top' ? foldDepth : height - foldDepth;
          const tipY = edge === 'top' ? tipDepth : height - tipDepth;
          const gapY = edge === 'top' ? 0 : foldY;
          ctx.clearRect(tangent, gapY, step + 1, foldDepth + 1);

          const flapTop = Math.min(foldY, tipY);
          const flapHeight = Math.abs(tipY - foldY);
          // Likewise, keep a short-edge read above the centre row. The full
          // card replaces the peel only after the server accepts a 94% reveal.
          const sourceDepth = clamp(Math.min(foldDepth / height, 0.4) * textureHeight, 1, textureHeight);
          const sourceY = edge === 'top' ? 0 : textureHeight - sourceDepth;
          const sourceW = (step + 1) / width * textureWidth;
          const sourceX = clamp(textureWidth - (tangent / width * textureWidth) - sourceW, 0, textureWidth - sourceW);
          ctx.save();
          ctx.translate(0, flapTop * 2 + flapHeight);
          ctx.scale(1, -1);
          ctx.drawImage(face, sourceX, sourceY, sourceW, sourceDepth, tangent, flapTop, step + 1, flapHeight);
          ctx.restore();
          folds.push({ x: tangent + step * 0.5, y: foldY });
          tips.push({ x: tangent + step * 0.5, y: tipY });
        }
      }

      function strokeCurve(points: Pt[], color: string, lineWidth: number, blur = 0) {
        if (points.length < 2) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = color;
        if (blur) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = blur;
        }
        ctx.stroke();
        ctx.restore();
      }

      strokeCurve(folds, 'rgba(30, 20, 14, 0.7)', Math.max(3, Math.min(width, height) * 0.018), 14);
      strokeCurve(folds, 'rgba(255, 247, 225, 0.72)', 1.2);
      strokeCurve(tips, 'rgba(255, 255, 255, 0.9)', 1.4, 4);

      // A virtual thumb follows the grip just as a player covers the printed
      // corner index while squeezing a physical baccarat card. It is drawn
      // last so it genuinely occludes the bent face in both local and remote
      // (projector) views.
      // Keep the exact same card-relative hand size on phones, the admin
      // monitor, and the broadcast screen. A fixed pixel cap made the hands
      // proportionally smaller as the projected card grew.
      const thumbLength = Math.min(width, height) * 0.44;
      const thumbWidth = thumbLength * 1.08;
      // On a short edge the thumbs spread toward the outer corners. On a long
      // edge they sit farther inward, over the vertically inset card indices.
      const cornerInset = LONG_EDGES.has(edge)
        ? clamp(tangentSize * 0.095, thumbWidth * 0.5, tangentSize * 0.14)
        : clamp(tangentSize * 0.1, thumbWidth * 0.52, tangentSize * 0.14);

      // The local controller also needs the virtual fingers: without them the
      // card index is exposed immediately on the participant's phone.

      function drawThumb(tangent: number, thumbAngle: number) {
        const { pull } = pullAt(tangent);
        const foldDepth = pull * (LONG_EDGES.has(edge) ? 0.56 : 0.54);
        // The corner index is painted just behind the moving edge of the
        // flap. Track that material point instead of overshooting the tip;
        // otherwise the hand moves faster than the card and uncovers it.
        const tipDepth = pull * FLAP_TIP_SCALE;
        const indexDepthAlongFlap = LONG_EDGES.has(edge) ? 0.88 : 0.94;
        const thumbDepth = foldDepth + (tipDepth - foldDepth) * indexDepthAlongFlap;
        const thumbTip = edge === 'left' ? { x: thumbDepth, y: tangent }
          : edge === 'right' ? { x: width - thumbDepth, y: tangent }
            : edge === 'top' ? { x: tangent, y: thumbDepth }
              : { x: tangent, y: height - thumbDepth };
        ctx.save();
        ctx.translate(thumbTip.x, thumbTip.y);
        ctx.rotate(thumbAngle);
        if (thumbImage.complete && thumbImage.naturalWidth > 0) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 7;
          ctx.shadowOffsetY = 3;
          // The source thumb points right: its fingertip overlaps the card
          // while the joint extends naturally out beyond the lifted edge.
          ctx.drawImage(
            thumbImage,
            260, 150, 1276, 740,
            -thumbLength * 0.94,
            -thumbWidth * 0.72,
            thumbLength * 1.48,
            thumbWidth * 1.44
          );
          ctx.restore();
          return;
        }

        // Lightweight fallback while the photographic sprite is loading.
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 13;
        ctx.shadowOffsetY = 4;
        const skin = ctx.createRadialGradient(-thumbLength * 0.14, -thumbWidth * 0.2, 2, 0, 0, thumbLength * 0.62);
        skin.addColorStop(0, '#f3c6a6');
        skin.addColorStop(0.55, '#d99a75');
        skin.addColorStop(1, '#9f6048');
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.ellipse(0, 0, thumbLength * 0.58, thumbWidth * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(92, 48, 36, 0.7)';
        ctx.stroke();

        // Nail on the outer half of the thumb gives a readable orientation at
        // phone size without requiring a photographic hand asset.
        ctx.fillStyle = 'rgba(255, 221, 205, 0.82)';
        ctx.beginPath();
        ctx.ellipse(-thumbLength * 0.14, 0, thumbLength * 0.27, thumbWidth * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = 'rgba(142, 82, 66, 0.55)';
        ctx.stroke();
        ctx.restore();
      }

      // Source sprite points right. Rotate the two hands toward one another:
      // top -> down and bottom -> up on long edges; left -> right and right
      // -> left on short edges.
      const firstThumbAngle = vertical ? Math.PI / 2 : 0;
      const secondThumbAngle = vertical ? -Math.PI / 2 : Math.PI;
      drawThumb(cornerInset, firstThumbAngle);
      drawThumb(tangentSize - cornerInset, secondThumbAngle);
    }

    function render() {
      if (!alive) return;
      const current = propsRef.current;
      if ((current.rank && current.rank !== lastRank) || (current.suit && current.suit !== lastSuit)) {
        const front = frontTexture.getContext('2d')!;
        front.clearRect(0, 0, textureWidth, textureHeight);
        drawCardFront(front, textureWidth, textureHeight, current.rank!, current.suit!, () => {
          lastRank = '';
          lastSuit = '';
        });
        lastRank = current.rank!;
        lastSuit = current.suit!;
      }
      const face = current.rank && current.suit ? frontTexture : mysteryTexture;
      ctx.clearRect(-bleed, -bleed, width + bleed * 2, height + bleed * 2);
      if (current.revealed) ctx.drawImage(face, 0, 0, textureWidth, textureHeight, 0, 0, width, height);
      else {
        ctx.drawImage(backTexture, 0, 0, textureWidth, textureHeight, 0, 0, width, height);
        const remote = remoteGeometry();
        if (remote) paintPeel(remote.edge, remote.origin, remote.pointer, face);
        else if (state.edge && state.origin && state.pointer) {
          if (state.returning) {
            state.pointer.x += (state.origin.x - state.pointer.x) * 0.24;
            state.pointer.y += (state.origin.y - state.pointer.y) * 0.24;
            if (Math.hypot(state.pointer.x - state.origin.x, state.pointer.y - state.origin.y) < 0.7) {
              state.edge = null; state.origin = null; state.pointer = null; state.returning = false;
            }
          }
          if (state.edge && state.origin && state.pointer) {
            paintPeel(state.edge, state.origin, state.pointer, face);
            if (state.dragging && performance.now() - state.lastProgressSent > 55) {
              state.lastProgressSent = performance.now();
              const pct = depth(state.edge, state.origin, state.pointer) / extentFor(state.edge, width, height);
              current.onProgress?.(state.edge, pct, grip(state.edge, state.origin));
            }
          }
        }
      }
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('lostpointercapture', onCancel);
    };
  }, []);

  return <div ref={hostRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'visible' }}><canvas ref={canvasRef} style={{ position: 'absolute', display: 'block', touchAction: 'none' }} /></div>;
}
