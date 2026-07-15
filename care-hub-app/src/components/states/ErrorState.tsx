import { strings } from "../../strings/en";
import { StateScreen } from "./StateScreen";

export interface ErrorStateProps {
  title?: string;
  body?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = strings.states.errorTitle, body = strings.states.errorBody, onRetry }: ErrorStateProps) {
  return (
    <StateScreen
      variant="error"
      icon="!"
      title={title}
      body={body}
      action={
        onRetry ? (
          <button type="button" className="btn btn-ghost btn-small" onClick={onRetry}>
            {strings.states.retry}
          </button>
        ) : undefined
      }
    />
  );
}
