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
