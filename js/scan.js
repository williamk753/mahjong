// Browser side of the Gemini hand scan: shrink the photo, send it to Gemini, parse the answer.
import { buildScanPrompt, parseScan } from './scan-core.js';
import { app } from './data.js';
import { prefs } from './prefs.js';

export const scanAvailable = () => app.store?.mode === 'cloud' && typeof app.store.generate === 'function' && prefs.rules.aiScan !== false;

/** Downscale to max 1600px JPEG (keeps requests small & fast on mobile data). */
export async function prepareImage(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image')); i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    return { dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
  } finally { URL.revokeObjectURL(url); }
}

function friendlyError(err) {
  const m = String(err?.message || err);
  if (/API has not been used|not enabled|SERVICE_DISABLED|firebasevertexai|firebaseml/i.test(m)) return 'Gemini is not switched on yet: Firebase console → AI Logic → Get started → Gemini Developer API.';
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(m)) return 'The free Gemini limit is used up for now — try again later, or pick the patterns by hand.';
  if (/not found|404|model/i.test(m)) return `The AI model "${prefs.rules.aiModel}" is not available. Choose another model in ⚙️ House rules → AI hand scan.`;
  if (/network|fetch|Failed to fetch|offline/i.test(m)) return 'No internet connection — pick the patterns by hand.';
  if (/SAFETY|blocked/i.test(m)) return 'The photo was blocked by the AI safety filter. Try a clearer photo of just the tiles.';
  return 'Scan failed: ' + m;
}

/** Returns { selection, tiles, notes, confidence, warnings, preview } */
export async function scanHand(file, ctx) {
  if (!scanAvailable()) throw new Error('The AI hand scan needs cloud mode (Firebase) and is switched on in House rules.');
  const img = await prepareImage(file);
  try {
    const text = await app.store.generate(prefs.rules.aiModel, [
      buildScanPrompt(prefs.rules, ctx),
      { inlineData: { data: img.base64, mimeType: img.mimeType } },
    ], { responseMimeType: 'application/json', temperature: 0.1 });
    return { ...parseScan(text), preview: img.dataUrl };
  } catch (err) {
    console.error(err);
    const e = new Error(friendlyError(err)); e.preview = img.dataUrl; throw e;
  }
}
