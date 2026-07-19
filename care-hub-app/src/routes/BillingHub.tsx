import { HubPage } from "../components/HubPage";
import { strings } from "../strings/en";

export function BillingHub() {
  return (
    <HubPage
      title={strings.billingHub.title}
      intro={strings.billingHub.intro}
      cards={[
        { to: "/subscriptions", title: strings.nav.subscriptions, body: strings.billingHub.subscriptionsBody },
        { to: "/entitlements", title: strings.nav.entitlements, body: strings.billingHub.entitlementsBody },
      ]}
    />
  );
}
