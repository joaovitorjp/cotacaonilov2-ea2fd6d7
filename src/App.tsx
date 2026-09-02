import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import CotacaoResposta from "./pages/CotacaoResposta.tsx";
import OAuthCallback from "./pages/OAuthCallback.tsx";
import OAuthConsent from "./pages/OAuthConsent.tsx";
import Perfil from "./pages/Perfil.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Assinatura from "./pages/Assinatura.tsx";
import AdminChaves from "./pages/AdminChaves.tsx";
import SubscriptionGate from "./components/SubscriptionGate.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<OAuthCallback />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/cotacao/:token" element={<CotacaoResposta />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <SubscriptionGate>
                    <Index />
                  </SubscriptionGate>
                </ProtectedRoute>
              }
            />
            <Route
              path="/assinatura"
              element={
                <ProtectedRoute>
                  <Assinatura />
                </ProtectedRoute>
              }
            />
            <Route path="/admin" element={<AdminChaves />} />

            <Route

              path="/perfil"
              element={
                <ProtectedRoute>
                  <SubscriptionGate>
                    <Perfil />
                  </SubscriptionGate>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
