// 100% Offline On-Device Statement Importer:
// Supports Google Pay (GPay) PDF statements, Google Takeout HTML/JSON, Bank/UPI CSV & TXT
// Zero external CDN libraries — uses native browser DecompressionStream + pure-JS PDF text extractor.
import { sha256Hex } from './crypto.js';
import { matchCategorizationRule, detectSelfTransfer } from './rules.js';
import { AccountAggregatorAdapter } from './parser.js';
import { nowIso } from './format.js';

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

function parseFlexibleDate(raw) {
  if (!raw) return nowIso();
  const s = String(raw).trim().replace(/,/g, ' ').replace(/\s+/g, ' ');

  // "22 Nov 2026" or "22-Nov-26" or "22 Nov 2026 1:15 PM"
  let m = s.match(/(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/](\d{2,4})/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon !== undefined) {
      let yr = parseInt(m[3], 10);
      if (yr < 100) yr += 2000;
      return new Date(yr, mon, parseInt(m[1], 10), 12, 0, 0).toISOString();
    }
  }

  // "Nov 22 2026" (Google Takeout / GPay format)
  m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{2,4})/);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon !== undefined) {
      let yr = parseInt(m[3], 10);
      if (yr < 100) yr += 2000;
      return new Date(yr, mon, parseInt(m[2], 10), 12, 0, 0).toISOString();
    }
  }

  // "22/11/2026" or "22-11-26"
  m = s.match(/(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{2,4})/);
  if (m) {
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr += 2000;
    return new Date(yr, parseInt(m[2], 10) - 1, parseInt(m[1], 10), 12, 0, 0).toISOString();
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? nowIso() : d.toISOString();
}

function parseAmt(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ============================================================
   PURE-JS OFFLINE PDF TEXT EXTRACTOR
   Supports: FlateDecode, ObjStm, Per-Font ToUnicode CMaps
   (bfchar + bfrange single & array), and (x, y) row reconstruction
   ============================================================ */
async function inflateBytes(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  for (const algo of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(algo);
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const out = await new Response(ds.readable).arrayBuffer();
      return new Uint8Array(out);
    } catch {
      // Try next algorithm
    }
  }
  return null;
}

function bytesToLatin1(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

function decodeHexToUnicode(hex) {
  const clean = hex.replace(/\s+/g, '');
  if (!clean) return '';
  if (clean.length === 2) return String.fromCharCode(parseInt(clean, 16));
  let res = '';
  for (let i = 0; i + 3 < clean.length; i += 4) {
    res += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
  }
  return res;
}

function parseToUnicodeCMap(text) {
  const cmap = new Map();
  let keyHexLen = 4;

  // beginbfchar ... endbfchar
  const bfCharRe = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = bfCharRe.exec(text)) !== null) {
    const pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let p;
    while ((p = pairRe.exec(m[1])) !== null) {
      keyHexLen = p[1].length;
      cmap.set(p[1].toUpperCase(), decodeHexToUnicode(p[2]));
    }
  }

  // beginbfrange ... endbfrange (supports both <dst> and [<dst1> <dst2> ...])
  const bfRangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfRangeRe.exec(text)) !== null) {
    const body = m[1];
    // Array form: <start> <end> [<u1> <u2> ...]
    const arrRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g;
    let ar;
    while ((ar = arrRe.exec(body)) !== null) {
      const start = parseInt(ar[1], 16);
      const kl = ar[1].length;
      keyHexLen = kl;
      const targets = [...ar[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map(x => x[1]);
      for (let idx = 0; idx < targets.length; idx++) {
        cmap.set((start + idx).toString(16).toUpperCase().padStart(kl, '0'), decodeHexToUnicode(targets[idx]));
      }
    }
    // Single destination form: <start> <end> <dstStart>
    const singleRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let r;
    while ((r = singleRe.exec(body)) !== null) {
      const start = parseInt(r[1], 16);
      const end = parseInt(r[2], 16);
      const kl = r[1].length;
      keyHexLen = kl;
      const dstHex = r[3];
      let dstCode = parseInt(dstHex.slice(-4), 16);
      const prefix = dstHex.length > 4 ? dstHex.slice(0, -4) : '';
      for (let code = start; code <= end && (code - start) < 1024; code++, dstCode++) {
        const key = code.toString(16).toUpperCase().padStart(kl, '0');
        const valHex = prefix + dstCode.toString(16).padStart(4, '0');
        cmap.set(key, decodeHexToUnicode(valHex));
      }
    }
  }
  return { map: cmap, keyHexLen };
}

function decodePdfLiteralRaw(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && i + 1 < str.length) {
      const nxt = str[++i];
      if (nxt === 'n') bytes.push(10);
      else if (nxt === 'r') bytes.push(13);
      else if (nxt === 't') bytes.push(9);
      else if (nxt === 'b') bytes.push(8);
      else if (nxt === 'f') bytes.push(12);
      else if (nxt === '\r') { if (str[i + 1] === '\n') i++; }
      else if (nxt === '\n') { /* line continuation */ }
      else if (/[0-7]/.test(nxt)) {
        let oct = nxt;
        if (i + 1 < str.length && /[0-7]/.test(str[i + 1])) oct += str[++i];
        if (i + 1 < str.length && /[0-7]/.test(str[i + 1])) oct += str[++i];
        bytes.push(parseInt(oct, 8) & 0xff);
      } else {
        bytes.push(nxt.charCodeAt(0) & 0xff);
      }
    } else {
      bytes.push(ch.charCodeAt(0) & 0xff);
    }
  }
  return bytes;
}

