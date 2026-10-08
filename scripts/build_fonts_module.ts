/**
 * Génère src/lib/couponFonts.ts — polices Montserrat en base64
 * (inline pour portabilité serverless: aucun fs read à runtime)
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const FONTS_DIR = join(__dirname, '..', 'src', 'lib', 'fonts');
const OUT = join(__dirname, '..', 'src', 'lib', 'couponFonts.ts');

const files: Array<{ file: string; name: string; weight: number; style: string }> = [
  { file: 'Montserrat-Regular.ttf', name: 'Montserrat', weight: 400, style: 'normal' },
  { file: 'Montserrat-SemiBold.ttf', name: 'Montserrat', weight: 600, style: 'normal' },
  { file: 'Montserrat-Bold.ttf', name: 'Montserrat', weight: 700, style: 'normal' },
  { file: 'Montserrat-ItalicBold.ttf', name: 'Montserrat', weight: 700, style: 'italic' },
];

let out = `/**
 * Polices Montserrat (base64) pour le rendu ImageResponse/satori — Task 37.
 * Généré par scripts/build_fonts_module.ts — NE PAS ÉDITER À LA MAIN.
 * Sources: fonts.gstatic.com (static TTF, licence OFL).
 */

export interface SatoriFont {
  name: string;
  data: ArrayBuffer;
  weight: number;
  style: 'normal' | 'italic';
}

const toBuffer = (b64: string): ArrayBuffer => {
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

`;

for (const f of files) {
  const b64 = readFileSync(join(FONTS_DIR, f.file)).toString('base64');
  // Découper en chunks lisibles de 100k chars
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += 100000) chunks.push(b64.slice(i, i + 100000));
  const varName = f.file.replace('Montserrat-', 'M_').replace('.ttf', '');
  out += `const ${varName} = [\n${chunks.map(c => `  '${c}',`).join('\n')}\n].join('');\n\n`;
}

out += `export const COUPON_FONTS: SatoriFont[] = [
  { name: 'Montserrat', data: toBuffer(M_Regular), weight: 400, style: 'normal' },
  { name: 'Montserrat', data: toBuffer(M_SemiBold), weight: 600, style: 'normal' },
  { name: 'Montserrat', data: toBuffer(M_Bold), weight: 700, style: 'normal' },
  { name: 'Montserrat', data: toBuffer(M_ItalicBold), weight: 700, style: 'italic' },
];
`;

writeFileSync(OUT, out);
console.log(`✅ ${OUT} généré (${(out.length / 1024).toFixed(0)} Ko)`);
