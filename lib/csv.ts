/**
 * A small CSV reader, written here rather than pulled in.
 *
 * The whole requirement is one upload of one export: quoted fields, commas and
 * newlines inside them, doubled quotes for a literal one, and whichever line
 * ending the machine that wrote the file happened to use. A dependency for
 * that is a dependency to keep updated forever.
 *
 * Deliberately free of imports so the browser can parse the file for the
 * mapping screen and the server can parse the same bytes again for the import
 * itself — the two must agree, and the surest way is one function.
 */

export type CsvTable = {
  headers: string[];
  rows: string[][];
};

/**
 * Splits CSV text into a header row and the rows under it.
 *
 * Rows with fewer cells than the header are padded rather than dropped: a
 * trailing empty column is missing from many exports, and losing the row would
 * lose a person.
 */
export function parseCsv(text: string): CsvTable {
  // Excel writes a byte-order mark, which would otherwise become part of the
  // first column's name and match nothing.
  const source = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character !== '"') {
        cell += character;
        continue;
      }
      // A doubled quote inside a quoted field is one literal quote.
      if (source[index + 1] === '"') {
        cell += '"';
        index += 1;
        continue;
      }
      quoted = false;
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (character === "\n" || character === "\r") {
      // Swallow the second half of a CRLF so it does not open an empty row.
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  // Whatever is still in hand when the text runs out is the last cell, unless
  // the file ended on a line break and there is nothing in hand at all.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const headerRow = rows.shift() ?? [];
  const headers = headerRow.map((header) => header.trim());

  return {
    headers,
    rows: rows
      // A blank line is not a person.
      .filter((entry) => entry.some((value) => value.trim() !== ""))
      .map((entry) => {
        const padded = [...entry];
        while (padded.length < headers.length) padded.push("");
        return padded;
      }),
  };
}
