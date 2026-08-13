import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { ActiveMemberOnly, GuestOnly, OfficeOnly, PendingMemberOnly } from "./auth/RouteGuards";
import { ContributionsPage } from "./pages/member/ContributionsPage";
import { MemberDashboardPage } from "./pages/member/MemberDashboardPage";
import { MemberQrPage } from "./pages/member/MemberQrPage";
import { ProfilePage } from "./pages/member/ProfilePage";
import { AccessRequestsPage } from "./pages/office/AccessRequestsPage";
import { CashPaymentPage } from "./pages/office/CashPaymentPage";
import { ExcelImportPage } from "./pages/office/ExcelImportPage";
import { MemberDetailPage } from "./pages/office/MemberDetailPage";
import { MembersPage } from "./pages/office/MembersPage";
import { OfficeDashboardPage } from "./pages/office/OfficeDashboardPage";
import { OfficeMorePage } from "./pages/office/OfficeMorePage";
import { PaymentHistoryPage } from "./pages/office/PaymentHistoryPage";
import { RemindersPage } from "./pages/office/RemindersPage";
import { ScannerPage } from "./pages/office/ScannerPage";
import { AdministrationPage } from "./pages/office/AdministrationPage";
import { ContributionRulesPage } from "./pages/office/ContributionRulesPage";
import { ResponsiblesPage } from "./pages/office/ResponsiblesPage";
import { AuditLogPage } from "./pages/office/AuditLogPage";
import { ExportsBackupsPage } from "./pages/office/ExportsBackupsPage";
import { CalendarPage } from "./pages/office/CalendarPage";
import { AlertsPage } from "./pages/office/AlertsPage";
import { OfficesPage } from "./pages/office/OfficesPage";
import { ApprovalPage } from "./pages/public/ApprovalPage";
import { LoginPage } from "./pages/public/LoginPage";
import { RegisterPage } from "./pages/public/RegisterPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/membre" replace />} />
          <Route path="/connexion" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/inscription" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route path="/validation" element={<PendingMemberOnly><ApprovalPage /></PendingMemberOnly>} />

          <Route path="/membre" element={<ActiveMemberOnly><MemberDashboardPage /></ActiveMemberOnly>} />
          <Route path="/membre/cotisations" element={<ActiveMemberOnly><ContributionsPage /></ActiveMemberOnly>} />
          <Route path="/membre/qr" element={<ActiveMemberOnly><MemberQrPage /></ActiveMemberOnly>} />
          <Route path="/membre/compte" element={<ActiveMemberOnly><ProfilePage /></ActiveMemberOnly>} />

          <Route path="/bureau" element={<OfficeOnly><OfficeDashboardPage /></OfficeOnly>} />
          <Route path="/bureau/membres" element={<OfficeOnly><MembersPage /></OfficeOnly>} />
          <Route path="/bureau/membre" element={<OfficeOnly><MemberDetailPage /></OfficeOnly>} />
          <Route path="/bureau/scanner" element={<OfficeOnly roles={["data_entry", "treasurer", "admin"]}><ScannerPage /></OfficeOnly>} />
          <Route path="/bureau/paiement" element={<OfficeOnly roles={["treasurer", "admin"]}><CashPaymentPage /></OfficeOnly>} />
          <Route path="/bureau/validations" element={<OfficeOnly roles={["controller", "treasurer", "admin"]}><AccessRequestsPage /></OfficeOnly>} />
          <Route path="/bureau/paiements" element={<OfficeOnly roles={["controller", "treasurer", "admin"]}><PaymentHistoryPage /></OfficeOnly>} />
          <Route path="/bureau/import-excel" element={<OfficeOnly roles={["admin"]}><ExcelImportPage /></OfficeOnly>} />
          <Route path="/bureau/rappels" element={<OfficeOnly roles={["controller", "treasurer", "admin"]}><RemindersPage /></OfficeOnly>} />
          <Route path="/bureau/administration" element={<OfficeOnly roles={["data_entry", "admin"]}><AdministrationPage /></OfficeOnly>} />
          <Route path="/bureau/categories" element={<OfficeOnly roles={["admin"]}><ContributionRulesPage /></OfficeOnly>} />
          <Route path="/bureau/responsables" element={<OfficeOnly roles={["admin"]}><ResponsiblesPage /></OfficeOnly>} />
          <Route path="/bureau/journal" element={<OfficeOnly roles={["admin"]}><AuditLogPage /></OfficeOnly>} />
          <Route path="/bureau/sauvegardes" element={<OfficeOnly roles={["admin"]}><ExportsBackupsPage /></OfficeOnly>} />
          <Route path="/bureau/calendrier" element={<OfficeOnly><CalendarPage /></OfficeOnly>} />
          <Route path="/bureau/alertes" element={<OfficeOnly><AlertsPage /></OfficeOnly>} />
          <Route path="/bureau/bureaux" element={<OfficeOnly><OfficesPage /></OfficeOnly>} />
          <Route path="/bureau/plus" element={<OfficeOnly><OfficeMorePage /></OfficeOnly>} />
          <Route path="*" element={<Navigate to="/membre" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
