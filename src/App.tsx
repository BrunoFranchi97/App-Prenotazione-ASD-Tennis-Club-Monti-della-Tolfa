import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MemberDashboard from "./pages/MemberDashboard";
import BookingCalendar from "./pages/BookingCalendar";
import AdminDashboard from "./pages/AdminDashboard";
import AuthLayout from "./components/AuthLayout";
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from "./pages/UpdatePassword";
import BookingConfirmation from "./pages/BookingConfirmation";
import BookingHistory from "./pages/BookingHistory";
import ThirdPartyBooking from "./pages/ThirdPartyBooking";
import AdminReservations from "./pages/AdminReservations";
import AdminManageSchedules from "./pages/AdminManageSchedules";
import AdminBlockSlots from "./pages/AdminBlockSlots";
import AdminUsageStats from "./pages/AdminUsageStats";
import AdminApprovals from "./pages/AdminApprovals";
import AdminUserManagement from "./pages/AdminUserManagement";
import FindMatch from "./pages/FindMatch";
import MedicalCertificates from "./pages/MedicalCertificates";
import EmailVerificationHandler from "./components/EmailVerificationHandler";
import EditBookingGroup from "./pages/EditBookingGroup";
import MatchBooking from "./pages/MatchBooking";
import MyProfile from "./pages/MyProfile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
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
              <Route path="/update-password" element={<UpdatePassword />} />
              <Route path="/dashboard" element={<MemberDashboard />} />
              <Route path="/profile" element={<MyProfile />} />
              <Route path="/book" element={<BookingCalendar />} />
              <Route path="/booking-confirmation" element={<BookingConfirmation />} />
              <Route path="/history" element={<BookingHistory />} />
              <Route path="/edit-booking" element={<EditBookingGroup />} />
              <Route path="/book-for-third-party" element={<ThirdPartyBooking />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/reservations" element={<AdminReservations />} />
              <Route path="/admin/manage-schedules" element={<AdminManageSchedules />} />
              <Route path="/admin/block-slots" element={<AdminBlockSlots />} />
              <Route path="/admin/usage-stats" element={<AdminUsageStats />} />
              <Route path="/admin/approvals" element={<AdminApprovals />} />
              <Route path="/admin/users" element={<AdminUserManagement />} />
              <Route path="/find-match" element={<FindMatch />} />
              <Route path="/match-booking" element={<MatchBooking />} />
              <Route path="/medical-certificates" element={<MedicalCertificates />} />
              <Route path="/auth/verify" element={<EmailVerificationHandler />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthLayout>
        </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;