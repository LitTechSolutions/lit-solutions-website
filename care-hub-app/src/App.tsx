import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { Login } from "./routes/Login";
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
import { NotFound } from "./routes/NotFound";

export function App() {
  return (
    <BrowserRouter basename="/care-hub">
      <AuthProvider>
        <Routes>
          {/* Unauthenticated / pre-auth routes -- no app shell chrome. */}
          <Route path="/login" element={<Login />} />
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
                  <Route path="/organizations" element={<Organizations />} />
                  <Route path="/reminders" element={<Reminders />} />
                  <Route path="/service-records" element={<ServiceRecords />} />
                  <Route path="/website-profiles" element={<WebsiteProfiles />} />
                  <Route path="/subscriptions" element={<Subscriptions />} />
                  <Route path="/technology-assets" element={<TechnologyAssets />} />
                  <Route path="/entitlements" element={<Entitlements />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/metrics" element={<Metrics />} />
                  <Route path="/audit-log" element={<AuditLog />} />
                  <Route path="/activity-timeline" element={<ActivityTimeline />} />
                  <Route path="/it-support" element={<ItSupport />} />
                  <Route path="/work-log" element={<WorkLog />} />
                  <Route path="/account" element={<Account />} />
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
