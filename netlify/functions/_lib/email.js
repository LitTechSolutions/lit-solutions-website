// email.js -- shared outbound email helper, used for account verification
// and message notifications. Netlify Functions have no built-in way to
// send email, so this calls out to Resend's HTTP API
// (https://resend.com) -- a single POST request, no SDK/dependency needed.
//
// Requires two environment variables (Site settings > Environment
// variables in the Netlify dashboard):
//   RESEND_API_KEY = <API key from resend.com>
//   EMAIL_FROM     = e.g. "Little Technical Solutions LLC <dylan@lit-solutions.tech>"
//                    (the domain in this address must be verified with
//                    Resend first -- see README_ADMIN_SETUP.md)
//
// If either is unset, sendEmail() logs to the function console and
// resolves normally instead of throwing -- every caller in this codebase
// treats email as best-effort, so a site with no email provider configured
// yet still works end to end (verification tokens/messages just have to be
// retrieved from the Netlify Blobs dashboard instead of an inbox until
// then; see the escape hatches documented in README_ADMIN_SETUP.md).

async function sendEmail({ to, subject, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.log(`[email not configured -- would have sent] to=${to} subject="${subject}"`);
    return { sent: false, reason: "not configured" };
  }

  try {
    // attachments: [{ filename, content }] -- content is base64, no data: URI prefix
    // (Resend's /emails endpoint accepts this directly; see README_ADMIN_SETUP.md)
    const payload = { from, to, subject, html };
    if (attachments && attachments.length) payload.attachments = attachments;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email send failed] status=${res.status} ${detail}`);
      return { sent: false, reason: `provider error ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email send failed]", e.message);
    return { sent: false, reason: e.message };
  }
}

module.exports = { sendEmail };
