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
