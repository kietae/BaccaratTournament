'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { drawCardBack, drawCardFront, drawMystery } from './cardFace';
import type { Edge } from '@/lib/types';

interface Pt { x: number; y: number; }

const LONG_EDGES = new Set<Edge>(['left', 'right']);
const LONG_EDGE_CAP_FRAC = 0.4;
const SHORT_EDGE_REVEAL_FRAC = 0.55;

export interface SqueezeCanvasProps {
  mode: 'interactive' | 'remote';
  revealed: boolean;
  rank?: string;
  suit?: string;
  remoteEdge?: Edge | null;
  remotePct?: number;
  remoteGrip?: number;
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

    const textureWidth = 480;
    const textureHeight = 800;
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

    let width = 1;
    let height = 1;
    let dpr = 1;
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
      lastProgressSent: 0
    };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      startZone = Math.max(30, 42 * width / 340);
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    function localPoint(event: PointerEvent): Pt {
      const rect = canvas.getBoundingClientRect();
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
      const max = extentFor(edge, width, height) * (LONG_EDGES.has(edge) ? LONG_EDGE_CAP_FRAC : 1);
      return clamp(raw, 0, max);
    }

    function onDown(event: PointerEvent) {
      const current = propsRef.current;
      if (current.mode !== 'interactive' || current.revealed) return;
      const point = localPoint(event);
      const [edge, distance] = nearestEdge(point);
      if (distance > startZone) return;
      const origin = anchor(edge, point);
      state.dragging = true;
      state.returning = false;
      state.edge = edge;
      state.origin = origin;
      state.pointer = { ...origin };
      try { canvas.setPointerCapture(event.pointerId); } catch { /* browser may have cancelled */ }
    }

    function onMove(event: PointerEvent) {
      if (!state.dragging) return;
      const point = localPoint(event);
      state.pointer = {
        x: clamp(point.x, -width * 0.25, width * 1.25),
        y: clamp(point.y, -height * 0.25, height * 1.25)
      };
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
      const willReveal = !LONG_EDGES.has(edge) && pct >= SHORT_EDGE_REVEAL_FRAC;
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
      const amount = Math.min(current.remotePct * extentFor(edge, width, height), extentFor(edge, width, height) * (LONG_EDGES.has(edge) ? LONG_EDGE_CAP_FRAC : 1));
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
      const tangentOrigin = vertical ? origin.y : origin.x;
      const tangentPointer = vertical ? pointer.y : pointer.x;
      const gripCenter = clamp(tangentOrigin + (tangentPointer - tangentOrigin) * 0.45, 0, tangentSize);
      const spread = tangentSize * (LONG_EDGES.has(edge) ? 0.24 : 0.62);
      const step = 2;
      const folds: Pt[] = [];
      const tips: Pt[] = [];

      // A squeezed card does not uncover a flat copy of its face. The original
      // edge moves inward while a fold remains behind it; the visible face is
      // the mirrored underside between those two curves.
      for (let tangent = 0; tangent < tangentSize; tangent += step) {
        const distance = (tangent + step * 0.5 - gripCenter) / Math.max(1, spread);
        const bell = Math.exp(-0.5 * distance * distance);
        const influence = LONG_EDGES.has(edge) ? bell : 0.42 + bell * 0.58;
        const pull = amount * influence;
        const foldDepth = pull * (0.48 + 0.08 * bell);
        const tipDepth = pull;
        if (foldDepth < 0.25 || tipDepth - foldDepth < 0.25) continue;

        if (edge === 'left' || edge === 'right') {
          const foldX = edge === 'left' ? foldDepth : width - foldDepth;
          const tipX = edge === 'left' ? tipDepth : width - tipDepth;
          const gapX = edge === 'left' ? 0 : foldX;
          ctx.clearRect(gapX, tangent, foldDepth + 1, step + 1);

          const flapLeft = Math.min(foldX, tipX);
          const flapWidth = Math.abs(tipX - foldX);
          const sourceDepth = clamp(foldDepth / width * textureWidth, 1, textureWidth);
          const sourceX = edge === 'left' ? 0 : textureWidth - sourceDepth;
          const sourceY = tangent / height * textureHeight;
          const sourceH = (step + 1) / height * textureHeight;
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
          const sourceDepth = clamp(foldDepth / height * textureHeight, 1, textureHeight);
          const sourceY = edge === 'top' ? 0 : textureHeight - sourceDepth;
          const sourceX = tangent / width * textureWidth;
          const sourceW = (step + 1) / width * textureWidth;
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
      ctx.clearRect(0, 0, width, height);
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

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />;
}
