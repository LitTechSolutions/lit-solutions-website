import { strings } from "../../strings/en";
import { StateScreen } from "./StateScreen";

export interface SessionExpiredStateProps {
  onSignInAgain: () => void;
}

export function SessionExpiredState({ onSignInAgain }: SessionExpiredStateProps) {
  return (
    <StateScreen
      variant="notice"
      icon="⏱"
      title={strings.states.sessionExpiredTitle}
      body={strings.states.sessionExpiredBody}
      action={
        <button type="button" className="btn btn-primary btn-small" onClick={onSignInAgain}>
          {strings.states.signInAgain}
        </button>
      }
    />
  );
}
