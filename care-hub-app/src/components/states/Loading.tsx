import { strings } from "../../strings/en";

export interface LoadingProps {
  label?: string;
}

/** aria-live="polite" so a screen reader announces "Loading…" once,
 * without interrupting -- and the visible spinner is aria-hidden since
 * the text already carries the meaning. */
export function Loading({ label = strings.states.loading }: LoadingProps) {
  return (
    <div className="state-screen" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="state-screen__body">{label}</p>
    </div>
  );
}
