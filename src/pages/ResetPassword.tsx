import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Lock, CheckCircle2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    if (!token) {
      setErrorMessage('Token de redefinição não encontrado ou expirado.')
      return
    }

    if (password.length < 8) {
      setErrorMessage('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }

    if (password !== passwordConfirm) {
      setErrorMessage('As senhas não coincidem.')
      return
    }

    setIsSubmitting(true)

    try {
      await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
      setSuccess(true)
      toast({
        title: 'Senha redefinida',
        description: 'Sua senha foi atualizada com sucesso. Acesse com as novas credenciais.',
      })
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao redefinir senha'
      setErrorMessage(
        msg.includes('token')
          ? 'Link de recuperação inválido ou expirado.'
          : 'Não foi possível redefinir a senha.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-ctx-0a0a0a flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md bg-ctx-111111 border border-ctx-262626 rounded-xl p-8 shadow-2xl relative z-10">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs text-ctx-9ca3af hover:text-ctx-brand mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar ao login
        </Link>

        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/40 text-[#22C55E] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-ctx-fg">Senha redefinida com sucesso!</h1>
            <p className="text-sm text-ctx-9ca3af">Redirecionando para a página de login...</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-ctx-fg">Nova senha</h1>
              <p className="text-xs text-ctx-9ca3af mt-1">
                Defina uma nova senha para a sua conta no CTX 2.0.
              </p>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            {!token && (
              <div className="mb-4 p-3 bg-amber-950/40 border border-amber-500/40 rounded-lg text-xs text-amber-300">
                Aviso: Nenhum token de recuperação detectado na URL. Utilize o link enviado por
                e-mail.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-xs uppercase tracking-wider text-ctx-9ca3af"
                >
                  Nova senha (mínimo 8 caracteres)
                </Label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ctx-9ca3af absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 bg-ctx-171717 border-ctx-262626 text-ctx-fg focus-visible:ring-[#FFD400]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="passwordConfirm"
                  className="text-xs uppercase tracking-wider text-ctx-9ca3af"
                >
                  Confirmar nova senha
                </Label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ctx-9ca3af absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="passwordConfirm"
                    type="password"
                    required
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 bg-ctx-171717 border-ctx-262626 text-ctx-fg focus-visible:ring-[#FFD400]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#FFD400] text-black font-bold hover:bg-[#E6BF00] py-5 mt-2"
              >
                {isSubmitting ? 'Atualizando senha...' : 'Salvar nova senha'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
