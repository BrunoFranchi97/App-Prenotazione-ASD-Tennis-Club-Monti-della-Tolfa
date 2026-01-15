import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MemberDashboard from "./pages/MemberDashboard";
import BookingCalendar from "./pages/BookingCalendar";
import AdminDashboard from "./pages/AdminDashboard";
import AuthLayout from "./components/AuthLayout";
import ForgotPassword from "./pages/ForgotPassword";
import BookingConfirmation from "./pages/BookingConfirmation";
import BookingHistory from "./pages/BookingHistory";
import ThirdPartyBooking from "./pages/ThirdPartyBooking";
import AdminReservations from "./pages/AdminReservations";
import AdminManageSchedules from "./pages/AdminManageSchedules";
import AdminBlockSlots from "./pages/AdminBlockSlots";
import AdminUsageStats from "./pages/AdminUsageStats";
import FindMatch from "./pages/FindMatch";
import MedicalCertificates from "./pages/MedicalCertificates";
import AdminApprovals from "./pages/AdminApprovals";
import EmailVerificationHandler from "./components/EmailVerificationHandler"; // Aggiunto

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthLayout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/dashboard" element={<MemberDashboard />} />
            <Route path="/book" element={<BookingCalendar />} />
            <Route path="/booking-confirmation" element={<BookingConfirmation />} />
            <Route path="/history" element={<BookingHistory />} />
            <Route path="/book-for-third-party" element={<ThirdPartyBooking />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/reservations" element={<AdminReservations />} />
            <Route path="/admin/manage-schedules" element={<AdminManageSchedules />} />
            <Route path="/admin/block-slots" element={<AdminBlockSlots />} />
            <Route path="/admin/usage-stats" element={<AdminUsageStats />} />
            <Route path="/admin/approvals" element={<AdminApprovals />} />
            <Route path="/find-match" element={<FindMatch />} />
            <Route path="/medical-certificates" element={<MedicalCertificates />} />
            <Route path="/auth/verify" element={<EmailVerificationHandler />} /> {/* Nuova route per verifica email */}
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;