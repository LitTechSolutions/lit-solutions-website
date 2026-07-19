import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRoute } from "./auth/RequireRoute";
import { Login } from "./routes/Login";
import { ResetPassword } from "./routes/ResetPassword";
import { InvitationAccept } from "./routes/InvitationAccept";
import { MfaEnroll } from "./routes/MfaEnroll";
import { MfaEnrollVerify } from "./routes/MfaEnrollVerify";
import { MfaVerify } from "./routes/MfaVerify";
import { Dashboard } from "./routes/Dashboard";
import { Tickets } from "./routes/Tickets";
import { Checklists } from "./routes/Checklists";
import { ScopeOfWork } from "./routes/ScopeOfWork";
import { ChangeOrders } from "./routes/ChangeOrders";
import { Approvals } from "./routes/Approvals";
import { Organizations } from "./routes/Organizations";
import { Reminders } from "./routes/Reminders";
import { ServiceRecords } from "./routes/ServiceRecords";
import { WebsiteProfiles } from "./routes/WebsiteProfiles";
import { Subscriptions } from "./routes/Subscriptions";
import { TechnologyAssets } from "./routes/TechnologyAssets";
import { Entitlements } from "./routes/Entitlements";
import { Templates } from "./routes/Templates";
import { Metrics } from "./routes/Metrics";
import { AuditLog } from "./routes/AuditLog";
import { ActivityTimeline } from "./routes/ActivityTimeline";
import { ItSupport } from "./routes/ItSupport";
import { WorkLog } from "./routes/WorkLog";
import { Account } from "./routes/Account";
import { ProjectHub } from "./routes/ProjectHub";
import { YourWebsiteHub } from "./routes/YourWebsiteHub";
import { BillingHub } from "./routes/BillingHub";
import { SiteContent } from "./routes/SiteContent";
import { ImageLibrary } from "./routes/ImageLibrary";
import { CustomerSupport } from "./routes/CustomerSupport";
import { NotFound } from "./routes/NotFound";

export function App() {
  return (
    <BrowserRouter basename="/care-hub">
      <AuthProvider>
        <Routes>
          {/* Unauthenticated / pre-auth routes -- no app shell chrome. */}
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite" element={<InvitationAccept />} />
          <Route path="/mfa/enroll" element={<MfaEnroll />} />
          <Route path="/mfa/enroll-verify" element={<MfaEnrollVerify />} />
          <Route path="/mfa/verify" element={<MfaVerify />} />

          {/* Everything else requires a real signed-in session. */}
          <Route
            path="/*"
            element={
              <RequireAuth>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tickets" element={<Tickets />} />
                  <Route path="/checklists" element={<Checklists />} />
                  <Route path="/scope-of-work" element={<ScopeOfWork />} />
                  <Route path="/change-orders" element={<ChangeOrders />} />
                  <Route path="/approvals" element={<Approvals />} />
                  <Route
                    path="/organizations"
                    element={
                      <RequireRoute routeKey="organizations">
                        <Organizations />
                      </RequireRoute>
                    }
                  />
                  <Route path="/reminders" element={<Reminders />} />
                  <Route path="/service-records" element={<ServiceRecords />} />
                  <Route path="/website-profiles" element={<WebsiteProfiles />} />
                  <Route path="/subscriptions" element={<Subscriptions />} />
                  <Route path="/technology-assets" element={<TechnologyAssets />} />
                  <Route path="/entitlements" element={<Entitlements />} />
                  <Route
                    path="/templates"
                    element={
                      <RequireRoute routeKey="templates">
                        <Templates />
                      </RequireRoute>
                    }
                  />
                  <Route
                    path="/metrics"
                    element={
                      <RequireRoute routeKey="metrics">
                        <Metrics />
                      </RequireRoute>
                    }
                  />
                  <Route
                    path="/audit-log"
                    element={
                      <RequireRoute routeKey="auditLog">
                        <AuditLog />
                      </RequireRoute>
                    }
                  />
                  <Route
                    path="/activity-timeline"
                    element={
                      <RequireRoute routeKey="activityTimeline">
                        <ActivityTimeline />
                      </RequireRoute>
                    }
                  />
                  <Route
                    path="/it-support"
                    element={
                      <RequireRoute routeKey="itSupport">
                        <ItSupport />
                      </RequireRoute>
                    }
                  />
                  <Route
                    path="/work-log"
                    element={
                      <RequireRoute routeKey="workLog">
                        <WorkLog />
                      </RequireRoute>
                    }
                  />
                  <Route path="/account" element={<Account />} />
                  <Route path="/project" element={<ProjectHub />} />
                  <Route path="/your-website" element={<YourWebsiteHub />} />
                  <Route path="/billing" element={<BillingHub />} />
                  <Route
                    path="/site-content"
                    element={
                      <RequireRoute routeKey="siteContent">
                        <SiteContent />
                      </RequireRoute>
                    }
                  />
                  <Route
                    path="/image-library"
                    element={
                      <RequireRoute routeKey="imageLibrary">
                        <ImageLibrary />
                      </RequireRoute>
                    }
                  />
                  <Route
                    path="/customer-support"
                    element={
                      <RequireRoute routeKey="customerSupport">
                        <CustomerSupport />
                      </RequireRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
