/**
 * Coupon Renderer — Task 37/38
 * ============================
 * Réplique le design de coupon "Combiné" de l'app Betclic (captures utilisateur).
 *
 * Task 38 — fidélité pixel aux captures réelles:
 *  - Couleurs échantillonnées par script (canvas #040410, carte/boîte #14182c,
 *    vert menthe #8bd1b4, saumon #fd99a1, jaune #fcdc3d, badges #004024/#680c10)
 *  - Police Inter (identification empirique vs Roboto/Figtree/DM Sans)
 *  - Boîte match = même fond que la carte, bordure fine #2e3144, gros rayon
 *  - Trophées = cercle vert menthe à glyphe sombre; croix = cercle saumon
 *  - Cotes en gros chiffres italiques (55px), hiérarchie de tailles mesurée
 *
 * Rendu: satori (via next/og ImageResponse) → PNG. Polices Inter inline
 * (src/lib/couponFonts.ts) → déterministe local comme Vercel.
 */

import { ImageResponse } from 'next/og';
import { COUPON_FONTS } from './couponFonts';
import { formatFcfa, formatOdds, type CouponView } from './couponTicket';

// ─── Palette (échantillonnée pixel par pixel des captures Betclic) ──────────

const C = {
  canvas: '#040410',      // fond autour de la carte (quasi noir)
  card: '#14182c',        // carte principale
  box: '#14182c',         // boîte résultat = MÊME fond que la carte
  border: '#2e3144',      // bordures internes / séparateurs
  white: '#ffffff',
  grey: '#b0b9ca',
  green: '#8bd1b4',
  salmon: '#fd99a1',
  badgeGreenBg: '#004024',
  badgeRedBg: '#680c10',
  badgeNeutralBg: '#262c46',
  yellow: '#fcdc3d',
  yellowText: '#14182c',
};

// ─── Icônes SVG (data URIs) ─────────────────────────────────────────────────

const svg64 = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const ICONS = {
  football: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#ffffff"/><polygon points="24,14 33,21 29,32 19,32 15,21" fill="#14182c"/><path d="M24 2v12M24 34v12M4 17l11 4M44 17l-11 4M12 43l7-11M36 43l-7-11" stroke="#14182c" stroke-width="2.5" fill="none"/></svg>`),
  tennis: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#fcdc3d"/><path d="M9 9c9 8 9 22 0 30M39 9c-9 8-9 22 0 30" stroke="#ffffff" stroke-width="3" fill="none"/></svg>`),
  basketball: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#f08c3a"/><path d="M2 24h44M24 2v44M9 9c8 8 8 22 0 30M39 9c-8 8-8 22 0 30" stroke="#14182c" stroke-width="2.5" fill="none"/></svg>`),
  baseball: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#ffffff"/><path d="M10 4c6 12 6 28 0 40M38 4c-6 12-6 28 0 40" stroke="#e05252" stroke-width="3" fill="none"/></svg>`),
  hockey: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><ellipse cx="24" cy="30" rx="19" ry="8" fill="#0e1424"/><ellipse cx="24" cy="26" rx="19" ry="8" fill="#2b3248"/></svg>`),
  // Trophée Betclic: cercle VERT MENTHE, glyphe sombre (échantillonné capture gagné)
  trophy: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#8bd1b4"/><path d="M16 12h16v8c0 5.5-3.6 10-8 10s-8-4.5-8-10v-8z" fill="#14182c"/><path d="M16 14h-5.5c0 5.5 2.2 9.5 7 10.5M32 14h5.5c0 5.5-2.2 9.5-7 10.5" stroke="#14182c" stroke-width="2.6" fill="none"/><rect x="21.2" y="30" width="5.6" height="4.5" fill="#14182c"/><rect x="16" y="34.5" width="16" height="3.6" rx="1.8" fill="#14182c"/></svg>`),
  // Croix Betclic: cercle SAUMON, croix blanche (échantillonné capture perdu)
  cross: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#fd99a1"/><path d="M17 17l14 14M31 17l-14 14" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"/></svg>`),
  chevron: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M10 30l14-13 14 13" stroke="#b0b9ca" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
};

function sportIcon(sport: string): string {
  const s = (sport || '').toLowerCase();
  if (s.includes('basket')) return ICONS.basketball;
  if (s.includes('hockey')) return ICONS.hockey;
  if (s.includes('base')) return ICONS.baseball;
  if (s.includes('tennis')) return ICONS.tennis;
  return ICONS.football;
}

// ─── Briques de style ───────────────────────────────────────────────────────

type Style = Record<string, string | number>;

const txt = (content: string, style: Style): object => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children: content },
});

// ─── Construction de l'arbre ────────────────────────────────────────────────

