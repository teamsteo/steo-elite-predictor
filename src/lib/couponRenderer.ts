/**
 * Coupon Renderer — Task 37
 * ==========================
 * Réplique le design de coupon "Combiné" (style app bookmaker fourni par
 * l'utilisateur: fond navy, sélections avec icônes, cotes italiques, badge
 * Gagné/Perdu, pastille jaune cote totale, Mise / Gains).
 *
 * Rendu: satori (via next/og ImageResponse) → PNG. Polices Montserrat inline
 * (src/lib/couponFonts.ts) → déterministe local comme Vercel.
 */

import { ImageResponse } from 'next/og';
import { COUPON_FONTS } from './couponFonts';
import { formatFcfa, formatOdds, type CouponView } from './couponTicket';

// ─── Palette (échantillonnée depuis les captures utilisateur) ───────────────

const C = {
  canvas: '#0d1322',      // fond autour de la carte
  card: '#1a2138',        // carte principale
  box: '#1f2740',         // boîte résultat
  border: '#303754',      // bordures internes
  white: '#ffffff',
  grey: '#8b93ab',
  green: '#57d9a3',
  salmon: '#f08c9e',
  badgeGreenBg: '#154734',
  badgeRedBg: '#5a1e30',
  badgeNeutralBg: '#2a3352',
  yellow: '#ffd43b',
  yellowText: '#12182b',
};

// ─── Icônes SVG (data URIs) ─────────────────────────────────────────────────

const svg64 = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const ICONS = {
  football: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#ffffff"/><polygon points="24,14 33,21 29,32 19,32 15,21" fill="#1a2138"/><path d="M24 2v12M24 34v12M4 17l11 4M44 17l-11 4M12 43l7-11M36 43l-7-11" stroke="#1a2138" stroke-width="2.5" fill="none"/></svg>`),
  tennis: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#ffd43b"/><path d="M9 9c9 8 9 22 0 30M39 9c-9 8-9 22 0 30" stroke="#ffffff" stroke-width="3" fill="none"/></svg>`),
  basketball: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#f08c3a"/><path d="M2 24h44M24 2v44M9 9c8 8 8 22 0 30M39 9c-8 8-8 22 0 30" stroke="#1a2138" stroke-width="2.5" fill="none"/></svg>`),
  baseball: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#ffffff"/><path d="M10 4c6 12 6 28 0 40M38 4c-6 12-6 28 0 40" stroke="#e05252" stroke-width="3" fill="none"/></svg>`),
  hockey: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><ellipse cx="24" cy="30" rx="19" ry="8" fill="#0e1424"/><ellipse cx="24" cy="26" rx="19" ry="8" fill="#2b3248"/></svg>`),
  trophy: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#2e7d5b"/><path d="M16 13h16v7c0 5-3.5 9-8 9s-8-4-8-9v-7z" fill="#ffffff"/><path d="M16 15h-5c0 5 2 8.5 6.5 9M32 15h5c0 5-2 8.5-6.5 9" stroke="#ffffff" stroke-width="2.5" fill="none"/><rect x="21" y="29" width="6" height="4" fill="#ffffff"/><rect x="16.5" y="33" width="15" height="3.5" rx="1.75" fill="#ffffff"/></svg>`),
  cross: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#e0526e"/><path d="M17 17l14 14M31 17l-14 14" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"/></svg>`),
  chevron: svg64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M10 30l14-13 14 13" stroke="#8b93ab" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
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

const col = (flexDirection: string, style: Style = {}): object => ({
  type: 'div',
  props: { style: { display: 'flex', flexDirection, ...style } },
});

