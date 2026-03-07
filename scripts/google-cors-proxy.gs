/**
 * Google Apps Script CORS Proxy
 *
 * Setup (2 Minuten):
 * 1. Gehe zu https://script.google.com
 * 2. Neues Projekt erstellen
 * 3. Diesen Code einfuegen
 * 4. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. URL kopieren und als NEXT_PUBLIC_CF_PROXY_URL in Netlify setzen
 *    (Settings > Environment variables)
 *
 * Limits (kostenlos):
 * - 20.000 URL fetches/Tag
 * - 6 Minuten max pro Request
 * - Laeuft auf Googles Servern (gute IPs, selten geblockt)
 */

function doGet(e) {
  var url = e.parameter.url;

  if (!url) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Missing url parameter" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var response = UrlFetchApp.fetch(url, {
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    var content = response.getContentText();
    var contentType = response.getHeaders()["Content-Type"] || "text/html";

    return ContentService.createTextOutput(content)
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
