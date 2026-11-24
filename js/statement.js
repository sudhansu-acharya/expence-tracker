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
   PURE-JS OFFLINE PDF TEXT EXTRACTOR (FlateDecode + ToUnicode)
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
  if (clean.length === 4) {
    return String.fromCharCode(parseInt(clean, 16));
  }
  let res = '';
  for (let i = 0; i + 3 < clean.length; i += 4) {
    res += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
  }
  if (!res && clean.length === 2) {
    return String.fromCharCode(parseInt(clean, 16));
  }
  return res;
}

function parseToUnicodeCMap(text, cmap) {
  // beginbfchar ... endbfchar
  const bfCharRe = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = bfCharRe.exec(text)) !== null) {
    const pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let p;
    while ((p = pairRe.exec(m[1])) !== null) {
      cmap.set(p[1].toUpperCase(), decodeHexToUnicode(p[2]));
    }
  }
  // beginbfrange ... endbfrange
  const bfRangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfRangeRe.exec(text)) !== null) {
    const rangeRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let r;
    while ((r = rangeRe.exec(m[1])) !== null) {
      const start = parseInt(r[1], 16);
      const end = parseInt(r[2], 16);
      let dst = parseInt(r[3], 16);
      const keyLen = r[1].length;
      for (let code = start; code <= end && (code - start) < 512; code++, dst++) {
        cmap.set(code.toString(16).toUpperCase().padStart(keyLen, '0'), String.fromCharCode(dst));
      }
    }
  }
}

function decodePdfLiteral(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function decodePdfHexString(hex, cmap) {
  const clean = hex.replace(/\s+/g, '').toUpperCase();
  if (!clean) return '';

  // Try 4-hex-digit (2-byte CID) CMap lookup first
  if (cmap.size > 0 && clean.length % 4 === 0) {
    let out = '';
    let hits = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const k = clean.slice(i, i + 4);
      if (cmap.has(k)) {
        out += cmap.get(k);
        hits++;
      } else {
        out += String.fromCharCode(parseInt(k, 16));
      }
    }
    if (hits > 0) return out;
  }

  // Try 2-hex-digit CMap or ASCII
  let out = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const k = clean.slice(i, i + 2);
    if (cmap.has(k)) out += cmap.get(k);
    else {
      const code = parseInt(k, 16);
      if (code >= 32 && code < 127) out += String.fromCharCode(code);
    }
  }
  return out;
}

function extractTextFromContentStream(streamText, cmap) {
  const lines = [];
  let current = '';

  const flush = () => {
    const trimmed = current.replace(/\s+/g, ' ').trim();
    if (trimmed) lines.push(trimmed);
    current = '';
  };

  // Tokenize PDF text blocks (BT ... ET)
  const btRe = /BT([\s\S]*?)ET/g;
  let bt;
  while ((bt = btRe.exec(streamText)) !== null) {
    const block = bt[1];
    // Split on text-showing and line-moving operators
    const opRe = /(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>|\[(?:[\s\S]*?)\])\s*(Tj|TJ|'|"|)|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(Td|TD)|T\*/g;
    let op;
    while ((op = opRe.exec(block)) !== null) {
      if (op[0] === 'T*' || op[5] === 'Td' || op[5] === 'TD') {
        const dy = parseFloat(op[4] || '0');
        if (op[0] === 'T*' || Math.abs(dy) > 4) flush();
        else if (current && !current.endsWith(' ')) current += ' ';
        continue;
      }
      const operand = op[1];
      const kind = op[2];
      if (!operand || !kind) continue;

      if (kind === 'TJ' && operand.startsWith('[')) {
        const innerRe = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>|-?\d+(?:\.\d+)?/g;
        let part;
        while ((part = innerRe.exec(operand.slice(1, -1))) !== null) {
          const tok = part[0];
          if (tok.startsWith('(')) current += decodePdfLiteral(tok.slice(1, -1));
          else if (tok.startsWith('<')) current += decodePdfHexString(tok.slice(1, -1), cmap);
          else if (parseFloat(tok) < -180) current += ' ';
        }
      } else {
        if (operand.startsWith('(')) current += decodePdfLiteral(operand.slice(1, -1));
        else if (operand.startsWith('<')) current += decodePdfHexString(operand.slice(1, -1), cmap);
        if (kind === "'" || kind === '"') flush();
      }
    }
    flush();
  }
  return lines.join('\n');
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

  const cmap = new Map();
  const decodedStreams = [];

  let pos = 0;
  while (pos < latin.length) {
    const streamIdx = latin.indexOf('stream', pos);
    if (streamIdx === -1) break;
    const endIdx = latin.indexOf('endstream', streamIdx + 6);
    if (endIdx === -1) break;

    const dictSlice = latin.slice(Math.max(0, streamIdx - 320), streamIdx);
    let dataStart = streamIdx + 6;
    if (latin[dataStart] === '\r' && latin[dataStart + 1] === '\n') dataStart += 2;
    else if (latin[dataStart] === '\n' || latin[dataStart] === '\r') dataStart += 1;

    let dataEnd = endIdx;
    while (dataEnd > dataStart && (latin[dataEnd - 1] === '\n' || latin[dataEnd - 1] === '\r')) {
      dataEnd--;
    }

    const rawSlice = bytes.subarray(dataStart, dataEnd);
    let text = '';
    if (/\/FlateDecode\b/.test(dictSlice)) {
      const inflated = await inflateBytes(rawSlice);
      if (inflated) text = bytesToLatin1(inflated);
    } else if (!/\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode/.test(dictSlice)) {
      text = bytesToLatin1(rawSlice);
    }

    if (text) {
      if (text.includes('beginbfchar') || text.includes('beginbfrange')) {
        parseToUnicodeCMap(text, cmap);
      }
      if (text.includes('BT') && (text.includes('Tj') || text.includes('TJ'))) {
        decodedStreams.push(text);
      }
    }
    pos = endIdx + 9;
  }

  const extracted = decodedStreams
    .map(s => extractTextFromContentStream(s, cmap))
    .filter(Boolean)
    .join('\n');

  return extracted;
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
  const gpayActionRe = /^(?:Paid\s+to|Sent\s+to|Received\s+from|Refund\s+from|Payment\s+to|Transfer\s+to|Cashback\s+from)\s+(.+)$/i;
  const takeoutLineRe = /(Paid|Sent|Received)\s+(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:to|from)\s+(.+?)(?:\s+using\s+(.+))?$/i;
  const amtRe = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i;

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

    // Pattern B: Google Pay India PDF Statement block ("Paid to Swiggy" followed by UPI Txn ID, Paid by Bank xxxx, ₹640)
    const am = line.match(gpayActionRe);
    if (am) {
      const isCredit = /^(?:Received|Refund|Cashback)/i.test(line);
      const rawType = isCredit ? 'income' : 'expense';
      let merchant = am[1].replace(/(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?/i, '').trim().slice(0, 64);

      // Look ahead up to 4 lines for amount, UPI transaction ID, and bank last-4
      let amount = parseAmt(line.match(amtRe)?.[1]);
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
          const na = nxt.match(amtRe);
          if (na) amount = parseAmt(na[1]);
        }
        const uid = nxt.match(/UPI\s*Transaction\s*ID[:\s]*([A-Za-z0-9]+)/i);
        if (uid) upiId = uid[1];
        const l4 = nxt.match(/(?:Paid\s+by|Credited\s+to|Bank|Card).*?(\d{4})/i);
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
