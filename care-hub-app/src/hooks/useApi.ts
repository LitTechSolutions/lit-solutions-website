import { useCallback, useEffect, useState } from "react";
import { isForbidden, isSessionExpired } from "../api/errors";

export type RemoteState<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "unauthorized" }
  | { status: "expired" };

/**
 * Runs an API call on mount (and whenever `deps` changes) and reduces
 * every outcome -- including the network/auth failure modes the API
 * client's typed errors distinguish -- into one of the states every
 * data-driven screen in this app needs to render: loading, success,
 * empty, error, unauthorized, or session-expired. `isEmpty` lets a
 * caller decide what "no data" means for its own shape (an empty array,
 * a null record, etc.) -- there's no single universal definition.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  isEmpty: (data: T) => boolean = () => false
): RemoteState<T> & { retry: () => void } {
  const [state, setState] = useState<RemoteState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const run = useCallback(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetcher()
      .then((data) => {
        if (cancelled) return;
        setState(isEmpty(data) ? { status: "empty" } : { status: "success", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isSessionExpired(err)) return setState({ status: "expired" });
        if (isForbidden(err)) return setState({ status: "unauthorized" });
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  useEffect(() => run(), [run]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
