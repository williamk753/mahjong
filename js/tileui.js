// Drawn mahjong tiles (CSS, works on every phone — no emoji tile font needed).
import { suitOf, numOf } from './handcalc.js';

const HONOUR = { w1: '東', w2: '南', w3: '西', w4: '北', d1: '中', d2: '發', d3: '白' };
const SUIT_CH = { m: '万', p: '筒', s: '索' };

/** One tile. opts: { cls, attrs, star } */
export function tile(t, opts = {}) {
  if (!t) return `<span class="mj empty ${opts.cls || ''}" ${opts.attrs || ''}></span>`;
  const s = suitOf(t);
  const face = HONOUR[t] ? `<b class="h ${t}">${HONOUR[t]}</b>` : `<b>${numOf(t)}</b><i>${SUIT_CH[s]}</i>`;
  return `<span class="mj ${s} ${opts.cls || ''}" ${opts.attrs || ''}>${face}${opts.star ? '<em>⭐</em>' : ''}</span>`;
}
export const tiles = (list, opts = {}) => `<span class="mjrow ${opts.small ? 'sm' : ''}">${list.map((t) => tile(t, opts)).join('')}</span>`;
export const bonusTile = (ch, n, on = true) => `<span class="mj f ${on ? '' : 'off'}"><b>${ch}</b><i>${n}</i></span>`;
