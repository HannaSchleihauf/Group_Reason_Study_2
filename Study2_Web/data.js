// Study 2 - data storage of the web version (as in Study 1):
//  - every trial row is kept on this device (browser storage) and can be
//    downloaded as CSV (end screen, or "download all data" on the start form);
//  - every row also goes into an outbox that is sent to the Google Sheet
//    (google_sheets/Code.gs); a row leaves the outbox only after the sheet
//    has confirmed it. Without internet the rows wait and are sent as soon as
//    there is a connection again (and every RETRY_SECONDS while the page is
//    open, and when the page is opened again).
// With SHEETS_URL empty, data are only kept on the device.
// The sheet also hands out the participant numbers (nextParticipant), so
// that all devices count up together.
//
// Published as a claude.ai page, the page cannot reach Google; instead rows
// go to the page's own database (the `db` capability), which only the owner
// and editors can write and read. Viewers who cannot write there keep their
// data on their device and save them with the download button.

const SHEETS_URL = '';  // web app URL of google_sheets/Code.gs ('' = device only)
const SHEETS_TOKEN = 'gr2-BImj5DUkskh34JdP'; // must be the same as TOKEN in Code.gs
const RETRY_SECONDS = 30;

const STORE_ROWS = 'study2.rows';     // all rows ever saved on this device
const STORE_OUTBOX = 'study2.outbox'; // rows not yet confirmed by the sheet

// Document ids in the claude.ai database: letters, digits and _ - . ~ : @ +
const safeId = s => String(s).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').replace(/^\.+$/, '_');

