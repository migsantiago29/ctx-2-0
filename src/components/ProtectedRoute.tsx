import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 rounded-lg bg-[#FFD400] text-black font-extrabold flex items-center justify-center text-sm mb-4 animate-pulse">
          CTX
        </div>
        <p className="text-sm text-[#9CA3AF]">Carregando ambiente...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
