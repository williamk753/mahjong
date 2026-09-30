// Pure helpers for the Gemini hand scan: prompt building and strict parsing of the AI's JSON reply.
import { TAI_CATALOG, taiValue } from './rules.js';
import { emptySelection } from './hand.js';

const pick = (input) => TAI_CATALOG.filter((x) => x.input === input);

export function buildScanPrompt(rules, ctx = {}) {
  const line = (x) => `- ${x.id}: ${x.name} (${x.zh}) — ${x.desc}${x.max ? ` [count 0-${x.max}]` : ''} = ${taiValue(rules, x.id)} Tai`;
  const bonuses = TAI_CATALOG.filter((x) => (x.input === 'flag' || x.input === 'count') && !(x.cat === 'special'));
  return `You are an expert Singapore / SEA mahjong scorer. Look at the photo of a WINNING mahjong hand (14+ tiles, possibly with exposed melds and bonus tiles: flowers, seasons, animals).

Context:
- Winner's seat wind: ${ctx.seatWind || 'unknown'} (seat flower/season number ${ctx.seatNo || 'unknown'}: 1=East 梅/春, 2=South 兰/夏, 3=West 菊/秋, 4=North 竹/冬)
- Prevailing (round) wind: ${ctx.roundWind || 'unknown'}
- Won by: ${ctx.selfDraw ? 'self-draw' : 'discard'}

Step 1: list every tile you can see (e.g. "1 wan", "5 dots", "7 bamboo", "East", "Red dragon", "Plum #1", "Cat").
Step 2: choose the scoring patterns using ONLY these ids.

BASE HAND — pick at most ONE (or null):
${pick('pattern').map(line).join('\n')}
SUIT — at most ONE (or null):
${pick('colour').map(line).join('\n')}
LIMIT HAND — at most ONE (or null); if you pick a limit hand, base and suit must be null:
${pick('limit').map(line).join('\n')}
BONUSES — any number (flags true/false, counts are integers):
${bonuses.map(line).join('\n')}

Rules: only mark seat flower/season if its number matches the winner's seat. Ping Hu requires zero flowers/animals. If a tile is unclear, say so in "notes" and lower "confidence".

Reply with JSON only, exactly this shape:
{"tiles": ["..."], "base": "id or null", "suit": "id or null", "limit": "id or null", "flags": {"id": true}, "counts": {"id": 1}, "confidence": 0.0, "notes": "short explanation"}`;
}

/** Parse & validate the model reply into a picker selection. Unknown ids are dropped with a warning. */
export function parseScan(text) {
  let raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1];
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI did not return a readable answer. Try another photo.');
  let obj;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { throw new Error('The AI answer was not valid JSON. Try again.'); }
  const byId = Object.fromEntries(TAI_CATALOG.map((x) => [x.id, x]));
  const warnings = [];
  const sel = emptySelection();
  const one = (v, input) => {
    if (v == null || v === '' || v === 'null') return null;
    const x = byId[v];
    if (!x || x.input !== input) { warnings.push(`Ignored unknown ${input} “${v}”`); return null; }
    return v;
  };
  sel.base = one(obj.base === 'sevenPairsSelf' ? 'sevenPairs' : obj.base, 'pattern');
  sel.suit = one(obj.suit, 'colour');
  sel.limit = one(obj.limit, 'limit');
  if (sel.limit) { if (sel.base || sel.suit) warnings.push('Limit hand chosen — base hand and suit removed.'); sel.base = null; sel.suit = null; }
  for (const [id, on] of Object.entries(obj.flags || {})) {
    if (!on) continue;
    const x = byId[id];
    if (x?.input === 'flag') sel.flags[id] = true; else if (x?.input === 'count') sel.counts[id] = 1; else warnings.push(`Ignored unknown bonus “${id}”`);
  }
  for (const [id, n] of Object.entries(obj.counts || {})) {
    const x = byId[id]; const k = Math.max(0, Math.floor(Number(n) || 0));
    if (!k) continue;
    if (x?.input === 'count') sel.counts[id] = Math.min(x.max || 9, k); else if (x?.input === 'flag') sel.flags[id] = true; else warnings.push(`Ignored unknown bonus “${id}”`);
  }
  const confidence = Math.max(0, Math.min(1, Number(obj.confidence) || 0));
  return {
    selection: sel,
    tiles: Array.isArray(obj.tiles) ? obj.tiles.map(String).slice(0, 30) : [],
    notes: String(obj.notes || '').slice(0, 400),
    confidence, warnings,
  };
}
