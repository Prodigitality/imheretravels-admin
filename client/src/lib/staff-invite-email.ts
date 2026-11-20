/**
 * The email an invited staff member gets (POST /api/users/invite): set your
 * own password, then finish sign-up. Same branded layout as the team emails.
 */

const LOGO_URL =
  "https://firebasestorage.googleapis.com/v0/b/imheretravels-a3f81.firebasestorage.app/o/website-assets%2Fbd35684dc8836c690d9d6b4bc9e112b3eb54301a4109bc36e7eb06571c66a0c1.png?alt=media&token=2ec27c63-b0cc-444e-b8d9-579b615855c6";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface InviteEmailInput {
  firstName: string;
  role: "viewer" | "agent";
  inviterName: string;
  setPasswordUrl: string;
  signupUrl: string;
}

export function buildInviteEmail(i: InviteEmailInput) {
  const access =
    i.role === "viewer"
      ? "read-only access to Bookings, Tour Packages, Enquiries and Transactions"
      : "an agent account";
  const step = (n: number, html: string) =>
    `<tr><td style="vertical-align:top;padding:6px 12px 6px 0;font-weight:bold;color:#EF3340;">${n}</td><td style="padding:6px 0;">${html}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F2F0EE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F0EE;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;font-family:Arial,Helvetica,sans-serif;color:#1C1F2A;">
<tr><td style="padding:28px 32px 8px 32px;"><img src="${LOGO_URL}" alt="I'm Here Travels" width="160" style="display:block;border:0;height:auto;"/></td></tr>
<tr><td style="padding:8px 32px 32px 32px;font-size:15px;line-height:1.6;">
<h1 style="margin:0 0 16px 0;font-size:22px;">${i.firstName ? `Hi ${esc(i.firstName)}, you're` : "You're"} invited to the I'm Here Travels admin</h1>
<p style="margin:0 0 16px 0;">${esc(i.inviterName)} has given you ${esc(access)}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
${step(1, "Choose your password with the button below.")}
${step(2, `Then go to <a href="${esc(i.signupUrl)}" style="color:#EF3340;">the admin sign-up page</a>, enter this email address and your new password, add your name and accept the terms.`)}
${step(3, "That's it: your account is already approved, so you can sign in straight away.")}
</table>
<p style="margin:0 0 24px 0;"><a href="${esc(i.setPasswordUrl)}" style="display:inline-block;background:#EF3340;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;">Choose your password</a></p>
<p style="margin:0;font-size:12px;color:#959595;">The password link works once and expires after a while. If it has, ask for a new invite. If you weren't expecting this, you can ignore this email.</p>
</td></tr>
</table>
</td></tr></table></body></html>`;
  return { subject: "You're invited to the I'm Here Travels admin", html };
}
