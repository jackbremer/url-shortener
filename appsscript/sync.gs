/**
 * Syncs all slug → URL pairs from this Google Sheet to Cloudflare KV.
 *
 * Sheet format (row 1 is a header, ignored):
 *   Column A: slug       e.g.  blog
 *   Column B: url        e.g.  https://example.com/long/path
 *   Column C: notes      (optional, ignored by this script)
 *
 * Required Script Properties (Extensions → Apps Script → Project Settings → Script Properties):
 *   CF_API_TOKEN       — Cloudflare API token with Workers KV Storage:Edit permission
 *   CF_ACCOUNT_ID      — Your Cloudflare account ID
 *   CF_KV_NAMESPACE_ID — The KV namespace ID for URL_SHORTCUTS
 *   CF_D1_DATABASE_ID  — The D1 database ID for url-shortener-hits (only needed for refreshHits,
 *                        and the token then also needs D1 Read permission)
 */

function syncToCloudflare() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('CF_API_TOKEN');
  var accountId = props.getProperty('CF_ACCOUNT_ID');
  var nsId = props.getProperty('CF_KV_NAMESPACE_ID');

  if (!token || !accountId || !nsId) {
    throw new Error('Missing Script Properties. Set CF_API_TOKEN, CF_ACCOUNT_ID, and CF_KV_NAMESPACE_ID.');
  }

  var errors = [];

  for (var i = 1; i < data.length; i++) {
    var slug = String(data[i][0]).trim();
    var url = String(data[i][1]).trim();

    if (!slug || !url || slug === '' || url === '') continue;

    var response = UrlFetchApp.fetch(
      'https://api.cloudflare.com/client/v4/accounts/' + accountId +
      '/storage/kv/namespaces/' + nsId +
      '/values/' + encodeURIComponent(slug),
      {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'text/plain',
        },
        payload: url,
        muteHttpExceptions: true,
      }
    );

    if (response.getResponseCode() !== 200) {
      errors.push('Row ' + (i + 1) + ' (' + slug + '): HTTP ' + response.getResponseCode());
    }
  }

  if (errors.length > 0) {
    throw new Error('Some rows failed to sync:\n' + errors.join('\n'));
  }

  Logger.log('Sync complete. ' + (data.length - 1) + ' rows processed.');
}

/**
 * Deletes ALL keys from Cloudflare KV then re-pushes everything from the sheet.
 * Use this after deleting rows. Assign to a "Full Sync" button in the sheet.
 */
function fullSyncToCloudflare() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('CF_API_TOKEN');
  var accountId = props.getProperty('CF_ACCOUNT_ID');
  var nsId = props.getProperty('CF_KV_NAMESPACE_ID');

  if (!token || !accountId || !nsId) {
    throw new Error('Missing Script Properties. Set CF_API_TOKEN, CF_ACCOUNT_ID, and CF_KV_NAMESPACE_ID.');
  }

  var baseUrl = 'https://api.cloudflare.com/client/v4/accounts/' + accountId +
                '/storage/kv/namespaces/' + nsId;
  var headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Fetch all existing keys from KV
  var listResponse = UrlFetchApp.fetch(baseUrl + '/keys', {
    method: 'GET',
    headers: headers,
    muteHttpExceptions: true,
  });

  if (listResponse.getResponseCode() !== 200) {
    throw new Error('Failed to list KV keys: HTTP ' + listResponse.getResponseCode());
  }

  var existingKeys = JSON.parse(listResponse.getContentText()).result.map(function(k) {
    return k.name;
  });

  // Delete all existing keys in one bulk request (max 10,000 per call)
  if (existingKeys.length > 0) {
    var deleteResponse = UrlFetchApp.fetch(baseUrl + '/bulk/delete', {
      method: 'POST',
      headers: headers,
      payload: JSON.stringify(existingKeys),
      muteHttpExceptions: true,
    });

    if (deleteResponse.getResponseCode() !== 200) {
      throw new Error('Failed to delete KV keys: HTTP ' + deleteResponse.getResponseCode());
    }
  }

  // Re-push everything from the sheet
  var errors = [];

  for (var i = 1; i < data.length; i++) {
    var slug = String(data[i][0]).trim();
    var url = String(data[i][1]).trim();

    if (!slug || !url || slug === '' || url === '') continue;

    var putResponse = UrlFetchApp.fetch(
      baseUrl + '/values/' + encodeURIComponent(slug),
      {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'text/plain' },
        payload: url,
        muteHttpExceptions: true,
      }
    );

    if (putResponse.getResponseCode() !== 200) {
      errors.push('Row ' + (i + 1) + ' (' + slug + '): HTTP ' + putResponse.getResponseCode());
    }
  }

  if (errors.length > 0) {
    throw new Error('Full sync completed with errors:\n' + errors.join('\n'));
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'All ' + (data.length - 1) + ' slugs synced, ' + existingKeys.length + ' old entries removed.',
    'Full Sync Complete'
  );
}

/**
 * Pulls all-time click counts from Cloudflare D1 into the column headed "Hits".
 * The column can sit anywhere; it's found by its header in row 1.
 * Run it from a button, or add a time-driven trigger (e.g. every hour).
 * Writes made by a script don't fire the on-edit trigger, so this won't cause a KV sync.
 */
function refreshHits() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('CF_API_TOKEN');
  var accountId = props.getProperty('CF_ACCOUNT_ID');
  var dbId = props.getProperty('CF_D1_DATABASE_ID');

  if (!token || !accountId || !dbId) {
    throw new Error('Missing Script Properties. Set CF_API_TOKEN, CF_ACCOUNT_ID, and CF_D1_DATABASE_ID.');
  }

  var hitsCol = data[0].map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('hits');
  if (hitsCol === -1) {
    throw new Error('No "Hits" column found. Add a column with "Hits" in row 1.');
  }

  var response = UrlFetchApp.fetch(
    'https://api.cloudflare.com/client/v4/accounts/' + accountId +
    '/d1/database/' + dbId + '/query',
    {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ sql: 'SELECT slug, count FROM hits' }),
      muteHttpExceptions: true,
    }
  );

  if (response.getResponseCode() !== 200) {
    throw new Error('Failed to query D1: HTTP ' + response.getResponseCode() + '\n' + response.getContentText());
  }

  var counts = {};
  JSON.parse(response.getContentText()).result[0].results.forEach(function(row) {
    counts[row.slug] = row.count;
  });

  if (data.length < 2) return;

  var values = [];
  for (var i = 1; i < data.length; i++) {
    var slug = String(data[i][0]).trim();
    values.push([slug ? (counts[slug] || 0) : '']);
  }

  sheet.getRange(2, hitsCol + 1, values.length, 1).setValues(values);
}
