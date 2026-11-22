// Smart-Merge Sync Engine, AES-256-GCM .enc.json Backup/Restore, CSV Export & Free Google Drive AppData Sync
import { encryptWithPassphrase, decryptWithPassphrase } from './crypto.js';
import { ENCRYPTED_STORES, loadAllVaultData, putRecord, clearStore } from './db.js';
import { nowIso } from './format.js';

// Export full encrypted snapshot (.enc.json)
export async function exportEncryptedSnapshot(passphrase) {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Enter a backup passphrase (at least 4 characters)');
  }
  const vaultData = await loadAllVaultData({ includeDeleted: true });
  const payload = {
    app: 'CashewFlow',
    schemaVersion: 1,
    exportedAt: nowIso(),
    stores: vaultData
  };
  return encryptWithPassphrase(payload, passphrase);
}

// Smart-Merge record-by-record by id + updatedAt (honoring deletedAt tombstones)
export async function importEncryptedSnapshot(envelope, passphrase, { mode = 'merge' } = {}) {
  const payload = await decryptWithPassphrase(envelope, passphrase);
  if (!payload || !payload.stores) throw new Error('Invalid snapshot payload');

  const stats = { inserted: 0, updated: 0, skipped: 0 };

  for (const storeName of ENCRYPTED_STORES) {
    const incoming = payload.stores[storeName] || [];
    if (mode === 'replace') {
      await clearStore(storeName);
      for (const rec of incoming) {
        await putRecord(storeName, rec);
        stats.inserted++;
      }
      continue;
    }

    const local = await loadAllVaultData({ includeDeleted: true });
    const localMap = new Map((local[storeName] || []).map(r => [r.id, r]));

    for (const rec of incoming) {
      const existing = localMap.get(rec.id);
      if (!existing) {
        await putRecord(storeName, rec);
        stats.inserted++;
      } else {
        const incTime = new Date(rec.updatedAt || 0).getTime();
        const locTime = new Date(existing.updatedAt || 0).getTime();
        if (incTime > locTime) {
          await putRecord(storeName, rec);
          stats.updated++;
        } else {
          stats.skipped++;
        }
      }
    }
  }
  return stats;
}

export function triggerFileDownload(content, filename, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// RFC-4180 CSV Export with UTF-8 BOM (opens INR ₹ cleanly in Excel/Numbers/Sheets)
export function buildTransactionsCsv(transactions = [], wallets = [], categories = []) {
  const wMap = new Map(wallets.map(w => [w.id, w.name]));
  const cMap = new Map(categories.map(c => [c.id, c.name]));

  const escapeCsv = val => {
    const s = String(val ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ['Date', 'Type', 'Merchant', 'Category', 'Amount', 'Currency', 'Wallet', 'Tags', 'SelfTransfer', 'Split', 'Source', 'Note'];
  const rows = [header.join(',')];

  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    if (Array.isArray(tx.splits) && tx.splits.length > 0) {
      for (const sp of tx.splits) {
        rows.push([
          tx.date,
          tx.type,
          tx.merchant || '',
          cMap.get(sp.categoryId) || '',
          sp.amount,
          tx.currency || 'INR',
          wMap.get(tx.walletId) || '',
          (tx.tags || []).join(' '),
          tx.isSelfTransfer ? 'Yes' : 'No',
          'Yes',
          tx.source || 'manual',
          sp.note || tx.note || ''
        ].map(escapeCsv).join(','));
      }
    } else {
      rows.push([
        tx.date,
        tx.type,
        tx.merchant || '',
        cMap.get(tx.categoryId) || '',
        tx.amount,
        tx.currency || 'INR',
        wMap.get(tx.walletId) || '',
        (tx.tags || []).join(' '),
        tx.isSelfTransfer ? 'Yes' : 'No',
        'No',
        tx.source || 'manual',
        tx.note || ''
      ].map(escapeCsv).join(','));
    }
  }

  return '\uFEFF' + rows.join('\r\n');
}

// Free Client-Side Google Drive appDataFolder End-to-End Encrypted Sync
const GDRIVE_FILE_NAME = 'cashew-vault.enc.json';

async function findDriveBackupFile(accessToken) {
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${GDRIVE_FILE_NAME}' and trashed=false&fields=files(id,name,modifiedTime)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google Drive list failed (${res.status})`);
  const json = await res.json();
  return json.files?.[0] || null;
}

async function downloadDriveFile(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Google Drive download failed (${res.status})`);
  return res.json();
}

async function uploadDriveFile(accessToken, envelope, existingFileId = null) {
  const boundary = 'cashew_e2e_boundary_' + Date.now();
  const metadata = existingFileId
    ? { name: GDRIVE_FILE_NAME }
    : { name: GDRIVE_FILE_NAME, parents: ['appDataFolder'] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(envelope)}\r\n--${boundary}--`;

  const endpoint = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const res = await fetch(endpoint, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  if (!res.ok) throw new Error(`Google Drive upload failed (${res.status})`);
  return res.json();
}

export async function syncWithGoogleDrive(accessToken, syncPassphrase) {
  if (!accessToken) throw new Error('Connect Google Drive OAuth access token first');
  if (!syncPassphrase || syncPassphrase.length < 4) throw new Error('Enter your E2E Sync Passphrase');

  const remoteFile = await findDriveBackupFile(accessToken);
  let mergeStats = { inserted: 0, updated: 0, skipped: 0 };

  if (remoteFile) {
    const remoteEnvelope = await downloadDriveFile(accessToken, remoteFile.id);
    mergeStats = await importEncryptedSnapshot(remoteEnvelope, syncPassphrase, { mode: 'merge' });
  }

  const freshEnvelope = await exportEncryptedSnapshot(syncPassphrase);
  await uploadDriveFile(accessToken, freshEnvelope, remoteFile?.id || null);

  return { syncedAt: nowIso(), mergeStats, fileId: remoteFile?.id || 'created' };
}
