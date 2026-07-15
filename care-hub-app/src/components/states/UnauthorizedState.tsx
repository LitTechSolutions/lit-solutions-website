import { strings } from "../../strings/en";
import { StateScreen } from "./StateScreen";

export function UnauthorizedState() {
  return <StateScreen variant="notice" icon="⚠" title={strings.states.unauthorizedTitle} body={strings.states.unauthorizedBody} />;
}
