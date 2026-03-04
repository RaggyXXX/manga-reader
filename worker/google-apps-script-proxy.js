/**
 * Google Apps Script CORS Proxy
 *
 * Setup (2 minutes):
 * 1. Go to https://script.google.com
 * 2. Create new project → paste this code
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the URL (looks like: https://script.google.com/macros/s/XXXX/exec)
 * 5. In Netlify: Site settings → Environment variables
 *    Add: NEXT_PUBLIC_CF_PROXY_URL = <your URL>
 * 6. Redeploy the site
 */

function doGet(e) {
  var url = e.parameter.url;
  if (!url) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Missing url param" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var allowed = ["manhwazone.to", "www.manhwazone.to", "c2.manhwatop.com", "c4.manhwatop.com"];
  try {
    var parsed = new URL(url);
    if (allowed.indexOf(parsed.hostname) === -1) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Host not allowed" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Invalid URL" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var response = UrlFetchApp.fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      followRedirects: true,
      muteHttpExceptions: true
    });

    return ContentService.createTextOutput(response.getContentText())
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message || String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
