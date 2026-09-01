'use client';

import { useLayoutEffect, useRef } from 'react';
import type { BigRoad } from '@/lib/types';

export default function BigRoadGrid({ road, compact = false }: { road: BigRoad; compact?: boolean }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cellPx = compact ? 14 : 18;
  const visibleCols = Math.max(road.cols, 6);
  const cellByPos = new Map(road.cells.map((c) => [`${c.col},${c.row}`, c]));

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return;
    viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
  }, [road.cols, road.cells.length]);

  return (
    <div ref={viewportRef} className="overflow-x-auto">
      <div
        className="grid gap-[2px] p-1 bg-black/30 rounded"
        style={{
          gridTemplateColumns: `repeat(${visibleCols}, ${cellPx}px)`,
          gridTemplateRows: `repeat(${road.maxRows}, ${cellPx}px)`,
          gridAutoFlow: 'column'
        }}
      >
        {Array.from({ length: visibleCols * road.maxRows }).map((_, i) => {
          const col = Math.floor(i / road.maxRows);
          const row = i % road.maxRows;
          const cell = cellByPos.get(`${col},${row}`);
          return (
            <div key={i} className="flex items-center justify-center">
              {cell && (
                <div
                  className={`${compact ? 'text-[7px]' : 'text-[8px]'} rounded-full flex items-center justify-center font-bold text-white relative`}
                  style={{
                    width: cellPx - 3,
                    height: cellPx - 3,
                    border: `2px solid ${cell.result === 'banker' ? '#B23B3B' : '#2A5C99'}`
                  }}
                >
                  {cell.marker && <span>{cell.marker}</span>}
                  {cell.ties > 0 && (
                    <span className="absolute -right-1 -top-1 flex min-w-2.5 items-center justify-center rounded-full bg-emerald-700 px-0.5 text-[6px] leading-2.5 text-white">
                      {cell.ties}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
