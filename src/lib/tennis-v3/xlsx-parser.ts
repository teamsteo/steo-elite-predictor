/**
 * Tennis V3 — Parseur XLSX minimaliste (jszip, zéro dépendance externe)
 * tennis-data.co.uk publie des .xlsx réguliers : sharedStrings + sheet1.
 * Supporte les cellules : shared string (t="s"), inline (inlineStr), nombres.
 */

import JSZip from 'jszip';

function colToIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64);
    else break;
  }
  return n - 1;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractSheetXml(xml: string): string {
  const m = xml.match(/<sheetData>([\s\S]*?)<\/sheetData>/);
  return m ? m[1] : xml;
}

export interface XlsxRow {
  [col: string]: string | number;
}

/** Parse le XML d'une feuille → grille de cellules texte. */
function cellsFromSheetXml(sheetXml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowMatches = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
  for (const rowXml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowXml.match(/<c[^>]*\/>|<c[^>]*>[\s\S]*?<\/c>/g) || [];
    for (const cellXml of cellMatches) {
      const ref = cellXml.match(/r="([A-Z]+)\d+"/)?.[1] || '';
      const col = colToIndex(ref);
      const type = cellXml.match(/t="([^"]+)"/)?.[1] || '';
      const value = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      let text = '';
      if (type === 's') {
        const idx = parseInt(value, 10);
        text = Number.isFinite(idx) ? sharedStrings[idx] ?? '' : '';
      } else if (type === 'inlineStr') {
        text = decodeXmlEntities(
          (cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).join('').replace(/<[^>]+>/g, '')
        );
      } else {
        text = decodeXmlEntities(value);
      }
      while (cells.length < col) cells.push('');
      cells[col] = text;
    }
    rows.push(cells);
  }
  return rows;
}

/** Parse un buffer xlsx → lignes indexées par nom de colonne (1ère ligne = header). */
export async function parseXlsx(buf: Buffer): Promise<XlsxRow[]> {
  const zip = await JSZip.loadAsync(buf);

  // 1. sharedStrings
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  let sharedStrings: string[] = [];
  if (sharedStringsFile) {
    const xml = await sharedStringsFile.async('string');
    sharedStrings = (xml.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) => {
      const texts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
      return decodeXmlEntities(texts.map((t) => t.replace(/<[^>]+>/g, '')).join(''));
    });
  }

  // 2. feuille principale (sheet1, sinon première feuille trouvée)
  const sheetFile = zip.file('xl/worksheets/sheet1.xml');
  let sheetXml: string;
  if (sheetFile) {
    sheetXml = await sheetFile.async('string');
  } else {
    const all = (zip.file(/xl\/worksheets\/sheet\d+\.xml/) as unknown) as any;
    const first = Array.isArray(all) ? all[0] : all;
    if (!first) throw new Error('sheet1.xml introuvable dans le xlsx');
    sheetXml = await first.async('string');
  }

  // 3. grille → lignes typées par header
  const grid = cellsFromSheetXml(extractSheetXml(sheetXml), sharedStrings);
  if (grid.length === 0) return [];
  const header = grid[0].map((h) => h.trim());
  return grid.slice(1).map((cells) => {
    const obj: XlsxRow = {};
    header.forEach((h, i) => {
      if (!h) return;
      const v = cells[i] ?? '';
      const num = Number(v);
      obj[h] = v !== '' && !Number.isNaN(num) ? num : v;
    });
    return obj;
  });
}
