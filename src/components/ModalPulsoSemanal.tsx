import { useState } from 'react'
import { X, Send, Loader2, CheckCircle2, Clock, Sparkles, ArrowRight, Flame } from 'lucide-react'
import type { Ciclo, MetaWithDetails } from '@/types/ctx'
import { rotinaService } from '@/services/rotinaService'
import { toast } from '@/hooks/use-toast'

interface ModalPulsoSemanalProps {
  ciclo: Ciclo
  metas: MetaWithDetails[]
  onClose: () => void
  onSuccess: () => void
}

type RespostaTipo = 'avancei' | 'sem_avanco' | 'travado'

export function ModalPulsoSemanal({ ciclo, metas, onClose, onSuccess }: ModalPulsoSemanalProps) {
  // Estado local para cada meta: resposta e texto de bloqueio opcional
  const [respostas, setRespostas] = useState<
    Record<string, { resposta: RespostaTipo; bloqueio_texto: string }>
  >(() => {
    const initial: Record<string, { resposta: RespostaTipo; bloqueio_texto: string }> = {}
    metas.forEach((m) => {
      // Pré-preenche se já tiver pulso anterior
      initial[m.id] = {
        resposta: m.ultimoPulso?.resposta || 'avancei',
        bloqueio_texto: m.ultimoPulso?.bloqueio_texto || '',
      }
    })
    return initial
  })

  const [saving, setSaving] = useState(false)

  const handleSelectResposta = (metaId: string, resposta: RespostaTipo) => {
    setRespostas((prev) => ({
      ...prev,
      [metaId]: {
        ...prev[metaId],
        resposta,
      },
    }))
  }

  const handleBloqueioChange = (metaId: string, texto: string) => {
    setRespostas((prev) => ({
      ...prev,
      [metaId]: {
        ...prev[metaId],
        bloqueio_texto: texto,
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const itens = metas.map((m) => ({
        meta_id: m.id,
        resposta: respostas[m.id]?.resposta || 'avancei',
        bloqueio_texto: respostas[m.id]?.bloqueio_texto || '',
      }))

      await rotinaService.salvarPulsos(ciclo.id, itens)
      toast({
        title: 'Pulso semanal enviado!',
        description: 'Seu acompanhamento rápido foi registrado com sucesso.',
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      console.error('Erro ao enviar pulso semanal:', err)
      toast({
        title: 'Erro ao salvar pulso',
        description: err instanceof Error ? err.message : 'Não foi possível salvar.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl max-h-[90vh] bg-[#111111] border border-[#2B2B2B] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#262626] bg-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FFD400] text-black font-black flex items-center justify-center text-xs">
              1m
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5">
                Pulso Semanal — {ciclo.titulo || ciclo.referencia}
              </h2>
              <p className="text-[11px] text-[#9CA3AF]">
                Check-in ultrarrápido (1 toque por meta) para manter o ritmo da CTX
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#1F1F1F] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {metas.map((meta, idx) => {
            const current = respostas[meta.id] || { resposta: 'avancei', bloqueio_texto: '' }
            const isTravado = current.resposta === 'travado'

            return (
              <div
                key={meta.id}
                className="p-4 rounded-xl bg-[#161616] border border-[#262626] space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[#202020] text-[#FFD400] font-bold">
                        {meta.codigo}
                      </span>
                      {meta.expand?.projeto && (
                        <span className="text-[10px] text-[#9CA3AF]">
                          {meta.expand.projeto.codigo}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xs font-bold text-white leading-snug">{meta.titulo}</h3>
                  </div>
                  <span className="text-[10px] font-mono text-[#666]">
                    #{idx + 1} de {metas.length}
                  </span>
                </div>

                {/* 3 Botões de Escolha Rápida (1 toque) */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectResposta(meta.id, 'avancei')}
                    className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      current.resposta === 'avancei'
                        ? 'bg-[#22C55E] text-black shadow-md shadow-[#22C55E]/20'
                        : 'bg-[#1F1F1F] text-[#9CA3AF] hover:text-white hover:bg-[#282828] border border-[#333]'
                    }`}
                  >
                    <span>👍</span>
                    <span>Avancei</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectResposta(meta.id, 'sem_avanco')}
                    className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      current.resposta === 'sem_avanco'
                        ? 'bg-[#EAB308] text-black shadow-md shadow-[#EAB308]/20'
                        : 'bg-[#1F1F1F] text-[#9CA3AF] hover:text-white hover:bg-[#282828] border border-[#333]'
                    }`}
                  >
                    <span>⏸️</span>
                    <span>Sem avanço</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectResposta(meta.id, 'travado')}
                    className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      current.resposta === 'travado'
                        ? 'bg-[#EF4444] text-white shadow-md shadow-[#EF4444]/20'
                        : 'bg-[#1F1F1F] text-[#9CA3AF] hover:text-white hover:bg-[#282828] border border-[#333]'
                    }`}
                  >
                    <span>🚨</span>
                    <span>Travado</span>
                  </button>
                </div>

                {/* Campo opcional "Algo te travando?" */}
                <div className="pt-1">
                  <input
                    type="text"
                    value={current.bloqueio_texto}
                    onChange={(e) => handleBloqueioChange(meta.id, e.target.value)}
                    placeholder={
                      isTravado
                        ? 'O que está te travando? (opcional)'
                        : 'Algo te travando? (opcional)'
                    }
                    className="w-full bg-[#111111] border border-[#2B2B2B] focus:border-[#FFD400] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#555] outline-none transition-colors"
                  />
                </div>
              </div>
            )
          })}

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 px-4 bg-[#FFD400] hover:bg-[#E5BE00] text-black font-extrabold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#FFD400]/20 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando pulso...</span>
                </>
              ) : (
                <>
                  <span>Concluir Pulso Semanal</span>
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
