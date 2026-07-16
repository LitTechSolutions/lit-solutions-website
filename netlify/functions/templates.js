// templates.js -- HTTP endpoint for F055 (Email & Communication Template
// Automation). Thin adapter over src/db/templateStore.js; rendering and
// the two-way variable-allowlist enforcement stay entirely in
// src/templates/templateRenderer.js.
//
// Templates are global (not org-scoped) configuration, reusing the
// existing platform.configure capability.
//
// Routes:
//   POST /templates -- create a template definition (platform_admin, platform.configure)
//   GET  /templates?key=&<variable-name>=<value>... -- render a template
//                    by key (platform_admin, platform.configure -- this
//                    endpoint is for staff previewing/using templates,
//                    e.g. composing a notification, not a customer-facing
//                    render)
//   GET  /templates (no `key` param at all) -- list every template
//                    definition (platform_admin, platform.configure --
//                    same auth as the render-by-key form above). Lets
//                    staff see which templates already exist instead of
//                    needing to already know a key out-of-band.

const { json } = require("./_lib/auth_utils");
const { authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createTemplateDefinition, renderTemplateByKey, listTemplateDefinitions } = require("../../src/db/templateStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleRender(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { key, subject, body: templateBody, allowedVariables } = body;
  if (!key || !subject || !templateBody || !allowedVariables) {
    return json(400, { error: "key, subject, body, and allowedVariables are required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "platform.configure");
  if (deny) return deny;

  try {
    const definition = await createTemplateDefinition({ key, subject, body: templateBody, allowedVariables }, { ...deps, actorId: auth.session.userId });
    return json(201, { definition });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleRender(event, deps) {
  const params = event.queryStringParameters || {};
  const { key, ...variables } = params;

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "platform.configure");
  if (deny) return deny;

  if (!key) {
    const definitions = await listTemplateDefinitions(deps);
    return json(200, { definitions });
  }

  try {
    const rendered = await renderTemplateByKey(key, variables, deps);
    return json(200, rendered);
  } catch (err) {
    return json(404, { error: err.message });
  }
}
