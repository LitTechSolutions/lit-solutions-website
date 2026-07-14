// Domain type for F031 (Website Profile & Ownership Registry).

/**
 * @typedef {Object} WebsiteProfile
 * @property {string} id
 * @property {string} organizationId
 * @property {string} primaryUrl
 * @property {string} [domainRegistrar]
 * @property {string} [hostingProvider]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @param {Partial<WebsiteProfile>} candidate
 * @returns {asserts candidate is WebsiteProfile}
 */
function assertValidWebsiteProfile(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("websiteProfile: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("websiteProfile: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("websiteProfile: organizationId is required");
  }
  if (typeof candidate.primaryUrl !== "string" || !/^https?:\/\//.test(candidate.primaryUrl)) {
    throw new Error("websiteProfile: primaryUrl must be a valid http(s) URL");
  }
}

module.exports = { assertValidWebsiteProfile };
