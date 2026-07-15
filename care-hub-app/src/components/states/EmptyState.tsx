import { strings } from "../../strings/en";
import { StateScreen } from "./StateScreen";

export interface EmptyStateProps {
  title?: string;
  body?: string;
}

export function EmptyState({ title = strings.states.emptyTitle, body = strings.states.emptyBody }: EmptyStateProps) {
  return <StateScreen title={title} body={body} icon="—" />;
}
