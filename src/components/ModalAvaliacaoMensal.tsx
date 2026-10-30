import { useState } from 'react'
import {
  X,
  Send,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  HelpCircle,
  Link as LinkIcon,
  Upload,
  Check,
} from 'lucide-react'
import type { Ciclo, MetaWithDetails, Colaborador, FarolStatus } from '@/types/ctx'
import { rotinaService } from '@/services/rotinaService'
import { toast } from '@/hooks/use-toast'

interface ModalAvaliacaoMensalProps {
  ciclo: Ciclo
  metas: MetaWithDetails[]
  todosColaboradores: Colaborador[]
  onClose: () => void
  onSuccess: () => void
}

interface AvaliacaoFormState {
  farol: FarolStatus
  avancou: string
  proximo_passo: string
  ajuda_colaborador: string
  ajuda_texto: string
  evidencia_link: string
  evidencia_arquivo: File | null
}

export function ModalAvaliacaoMensal({
  ciclo,
  metas,
  todosColaboradores,
  onClose,
  onSuccess,
}: ModalAvaliacaoMensalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const currentMeta = metas[currentIndex]

  // Estado das respostas por meta
  const [formsState, setFormsState] = useState<Record<string, AvaliacaoFormState>>(() => {
    const init: Record<string, AvaliacaoFormState> = {}
    metas.forEach((m) => {
      const prev = m.ultimaAvaliacao
      init[m.id] = {
        farol: prev?.farol || 'verde',
        avancou: prev?.avancou || '',
        proximo_passo: prev?.proximo_passo || '',
        ajuda_colaborador: prev?.ajuda_colaborador || '',
        ajuda_texto: prev?.ajuda_texto || '',
        evidencia_link: prev?.evidencia_link || '',
        evidencia_arquivo: null,
      }
    })
    return init
  })

  const [saving, setSaving] = useState(false)

  if (!currentMeta) return null

  const currentState = formsState[currentMeta.id] || {
    farol: 'verde',
    avancou: '',
    proximo_passo: '',
    ajuda_colaborador: '',
    ajuda_texto: '',
    evidencia_link: '',
    evidencia_arquivo: null,
  }

  const updateCurrentState = (partial: Partial<AvaliacaoFormState>) => {
    setFormsState((prev) => ({
      ...prev,
      [currentMeta.id]: {
        ...currentState,
        ...partial,
      },
    }))
  }

  const isLast = currentIndex === metas.length - 1

  const handleNextOrFinish = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validações
    if (!currentState.avancou.trim()) {
      toast({
        title: 'Campo obrigatório',
        description: 'Preencha o campo "O que avançou no mês?".',
        variant: 'destructive',
      })
      return
    }

    if (!currentState.proximo_passo.trim()) {
      toast({
        title: 'Campo obrigatório',
        description: 'Preencha o campo "Próximo passo".',
        variant: 'destructive',
      })
      return
    }

    if (
      currentState.farol === 'concluida' &&
      !currentState.evidencia_link.trim() &&
      !currentState.evidencia_arquivo
    ) {
      toast({
        title: 'Evidência obrigatória',
        description: 'Para marcar a meta como "Concluída", forneça um link ou foto de evidência.',
        variant: 'destructive',
      })
      return
    }

    // Salvar meta atual
    setSaving(true)
    try {
      await rotinaService.salvarAvaliacao({
        ciclo_id: ciclo.id,
        meta_id: currentMeta.id,
        farol: currentState.farol,
        avancou: currentState.avancou,
        proximo_passo: currentState.proximo_passo,
        ajuda_colaborador: currentState.ajuda_colaborador || null,
        ajuda_texto: currentState.ajuda_texto,
        evidencia_link: currentState.evidencia_link,
        evidencia_arquivo: currentState.evidencia_arquivo,
      })

      if (isLast) {
        toast({
          title: 'Avaliação concluída!',
          description: 'Todas as metas foram avaliadas para este ciclo.',
        })
        onSuccess()
        onClose()
      } else {
        setCurrentIndex((i) => i + 1)
      }
    } catch (err: unknown) {
      console.error('Erro ao salvar avaliação:', err)
      toast({
        title: 'Erro ao salvar meta',
        description: err instanceof Error ? err.message : 'Falha na gravação.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const farolOptions: Array<{
    id: FarolStatus
    label: string
    desc: string
    color: string
    border: string
    bgSelected: string
  }> = [
    {
      id: 'verde',
      label: 'No ritmo',
      desc: 'No ritmo para cumprir no prazo',
      color: '#22C55E',
      border: 'border-[#22C55E]',
      bgSelected: 'bg-[#22C55E]/15 text-[#22C55E]',
    },
    {
      id: 'atencao',
      label: 'Atenção',
      desc: 'Em risco, mas com plano',
      color: '#F59E0B', // Âmbar conforme regra
      border: 'border-[#F59E0B]',
      bgSelected: 'bg-[#F59E0B]/15 text-[#F59E0B]',
    },
    {
      id: 'vermelho',
      label: 'Travado',
      desc: 'Não cumpre sem ajuda ou decisão',
      color: '#EF4444',
      border: 'border-[#EF4444]',
      bgSelected: 'bg-[#EF4444]/15 text-[#EF4444]',
    },
    {
      id: 'concluida',
      label: 'Concluída',
      desc: 'Critério da meta atingido',
      color: '#3B82F6',
      border: 'border-[#3B82F6]',
      bgSelected: 'bg-[#3B82F6]/15 text-[#3B82F6]',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[95vh] bg-ctx-0e0e0e border border-ctx-2b2b2b rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-ctx-262626 bg-ctx-141414 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#FFD400] text-black font-extrabold">
              {currentMeta.codigo}
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ctx-fg">
                Avaliação Mensal — {ciclo.titulo || ciclo.referencia}
              </h2>
              <p className="text-[11px] text-ctx-9ca3af">
                Meta {currentIndex + 1} de {metas.length}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ctx-9ca3af hover:text-ctx-fg hover:bg-ctx-1f1f1f transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar Top */}
        <div className="h-1 w-full bg-ctx-1a1a1a">
          <div
            className="h-full bg-[#FFD400] transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / metas.length) * 100}%` }}
          />
        </div>

        {/* Content Body */}
        <form onSubmit={handleNextOrFinish} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Título e Projeto da Meta */}
          <div className="p-4 rounded-xl bg-ctx-141414 border border-ctx-262626 space-y-1">
            <span className="text-[10px] font-mono text-ctx-9ca3af uppercase">
              {currentMeta.expand?.projeto?.nome || 'Projeto Estratégico'}
            </span>
            <h3 className="text-base font-extrabold text-ctx-fg leading-snug">
              {currentMeta.titulo}
            </h3>
            {currentMeta.descricao && (
              <p className="text-xs text-ctx-888888 pt-1">{currentMeta.descricao}</p>
            )}
          </div>

          {/* Farol (Obrigatório com explicação visível) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-ctx-fg uppercase tracking-wider">
              Farol da Meta <span className="text-ctx-brand">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {farolOptions.map((opt) => {
                const isSelected = currentState.farol === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateCurrentState({ farol: opt.id })}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                      isSelected
                        ? `${opt.border} ${opt.bgSelected} shadow-md`
                        : 'border-ctx-262626 bg-ctx-141414 text-ctx-9ca3af hover:bg-ctx-1a1a1a hover:text-ctx-fg'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 mt-0.5"
                      style={{ backgroundColor: opt.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-black uppercase tracking-wider flex items-center justify-between">
                        <span>{opt.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                      <p className="text-[11px] leading-tight opacity-90 mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* O que avançou no mês? (1 linha, obrigatório) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ctx-fg uppercase tracking-wider">
              O que avançou no mês? <span className="text-ctx-brand">*</span>
            </label>
            <input
              type="text"
              required
              value={currentState.avancou}
              onChange={(e) => updateCurrentState({ avancou: e.target.value })}
              placeholder="Ex.: Fechado piloto do ERP com 3 usuários da produção"
              className="w-full bg-ctx-141414 border border-ctx-2b2b2b focus:border-[#FFD400] rounded-xl px-3.5 py-2.5 text-xs text-ctx-fg placeholder-ctx-555555 outline-none transition-colors"
            />
          </div>

          {/* Próximo passo (1 linha, obrigatório) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ctx-fg uppercase tracking-wider">
              Próximo passo <span className="text-ctx-brand">*</span>
            </label>
            <input
              type="text"
              required
              value={currentState.proximo_passo}
              onChange={(e) => updateCurrentState({ proximo_passo: e.target.value })}
              placeholder="Ex.: Configurar módulo financeiro e treinar a equipe"
              className="w-full bg-ctx-141414 border border-ctx-2b2b2b focus:border-[#FFD400] rounded-xl px-3.5 py-2.5 text-xs text-ctx-fg placeholder-ctx-555555 outline-none transition-colors"
            />
          </div>

          {/* Precisa de ajuda? (opcional) */}
          <div className="p-4 rounded-xl bg-ctx-141414 border border-ctx-262626 space-y-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#F59E0B]" />
              <span className="text-xs font-bold text-ctx-fg uppercase tracking-wider">
                Precisa de ajuda? (Opcional)
              </span>
            </div>
            <div className="space-y-2">
              <select
                value={currentState.ajuda_colaborador}
                onChange={(e) => updateCurrentState({ ajuda_colaborador: e.target.value })}
                className="w-full bg-ctx-1c1c1c border border-ctx-2b2b2b focus:border-[#FFD400] rounded-lg px-3 py-2 text-xs text-ctx-fg outline-none cursor-pointer"
              >
                <option value="">Selecione um colaborador (se precisar de ajuda)</option>
                {todosColaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} {c.cargo ? `— ${c.cargo}` : ''}
                  </option>
                ))}
              </select>

              {currentState.ajuda_colaborador && (
                <input
                  type="text"
                  value={currentState.ajuda_texto}
                  onChange={(e) => updateCurrentState({ ajuda_texto: e.target.value })}
                  placeholder="Descreva brevemente o que você precisa..."
                  className="w-full bg-ctx-1c1c1c border border-ctx-2b2b2b focus:border-[#FFD400] rounded-lg px-3 py-2 text-xs text-ctx-fg placeholder-ctx-555555 outline-none"
                />
              )}
            </div>
          </div>

          {/* Evidência (opcional; obrigatória quando o farol for "Concluída") */}
          <div className="p-4 rounded-xl bg-ctx-141414 border border-ctx-262626 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ctx-fg uppercase tracking-wider flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-ctx-brand" />
                Evidência
                {currentState.farol === 'concluida' ? (
                  <span className="text-[#EF4444] text-[10px] lowercase font-bold">
                    (obrigatória para meta concluída)
                  </span>
                ) : (
                  <span className="text-ctx-666666 text-[10px] lowercase font-normal">(opcional)</span>
                )}
              </span>
            </div>

            <div className="space-y-2">
              <input
                type="url"
                value={currentState.evidencia_link}
                onChange={(e) => updateCurrentState({ evidencia_link: e.target.value })}
                placeholder="Link da evidência (Google Drive, Notion, Sistema...)"
                className="w-full bg-ctx-1c1c1c border border-ctx-2b2b2b focus:border-[#FFD400] rounded-lg px-3 py-2 text-xs text-ctx-fg placeholder-ctx-555555 outline-none"
              />

              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ctx-202020 hover:bg-ctx-282828 border border-ctx-333333 text-xs text-ctx-d1d5db transition-colors">
                  <Upload className="w-3.5 h-3.5 text-ctx-brand" />
                  <span>
                    {currentState.evidencia_arquivo
                      ? currentState.evidencia_arquivo.name
                      : 'Ou tirar foto / anexar arquivo do celular'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        updateCurrentState({ evidencia_arquivo: e.target.files[0] })
                      }
                    }}
                  />
                </label>
                {currentState.evidencia_arquivo && (
                  <button
                    type="button"
                    onClick={() => updateCurrentState({ evidencia_arquivo: null })}
                    className="text-[11px] text-[#EF4444] hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="pt-3 flex items-center justify-between gap-3 border-t border-ctx-262626">
            {currentIndex > 0 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => i - 1)}
                className="py-2.5 px-4 rounded-xl border border-ctx-2b2b2b bg-ctx-161616 hover:bg-ctx-202020 text-xs font-bold text-ctx-9ca3af hover:text-ctx-fg flex items-center gap-1.5 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="submit"
              disabled={saving}
              className="py-3 px-6 bg-[#FFD400] hover:bg-[#E5BE00] text-black font-extrabold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-[#FFD400]/20 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando meta...</span>
                </>
              ) : isLast ? (
                <>
                  <span>Concluir Avaliação do Mês</span>
                  <Send className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Próxima Meta</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
