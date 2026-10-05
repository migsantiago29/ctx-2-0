import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Mail, Lock, Building2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

const CTX_AREAS = [
  'Marketing',
  'Vendas/Atendimento',
  'Orçamento',
  'Compras',
  'Almoxarifado',
  'PCP',
  'Gestão de Projetos',
  'Produção de Campo',
  'Financeiro',
  'RH',
  'Arquitetura',
]

export default function Signup() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [area, setArea] = useState('Gestão de Projetos')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    if (password.length < 8) {
      setErrorMessage('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    if (password !== passwordConfirm) {
      setErrorMessage('As senhas não coincidem.')
      return
    }

    setIsSubmitting(true)

    try {
      await pb.collection('users').create({
        name: name.trim(),
        email: email.trim(),
        password,
        passwordConfirm,
        area,
      })

      // Send verification email
      try {
        await pb.collection('users').requestVerification(email.trim())
      } catch {
        /* intentionally ignored */
      }

      toast({
        title: 'Conta criada com sucesso!',
        description: 'Enviamos uma confirmação para seu e-mail. Faça login para acessar o CTX 2.0.',
      })

      navigate('/login', { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar conta'
      setErrorMessage(
        msg.includes('email')
          ? 'Este e-mail já está cadastrado no sistema.'
          : 'Não foi possível cadastrar a conta. Verifique os dados.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 relative overflow-hidden">
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full pointer-events-none opacity-20 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(255,212,0,0.8) 0%, rgba(10,10,10,0) 70%)',
        }}
      />

      <div className="w-full max-w-md bg-[#111111] border border-[#262626] rounded-xl p-8 shadow-2xl relative z-10">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#FFD400] mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar ao login
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#FFD400] text-black font-black flex items-center justify-center text-base">
            CTX
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Criar nova conta</h1>
            <p className="text-xs text-[#9CA3AF]">Cadastro de colaborador da CTX</p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs uppercase tracking-wider text-[#9CA3AF]">
              Nome completo
            </Label>
            <div className="relative">
              <User className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="pl-9 bg-[#171717] border-[#262626] text-white focus-visible:ring-[#FFD400]"
              />
            </div>
          </div>

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
                placeholder="nome@ctxcenografia.com.br"
                className="pl-9 bg-[#171717] border-[#262626] text-white focus-visible:ring-[#FFD400]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="area" className="text-xs uppercase tracking-wider text-[#9CA3AF]">
              Área de atuação
            </Label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-md bg-[#171717] border border-[#262626] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD400]"
              >
                {CTX_AREAS.map((a) => (
                  <option key={a} value={a} className="bg-[#171717] text-white">
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs uppercase tracking-wider text-[#9CA3AF]">
              Senha (mínimo 8 caracteres)
            </Label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 bg-[#171717] border-[#262626] text-white focus-visible:ring-[#FFD400]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="passwordConfirm"
              className="text-xs uppercase tracking-wider text-[#9CA3AF]"
            >
              Confirmar senha
            </Label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="passwordConfirm"
                type="password"
                required
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                className="pl-9 bg-[#171717] border-[#262626] text-white focus-visible:ring-[#FFD400]"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#FFD400] text-black font-bold hover:bg-[#E6BF00] py-5 mt-2"
          >
            {isSubmitting ? 'Criando conta...' : 'Criar conta'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-[#9CA3AF]">
          Já possui conta?{' '}
          <Link to="/login" className="text-[#FFD400] hover:underline font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