function decodePdfBytesWithCMap(bytes, cmapObj) {
  if (!bytes.length) return '';
  if (cmapObj && cmapObj.map && cmapObj.map.size > 0) {
    const step = cmapObj.keyHexLen === 4 ? 2 : 1;
    let out = '';
    let hits = 0;
    for (let i = 0; i < bytes.length; i += step) {
      let hex = '';
      for (let j = 0; j < step && (i + j) < bytes.length; j++) {
        hex += bytes[i + j].toString(16).toUpperCase().padStart(2, '0');
      }
      if (cmapObj.map.has(hex)) {
        out += cmapObj.map.get(hex);
        hits++;
      } else if (step === 1 && bytes[i] >= 32 && bytes[i] < 127) {
        out += String.fromCharCode(bytes[i]);
      } else if (step === 2 && i + 1 < bytes.length) {
        const code = (bytes[i] << 8) | bytes[i + 1];
        if (code >= 32 && code < 127) out += String.fromCharCode(code);
      }
    }
    if (hits > 0 || out.trim()) return out;
  }
  // Fallback ASCII/Latin-1
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 32 && b < 127) out += String.fromCharCode(b);
    else if (b === 10 || b === 13 || b === 9) out += ' ';
  }
  return out;
}

function decodePdfHexWithCMap(hex, cmapObj) {
  const clean = hex.replace(/\s+/g, '').toUpperCase();
  if (!clean) return '';
  const bytes = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return decodePdfBytesWithCMap(bytes, cmapObj);
}

