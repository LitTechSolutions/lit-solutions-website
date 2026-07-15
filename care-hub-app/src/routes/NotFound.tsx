import { strings } from "../strings/en";
import { StateScreen } from "../components/states/StateScreen";

export function NotFound() {
  return <StateScreen title={strings.states.notFoundTitle} body={strings.states.notFoundBody} icon="?" />;
}
