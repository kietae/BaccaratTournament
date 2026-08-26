'use client';

import type { BigRoad } from '@/lib/types';

export default function BigRoadGrid({ road }: { road: BigRoad }) {
  const cellPx = 18;
  const visibleCols = Math.max(road.cols, 6);
  const cellByPos = new Map(road.cells.map((c) => [`${c.col},${c.row}`, c]));

  return (
    <div className="overflow-x-auto">
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
                  className="rounded-full flex items-center justify-center text-[8px] font-bold text-white relative"
                  style={{
                    width: cellPx - 3,
                    height: cellPx - 3,
                    border: `2px solid ${cell.result === 'banker' ? '#B23B3B' : '#2A5C99'}`
                  }}
                >
                  {cell.ties > 0 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[7px] text-emerald-400">
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
