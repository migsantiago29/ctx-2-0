/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'

// Pages
import Index from './pages/Index'
import Projetos from './pages/Projetos'
import PulsoCTX from './pages/PulsoCTX'
import Fluxograma from './pages/Fluxograma'
import Organograma from './pages/Organograma'
import AdminImport from './pages/AdminImport'
import AdminCiclos from './pages/AdminCiclos'
import AdminExportacao from './pages/AdminExportacao'
import RedefinirSenhaObrigatoria from './pages/RedefinirSenhaObrigatoria'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import ConfirmEmailChange from './pages/ConfirmEmailChange'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />
          <Route path="/redefinir-senha-obrigatoria" element={<RedefinirSenhaObrigatoria />} />

          {/* Protected Routes wrapped in ProtectedRoute + Corporate Layout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/projetos" element={<Projetos />} />
              <Route path="/projetos/:id" element={<Projetos />} />
              <Route path="/pulso-ctx" element={<PulsoCTX />} />
              <Route path="/fluxograma" element={<Fluxograma />} />
              <Route path="/organograma" element={<Organograma />} />
              <Route path="/admin/ciclos" element={<AdminCiclos />} />
              <Route path="/admin/import" element={<AdminImport />} />
              <Route path="/admin/export" element={<AdminExportacao />} />
            </Route>
          </Route>

          {/* Fallback 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
