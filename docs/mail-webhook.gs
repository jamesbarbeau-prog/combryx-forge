/**
 * Builder Guardian mail relay (Google Apps Script).
 * Sends the app's emails from YOUR Google Workspace account, with the signed PDF attached. Free, no new vendor.
 *
 * Setup (about 3 minutes):
 *  1. Go to script.google.com, New project, paste this whole file, replace the secret below with a long random phrase.
 *  2. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Click Deploy and allow access.
 *  3. Copy the Web app URL. In Supabase > Edge Functions > Secrets add:
 *       MAIL_WEBHOOK_URL    = that URL
 *       MAIL_WEBHOOK_SECRET = the same secret phrase
 *  The app is in TEST MODE: every email still goes only to the test address until MAIL_LIVE=true is set.
 */
var SECRET = 'CHANGE-ME-to-a-long-random-phrase';

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return ContentService.createTextOutput('denied');
    var to = (d.to || []).join(',');
    if (!to) return ContentService.createTextOutput('no recipient');
    var atts = (d.attachments || []).map(function (a) {
      return Utilities.newBlob(Utilities.base64Decode(a.content), 'application/pdf', a.filename);
    });
    GmailApp.sendEmail(to, d.subject, 'Open this email in an HTML-capable mail app.', { htmlBody: d.html, attachments: atts, name: 'Builder Guardian' });
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}

function doGet() { return ContentService.createTextOutput('Builder Guardian mail relay is running.'); }
