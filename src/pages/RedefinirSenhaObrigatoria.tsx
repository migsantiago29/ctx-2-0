import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, KeyRound, ShieldAlert, CheckCircle2, ArrowRight } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import { TourPrimeiroAcesso } from '@/components/TourPrimeiroAcesso'

export default function RedefinirSenhaObrigatoria() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [showTour, setShowTour] = useState(false)

  if (!user) {
    navigate('/login')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 8) {
      setErrorMsg('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }

    if (password === 'CTX@2027') {
      setErrorMsg('A nova senha não pode ser a senha provisória CTX@2027.')
      return
    }

    if (password !== passwordConfirm) {
      setErrorMsg('A confirmação da senha não confere.')
      return
    }

    setLoading(true)
    try {
      const userEmail = user.email

      // Chamar endpoint seguro do servidor para primeiro acesso
      const response = await pb.send('/backend/v1/ctx/first-access-password', {
        method: 'POST',
        body: {
          password,
          passwordConfirm,
        },
      })

      if (!response || !response.success) {
        throw new Error(response?.message || 'Falha ao redefinir senha no servidor.')
      }

      // Reautenticar silenciosamente com a nova senha para garantir que o token JWT seja renovado
      try {
        if (userEmail) {
          await pb.collection('users').authWithPassword(userEmail, password)
        } else {
          await refreshUser()
        }
      } catch (authErr) {
        console.warn('Reautenticação silenciosa pós-troca falhou, tentando refreshUser:', authErr)
        await refreshUser()
      }

      toast({
        title: 'Senha alterada com sucesso!',
        description: 'Bem-vindo ao CTX 2.0!',
      })

      setShowTour(true)
    } catch (err: unknown) {
      console.error('Erro ao redefinir senha:', err)
      let msg = 'Não foi possível redefinir a senha.'
      if (err instanceof Error) {
        msg = err.message
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        msg = String((err as { message: unknown }).message)
      }
      setErrorMsg(msg)
      toast({
        title: 'Erro ao atualizar senha',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ctx-0a0a0a flex flex-col justify-center items-center p-4">
      {showTour && (
        <TourPrimeiroAcesso
          colaboradorNome={user?.name || 'Colaborador'}
          onComplete={() => navigate('/', { replace: true })}
        />
      )}
      <div className="w-full max-w-md bg-ctx-111111 border border-ctx-262626 rounded-2xl p-8 shadow-2xl relative">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#FFD400] text-black font-black flex items-center justify-center text-lg mb-3 shadow-md shadow-[#FFD400]/20">
            CTX
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFD400]/15 text-ctx-brand text-xs font-semibold mb-2 border border-[#FFD400]/30">
            <ShieldAlert className="w-3.5 h-3.5" />
            Primeiro Acesso — Redefinição Obrigatória
          </div>
          <h1 className="text-xl font-extrabold text-ctx-fg tracking-tight">
            Defina sua Senha Pessoal
          </h1>
          <p className="text-xs text-ctx-9ca3af mt-1.5 leading-relaxed">
            Olá, <strong className="text-ctx-fg">{user.name || user.email}</strong>. Por motivos de
            segurança da CTX Cenografia, você deve cadastrar uma nova senha pessoal antes de acessar
            a plataforma.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-500/30 rounded-lg text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ctx-d1d5db mb-1.5">
              Nova Senha (mínimo 8 dígitos)
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-ctx-9ca3af absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua nova senha"
                className="w-full bg-ctx-171717 border border-ctx-262626 rounded-lg pl-9 pr-3 py-2 text-sm text-ctx-fg focus:outline-none focus:border-[#FFD400] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ctx-d1d5db mb-1.5">
              Confirmar Nova Senha
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-ctx-9ca3af absolute left-3 top-3" />
              <input
                type="password"
                required
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Repita sua nova senha"
                className="w-full bg-ctx-171717 border border-ctx-262626 rounded-lg pl-9 pr-3 py-2 text-sm text-ctx-fg focus:outline-none focus:border-[#FFD400] transition-colors"
              />
            </div>
          </div>

          <div className="bg-ctx-141414 p-3 rounded-lg border border-ctx-262626 text-[11px] text-ctx-9ca3af space-y-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-ctx-brand" />
              <span>Mínimo 8 caracteres</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-ctx-brand" />
              <span>Diferente da senha provisória de primeiro acesso</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#FFD400] hover:bg-[#E5BE00] text-black font-bold rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-[#FFD400]/20 disabled:opacity-50"
          >
            {loading ? (
              <span>Salvando...</span>
            ) : (
              <>
                <span>Salvar Nova Senha e Continuar</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-ctx-262626 text-center">
          <button
            type="button"
            onClick={() => {
              logout()
              navigate('/login')
            }}
            className="text-xs text-ctx-9ca3af hover:text-ctx-fg transition-colors"
          >
            Sair e voltar para o login
          </button>
        </div>
      </div>
    </div>
  )
}
