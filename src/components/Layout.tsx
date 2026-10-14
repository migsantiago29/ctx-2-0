import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Target,
  Workflow,
  Users,
  LogOut,
  Menu,
  X,
  Shield,
  Compass,
  Activity,
  Sliders,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectPermissions } from '@/hooks/useProjectPermissions'
import { NotificationBell } from './NotificationBell'

export default function Layout() {
  const { user, logout } = useAuth()
  const { canAccessProjects } = useProjectPermissions()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSignOut = () => {
    logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin'

  const baseNavItems = [
    { name: 'Meu Painel', path: '/', icon: Target },
    ...(canAccessProjects ? [{ name: 'Projetos', path: '/projetos', icon: Compass }] : []),
    { name: 'Pulso CTX', path: '/pulso-ctx', icon: Activity },
    { name: 'Fluxograma', path: '/fluxograma', icon: Workflow },
    { name: 'Organograma', path: '/organograma', icon: Users },
  ]
  const navItems = baseNavItems

  const adminNavItems = [
    { name: 'Ciclos & Adesão', path: '/admin/ciclos', icon: Sliders },
    { name: 'Importação & Acessos', path: '/admin/import', icon: Shield },
  ]

  const firstName = user?.name ? user.name.split(' ')[0] : 'Colaborador'
  const userArea = user?.area || 'CTX Cenografia'

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col md:flex-row font-sans">
      {/* DESKTOP SIDEBAR (~260px) */}
      <aside className="hidden md:flex flex-col w-[260px] bg-[#0D0D0D] border-r border-[#262626] shrink-0 fixed top-0 bottom-0 left-0 z-30">
        {/* Brand Header */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-[#262626]/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FFD400] text-black font-black flex items-center justify-center text-sm shadow-md shadow-[#FFD400]/20 tracking-wider">
              CTX
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                CTX 2.0
              </span>
              <span className="text-[11px] text-[#9CA3AF] tracking-wide">Cenografia & Stands</span>
            </div>
          </div>
          <div className="hidden md:block">
            <NotificationBell />
          </div>
        </div>

        {/* Navigation items */}
        <div className="flex-1 py-6 px-3 space-y-1.5">
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]/60">
            Navegação Principal
          </p>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'border-l-4 border-[#FFD400] bg-[#171717] text-[#FFD400] pl-3'
                      : 'text-[#9CA3AF] hover:text-white hover:bg-[#141414] border-l-4 border-transparent'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            )
          })}

          {isAdmin && (
            <>
              <p className="px-3 pt-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#FFD400]/80">
                Administração
              </p>
              {adminNavItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'border-l-4 border-[#FFD400] bg-[#171717] text-[#FFD400] pl-3'
                          : 'text-[#9CA3AF] hover:text-white hover:bg-[#141414] border-l-4 border-transparent'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.name}</span>
                  </NavLink>
                )
              })}
            </>
          )}
        </div>

        {/* User profile & Logout Footer */}
        <div className="p-4 border-t border-[#262626] bg-[#0A0A0A]/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[#1A1A1A] border border-[#262626] flex items-center justify-center text-[#FFD400] font-bold text-sm shrink-0">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{firstName}</p>
              <p className="text-xs text-[#9CA3AF] truncate">{userArea}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-[#262626] text-xs font-semibold text-[#9CA3AF] hover:text-red-400 hover:border-red-900/50 hover:bg-red-950/20 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER (< 768px) */}
      <header className="md:hidden flex items-center justify-between h-16 px-4 bg-[#0D0D0D] border-b border-[#262626] sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FFD400] text-black font-black flex items-center justify-center text-xs tracking-wider">
            CTX
          </div>
          <span className="font-bold text-sm tracking-tight text-white">CTX 2.0</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-[#9CA3AF] hover:text-white rounded-lg hover:bg-[#1A1A1A]"
            aria-label="Abrir menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER WITH BACKDROP */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed top-0 bottom-0 left-0 w-72 bg-[#0D0D0D] border-r border-[#262626] p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#262626]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#FFD400] text-black font-black flex items-center justify-center text-sm">
                    CTX
                  </div>
                  <span className="font-extrabold text-base text-white">CTX 2.0</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-[#9CA3AF] hover:text-white rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium ${
                          isActive
                            ? 'border-l-4 border-[#FFD400] bg-[#171717] text-[#FFD400]'
                            : 'text-[#9CA3AF] hover:text-white hover:bg-[#141414]'
                        }`
                      }
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span>{item.name}</span>
                    </NavLink>
                  )
                })}

                {isAdmin && (
                  <>
                    <p className="px-3 pt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#FFD400]/80">
                      Administração
                    </p>
                    {adminNavItems.map((item) => {
                      const Icon = item.icon
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium ${
                              isActive
                                ? 'border-l-4 border-[#FFD400] bg-[#171717] text-[#FFD400]'
                                : 'text-[#9CA3AF] hover:text-white hover:bg-[#141414]'
                            }`
                          }
                        >
                          <Icon className="w-5 h-5 shrink-0" />
                          <span>{item.name}</span>
                        </NavLink>
                      )
                    })}
                  </>
                )}
              </nav>
            </div>

            <div className="pt-6 border-t border-[#262626]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#1A1A1A] border border-[#262626] flex items-center justify-center text-[#FFD400] font-bold">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">
                    {user?.name || 'Colaborador'}
                  </p>
                  <p className="text-xs text-[#9CA3AF] truncate">{userArea}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-[#262626] text-sm font-semibold text-[#9CA3AF] hover:text-red-400 hover:border-red-900/50 transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 md:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto animate-fade-in">
          <Outlet />
        </main>

        {/* FOOTER (desktop only) */}
        <footer className="hidden md:block py-4 px-8 border-t border-[#262626] text-center text-xs text-[#9CA3AF]/70 bg-[#0A0A0A]">
          CTX 2.0 — Cenografia e Stands • Gestão Estratégica & Desempenho
        </footer>
      </div>
    </div>
  )
}