function text(content: string, style: Style): object {
  return { type: 'div', props: { style } };
}

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
        justifyContent: 'space-between', marginTop: i === 0 ? 0 : 10,
      },
      children: [
        txt(t.name, { fontSize: 27, color: t.dimmed ? C.grey : C.white, fontWeight: 500 }),
        txt(t.score !== null && t.score !== undefined ? String(t.score) : '',
          { fontSize: 27, color: t.dimmed ? C.grey : C.white, fontWeight: 700 }),
      ],
    },
  }));

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column',
        paddingTop: 26, paddingBottom: 24,
        borderBottom: isLast ? '0px solid transparent' : `1px solid ${C.border}55`,
      },
      children: [
        // Rangée sélection
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'row', alignItems: 'center' },
            children: [
              { type: 'img', props: { src: sportIcon(leg.sport), width: 42, height: 42 } },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', marginLeft: 22, flex: 1 },
                  children: [
                    txt(leg.pickLabel, { fontSize: 30, fontWeight: 700, color: pickColor }),
                    txt(leg.marketLabel, { fontSize: 26, color: C.white, marginTop: 5, fontWeight: 500 }),
                  ],
                },
              },
              txt(formatOdds(leg.odds), {
                fontSize: 40, fontWeight: 700, fontStyle: 'italic', color: C.white,
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
              borderRadius: 18,
              marginTop: 24,
              paddingTop: 30, paddingBottom: 20, paddingHorizontal: 26,
              backgroundColor: C.box,
            },
            children: [
              {
                // Label centré posé sur la bordure haute
                type: 'div',
                props: {
                  style: {
                    display: 'flex', flexDirection: 'row', justifyContent: 'center',
                    position: 'absolute', top: -17, left: 0, right: 0,
                  },
                  children: [
                    txt(leg.timeLabel, {
                      fontSize: 24, color: C.grey, backgroundColor: C.box,
                      paddingLeft: 16, paddingRight: 16, fontWeight: 500,
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
          props: { src, width: 36, height: 36, marginLeft: i === 0 ? 0 : -6 },
        })),
        { type: 'img', props: { src: ICONS.chevron, width: 26, height: 26, marginLeft: 10 } },
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
        display: 'flex', backgroundColor: m.bg, borderRadius: 10,
        paddingLeft: 20, paddingRight: 20, paddingTop: 9, paddingBottom: 9,
      },
      children: [txt(m.label, { fontSize: 27, fontWeight: 700, color: m.fg })],
    },
  };
}

function footerRow(label: string, right: object): object {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginTop: 22,
      },
      children: [
        txt(label, { fontSize: 30, fontWeight: 700, color: C.white }),
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

  // Hauteur dynamique: en-tête ~150 + par leg ~240 + footer ~260 + marges carte/canvas
  const height = 300 + view.legs.length * 250 + 300;

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
              padding: 34, width: '100%', height: '100%',
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
                          txt(`Combiné (${view.legs.length})`, { fontSize: 32, fontWeight: 600, color: C.white }),
                          headerIcons(view),
                        ],
                      },
                    },
                    badge(view),
                  ],
                },
              },
              // Legs
              { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', marginTop: 10 }, children: legsChildren } },
              // Pied
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', marginTop: 16 },
                  children: [
                    footerRow('Cote totale', {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex', backgroundColor: C.yellow, borderRadius: 14,
                          paddingLeft: 24, paddingRight: 24, paddingTop: 10, paddingBottom: 10,
                        },
                        children: [txt(formatOdds(view.totalOdds), {
                          fontSize: 34, fontWeight: 700, fontStyle: 'italic', color: C.yellowText,
                        })],
                      },
                    }),
                    footerRow('Mise', txt(formatFcfa(view.stake), { fontSize: 30, fontWeight: 700, color: C.white })),
                    footerRow(gainsLabel, txt(gainsValue, { fontSize: 33, fontWeight: 700, fontStyle: 'italic', color: gainsColor })),
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
  const height = 300 + view.legs.length * 250 + 300;
  const response = new ImageResponse(buildTree(view) as any, {
    width: 1000,
    height,
    fonts: COUPON_FONTS as any,
  });
  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
}