function legBlock(leg: CouponView['legs'][number], isLast: boolean): object {
  const pickColor =
    leg.legStatus === 'won' ? C.green : leg.legStatus === 'lost' ? C.salmon : C.white;

  // Icône de gauche = sport ; icône header = statut
  const teamsRows = leg.teams.map((t, i) => ({
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginTop: i === 0 ? 0 : 16,
      },
      children: [
        txt(t.name, { fontSize: 41, color: t.dimmed ? C.grey : C.white, fontWeight: 500 }),
        txt(t.score !== null && t.score !== undefined ? String(t.score) : '',
          { fontSize: 41, color: t.dimmed ? C.grey : C.white, fontWeight: 700 }),
      ],
    },
  }));

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column',
        paddingTop: 28, paddingBottom: 26,
        borderBottom: isLast ? '0px solid transparent' : `1px solid ${C.border}66`,
      },
      children: [
        // Rangée sélection
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'row', alignItems: 'center' },
            children: [
              { type: 'img', props: { src: sportIcon(leg.sport), width: 44, height: 44 } },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', marginLeft: 22, flex: 1 },
                  children: [
                    txt(leg.pickLabel, { fontSize: 41, fontWeight: 700, color: pickColor }),
                    txt(leg.marketLabel, { fontSize: 36, color: C.white, marginTop: 8, fontWeight: 400 }),
                  ],
                },
              },
              txt(formatOdds(leg.odds), {
                fontSize: 55, fontWeight: 700, fontStyle: 'italic', color: C.white,
              }),
            ],
          },
        },
        // Boîte match (heure sur la bordure + équipes/scores)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', flexDirection: 'column',
              position: 'relative',
              border: `2px solid ${C.border}`,
              borderRadius: 26,
              marginTop: 52,
              paddingTop: 26, paddingBottom: 32, paddingHorizontal: 28,
              backgroundColor: C.box,
            },
            children: [
              {
                // Label centré posé sur la bordure haute
                type: 'div',
                props: {
                  style: {
                    display: 'flex', flexDirection: 'row', justifyContent: 'center',
                    position: 'absolute', top: -18, left: 0, right: 0,
                  },
                  children: [
                    txt(leg.timeLabel, {
                      fontSize: 27, color: C.grey, backgroundColor: C.card,
                      paddingLeft: 18, paddingRight: 18, fontWeight: 400,
                    }),
                  ],
                },
              },
              ...teamsRows,
            ],
          },
        },
      ],
    },
  };
}

function headerIcons(view: CouponView): object {
  const icons = view.legs.map(l =>
    l.legStatus === 'won' ? ICONS.trophy : l.legStatus === 'lost' ? ICONS.cross : sportIcon(l.sport));
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'row', alignItems: 'center', marginTop: 14 },
      children: [
        ...icons.map((src, i) => ({
          type: 'img',
          props: { src, width: 39, height: 39, marginLeft: i === 0 ? 0 : -7 },
        })),
        { type: 'img', props: { src: ICONS.chevron, width: 28, height: 28, marginLeft: 12 } },
      ],
    },
  };
}

function badge(view: CouponView): object {
  const map = {
    won: { bg: C.badgeGreenBg, fg: C.green, label: 'Gagné' },
    lost: { bg: C.badgeRedBg, fg: C.salmon, label: 'Perdu' },
    pending: { bg: C.badgeNeutralBg, fg: C.yellow, label: 'En jeu' },
  } as const;
  const m = map[view.status];
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', backgroundColor: m.bg, borderRadius: 12,
        paddingLeft: 22, paddingRight: 22, paddingTop: 10, paddingBottom: 10,
      },
      children: [txt(m.label, { fontSize: 30, fontWeight: 700, color: m.fg })],
    },
  };
}

function footerRow(label: string, right: object): object {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginTop: 24,
      },
      children: [
        txt(label, { fontSize: 36, fontWeight: 600, color: C.white }),
        right,
      ],
    },
  };
}

function buildTree(view: CouponView): object {
  const gainsLabel = view.status === 'pending' ? 'Gain potentiel' : 'Gains';
  const gainsColor = view.status === 'won' ? C.green : view.status === 'lost' ? C.salmon : C.green;
  const gainsValue = view.status === 'lost' ? '0 F' : formatFcfa(view.gains);

  const legsChildren = view.legs.map((l, i) => legBlock(l, i === view.legs.length - 1));

  // Hauteur dynamique calée sur les captures (en-tête ~150 + leg ~365 + pied ~280)
  const height = 560 + view.legs.length * 365;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column',
        width: 1000, height,
        backgroundColor: C.canvas,
        padding: 26,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', flexDirection: 'column',
              backgroundColor: C.card, borderRadius: 26,
              padding: 32, width: '100%', height: '100%',
            },
            children: [
              // En-tête
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column' },
                        children: [
                          txt(`Combiné (${view.legs.length})`, { fontSize: 37, fontWeight: 600, color: C.white }),
                          headerIcons(view),
                        ],
                      },
                    },
                    badge(view),
                  ],
                },
              },
              // Legs
              { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', marginTop: 12 }, children: legsChildren } },
              // Pied
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', marginTop: 18 },
                  children: [
                    footerRow('Cote totale', {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex', backgroundColor: C.yellow, borderRadius: 26,
                          paddingLeft: 28, paddingRight: 28, paddingTop: 12, paddingBottom: 12,
                        },
                        children: [txt(formatOdds(view.totalOdds), {
                          fontSize: 50, fontWeight: 700, fontStyle: 'italic', color: C.yellowText,
                        })],
                      },
                    }),
                    footerRow('Mise', txt(formatFcfa(view.stake), { fontSize: 36, fontWeight: 600, color: C.white })),
                    footerRow(gainsLabel, txt(gainsValue, { fontSize: 41, fontWeight: 700, fontStyle: 'italic', color: gainsColor })),
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ─── Rendu PNG ──────────────────────────────────────────────────────────────

/** Rend le coupon en PNG (Buffer). */
export async function renderCouponPNG(view: CouponView): Promise<Buffer> {
  const height = 560 + view.legs.length * 365;
  const response = new ImageResponse(buildTree(view) as any, {
    width: 1000,
    height,
    fonts: COUPON_FONTS as any,
  });
  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
}
