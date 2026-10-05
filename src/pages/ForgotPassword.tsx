import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      await pb.collection('users').requestPasswordReset(email.trim())
      setSubmitted(true)
    } catch (_) {
      // For security, show success anyway to prevent enumeration
      setSubmitted(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md bg-[#111111] border border-[#262626] rounded-xl p-8 shadow-2xl relative z-10">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#FFD400] mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar ao login
        </Link>

        {submitted ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#FFD400]/10 border border-[#FFD400]/40 text-[#FFD400] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-white">E-mail enviado!</h1>
            <p className="text-sm text-[#9CA3AF]">
              Verifique seu e-mail para redefinir sua senha. Caso a conta exista em nossa base, um
              link seguro foi enviado.
            </p>
            <Link to="/login">
              <Button className="w-full mt-4 bg-[#FFD400] text-black font-bold hover:bg-[#E6BF00]">
                Ir para o login
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-white">Recuperar senha</h1>
              <p className="text-xs text-[#9CA3AF] mt-1">
                Informe o seu e-mail corporativo cadastrado para receber as instruções de
                recuperação.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-[#9CA3AF]">
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
                    className="pl-9 bg-[#171717] border-[#262626] text-white focus-visible:ring-[#FFD400]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#FFD400] text-black font-bold hover:bg-[#E6BF00] py-5 mt-2"
              >
                {isSubmitting ? 'Enviando link...' : 'Enviar link de recuperação'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
