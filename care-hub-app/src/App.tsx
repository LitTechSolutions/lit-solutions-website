import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { Login } from "./routes/Login";
import { MfaEnroll } from "./routes/MfaEnroll";
import { MfaVerify } from "./routes/MfaVerify";
import { Dashboard } from "./routes/Dashboard";
import { Tickets } from "./routes/Tickets";
import { Checklists } from "./routes/Checklists";
import { ComingSoon } from "./routes/ComingSoon";
import { NotFound } from "./routes/NotFound";
import { strings } from "./strings/en";

export function App() {
  return (
    <BrowserRouter basename="/care-hub">
      <AuthProvider>
        <Routes>
          {/* Unauthenticated / pre-auth routes -- no app shell chrome. */}
          <Route path="/login" element={<Login />} />
          <Route path="/mfa/enroll" element={<MfaEnroll />} />
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
                  <Route path="/account" element={<ComingSoon title={strings.nav.account} />} />
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
