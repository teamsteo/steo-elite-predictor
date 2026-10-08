/**
 * Génère src/lib/couponFonts.ts — polices Inter en base64 (Task 38)
 * (inline pour portabilité serverless: aucun fs read à runtime)
 * Inter = police la plus proche de la typo des captures Betclic utilisateur
 * (identification empirique: comparaison glyphes Roboto/Inter/Figtree/DM Sans)
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const FONTS_DIR = join(__dirname, '..', 'src', 'lib', 'fonts');
const OUT = join(__dirname, '..', 'src', 'lib', 'couponFonts.ts');

const files: Array<{ file: string; name: string; weight: number; style: string }> = [
  { file: 'Inter-Regular.ttf', name: 'Inter', weight: 400, style: 'normal' },
  { file: 'Inter-Medium.ttf', name: 'Inter', weight: 500, style: 'normal' },
  { file: 'Inter-SemiBold.ttf', name: 'Inter', weight: 600, style: 'normal' },
  { file: 'Inter-Bold.ttf', name: 'Inter', weight: 700, style: 'normal' },
  { file: 'Inter-ItalicBold.ttf', name: 'Inter', weight: 700, style: 'italic' },
];

let out = `/**
 * Polices Inter (base64) pour le rendu ImageResponse/satori — Task 38.
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
  const varName = f.file.replace('Inter-', 'I_').replace('.ttf', '');
  out += `const ${varName} = [\n${chunks.map(c => `  '${c}',`).join('\n')}\n].join('');\n\n`;
}

out += `export const COUPON_FONTS: SatoriFont[] = [
  { name: 'Inter', data: toBuffer(I_Regular), weight: 400, style: 'normal' },
  { name: 'Inter', data: toBuffer(I_Medium), weight: 500, style: 'normal' },
  { name: 'Inter', data: toBuffer(I_SemiBold), weight: 600, style: 'normal' },
  { name: 'Inter', data: toBuffer(I_Bold), weight: 700, style: 'normal' },
  { name: 'Inter', data: toBuffer(I_ItalicBold), weight: 700, style: 'italic' },
];
`;

writeFileSync(OUT, out);
console.log(`✅ ${OUT} généré (${(out.length / 1024).toFixed(0)} Ko)`);
