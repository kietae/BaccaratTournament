'use strict';

const MAX_ROWS = 6;

// Standard Big Road (매도) layout: consecutive same-side wins stack downward
// in a column; a change of side starts a new column; a run that outgrows
// MAX_ROWS continues sideways along the bottom row ("dragon tail"); ties
// don't start a new column, they annotate the most recent mark with a count.
function buildBigRoad(outcomes) {
  const cells = [];
  const grid = new Map(); // "col,row" -> cell
  let last = null; // { col, row, result }
  let leadingTies = 0;

  for (const outcome of outcomes) {
    if (outcome === 'tie') {
      if (last) {
        last.cell.ties += 1;
      } else {
        leadingTies += 1;
      }
      continue;
    }

    let col, row;
    if (!last) {
      col = 0; row = 0;
    } else if (outcome === last.result) {
      const nextRow = last.row + 1;
      if (nextRow < MAX_ROWS && !grid.has(last.col + ',' + nextRow)) {
        col = last.col; row = nextRow;
      } else {
        col = last.col + 1; row = last.row;
      }
    } else {
      col = last.col + 1; row = 0;
    }

    const cell = { col, row, result: outcome, ties: 0 };
    grid.set(col + ',' + row, cell);
    cells.push(cell);
    last = { col, row, result: outcome, cell };
  }

  const cols = cells.reduce((max, c) => Math.max(max, c.col + 1), 0);
  return { cells, cols, maxRows: MAX_ROWS, leadingTies };
}

module.exports = { buildBigRoad, MAX_ROWS };
