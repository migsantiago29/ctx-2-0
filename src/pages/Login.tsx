import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('miguel.santiago@ctxcenografia.com.br')
  const [password, setPassword] = useState('Skip@Pass')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (_) {
      setErrorMessage('Credenciais inválidas. Verifique seu e-mail e senha.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle yellow radial gradient background accent */}
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full pointer-events-none opacity-20 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(255,212,0,0.8) 0%, rgba(10,10,10,0) 70%)',
        }}
      />
      <div
        className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full pointer-events-none opacity-15 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(255,212,0,0.6) 0%, rgba(10,10,10,0) 70%)',
        }}
      />

      <div className="w-full max-w-md bg-[#111111] border border-[#262626] rounded-xl p-8 shadow-2xl relative z-10 transition-all">
        {/* CTX 2.0 Logo Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-[#FFD400] text-black font-black flex items-center justify-center text-xl tracking-wider shadow-lg shadow-[#FFD400]/20 mb-4">
            CTX
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CTX 2.0</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">Gestão Estratégica, Metas & Cenografia</p>
        </div>

        <div className="mb-6 text-center">
          <h2 className="text-lg font-semibold text-white">Acesse sua conta</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Visualize suas metas individuais e contribuições para os Projetos Estratégicos.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-sm text-red-400 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="email"
              className="text-xs uppercase tracking-wider text-[#9CA3AF] font-medium"
            >
              E-mail corporativo
            </Label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.nome@ctxcenografia.com.br"
                className="pl-9 bg-[#171717] border-[#262626] text-white placeholder:text-[#525252] focus-visible:ring-2 focus-visible:ring-[#FFD400] focus-visible:border-[#FFD400]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="password"
                className="text-xs uppercase tracking-wider text-[#9CA3AF] font-medium"
              >
                Senha
              </Label>
              <Link
                to="/forgot-password"
                className="text-xs text-[#FFD400] hover:text-[#E6BF00] transition-colors"
              >
                Esqueceu a senha?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 pr-10 bg-[#171717] border-[#262626] text-white placeholder:text-[#525252] focus-visible:ring-2 focus-visible:ring-[#FFD400] focus-visible:border-[#FFD400]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-white transition-colors"
                aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#FFD400] text-black font-bold hover:bg-[#E6BF00] active:scale-[0.98] transition-all py-5 mt-2 flex items-center justify-center gap-2"
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
            {!isSubmitting && <ArrowRight className="w-4 h-4" />}
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-[#262626] text-center space-y-2">
          <p className="text-xs text-[#9CA3AF]">
            Novo colaborador na CTX?{' '}
            <Link to="/signup" className="text-[#FFD400] font-medium hover:underline">
              Criar conta
            </Link>
          </p>
          <div className="bg-[#171717] p-2.5 rounded-lg border border-[#262626]/80 text-left">
            <p className="text-[11px] text-[#9CA3AF] uppercase tracking-wider font-semibold mb-1">
              Acesso Rápido de Demonstração
            </p>
            <p className="text-xs text-white/90 font-mono">miguel.santiago@ctxcenografia.com.br</p>
            <p className="text-xs text-[#9CA3AF] font-mono">Senha: Skip@Pass</p>
          </div>
        </div>
      </div>
    </div>
  )
}