const Data = {
  db: null,        // claude.ai page database, when this view may use it
  dbWritable: true,
  downloads: null, // claude.ai downloads (a page there cannot download files itself)
  ready: null,     // resolves once the claude.ai capabilities have answered

  initClaude() {
    if (!window.claude || !window.claude.use) {
      this.ready = Promise.resolve();
      return;
    }
    this.ready = Promise.all([
      window.claude.use('db').then(db => { this.db = db; }),
      window.claude.use('downloads').then(d => { this.downloads = d; }),
    ]).catch(() => {}).then(() => { if (this.db) this.send(); });
  },
  destination() {
    if (this.db && this.dbWritable) return 'db';
    return SHEETS_URL ? 'sheets' : null;
  },

  load(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  },
  store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Could not store data on this device', e);
    }
  },

  rowId(row) {
    return `${row.participant}_${row.date}_trial${row.trial}`;
  },
  allRows() {
    return this.load(STORE_ROWS, []);
  },
  sessionRows(info) {
    return this.allRows().filter(r => r.participant === info.participant && r.date === info.date);
  },

  saveRow(row) {
    const rows = this.allRows();
    rows.push(row);
    this.store(STORE_ROWS, rows);
    this.queue([row]);
  },

  // Fill session_duration_min into all rows of this session; the rows are
  // sent to the sheet again (the sheet updates them).
  addSessionDuration(info, minutes) {
    const rows = this.allRows();
    const changed = [];
    rows.forEach(r => {
      if (r.participant === info.participant && r.date === info.date) {
        r.session_duration_min = minutes;
        changed.push(r);
      }
    });
    this.store(STORE_ROWS, rows);
    this.queue(changed);
  },

  queue(rows) {
    if (!this.destination()) return;
    const outbox = this.load(STORE_OUTBOX, {});
    rows.forEach(r => { outbox[this.rowId(r)] = Object.assign({row_id: this.rowId(r)}, r); });
    this.store(STORE_OUTBOX, outbox);
    this.send();
  },
  waiting() {
    return Object.keys(this.load(STORE_OUTBOX, {})).length;
  },

  // Send the whole outbox in one request; returns the number of rows still waiting.
  sending: null,
  send(timeoutMs = 10000) {
    const destination = this.destination();
    if (!destination) return Promise.resolve(this.waiting());
    if (this.sending) return this.sending;
    if (destination === 'db') return this.sendDb();
    const outbox = this.load(STORE_OUTBOX, {});
    const ids = Object.keys(outbox);
    if (!ids.length) return Promise.resolve(0);
    const sent = JSON.stringify(outbox);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    this.sending = fetch(SHEETS_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify({token: SHEETS_TOKEN, rows: ids.map(id => outbox[id])}),
      signal: controller.signal,
    })
      .then(response => response.json())
      .then(answer => {
        if (!answer.ok) {
          console.error('Google Sheets refused the data:', answer.error);
          return;
        }
        // remove what was sent, unless it changed in the meantime
        const now = this.load(STORE_OUTBOX, {});
        const before = JSON.parse(sent);
        ids.forEach(id => {
          if (JSON.stringify(now[id]) === JSON.stringify(before[id])) delete now[id];
        });
        this.store(STORE_OUTBOX, now);
      })
      .catch(() => {}) // no internet: the rows stay in the outbox
      .then(() => {
        clearTimeout(timer);
        this.sending = null;
        return this.waiting();
      });
    return this.sending;
  },
  // claude.ai database: rows/<row id> per trial, sessions/<session> with what
  // the counterbalancing needs. One write at a time.
  sendDb() {
    const run = async () => {
      // keep going until every row (also rows queued meanwhile) has been sent
      const sent = {};
      for (;;) {
        const todo = Object.entries(this.load(STORE_OUTBOX, {}))
          .filter(([id, row]) => sent[id] !== JSON.stringify(row));
        if (!todo.length) break;
        for (const [id, row] of todo) {
          try {
            await this.db.doc(`rows/${safeId(id)}`).set(row);
            await this.db.doc(`sessions/${safeId(`${row.participant}_${row.date}`)}`).set(
              {participant: String(row.participant), date: row.date, age: String(row.age),
               cb_list: row.cb_list, membership: row.membership, trial_order: row.trial_order,
               n: row.trial, app: row.app || ''});
            sent[id] = JSON.stringify(row);
            const now = this.load(STORE_OUTBOX, {});
            if (JSON.stringify(now[id]) === sent[id]) {
              delete now[id];
              this.store(STORE_OUTBOX, now);
            }
          } catch (e) {
            if (e && ['invalid_argument', 'not_granted', 'capability_disabled',
                      'capability_removed', 'revoked'].includes(e.code)) {
              // this viewer may not write the database: keep data on the device
              this.dbWritable = false;
              if (!SHEETS_URL) this.store(STORE_OUTBOX, {});
            }
            return this.waiting();  // offline or busy: try again later
          }
        }
      }
      return this.waiting();
    };
    // `sending` is cleared only after the run (also when the outbox is empty)
    this.sending = run().finally(() => { this.sending = null; });
    return this.sending;
  },
  async allDbRows() {
    if (!this.db) return [];
    try {
      const snap = await this.db.collection('rows').limit(1000).get();
      return snap.docs.map(d => d.data());
    } catch (e) {
      return [];
    }
  },

  startRetrying() {
    this.send();
    setInterval(() => this.send(), RETRY_SECONDS * 1000);
    window.addEventListener('online', () => this.send());
  },

  // GET request to the sheet's web app; the JSON answer, or null.
  async sheetGet(params, timeoutMs = 5000) {
    if (!SHEETS_URL || !navigator.onLine) return null;
    const query = Object.entries(Object.assign({token: SHEETS_TOKEN}, params))
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${SHEETS_URL}?${query}`, {signal: controller.signal});
      return await response.json();
    } catch (e) {
      return null;  // no internet, timeout, or no JSON answer
    } finally {
      clearTimeout(timer);
    }
  },

  // Highest participant number in the rows on this device and (claude.ai)
  // in the page's database; IDs that are not numbers (test) are skipped.
  async localMaxParticipant() {
    const ids = this.allRows().map(r => r.participant);
    if (this.db) {
      try {
        const snap = await Promise.race([
          this.db.collection('sessions').limit(1000).get(),
          new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 4000))]);
        snap.docs.forEach(d => ids.push(d.data().participant));
      } catch (e) { /* this device only */ }
    }
    return ids.map(id => String(id).trim()).filter(id => /^\d+$/.test(id))
      .reduce((highest, id) => Math.max(highest, Number(id)), 0);
  },

  // Next participant number from the sheet: one more than the highest number
  // in the sheet, handed out before, or localMax. With `reserve` the number
  // is taken. null if the sheet cannot be reached.
  async nextParticipant(localMax, reserve = false) {
    const answer = await this.sheetGet({action: 'next', min: localMax, reserve: reserve ? 1 : 0},
                                       8000);
    if (answer && answer.ok) return Number(answer.participant);
    // older Code.gs without action=next: the highest number in the sheet
    const sessions = await this.sheetGet({action: 'sessions'});
    if (sessions && sessions.ok) {
      return sessions.sessions.map(s => String(s.participant).trim())
        .filter(id => /^\d+$/.test(id))
        .reduce((highest, id) => Math.max(highest, Number(id)), localMax) + 1;
    }
    return null;
  },

  // Completed sessions (all trials) for counterbalancing: from the sheet if
  // it can be reached (all devices), otherwise from this device.
  async completedSessions() {
    if (this.db) {
      try {
        const snap = await Promise.race([
          this.db.collection('sessions').limit(1000).get(),
          new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 4000))]);
        if (snap.size) return {source: 'db', sessions: snap.docs.map(d => d.data())};
      } catch (e) { /* fall back */ }
    }
    const answer = await this.sheetGet({action: 'sessions'});
    if (answer && answer.ok) return {source: 'sheet', sessions: answer.sessions};
    const bySession = {};
    this.allRows().forEach(r => {
      const key = `${r.participant}_${r.date}`;
      bySession[key] = bySession[key] || {participant: r.participant, age: r.age,
                                          cb_list: r.cb_list, n: 0};      bySession[key].n++;
    });
    return {source: 'device', sessions: Object.values(bySession)};
  },

  toCsv(rows) {
    const columns = [];
    rows.forEach(r => Object.keys(r).forEach(k => { if (!columns.includes(k)) columns.push(k); }));
    const cell = v => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [columns.join(','), ...rows.map(r => columns.map(k => cell(r[k])).join(','))].join('\n');
  },
  async download(filename, rows) {
    if (this.downloads) {  // claude.ai: the viewer confirms the save
      try {
        await this.downloads.save({filename, data: this.toCsv(rows)});
      } catch (e) { /* declined or unavailable */ }
      return;
    }
    const blob = new Blob([this.toCsv(rows)], {type: 'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
};
