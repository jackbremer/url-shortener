// QR generator page served at /qr.
// Everything happens in the browser: what you type (including Wi-Fi passwords)
// is never sent to the Worker, and nothing is counted or logged.
// Payload formats follow the ZXing "Barcode Contents" conventions that phone cameras read:
// https://github.com/zxing/zxing/wiki/Barcode-Contents
// String.raw keeps the backslashes in the page's regexes as written.

export const QR_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QR code generator</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 48px auto; padding: 0 16px; color: #111; }
    h1 { font-size: 1.5rem; margin: 0 0 24px; }
    .label { font-size: 0.875rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
    .types { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 24px; }
    .types label { border: 1px solid #ccc; border-radius: 999px; padding: 6px 14px; font-size: 0.9rem; cursor: pointer; }
    .types input { position: absolute; opacity: 0; }
    .types label:has(input:checked) { background: #2563eb; border-color: #2563eb; color: #fff; }
    .types label:has(input:focus-visible) { outline: 2px solid #2563eb; outline-offset: 2px; }
    fieldset { border: 0; padding: 0; margin: 0; }
    fieldset[hidden] { display: none; }
    .field { display: block; margin-bottom: 14px; font-size: 0.875rem; color: #444; }
    .field input, .field textarea, .field select { display: block; width: 100%; margin-top: 4px; padding: 8px 10px; font: inherit; font-size: 1rem; color: #111; border: 1px solid #ccc; border-radius: 6px; }
    .field textarea { min-height: 80px; resize: vertical; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 0.875rem; color: #444; margin-bottom: 14px; }
    .hint { font-size: 0.8rem; color: #888; margin-top: 4px; }
    .out { margin-top: 32px; }
    #preview svg { display: block; width: 240px; height: 240px; margin: 12px 0; }
    #preview:empty::before { content: "Fill in the form to make a code"; display: block; width: 240px; height: 240px; margin: 12px 0; border: 1px dashed #ccc; color: #888; font-size: 0.875rem; padding: 96px 24px; text-align: center; }
    .downloads button { font: inherit; font-size: 0.875rem; color: #2563eb; background: none; border: 0; padding: 0; margin-right: 16px; cursor: pointer; text-decoration: underline; }
    .downloads button:disabled { color: #aaa; cursor: default; text-decoration: none; }
    #error { color: #b91c1c; font-size: 0.875rem; }
    details { margin-top: 20px; font-size: 0.875rem; color: #666; }
    #payload { white-space: pre-wrap; word-break: break-all; background: #f5f5f5; padding: 8px 10px; border-radius: 6px; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>QR code generator</h1>

  <div class="label">Type</div>
  <div class="types" role="radiogroup">
    <label><input type="radio" name="type" value="text" checked> Link or text</label>
    <label><input type="radio" name="type" value="wifi"> Wi-Fi</label>
    <label><input type="radio" name="type" value="tel"> Phone</label>
    <label><input type="radio" name="type" value="sms"> SMS</label>
    <label><input type="radio" name="type" value="email"> Email</label>
    <label><input type="radio" name="type" value="contact"> Contact</label>
  </div>

  <form id="form" autocomplete="off">
    <fieldset data-type="text">
      <label class="field">Link or text
        <textarea name="text" placeholder="https://example.com"></textarea>
      </label>
    </fieldset>

    <fieldset data-type="wifi" hidden>
      <label class="field">Network name (SSID)<input name="ssid"></label>
      <label class="field">Security
        <select name="security">
          <option value="WPA">WPA, WPA2 or WPA3 (most networks)</option>
          <option value="WPA3">WPA3 only</option>
          <option value="WEP">WEP (old)</option>
          <option value="nopass">None (open network)</option>
        </select>
      </label>
      <label class="field">Password<input name="password" type="text"></label>
      <label class="check"><input type="checkbox" name="hidden"> Hidden network</label>
      <div class="hint">Phones join the network when they scan this. The password stays in your browser.</div>
    </fieldset>

    <fieldset data-type="tel" hidden>
      <label class="field">Phone number<input name="tel" type="tel" placeholder="+44 20 7946 0000"></label>
      <div class="hint">Include the country code so it works from abroad.</div>
    </fieldset>

    <fieldset data-type="sms" hidden>
      <label class="field">Phone number<input name="smsTo" type="tel" placeholder="+44 7700 900000"></label>
      <label class="field">Message (optional)<textarea name="smsBody"></textarea></label>
    </fieldset>

    <fieldset data-type="email" hidden>
      <label class="field">Email address<input name="emailTo" type="email"></label>
      <label class="field">Subject (optional)<input name="emailSubject"></label>
      <label class="field">Message (optional)<textarea name="emailBody"></textarea></label>
    </fieldset>

    <fieldset data-type="contact" hidden>
      <label class="field">First name<input name="first"></label>
      <label class="field">Last name<input name="last"></label>
      <label class="field">Organisation<input name="org"></label>
      <label class="field">Job title<input name="title"></label>
      <label class="field">Phone<input name="phone" type="tel"></label>
      <label class="field">Email<input name="email" type="email"></label>
      <label class="field">Website<input name="url" type="url"></label>
      <div class="hint">Scanning offers to save this as a new contact.</div>
    </fieldset>
  </form>

  <div class="out">
    <div class="label">QR code</div>
    <div id="preview"></div>
    <div id="error"></div>
    <div class="downloads">
      <button type="button" id="png" disabled>Download PNG</button>
      <button type="button" id="svg" disabled>Download SVG</button>
    </div>
    <details>
      <summary>What's in the code</summary>
      <div id="payload"></div>
    </details>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js"
    integrity="sha384-e9EFD6BGC90bkW9aDV5xbbBfzwN7G8YImHao2lfLVKV/hPB0E0go+H3I64h7oHtA"
    crossorigin="anonymous"></script>
  <script>
    // The library's default encoding only keeps the low byte of each character
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

    const PNG_SIZE = 1000; // approximate width in pixels
    const form = document.getElementById('form');
    const preview = document.getElementById('preview');
    const error = document.getElementById('error');
    const payloadEl = document.getElementById('payload');
    const pngButton = document.getElementById('png');
    const svgButton = document.getElementById('svg');
    let current = null;

    // Wi-Fi strings need \ ; , " : escaped with a backslash
    const wifiEscape = (s) => s.replace(/([\\;,":])/g, '\\$1');
    // vCard values need \ , ; escaped and newlines written as \n
    const vcardEscape = (s) => s.replace(/([\\,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
    // Keep digits and +, and drop the "(0)" in numbers written like +44 (0)20 ...
    const phone = (s) => s.replace(/\(0\)/g, '').replace(/[^\d+]/g, '');

    function currentType() {
      return document.querySelector('input[name="type"]:checked').value;
    }

    function buildPayload(type, f) {
      const v = (name) => f.get(name).trim();
      switch (type) {
        case 'text':
          return v('text');
        case 'wifi': {
          if (!v('ssid')) return '';
          const security = v('security');
          let s = 'WIFI:T:' + (security === 'WPA3' ? 'WPA;R:1' : security) + ';S:' + wifiEscape(v('ssid')) + ';';
          if (security !== 'nopass') s += 'P:' + wifiEscape(f.get('password')) + ';';
          if (f.get('hidden')) s += 'H:true;';
          return s + ';';
        }
        case 'tel':
          return v('tel') ? 'tel:' + phone(v('tel')) : '';
        case 'sms':
          if (!v('smsTo')) return '';
          return 'SMSTO:' + phone(v('smsTo')) + ':' + v('smsBody');
        case 'email': {
          if (!v('emailTo')) return '';
          const params = new URLSearchParams();
          if (v('emailSubject')) params.set('subject', v('emailSubject'));
          if (v('emailBody')) params.set('body', v('emailBody'));
          // URLSearchParams writes spaces as +, which mail apps show literally
          const query = params.toString().replace(/\+/g, '%20');
          return 'mailto:' + v('emailTo') + (query ? '?' + query : '');
        }
        case 'contact': {
          const first = v('first'), last = v('last');
          const name = [first, last].filter(Boolean).join(' ');
          if (!name && !v('org')) return '';
          const lines = ['BEGIN:VCARD', 'VERSION:3.0',
            'N:' + vcardEscape(last) + ';' + vcardEscape(first) + ';;;',
            'FN:' + vcardEscape(name || v('org'))];
          if (v('org')) lines.push('ORG:' + vcardEscape(v('org')));
          if (v('title')) lines.push('TITLE:' + vcardEscape(v('title')));
          if (v('phone')) lines.push('TEL;TYPE=CELL:' + phone(v('phone')));
          if (v('email')) lines.push('EMAIL:' + vcardEscape(v('email')));
          if (v('url')) lines.push('URL:' + vcardEscape(v('url')));
          lines.push('END:VCARD');
          return lines.join('\r\n');
        }
      }
      return '';
    }

    function render() {
      const type = currentType();
      for (const fs of form.querySelectorAll('fieldset')) fs.hidden = fs.dataset.type !== type;

      const payload = buildPayload(type, new FormData(form));
      payloadEl.textContent = payload;
      preview.innerHTML = '';
      error.textContent = '';
      current = null;

      if (payload) {
        try {
          const qr = qrcode(0, 'M');
          qr.addData(payload);
          qr.make();
          current = qr;
          preview.innerHTML = qr.createSvgTag({ cellSize: 10, margin: 0, scalable: true });
        } catch (e) {
          error.textContent = 'Too much to fit in one QR code. Try shortening it.';
        }
      }
      pngButton.disabled = svgButton.disabled = !current;
    }

    function save(blob, name) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    pngButton.addEventListener('click', () => {
      const count = current.getModuleCount();
      const scale = Math.max(1, Math.floor(PNG_SIZE / count));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = count * scale;
      const c = canvas.getContext('2d');
      c.fillStyle = '#fff';
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = '#000';
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          if (current.isDark(row, col)) c.fillRect(col * scale, row * scale, scale, scale);
        }
      }
      canvas.toBlob((blob) => save(blob, 'qr-' + currentType() + '.png'), 'image/png');
    });

    svgButton.addEventListener('click', () => {
      save(new Blob([preview.innerHTML], { type: 'image/svg+xml' }), 'qr-' + currentType() + '.svg');
    });

    document.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener('change', render));
    form.addEventListener('input', render);
    form.addEventListener('submit', (e) => e.preventDefault());
    render();
  </script>
</body>
</html>`;
