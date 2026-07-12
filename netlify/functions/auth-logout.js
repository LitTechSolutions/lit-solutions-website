// auth-logout.js -- session revoked on sign-out, not just expired.

const { readCookie, revokeSession, clearSessionCookie, json } = require("./_lib/auth_utils");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const token = readCookie(event, "lts_session");
  if (token) await revokeSession(token);
  return json(200, { message: "Signed out." }, { "Set-Cookie": clearSessionCookie() });
};
