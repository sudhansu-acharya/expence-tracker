// Phase 1 & 4: Settings, Security, Theme, Currency, Encrypted .enc.json Smart-Merge, CSV & Google Drive Sync
import { iconSvg } from '../icons.js';
import { CURRENCIES, escHtml } from '../format.js';
import { isWebAuthnAvailable } from '../crypto.js';

export function renderSettingsView(ctx) {
  const { data, authMeta } = ctx;
  const s = data.settings;
  const accents = [
    ['emerald', '#0d9488'],
    ['indigo', '#4f46e5'],
    ['coral', '#e11d48'],
    ['violet', '#7c3aed'],
    ['amber', '#d97706'],
    ['teal', '#0284c7']
  ];

  return `
    <div class="stack">
      <div class="grid-2">
        <!-- Appearance & Currency -->
        <div class="card">
          <div class="card-header"><div class="card-title">Appearance &amp; Currency</div></div>
          <div class="stack" style="gap:12px">
            <div>
              <label class="field-label">Theme Mode</label>
              <div class="segmented">
                ${['system', 'light', 'dark'].map(m => `<button class="seg-btn ${s.themeMode === m ? 'active' : ''}" data-action="set-theme-mode" data-mode="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
              </div>
            </div>

            <div>
              <label class="field-label">Material You Accent Color</label>
              <div class="accent-dots">
                ${accents.map(([key, hex]) => `<button class="accent-dot ${s.accentColor === key ? 'active' : ''}" style="background:${hex}" data-action="set-accent" data-accent="${key}" title="${key}"></button>`).join('')}
              </div>
            </div>

            <div>
              <label class="field-label">Default Currency</label>
              <select class="input" id="settingCurrency">
                ${Object.values(CURRENCIES).map(c => `<option value="${c.code}" ${s.defaultCurrency === c.code ? 'selected' : ''}>${c.code} (${c.symbol}) — ${c.name}</option>`).join('')}
              </select>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div>
                <label class="field-label">Monthly Income Est.</label>
                <input class="input" type="number" id="settingIncomeEst" value="${escHtml(s.monthlyIncomeEstimate ?? 85000)}" />
              </div>
              <div>
                <label class="field-label">Monthly Savings Target</label>
                <input class="input" type="number" id="settingSavingsTarget" value="${escHtml(s.monthlySavingsTarget ?? 15000)}" />
              </div>
            </div>
            <button class="btn-primary" data-action="save-display-settings">Save Preferences</button>
          </div>
        </div>

        <!-- Security & Vault Lock -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">${iconSvg('shield')} Security &amp; Access Control</div>
            <span class="chip chip-green">AES-256-GCM</span>
          </div>
          <div class="stack" style="gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:700;font-size:13px">Signed in as <code>${escHtml(authMeta?.username || 'user')}</code></div>
                <div class="muted">IndexedDB encrypted at rest • PBKDF2-SHA256</div>
              </div>
              <button class="btn-danger" data-action="lock-vault">${iconSvg('lock')} Lock</button>
            </div>

            <div>
              <label class="field-label">Inactivity Auto-Lock</label>
              <select class="input" id="settingAutoLock">
                ${[1, 5, 15, 30, 0].map(m => `<option value="${m}" ${(authMeta?.autoLockMinutes ?? 15) === m ? 'selected' : ''}>${m === 0 ? 'Disabled' : `${m} minutes`}</option>`).join('')}
              </select>
            </div>

            <div style="display:grid;grid-template-columns:1fr auto;gap:8px">
              <input class="input" type="password" id="settingQuickPin" placeholder="Set/Update 4–6 digit Quick PIN" maxlength="6" />
              <button class="btn-soft" data-action="save-quick-pin">Save PIN</button>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${isWebAuthnAvailable() ? `<button class="btn-soft" data-action="enroll-biometric">${iconSvg('fingerprint')} ${authMeta?.webAuthnCredId ? 'Biometric Enrolled ✓' : 'Enable Fingerprint / Hello'}</button>` : ''}
              <button class="btn-soft" data-action="request-notif-perm">${iconSvg('bell')} Enable Local Alerts</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Offline Encrypted Backup / Smart-Merge Restore & CSV Export -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${iconSvg('download')} Encrypted Backup, Smart-Merge &amp; CSV Export</div>
          <span class="chip chip-accent">100% Offline Portable</span>
        </div>
        <p class="muted" style="margin-bottom:10px">Move or merge data across Android, Windows, and macOS using end-to-end encrypted <code>.enc.json</code> files (AES-256-GCM). Smart-Merge combines edits by record ID &amp; timestamp without losing offline changes.</p>
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;margin-bottom:10px">
          <input class="input" type="password" id="backupPassphrase" placeholder="Enter Backup / Sync Passphrase (min 4 chars)" />
          <button class="btn-primary" data-action="export-enc-backup">${iconSvg('download')} Export .enc.json</button>
          <button class="btn-soft" data-action="export-csv">${iconSvg('download')} Export CSV</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <label class="btn-soft" style="cursor:pointer">
            ${iconSvg('upload')} Smart-Merge Import (.enc.json)
            <input type="file" id="importEncMergeFile" accept=".json,.enc.json" class="hidden" />
          </label>
          <label class="btn-danger" style="cursor:pointer">
            ${iconSvg('upload')} Replace Vault (.enc.json)
            <input type="file" id="importEncReplaceFile" accept=".json,.enc.json" class="hidden" />
          </label>
        </div>
      </div>

      <!-- Optional Free Google Drive AppData E2E-Encrypted Sync -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${iconSvg('cloud')} Optional Free Google Drive Sync (E2E Encrypted)</div>
          <span class="chip chip-green">${s.lastSyncAt ? `Last synced ${escHtml(s.lastSyncAt.slice(0, 16).replace('T', ' '))}` : 'Not Connected'}</span>
        </div>
        <p class="muted" style="line-height:1.5;margin-bottom:10px">
          Your vault is encrypted locally with <strong>AES-256-GCM</strong> using your passphrase <em>before</em> uploading <code>cashew-vault.enc.json</code> to your personal Google Drive <code>appDataFolder</code>. Google Drive only stores opaque ciphertext.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <label class="field-label">Google OAuth Access Token (drive.appdata scope)</label>
            <input class="input" type="password" id="gdriveAccessToken" placeholder="Paste OAuth access token (kept in memory only)" />
          </div>
          <div>
            <label class="field-label">E2E Sync Passphrase</label>
            <input class="input" type="password" id="gdriveSyncPass" placeholder="Same passphrase across your devices" />
          </div>
        </div>
        <button class="btn-primary" data-action="sync-gdrive">${iconSvg('cloud')} Sync Encrypted Now</button>
      </div>
    </div>`;
}
