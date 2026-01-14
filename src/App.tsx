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
import ThirdPartyBooking from "./pages/ThirdPartyBooking"; // Importa la nuova pagina

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
            <Route path="/book-for-third-party" element={<ThirdPartyBooking />} /> {/* Aggiungi la rotta per la prenotazione conto terzi */}
            <Route path="/admin" element={<AdminDashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;