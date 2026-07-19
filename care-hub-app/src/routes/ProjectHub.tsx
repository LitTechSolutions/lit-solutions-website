import { HubPage } from "../components/HubPage";
import { strings } from "../strings/en";

export function ProjectHub() {
  return (
    <HubPage
      title={strings.projectHub.title}
      intro={strings.projectHub.intro}
      cards={[
        { to: "/scope-of-work", title: strings.nav.scopeOfWork, body: strings.projectHub.scopeOfWorkBody },
        { to: "/change-orders", title: strings.nav.changeOrders, body: strings.projectHub.changeOrdersBody },
      ]}
    />
  );
}
