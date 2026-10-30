import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Nenhum código de verificação foi fornecido.')
      return
    }

    pb.collection('users')
      .confirmVerification(token)
      .then(() => {
        setStatus('success')
        setMessage('Conta verificada com sucesso. Faça login para continuar.')
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err?.message || 'Link de verificação inválido ou expirado.')
      })
  }, [token])

  return (
    <div className="min-h-screen bg-ctx-0a0a0a flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-ctx-111111 border border-ctx-262626 rounded-xl p-8 shadow-2xl text-center space-y-6">
        <div className="w-12 h-12 rounded-xl bg-[#FFD400] text-black font-black flex items-center justify-center text-lg mx-auto">
          CTX
        </div>

        {status === 'verifying' && (
          <div className="space-y-3">
            <div className="w-8 h-8 border-2 border-[#FFD400] border-t-transparent rounded-full animate-spin mx-auto" />
            <h1 className="text-lg font-bold text-ctx-fg">Validando e-mail...</h1>
            <p className="text-xs text-ctx-9ca3af">
              Aguarde enquanto confirmamos sua conta corporativa.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/40 text-[#22C55E] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-ctx-fg">Conta verificada</h1>
            <p className="text-sm text-ctx-9ca3af">{message}</p>
            <Link to="/login" className="block w-full">
              <Button className="w-full bg-[#FFD400] text-black font-bold hover:bg-[#E6BF00] flex items-center justify-center gap-2">
                Acessar minha conta
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-ctx-fg">Falha na verificação</h1>
            <p className="text-sm text-ctx-9ca3af">{message}</p>
            <Link to="/login" className="block w-full">
              <Button
                variant="outline"
                className="w-full border-ctx-262626 text-ctx-fg hover:bg-ctx-171717"
              >
                Voltar ao login
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
