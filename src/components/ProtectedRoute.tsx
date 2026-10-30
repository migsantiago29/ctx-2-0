import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ctx-0a0a0a flex flex-col items-center justify-center text-ctx-fg">
        <div className="w-10 h-10 rounded-lg bg-[#FFD400] text-black font-extrabold flex items-center justify-center text-sm mb-4 animate-pulse">
          CTX
        </div>
        <p className="text-sm text-ctx-9ca3af">Carregando ambiente...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Redirecionamento obrigatório para troca de senha se must_change_password estiver ativo
  if (user.must_change_password) {
    return <Navigate to="/redefinir-senha-obrigatoria" replace />
  }

  return <Outlet />
}
