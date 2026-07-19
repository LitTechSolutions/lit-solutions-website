import { HubPage } from "../components/HubPage";
import { strings } from "../strings/en";

export function YourWebsiteHub() {
  return (
    <HubPage
      title={strings.yourWebsiteHub.title}
      intro={strings.yourWebsiteHub.intro}
      cards={[
        { to: "/website-profiles", title: strings.nav.websiteProfiles, body: strings.yourWebsiteHub.websiteProfilesBody },
        { to: "/technology-assets", title: strings.nav.technologyAssets, body: strings.yourWebsiteHub.technologyAssetsBody },
        { to: "/service-records", title: strings.nav.serviceRecords, body: strings.yourWebsiteHub.serviceRecordsBody },
        { to: "/reminders", title: strings.nav.reminders, body: strings.yourWebsiteHub.remindersBody },
      ]}
    />
  );
}
