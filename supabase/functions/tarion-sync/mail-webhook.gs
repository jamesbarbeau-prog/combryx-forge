/**
 * Mail relay for the Builder Guardian new-forms digest. Sends from YOUR Google Workspace account — no domain setup.
 *
 * 1. script.google.com > New project > paste this file.
 * 2. Project Settings > Script properties > add  MAIL_WEBHOOK_SECRET = a long random string you make up.
 * 3. Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone > Deploy. Copy the web app URL.
 * 4. In Supabase > Edge Functions > Secrets set:
 *      MAIL_WEBHOOK_URL     = the web app URL from step 3
 *      MAIL_WEBHOOK_SECRET  = the same string as step 2
 *
 * Without the secret the endpoint refuses to send anything, so the public URL cannot be used to send mail.
 */
function doPost(e) {
  var secret = PropertiesService.getScriptProperties().getProperty('MAIL_WEBHOOK_SECRET');
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return ContentService.createTextOutput('bad request'); }
  if (!secret || b.secret !== secret) return ContentService.createTextOutput('denied');
  var to = (b.to || []).filter(function (a) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a); });
  if (!to.length) return ContentService.createTextOutput('no valid recipient');
  MailApp.sendEmail({ to: to.join(','), subject: String(b.subject || 'Builder Guardian').slice(0, 200), htmlBody: String(b.html || ''), name: 'Builder Guardian' });
  return ContentService.createTextOutput('ok');
}
