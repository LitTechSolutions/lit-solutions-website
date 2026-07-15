import { StateScreen } from "../components/states/StateScreen";

export interface ComingSoonProps {
  title: string;
}

/**
 * Honest placeholder for nav destinations this scaffold intentionally
 * doesn't build yet (tickets/checklists/account UI are steps 5-6 of
 * Dylan's directive, not this scaffolding pass) -- distinct from
 * NotFound, which means "this route doesn't exist at all."
 */
export function ComingSoon({ title }: ComingSoonProps) {
  return <StateScreen title={title} body="This screen hasn't been built yet." icon="…" />;
}
