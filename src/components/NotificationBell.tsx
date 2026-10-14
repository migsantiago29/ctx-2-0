import { useState, useEffect, useRef } from 'react'
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Flame,
  HelpCircle,
  MessageSquare,
  Sparkles,
  Calendar,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { rotinaService } from '@/services/rotinaService'
import type { Notificacao } from '@/types/ctx'
import pb from '@/lib/pocketbase/client'

export function NotificationBell() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const carregar = async () => {
    try {
      const list = await rotinaService.getNotificacoes()
      setNotificacoes(list)
    } catch (e) {
      console.error('Erro ao carregar notificacoes:', e)
    }
  }

  useEffect(() => {
    carregar()
    // Ouvir realtime de notificações para o usuário
    const unsubscribe = pb.collection('notificacoes').subscribe('*', () => {
      carregar()
    })

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      unsubscribe.then((unsub) => unsub?.()).catch(() => {})
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const unreadCount = notificacoes.filter((n) => !n.lida).length

  const handleMarcarLida = async (n: Notificacao) => {
    if (!n.lida) {
      await rotinaService.marcarNotificacaoLida(n.id)
      setNotificacoes((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, lida: true } : item)),
      )
    }
    if (n.link) {
      setOpen(false)
      navigate(n.link)
    }
  }

  const handleMarcarTodasLidas = async () => {
    const unreadIds = notificacoes.filter((n) => !n.lida).map((n) => n.id)
    if (unreadIds.length === 0) return
    setLoading(true)
    await rotinaService.marcarTodasLidas(unreadIds)
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })))
    setLoading(false)
  }

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'pedido_ajuda':
        return <HelpCircle className="w-4 h-4 text-[#F59E0B]" />
      case 'meta_concluida':
        return <Sparkles className="w-4 h-4 text-[#22C55E]" />
      case 'comentario':
        return <MessageSquare className="w-4 h-4 text-[#38BDF8]" />
      case 'lembrete':
        return <Flame className="w-4 h-4 text-[#EF4444]" />
      default:
        return <Calendar className="w-4 h-4 text-[#FFD400]" />
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] border border-[#262626] text-[#9CA3AF] hover:text-white transition-all flex items-center justify-center"
        aria-label="Notificações"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] h-[18px] rounded-full bg-[#FFD400] text-black text-[10px] font-black flex items-center justify-center shadow-md animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#111111] border border-[#2B2B2B] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-3.5 border-b border-[#262626] flex items-center justify-between bg-[#141414]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Notificações
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFD400]/15 text-[#FFD400] font-bold">
                  {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarcarTodasLidas}
                disabled={loading}
                className="text-[11px] text-[#9CA3AF] hover:text-[#FFD400] flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Marcar todas lidas</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[#1F1F1F]">
            {notificacoes.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#666]">
                Nenhuma notificação no momento.
              </div>
            ) : (
              notificacoes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleMarcarLida(n)}
                  className={`p-3.5 text-xs transition-colors cursor-pointer flex items-start gap-3 ${
                    n.lida
                      ? 'bg-transparent hover:bg-[#161616] text-[#A3A3A3]'
                      : 'bg-[#FFD400]/5 hover:bg-[#FFD400]/10 text-white font-medium'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-[#1C1C1C] border border-[#2B2B2B] shrink-0 mt-0.5">
                    {getIcon(n.tipo)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="leading-snug break-words">{n.texto}</p>
                    <span className="text-[10px] text-[#666] block mt-1">
                      {new Date(n.created).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {!n.lida && (
                    <span className="w-2 h-2 rounded-full bg-[#FFD400] shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
