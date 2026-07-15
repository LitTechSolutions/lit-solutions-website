import { useCallback } from "react";
import { memberships } from "../api/memberships";
import { useApi } from "./useApi";

/**
 * Every organization the signed-in user belongs to. platform_admin/
 * technician accounts legitimately return an empty array (they aren't
 * org members -- see care_hub_auth.js) -- callers should treat that as
 * "this screen needs a real customer org, not you" rather than an error.
 */
export function useMemberships() {
  const fetchMemberships = useCallback(() => memberships.list(), []);
  return useApi(fetchMemberships, [], (data) => data.memberships.length === 0);
}
