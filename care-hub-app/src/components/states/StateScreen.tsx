import type { ReactNode } from "react";

export interface StateScreenProps {
  variant?: "default" | "error" | "notice";
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}

/**
 * Shared shape for every "there's nothing normal to show right now"
 * screen (empty, error, unauthorized, session-expired). One accessible
 * primitive, not five near-duplicate components -- callers below this
 * file supply the copy/icon/action, this owns the layout, semantics,
 * and color variant.
 */
export function StateScreen({ variant = "default", icon, title, body, action }: StateScreenProps) {
  const className = variant === "default" ? "state-screen" : `state-screen state-screen--${variant}`;
  const role = variant === "error" ? "alert" : "status";
  return (
    <div className={className} role={role}>
      {icon ? (
        <span className="state-screen__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="state-screen__title">{title}</p>
      {body ? <p className="state-screen__body">{body}</p> : null}
      {action}
    </div>
  );
}
