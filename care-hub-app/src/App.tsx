import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./routes/Dashboard";
import { ComingSoon } from "./routes/ComingSoon";
import { NotFound } from "./routes/NotFound";
import { strings } from "./strings/en";
import { api } from "./api/client";

export function App() {
  return (
    <BrowserRouter basename="/care-hub">
      <AppShell onSignOut={() => api.auth.logout().finally(() => window.location.assign("/care-hub/"))}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tickets" element={<ComingSoon title={strings.nav.tickets} />} />
          <Route path="/checklists" element={<ComingSoon title={strings.nav.checklists} />} />
          <Route path="/account" element={<ComingSoon title={strings.nav.account} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
