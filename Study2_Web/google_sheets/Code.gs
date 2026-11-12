/**
 * Study 2 - receives the data rows from the web task (data.js) and appends
 * them to the sheet "data". Use a new Google Sheet for Study 2 (not the
 * Study 1 sheet): the columns differ, and participant numbers count up
 * separately. doGet also tells the task which counterbalancing lists
 * completed sessions used (all devices), and hands out the participant
 * numbers (action=next), so that all devices count up together.
 *
 * Setup (once):
 *  1. Make a new Google Sheet (e.g. in the lab's Google Drive).
 *  2. In the sheet: Extensions > Apps Script. Replace the code there with this
 *     file.
 *  3. Deploy > New deployment > type "Web app".
 *       Execute as: Me
 *       Who has access: Anyone
 *     Deploy, allow access, and copy the web app URL.
 *  4. In data.js set SHEETS_URL to that URL (SHEETS_TOKEN is already the same
 *     as TOKEN below).
 *  5. Check: open <URL>?action=sessions&token=<TOKEN> in a browser; it should
 *     show {"ok":true,"sessions":[...]}, and <URL>?action=next&token=<TOKEN>
 *     should show {"ok":true,"participant":<next number>}.
 *  After changing this code later: Deploy > Manage deployments > edit >
 *  Version: New version (the URL stays the same).
 *
 * The first row of the sheet holds the column names; new columns are added
 * at the right when the task sends a field the sheet does not have yet.
 * A row whose row_id is already in the sheet is updated, not added again
 * (no duplicates when a row is sent twice; at the end of a session the task
 * sends its rows again with session_duration_min filled in).
 */
const TOKEN = 'gr2-BImj5DUkskh34JdP';  // same as SHEETS_TOKEN in data.js
const SHEET_NAME = 'data';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);  // one request at a time
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) return reply({ok: false, error: 'wrong token'});

    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);

    const header = sheet.getLastColumn() > 0
        ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    data.rows.forEach(row => Object.keys(row).forEach(key => {
      if (!header.includes(key)) header.push(key);
    }));
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.setFrozenRows(1);

    const idColumn = header.indexOf('row_id') + 1;
    const lastRow = sheet.getLastRow();
    const ids = lastRow > 1
        ? sheet.getRange(2, idColumn, lastRow - 1, 1).getValues().map(r => String(r[0]))
        : [];
    const fresh = [];
    let updated = 0;
    data.rows.forEach(row => {
      const values = header.map(key =>
          row[key] === undefined || row[key] === null ? '' : row[key]);
      const i = ids.indexOf(String(row.row_id));
      if (i >= 0) {  // known row: update it
        sheet.getRange(i + 2, 1, 1, header.length).setValues([values]);
        updated++;
      } else {
        fresh.push(values);
      }
    });
    if (fresh.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, header.length)
           .setValues(fresh);
    }
    return reply({ok: true, added: fresh.length, updated: updated});
  } catch (err) {
    return reply({ok: false, error: String(err)});
  } finally {
    lock.releaseLock();
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.token !== TOKEN) return reply({ok: false, error: 'wrong token'});
  if (p.action === 'sessions') return reply({ok: true, sessions: sessions()});
  if (p.action === 'next') return reply(nextParticipant(Number(p.min) || 0, p.reserve === '1'));
  return reply({ok: false, error: 'unknown action'});
}

// All rows of the sheet as objects (column name -> value).
function sheetRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const header = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    header.forEach((name, i) => { obj[name] = row[i]; });
    return obj;
  });
}

// Completed sessions per participant and date (age, cb_list, number of
// trials), for the counterbalancing.
function sessions() {
  const bySession = {};
  sheetRows().forEach(row => {
    const key = row.participant + '_' + row.date;
    if (!bySession[key]) {
      const age = row.age !== undefined ? row.age : row.age_group;
      bySession[key] = {participant: String(row.participant), age: String(age),
                        cb_list: row.cb_list, n: 0};
    }
    bySession[key].n++;
  });
  return Object.values(bySession);
}

// Next participant number: one more than the highest number in the sheet,
// the highest number handed out before (also for sessions that have not
// sent a row yet) and `min` (the highest number the device knows of).
// With `reserve` the number is taken, so the next device gets the one after.
function nextParticipant(min, reserve) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    let highest = Math.max(min, Number(props.getProperty('last_participant')) || 0);
    sheetRows().forEach(row => {
      const id = String(row.participant).trim();
      if (/^\d+$/.test(id)) highest = Math.max(highest, Number(id));
    });
    const next = highest + 1;
    if (reserve) props.setProperty('last_participant', String(next));
    return {ok: true, participant: next};
  } finally {
    lock.releaseLock();
  }
}
