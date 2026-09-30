// Tile picture guide (Unicode mahjong tiles, rendered locally).
import { zh } from './prefs.js';

const cp = (n) => String.fromCodePoint(n);
const range = (from, n) => Array.from({ length: n }, (_, i) => cp(from + i));
const GROUPS = [
  { title: 'Winds 风牌', note: 'Dong Nan Xi Bei. Your seat wind and the round wind score +1 Tai as a pong.', tiles: range(0x1F000, 4), labels: ['East 東', 'South 南', 'West 西', 'North 北'] },
  { title: 'Dragons 三元牌', note: 'Red 中, Green 發, White 白. Each dragon pong = +1 Tai.', tiles: [cp(0x1F004), cp(0x1F005), cp(0x1F006)], labels: ['Red 中', 'Green 發', 'White 白'] },
  { title: 'Characters 万 (Wan)', note: '1–9. 1 and 9 are terminals.', tiles: range(0x1F007, 9), labels: range(1, 9).map((_, i) => `${i + 1} 万`) },
  { title: 'Bamboo 索 (Tiao)', note: '1 bamboo is usually drawn as a bird.', tiles: range(0x1F010, 9), labels: range(1, 9).map((_, i) => `${i + 1} 索`) },
  { title: 'Dots 筒 (Ping / Tong)', note: 'Circles.', tiles: range(0x1F019, 9), labels: range(1, 9).map((_, i) => `${i + 1} 筒`) },
  { title: 'Flowers 花', note: 'Seat match: 1 East 梅, 2 South 兰, 3 West 菊, 4 North 竹 → +1 Tai. All four = a set.', tiles: [cp(0x1F022), cp(0x1F023), cp(0x1F025), cp(0x1F024)], labels: ['1 Plum 梅', '2 Orchid 兰', '3 Chrysanthemum 菊', '4 Bamboo 竹'] },
  { title: 'Seasons 季', note: 'Seat match: 1 Spring 春, 2 Summer 夏, 3 Autumn 秋, 4 Winter 冬 → +1 Tai.', tiles: range(0x1F026, 4), labels: ['1 Spring 春', '2 Summer 夏', '3 Autumn 秋', '4 Winter 冬'] },
  { title: 'Animals 动物 (Singapore)', note: 'Each animal = +1 Tai. Cat + Mouse or Cockerel + Centipede = a matched pair.', emoji: ['🐱', '🐭', '🐓', '🐛'], labels: ['Cat 猫', 'Mouse 鼠', 'Cockerel 鸡', 'Centipede 蜈蚣'] },
];
function range1(n) { return Array.from({ length: n }, (_, i) => i); }
void range1;

export function renderTiles($app) {
  $app.innerHTML = `
    <div class="pagehead"><h1>🀄 Tile picture guide ${zh('牌面图解')}</h1><p class="muted">Every tile in a Singapore set</p></div>
    ${GROUPS.map((g) => `<section class="card"><h2>${g.title}</h2><p class="small muted">${g.note}</p>
      <div class="tilegrid">${(g.tiles || g.emoji).map((t, i) => `<figure class="tilefig"><span class="${g.tiles ? 'tileglyph' : 'tileemoji'}">${t}</span><figcaption>${g.labels[i]}</figcaption></figure>`).join('')}</div></section>`).join('')}
    <p class="small muted center">Tile images use the standard Unicode mahjong characters and may look different on each phone.</p>`;
}