function extractLinesFromContentStream(streamText, fontCMaps) {
  const fragments = [];
  let activeFont = null;
  let curX = 0;
  let curY = 0;
  let lineOrder = 0;

  const pushText = (txt, x, y) => {
    const cleaned = txt.replace(/\u0000/g, '');
    if (!cleaned) return;
    fragments.push({ text: cleaned, x, y, order: lineOrder++ });
  };

  // Match font switches (/F1 12 Tf) and BT...ET blocks
  const btRe = /BT([\s\S]*?)ET/g;
  let bt;
  while ((bt = btRe.exec(streamText)) !== null) {
    const block = bt[1];
    let tx = 0;
    let ty = 0;

    const tokenRe = /\/([A-Za-z0-9_.\-+]+)\s+[\d.\-]+\s+Tf|([\-0-9.]+)\s+([\-0-9.]+)\s+([\-0-9.]+)\s+([\-0-9.]+)\s+([\-0-9.]+)\s+([\-0-9.]+)\s+Tm|([\-0-9.]+)\s+([\-0-9.]+)\s+(Td|TD)|T\*|(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>|\[(?:[\s\S]*?)\])\s*(Tj|TJ|'|")/g;
    let tok;
    while ((tok = tokenRe.exec(block)) !== null) {
      if (tok[1]) {
        activeFont = tok[1];
        continue;
      }
      if (tok[6] !== undefined) {
        tx = parseFloat(tok[6]) || 0;
        ty = parseFloat(tok[7]) || 0;
        curX = tx;
        curY = ty;
        continue;
      }
      if (tok[10] === 'Td' || tok[10] === 'TD') {
        tx += parseFloat(tok[8]) || 0;
        ty += parseFloat(tok[9]) || 0;
        curX = tx;
        curY = ty;
        continue;
      }
      if (tok[0] === 'T*') {
        ty -= 12;
        curY = ty;
        continue;
      }

      const operand = tok[11];
      const kind = tok[12];
      if (!operand || !kind) continue;

      const cmapObj = (activeFont && fontCMaps.get(activeFont)) || fontCMaps.get('__default__') || null;
      let piece = '';

      if (kind === 'TJ' && operand.startsWith('[')) {
        const innerRe = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>|[\-0-9.]+/g;
        let part;
        while ((part = innerRe.exec(operand.slice(1, -1))) !== null) {
          const p = part[0];
          if (p.startsWith('(')) piece += decodePdfBytesWithCMap(decodePdfLiteralRaw(p.slice(1, -1)), cmapObj);
          else if (p.startsWith('<')) piece += decodePdfHexWithCMap(p.slice(1, -1), cmapObj);
          else if (parseFloat(p) < -180) piece += ' ';
        }
      } else {
        if (operand.startsWith('(')) piece += decodePdfBytesWithCMap(decodePdfLiteralRaw(operand.slice(1, -1)), cmapObj);
        else if (operand.startsWith('<')) piece += decodePdfHexWithCMap(operand.slice(1, -1), cmapObj);
        if (kind === "'" || kind === '"') {
          ty -= 12;
          curY = ty;
        }
      }

      if (piece) {
        pushText(piece, curX, curY);
        curX += piece.length * 4;
      }
    }
  }

  if (!fragments.length) return [];

  // Group fragments by visual Y row (within 4pt tolerance), top-to-bottom (higher Y first in PDF), left-to-right (lower X first)
  const hasRealCoords = fragments.some(f => f.x !== 0 || f.y !== 0);
  if (!hasRealCoords) {
    return fragments.map(f => f.text.trim()).filter(Boolean);
  }

  const rows = [];
  for (const frag of fragments) {
    let row = rows.find(r => Math.abs(r.y - frag.y) <= 4);
    if (!row) {
      row = { y: frag.y, items: [] };
      rows.push(row);
    }
    row.items.push(frag);
  }

  rows.sort((a, b) => b.y - a.y);
  return rows
    .map(r => {
      r.items.sort((a, b) => a.x - b.x || a.order - b.order);
      return r.items.map(i => i.text).join(' ').replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

export async function extractTextFromPdfBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const latin = bytesToLatin1(bytes);

  if (!latin.includes('%PDF-')) {
    throw new Error('File is not a valid PDF document');
  }
  if (/\/Encrypt\b/.test(latin)) {
    throw new Error('This PDF is password-protected. Please unlock it (Print → Save as PDF without password) or export CSV/HTML.');
  }

  // 1. Parse all top-level indirect objects (N G obj ... endobj)
  const objects = new Map(); // objNum -> { dict, streamText, rawBody }
  const objHeaderRe = /(\d+)\s+\d+\s+obj\b/g;
  let om;
  while ((om = objHeaderRe.exec(latin)) !== null) {
    const objNum = parseInt(om[1], 10);
    const bodyStart = om.index + om[0].length;
    const endObjIdx = latin.indexOf('endobj', bodyStart);
    if (endObjIdx === -1) continue;
    const body = latin.slice(bodyStart, endObjIdx);

    const streamRel = body.indexOf('stream');
    if (streamRel !== -1) {
      const endStreamRel = body.indexOf('endstream', streamRel + 6);
      if (endStreamRel !== -1) {
        const dict = body.slice(0, streamRel);
        let ds = bodyStart + streamRel + 6;
        if (latin[ds] === '\r' && latin[ds + 1] === '\n') ds += 2;
        else if (latin[ds] === '\n' || latin[ds] === '\r') ds += 1;
        let de = bodyStart + endStreamRel;
        while (de > ds && (latin[de - 1] === '\n' || latin[de - 1] === '\r')) de--;

        const rawSlice = bytes.subarray(ds, de);
        let streamText = '';
        if (/\/FlateDecode\b/.test(dict)) {
          const inflated = await inflateBytes(rawSlice);
          if (inflated) streamText = bytesToLatin1(inflated);
        } else if (!/\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode/.test(dict)) {
          streamText = bytesToLatin1(rawSlice);
        }
        objects.set(objNum, { dict, streamText, rawBody: dict });

        // Expand PDF 1.5+ compressed Object Streams (/ObjStm)
        if (/\/Type\s*\/ObjStm\b/.test(dict) && streamText) {
          const firstMatch = dict.match(/\/First\s+(\d+)/);
          const nMatch = dict.match(/\/N\s+(\d+)/);
          if (firstMatch && nMatch) {
            const first = parseInt(firstMatch[1], 10);
            const n = parseInt(nMatch[1], 10);
            const headerNums = streamText.slice(0, first).trim().split(/\s+/).map(Number);
            for (let k = 0; k < n && (k * 2 + 1) < headerNums.length; k++) {
              const subNum = headerNums[k * 2];
              const subOff = first + headerNums[k * 2 + 1];
              const nextOff = (k + 1 < n && ((k + 1) * 2 + 1) < headerNums.length)
                ? first + headerNums[(k + 1) * 2 + 1]
                : streamText.length;
              const subBody = streamText.slice(subOff, nextOff);
              if (!objects.has(subNum)) {
                objects.set(subNum, { dict: subBody, streamText: '', rawBody: subBody });
              }
            }
          }
        }
        continue;
      }
    }
    objects.set(objNum, { dict: body, streamText: '', rawBody: body });
  }

  // 2. Build ToUnicode CMap index by object number
  const cmapByObj = new Map();
  for (const [num, obj] of objects.entries()) {
    if (obj.streamText && (obj.streamText.includes('beginbfchar') || obj.streamText.includes('beginbfrange'))) {
      cmapByObj.set(num, parseToUnicodeCMap(obj.streamText));
    }
  }

  // 3. Map Font Object ID -> CMap (handling /ToUnicode direct & via /DescendantFonts)
  const fontObjToCMap = new Map();
  for (const [num, obj] of objects.entries()) {
    const tu = obj.rawBody.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (tu && cmapByObj.has(parseInt(tu[1], 10))) {
      fontObjToCMap.set(num, cmapByObj.get(parseInt(tu[1], 10)));
    }
  }
  for (const [num, obj] of objects.entries()) {
    if (fontObjToCMap.has(num)) continue;
    const desc = obj.rawBody.match(/\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/);
    if (desc && fontObjToCMap.has(parseInt(desc[1], 10))) {
      fontObjToCMap.set(num, fontObjToCMap.get(parseInt(desc[1], 10)));
    }
  }

  // 4. Map Font Resource Names (/F1, /F2, /TT0, etc.) -> their own CMap
  const fontNameToCMap = new Map();
  for (const [, obj] of objects.entries()) {
    const fontDictRe = /\/Font\s*<<([\s\S]*?)>>/g;
    let fm;
    while ((fm = fontDictRe.exec(obj.rawBody)) !== null) {
      const refRe = /\/([A-Za-z0-9_.\-+]+)\s+(\d+)\s+\d+\s+R/g;
      let rf;
      while ((rf = refRe.exec(fm[1])) !== null) {
        const refNum = parseInt(rf[2], 10);
        if (fontObjToCMap.has(refNum)) {
          fontNameToCMap.set(rf[1], fontObjToCMap.get(refNum));
        }
      }
    }
    // Also handle indirect /Font N 0 R dictionaries
    const refRe = /\/(F\d+|TT\d+|C\d+_\d+)\s+(\d+)\s+\d+\s+R/g;
    let rf;
    while ((rf = refRe.exec(obj.rawBody)) !== null) {
      const refNum = parseInt(rf[2], 10);
      if (fontObjToCMap.has(refNum) && !fontNameToCMap.has(rf[1])) {
        fontNameToCMap.set(rf[1], fontObjToCMap.get(refNum));
      }
    }
  }
  if (cmapByObj.size === 1) {
    fontNameToCMap.set('__default__', [...cmapByObj.values()][0]);
  }

  // 5. Extract text page-by-page (in object order) from all content streams
  const allLines = [];
  for (const [, obj] of objects.entries()) {
    if (!obj.streamText) continue;
    if (obj.streamText.includes('beginbfchar') || obj.streamText.includes('beginbfrange')) continue;
    if (/\/Type\s*\/ObjStm\b/.test(obj.dict)) continue;
    if (obj.streamText.includes('BT') && (obj.streamText.includes('Tj') || obj.streamText.includes('TJ'))) {
      const pageLines = extractLinesFromContentStream(obj.streamText, fontNameToCMap);
      allLines.push(...pageLines);
    }
  }

  return allLines.join('\n');
}

/* ============================================================
   GOOGLE PAY / UPI / BANK STATEMENT TEXT & HTML PARSER
   ============================================================ */
function stripHtmlToLines(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8377;|&\#x20B9;/gi, '₹')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function classifyTransaction({ rawType, merchant, note, amount, dateIso, walletId }, context) {
  const combined = `${merchant} ${note}`;
  const isInvest = /\b(?:sip|mutual\s*fund|zerodha|groww|kuvera|coin\s*by|upstox|fixed\s*deposit|ppf|nps|sgb|gold\s*etf|recurring\s*deposit|indmoney)\b/i.test(combined);
  const selfCheck = detectSelfTransfer({ type: rawType, merchant, note, walletId, amount, date: dateIso }, context.wallets, context.existingTxs);

  let finalType = rawType;
  if (selfCheck.isSelfTransfer) finalType = 'transfer';
  else if (rawType === 'expense' && isInvest) finalType = 'investment';

  const ruleHit = matchCategorizationRule(combined, context.rules);
  let categoryId = ruleHit?.categoryId || '';
  if (finalType === 'investment') {
    const invCat = context.categories.find(c => c.type === 'investment' && (
      (/sip|mutual/i.test(combined) && /sip/i.test(c.name)) ||
      (/\bfd\b|fixed\s*deposit/i.test(combined) && /fd/i.test(c.name)) ||
      (/stock|zerodha|groww|upstox|equity/i.test(combined) && /stock/i.test(c.name)) ||
      (/ppf|epf|nps/i.test(combined) && /ppf/i.test(c.name)) ||
      (/gold|sgb/i.test(combined) && /gold/i.test(c.name))
    )) || context.categories.find(c => c.type === 'investment');
    if (invCat) categoryId = invCat.id;
  }
  if (!categoryId) {
    const fallback = context.categories.find(c => c.type === (finalType === 'transfer' ? 'expense' : finalType)) || context.categories[0];
    categoryId = fallback?.id || '';
  }

  return { finalType, categoryId, ruleHit, selfCheck };
}

export async function parseStatementText(rawText, context, { sourceTag = '#gpay-statement' } = {}) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const results = [];
  const seenHashes = new Set();
  const upiWallet = context.wallets.find(w => w.type === 'upi') || context.wallets.find(w => w.type === 'bank') || context.wallets[0];

  const dateLineRe = /\b(\d{1,2}[\s\-\/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[\s\-\/,]+\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4})\b/i;
  // Matches anywhere in a reconstructed PDF row: e.g. "03 May, 2026 Paid to Flipkart Payments ₹182"
  const gpayActionRe = /\b(Paid\s+to|Sent\s+to|Received\s+from|Refund\s+from|Payment\s+to|Transfer\s+to|Cashback\s+from)\s+(.+)$/i;
  const takeoutLineRe = /(Paid|Sent|Received)\s+(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:to|from)\s+(.+?)(?:\s+using\s+(.+))?$/i;
  const amtRe = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i;
  const trailingAmtRe = /(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\s*$/;

  let currentDateIso = nowIso();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track most recent date header
    const dm = line.match(dateLineRe);
    if (dm) {
      currentDateIso = parseFlexibleDate(dm[1]);
    }

    // Pattern A: Google Takeout single-line format ("Paid ₹450.00 to Swiggy using Bank Account XXXXXX9042")
    const tm = line.match(takeoutLineRe);
    if (tm) {
      const verb = tm[1].toLowerCase();
      const amount = parseAmt(tm[2]);
      if (!amount) continue;
      const merchant = tm[3].trim().slice(0, 64);
      const acctInfo = tm[4] || '';
      const nextDateMatch = (lines[i + 1] || '').match(dateLineRe);
      const dateIso = nextDateMatch ? parseFlexibleDate(nextDateMatch[1]) : currentDateIso;
      const last4 = acctInfo.match(/(\d{4})/)?.[1];
      const wallet = context.wallets.find(w => last4 && w.last4Digits === last4) || upiWallet;
      const rawType = verb === 'received' ? 'income' : 'expense';
      const sourceHash = await sha256Hex(`stmt|${rawType}|${amount}|${dateIso.slice(0, 10)}|${merchant.toLowerCase()}|${i}`);
      if (seenHashes.has(sourceHash)) continue;
      seenHashes.add(sourceHash);

      const { finalType, categoryId, ruleHit, selfCheck } = classifyTransaction(
        { rawType, merchant, note: line, amount, dateIso, walletId: wallet?.id },
        context
      );
      results.push({
        kind: 'transaction',
        sourceHash,
        type: finalType,
        amount,
        currency: 'INR',
        date: dateIso,
        walletId: wallet?.id || '',
        categoryId,
        merchant,
        note: `Statement: ${line.slice(0, 140)}`,
        tags: [...new Set([...(ruleHit?.tags || []), sourceTag])],
        source: 'gpay_statement',
        isSelfTransfer: selfCheck.isSelfTransfer,
        selfTransferReason: selfCheck.reason
      });
      continue;
    }

    // Pattern B: Google Pay India PDF Statement row/block:
    // Handles both same-row ("03 May, 2026 Paid to Flipkart Payments ₹182") and multi-line blocks
    const am = line.match(gpayActionRe);
    if (am) {
      const verbPhrase = am[1];
      const isCredit = /^(?:Received|Refund|Cashback)/i.test(verbPhrase);
      const rawType = isCredit ? 'income' : 'expense';
      let tail = am[2].trim();

      // Extract amount from same line (with ₹/Rs. or trailing numeric column)
      let amount = parseAmt(tail.match(amtRe)?.[1]);
      if (amount) {
        tail = tail.replace(amtRe, '').trim();
      } else {
        const tr = tail.match(/\s+([\d,]+(?:\.\d{1,2})?)$/);
        if (tr && parseAmt(tr[1])) {
          amount = parseAmt(tr[1]);
          tail = tail.slice(0, tr.index).trim();
        }
      }
      let merchant = tail.replace(/\s+/g, ' ').trim().slice(0, 64);

      // Look ahead up to 4 lines for amount (if not on same line), UPI Transaction ID, and Paid by Bank / UPI Lite
      let upiId = '';
      let last4 = '';
      let blockDateIso = currentDateIso;
      const snippetParts = [line];

      for (let j = 1; j <= 4 && (i + j) < lines.length; j++) {
        const nxt = lines[i + j];
        if (gpayActionRe.test(nxt) || takeoutLineRe.test(nxt)) break;
        snippetParts.push(nxt);
        const nd = nxt.match(dateLineRe);
        if (nd && !dm) blockDateIso = parseFlexibleDate(nd[1]);
        if (!amount) {
          const na = nxt.match(amtRe) || (/^(?:₹|Rs\.?|INR)?\s*[\d,]+(?:\.\d{1,2})?$/.test(nxt) ? nxt.match(trailingAmtRe) : null);
          if (na) amount = parseAmt(na[1]);
        }
        const uid = nxt.match(/UPI\s*Transaction\s*ID[:\s]*([A-Za-z0-9]+)/i);
        if (uid) upiId = uid[1];
        const l4 = nxt.match(/(?:Paid\s+by|Credited\s+to|Bank|UPI\s*Lite|Card).*?(\d{4})/i);
        if (l4) last4 = l4[1];
      }

      if (!amount) continue;
      if (!merchant) merchant = isCredit ? 'GPay Receipt' : 'GPay Payment';

      const wallet = context.wallets.find(w => last4 && w.last4Digits === last4) || upiWallet;
      const note = snippetParts.join(' • ').slice(0, 160);
      const sourceHash = await sha256Hex(upiId
        ? `gpay|${upiId}`
        : `gpay|${rawType}|${amount}|${blockDateIso.slice(0, 10)}|${merchant.toLowerCase()}`
      );
      if (seenHashes.has(sourceHash)) continue;
      seenHashes.add(sourceHash);

      const { finalType, categoryId, ruleHit, selfCheck } = classifyTransaction(
        { rawType, merchant, note, amount, dateIso: blockDateIso, walletId: wallet?.id },
        context
      );

      results.push({
        kind: 'transaction',
        sourceHash,
        type: finalType,
        amount,
        currency: 'INR',
        date: blockDateIso,
        walletId: wallet?.id || '',
        categoryId,
        merchant,
        note,
        tags: [...new Set([...(ruleHit?.tags || []), sourceTag])],
        source: 'gpay_statement',
        isSelfTransfer: selfCheck.isSelfTransfer,
        selfTransferReason: selfCheck.reason
      });
      continue;
    }

    // Pattern C: Generic single-line statement row containing a Date + ₹/Rs amount (PhonePe / Paytm / Bank PDF)
    if (dm && amtRe.test(line)) {
      const amount = parseAmt(line.match(amtRe)?.[1]);
      if (!amount) continue;
      const isCredit = /\b(?:cr|credit|credited|received|refund|cashback|deposit)\b/i.test(line)
        && !/\b(?:dr|debit|debited|paid|sent|withdrawn)\b/i.test(line);
      const rawType = isCredit ? 'income' : 'expense';
      const cleanedDesc = line
        .replace(dateLineRe, '')
        .replace(amtRe, '')
        .replace(/\b(?:DR|CR|DEBIT|CREDIT|INR|RS\.?)\b/gi, '')
        .replace(/[|•\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const merchant = (cleanedDesc || 'Statement Transaction').slice(0, 64);
      const sourceHash = await sha256Hex(`row|${rawType}|${amount}|${currentDateIso.slice(0, 10)}|${merchant.toLowerCase()}`);
      if (seenHashes.has(sourceHash)) continue;
      seenHashes.add(sourceHash);

      const { finalType, categoryId, ruleHit, selfCheck } = classifyTransaction(
        { rawType, merchant, note: line, amount, dateIso: currentDateIso, walletId: upiWallet?.id },
        context
      );
      results.push({
        kind: 'transaction',
        sourceHash,
        type: finalType,
        amount,
        currency: 'INR',
        date: currentDateIso,
        walletId: upiWallet?.id || '',
        categoryId,
        merchant,
        note: `Statement: ${line.slice(0, 140)}`,
        tags: [...new Set([...(ruleHit?.tags || []), sourceTag])],
        source: 'gpay_statement',
        isSelfTransfer: selfCheck.isSelfTransfer,
        selfTransferReason: selfCheck.reason
      });
    }
  }

  return results;
}

// Unified Entry Point for PDF, HTML, JSON, CSV, TSV, TXT Statement Documents
export async function importStatementFile(file, context) {
  const name = (file.name || '').toLowerCase();
  const adapter = new AccountAggregatorAdapter();

  if (name.endsWith('.pdf')) {
    const buf = await file.arrayBuffer();
    const extractedText = await extractTextFromPdfBuffer(buf);
    if (!extractedText || !extractedText.trim()) {
      throw new Error('Could not extract selectable text from this PDF (it may be a scanned image). Try exporting CSV/HTML or copying the text.');
    }
    return parseStatementText(extractedText, context, { sourceTag: '#pdf-statement' });
  }

  const text = await file.text();

  if (name.endsWith('.html') || name.endsWith('.htm')) {
    const plain = stripHtmlToLines(text);
    return parseStatementText(plain, context, { sourceTag: '#gpay-html' });
  }

  if (name.endsWith('.json')) {
    const parsedJson = JSON.parse(text);
    // Support Google Takeout My Activity JSON array [{ title: "Paid ₹450.00 to Swiggy...", time: "..." }]
    if (Array.isArray(parsedJson) && parsedJson.length && parsedJson[0]?.title) {
      const lines = parsedJson.map(item => `${item.title || ''}\n${item.time || ''}`).join('\n');
      return parseStatementText(lines, context, { sourceTag: '#gpay-json' });
    }
    return adapter.parseRebitJson(parsedJson, context);
  }

  if (name.endsWith('.csv') || name.endsWith('.tsv')) {
    const normalized = name.endsWith('.tsv') ? text.replace(/\t/g, ',') : text;
    const csvRows = await adapter.parseBankCsv(normalized, context);
    if (csvRows.length > 0) return csvRows;
    return parseStatementText(text, context, { sourceTag: '#csv-statement' });
  }

  // Fallback: .txt or copied statement text
  return parseStatementText(text, context, { sourceTag: '#txt-statement' });
}
