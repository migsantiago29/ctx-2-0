import { useEffect, useState, useCallback } from 'react'
import {
  Workflow,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  Building2,
  ArrowDown,
  CheckCircle2,
  Layers,
  Sparkles,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import useRealtime from '@/hooks/use-realtime'
import type { FluxogramaEtapa } from '@/types/ctx'

export default function Fluxograma() {
  const [etapas, setEtapas] = useState<FluxogramaEtapa[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchFluxograma = useCallback(async () => {
    try {
      const records = await pb.collection('fluxograma').getFullList<FluxogramaEtapa>({
        sort: 'ordem',
      })
      setEtapas(records)
      if (records.length > 0 && !expandedId) {
        // Expand first stage by default for immediate context
        setExpandedId(records[0].id)
      }
    } catch (err) {
      console.error('Error fetching fluxograma:', err)
    } finally {
      setLoading(false)
    }
  }, [expandedId])

  useEffect(() => {
    fetchFluxograma()
  }, [fetchFluxograma])

  // Real-time synchronization
  useRealtime<FluxogramaEtapa>('fluxograma', () => {
    fetchFluxograma()
  })

  const toggleAccordion = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="border-b border-[#262626] pb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold mb-2">
          <Workflow className="w-3.5 h-3.5" />
          Mapeamento Operacional End-to-End
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
          Fluxograma da Empresa
        </h1>
        <p className="text-sm text-[#9CA3AF] mt-1">
          Processos e evidências entre as áreas da CTX — do primeiro contato comercial com o cliente
          até a entrega e desmontagem do stand.
        </p>

        {/* Informative banner */}
        <div className="mt-4 p-3 bg-[#111] rounded-lg border border-[#262626] flex items-center gap-3 text-xs text-[#9CA3AF]">
          <span className="w-2 h-2 rounded-full bg-[#FFD400] shrink-0" />
          <span>
            Cada etapa representa uma transição de responsabilidade entre as 11 áreas da CTX, com
            garantia de evidência formal (Briefing, 3D, Orçamento, PCP ou Stand entregue).
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-28 bg-[#111111] border border-[#262626] rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : (
        /* Vertical Flow of Connected Nodes */
        <div className="relative py-4">
          <div className="space-y-0">
            {etapas.map((stage, index) => {
              const isExpanded = expandedId === stage.id
              const isLast = index === etapas.length - 1

              return (
                <div key={stage.id} className="relative">
                  {/* Stage Card */}
                  <div
                    onClick={() => toggleAccordion(stage.id)}
                    className={`bg-[#111111] border rounded-xl p-5 md:p-6 shadow-md transition-all duration-200 cursor-pointer ${
                      isExpanded
                        ? 'border-[#FFD400] ring-1 ring-[#FFD400]/50 shadow-xl'
                        : 'border-[#262626] hover:border-[#FFD400]/40 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Step number + titles */}
                      <div className="flex items-start gap-4 min-w-0">
                        {/* Step Number Badge */}
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#171717] border border-[#FFD400]/40 text-[#FFD400] font-black text-lg md:text-xl flex items-center justify-center shrink-0 shadow-sm">
                          {stage.ordem}
                        </div>

                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base md:text-lg font-bold text-white tracking-tight">
                              {stage.etapa}
                            </h3>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1A1A1A] border border-[#262626] text-xs font-medium text-[#FFD400]">
                              <Building2 className="w-3 h-3" />
                              {stage.area}
                            </span>
                          </div>

                          {/* Evidence output */}
                          <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
                            <FileCheck2 className="w-3.5 h-3.5 text-[#22C55E] shrink-0" />
                            <span>
                              Evidência / Entrega:{' '}
                              <strong className="text-white font-medium">
                                {stage.evidencia || 'Documento validado'}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Expand/Collapse Arrow */}
                      <div className="flex items-center gap-2 shrink-0 pt-1">
                        <span className="text-[11px] uppercase font-semibold text-[#9CA3AF] hidden sm:inline">
                          {isExpanded ? 'Ocultar' : 'Ver passos'}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-[#171717] border border-[#262626] flex items-center justify-center text-[#9CA3AF] group-hover:text-white">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[#FFD400]" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Accordion Content (Subpassos & Detalhes) */}
                    {isExpanded && (
                      <div className="mt-5 pt-5 border-t border-[#262626] space-y-4 animate-in fade-in slide-in-from-top-2 duration-250">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Subpassos ordenados */}
                          <div className="space-y-2 bg-[#161616] p-4 rounded-lg border border-[#262626]">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FFD400]">
                              <Layers className="w-3.5 h-3.5" />
                              Subpassos Operacionais
                            </div>
                            {stage.subpassos && stage.subpassos.length > 0 ? (
                              <ol className="space-y-2 pt-1 text-xs text-[#D1D5DB]">
                                {stage.subpassos.map((passo, pIndex) => (
                                  <li key={pIndex} className="flex items-start gap-2">
                                    <span className="w-4 h-4 rounded-full bg-[#1F1F1F] text-[#FFD400] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                      {pIndex + 1}
                                    </span>
                                    <span className="leading-relaxed">{passo}</span>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="text-xs text-[#525252]">
                                Nenhum subpasso discriminado.
                              </p>
                            )}
                          </div>

                          {/* Evidências e Saídas Formais */}
                          <div className="space-y-2 bg-[#161616] p-4 rounded-lg border border-[#262626] flex flex-col justify-between">
                            <div>
                              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#22C55E]">
                                <FileCheck2 className="w-3.5 h-3.5" />
                                Handoff & Evidência Formal
                              </div>
                              <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed">
                                Para liberar a próxima etapa, a área de{' '}
                                <strong className="text-white">{stage.area}</strong> deve emitir e
                                aprovar a evidência:
                              </p>
                              <div className="mt-3 p-2.5 rounded bg-[#1C1C1C] border border-[#22C55E]/30 flex items-center gap-2 text-xs text-white font-medium">
                                <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                                <span>{stage.evidencia}</span>
                              </div>
                            </div>
                            <div className="pt-2 text-[11px] text-[#9CA3AF] flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-[#FFD400]" />
                              Etapa sincronizada em tempo real com o backend CTX.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Connecting Line + Arrow between nodes */}
                  {!isLast && (
                    <div className="flex flex-col items-center my-2">
                      <div className="w-0.5 h-6 border-l-2 border-dashed border-[#FFD400]/60" />
                      <div className="w-6 h-6 rounded-full bg-[#1A1A1A] border border-[#FFD400] text-[#FFD400] flex items-center justify-center -my-1 z-10 shadow-sm">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </div>
                      <div className="w-0.5 h-6 border-l-2 border-dashed border-[#FFD400]/60" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
