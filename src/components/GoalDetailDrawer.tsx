import { useNavigate } from 'react-router-dom'
import {
  X,
  Calendar,
  Compass,
  BarChart3,
  Workflow,
  AlertCircle,
  Users,
  ExternalLink,
} from 'lucide-react'
import type { MetaWithDetails } from '@/types/ctx'
import Sparkline, { TrendBadge } from './Sparkline'

interface GoalDetailDrawerProps {
  goal: MetaWithDetails | null
  onClose: () => void
}

export function GoalDetailDrawer({ goal, onClose }: GoalDetailDrawerProps) {
  const navigate = useNavigate()

  if (!goal) return null

  // Formata data do prazo para dd/mm/aaaa
  const formatPrazo = (dateStr?: string) => {
    if (!dateStr) return null
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    } catch (_) {
      return dateStr
    }
  }

  const prazoFormatado = formatPrazo(goal.prazo)
  const responsaveisList = goal.expand?.responsaveis || []
  const hasProgresso =
    goal.progresso !== undefined && goal.progresso !== null && !isNaN(goal.progresso)
  const progresso = hasProgresso ? Math.min(Math.max(goal.progresso || 0, 0), 100) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer: 440px on desktop, full screen on mobile */}
      <div className="relative w-full md:w-[460px] bg-[#0E0E0E] border-l border-[#262626] h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-250 overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-[#262626] flex items-center justify-between bg-[#121212]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C1C1C] border border-[#333] text-[#FFD400] font-bold">
              {goal.codigo}
            </span>
            <h3 className="text-xs uppercase tracking-wider font-bold text-[#9CA3AF]">
              Detalhes da Meta
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#1E1E1E] transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Pills de Projetos Estratégicos */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Projeto Principal: Sólido */}
              {goal.expand?.projeto ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFD400] text-black text-xs font-black shadow-sm">
                  <Compass className="w-3.5 h-3.5" />
                  {goal.expand.projeto.nome}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFD400] text-black text-xs font-black">
                  <Compass className="w-3.5 h-3.5" />
                  Projeto Estratégico
                </div>
              )}

              {/* Projeto Secundário: Outline */}
              {goal.expand?.projeto_secundario && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#FFD400]/70 text-[#FFD400] text-xs font-bold bg-transparent">
                  {goal.expand.projeto_secundario.nome}
                </div>
              )}
            </div>

            <h2 className="text-xl font-black text-white tracking-tight leading-snug">
              {goal.titulo}
            </h2>
          </div>

          {/* Aviso se valor_alvo_a_definir = sim */}
          {goal.valor_alvo_a_definir && (
            <div className="p-3.5 rounded-xl bg-[#FFD400]/10 border border-[#FFD400]/30 flex items-start gap-2.5 text-xs text-[#FFD400]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Valor-alvo a definir na revisão trimestral de abril/2027</span>
            </div>
          )}

          {/* Metadados: Prazo, Trimestre, Periodicidade, Responsáveis */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {prazoFormatado && (
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] flex items-center gap-2 text-[#9CA3AF]">
                <Calendar className="w-4 h-4 text-[#FFD400] shrink-0" />
                <div>
                  <span className="block text-[10px] uppercase text-[#666]">Prazo</span>
                  <strong className="text-white">{prazoFormatado}</strong>
                </div>
              </div>
            )}

            {goal.trimestre && (
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] flex items-center gap-2 text-[#9CA3AF]">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C1C1C] border border-[#333] text-white font-bold">
                  {goal.trimestre}
                </span>
                <div>
                  <span className="block text-[10px] uppercase text-[#666]">Periodicidade</span>
                  <strong className="text-white">{goal.periodicidade || 'Geral'}</strong>
                </div>
              </div>
            )}

            {responsaveisList.length > 0 && (
              <div className="col-span-2 p-3 rounded-xl bg-[#141414] border border-[#262626] flex items-center gap-2 text-[#9CA3AF]">
                <Users className="w-4 h-4 text-[#FFD400] shrink-0" />
                <div>
                  <span className="block text-[10px] uppercase text-[#666]">Responsável(is)</span>
                  <strong className="text-white">
                    {responsaveisList.map((r) => r.nome).join(', ')}
                  </strong>
                </div>
              </div>
            )}
          </div>

          {/* Descrição */}
          {goal.descricao && (
            <div className="p-4 rounded-xl bg-[#141414] border border-[#262626] text-xs text-[#D1D5DB] leading-relaxed">
              {goal.descricao}
            </div>
          )}

          {/* Status ou Barra de Progresso */}
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-[#9CA3AF] uppercase tracking-wider text-[11px]">
                Status do Progresso
              </span>
              {progresso !== null ? (
                <span className="text-[#FFD400] font-mono text-base font-bold">{progresso}%</span>
              ) : null}
            </div>

            {progresso !== null ? (
              <div className="h-3 w-full bg-[#1C1C1C] rounded-full overflow-hidden border border-[#262626]">
                <div
                  className="h-full bg-[#FFD400] transition-all duration-700 ease-out rounded-full"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[#171717] border border-[#262626] flex items-center justify-between">
                <span className="text-xs text-[#888]">Progresso não mensurado</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#242424] text-[#A3A3A3] font-bold border border-[#333]">
                  Sem atualização
                </span>
              </div>
            )}
          </div>

          {/* Indicadores de Acompanhamento */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#FFD400]" />
                <h4 className="text-xs uppercase tracking-wider font-bold text-white">
                  Indicadores Chave
                </h4>
              </div>
              <span className="text-[11px] text-[#9CA3AF] font-mono">
                {goal.indicadoresList?.length || 0} indicador(es)
              </span>
            </div>

            {!goal.indicadoresList || goal.indicadoresList.length === 0 ? (
              <p className="text-xs text-[#666] py-2 italic">
                Nenhum indicador cadastrado para esta meta.
              </p>
            ) : (
              <div className="space-y-3">
                {goal.indicadoresList.map((ind) => {
                  const hasValues = ind.valor_atual !== undefined && ind.valor_atual !== null
                  const hasHistorico = ind.historico && ind.historico.length > 1

                  return (
                    <div
                      key={ind.id}
                      className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {ind.ordem && (
                            <span className="w-5 h-5 rounded bg-[#1F1F1F] text-[#9CA3AF] text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                              #{ind.ordem}
                            </span>
                          )}
                          <p className="text-xs font-semibold text-white leading-snug">
                            {ind.nome}
                          </p>
                        </div>
                        {hasValues && ind.tendencia && <TrendBadge tendencia={ind.tendencia} />}
                      </div>

                      {/* Alvo se fornecido */}
                      {ind.alvo && (
                        <div className="text-xs flex items-center gap-1.5 pt-1 text-[#9CA3AF]">
                          <span className="text-[11px] uppercase text-[#666]">Alvo:</span>
                          <span className="text-[#FFD400] font-mono font-bold">{ind.alvo}</span>
                        </div>
                      )}

                      {/* Sem valores registrados, NÃO mostrar seta nem sparkline */}
                      {hasValues && (
                        <div className="flex items-center justify-between pt-1">
                          <div>
                            <span className="text-xs text-[#9CA3AF]">Atual / Meta: </span>
                            <span className="text-sm font-mono font-bold text-white">
                              {ind.valor_atual ?? 0} <span className="text-[#9CA3AF]">/</span>{' '}
                              {ind.valor_meta ?? 0}
                            </span>
                          </div>
                          {hasHistorico && (
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] text-[#9CA3AF] mb-0.5">Histórico</span>
                              <Sparkline
                                data={ind.historico}
                                tendencia={ind.tendencia}
                                width={100}
                                height={26}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Processos Vinculados (Chips de Consulta) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-[#FFD400]" />
                <h4 className="text-xs uppercase tracking-wider font-bold text-white">
                  Processos Vinculados
                </h4>
              </div>
              <span className="text-[11px] text-[#9CA3AF] font-mono">
                {goal.processosList?.length || 0} processo(s)
              </span>
            </div>

            {!goal.processosList || goal.processosList.length === 0 ? (
              <p className="text-xs text-[#666] py-2 italic">
                Nenhum processo vinculado a esta meta.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {goal.processosList.map((proc) => {
                  return (
                    <button
                      key={proc.id}
                      type="button"
                      onClick={() => {
                        onClose()
                        navigate(`/processos?codigo=${encodeURIComponent(proc.codigo)}`)
                      }}
                      className="group flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2B2B2B] bg-[#161616] hover:bg-[#202020] hover:border-[#FFD400]/70 transition-all text-left cursor-pointer"
                    >
                      <span className="font-mono text-xs font-bold text-[#FFD400] group-hover:underline">
                        {proc.codigo}
                      </span>
                      <span className="text-xs text-white max-w-[200px] truncate">{proc.nome}</span>
                      <ExternalLink className="w-3 h-3 text-[#666] group-hover:text-white shrink-0 ml-0.5" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-[#262626] bg-[#121212]">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-[#1C1C1C] hover:bg-[#262626] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors"
          >
            Fechar detalhes
          </button>
        </div>
      </div>
    </div>
  )
}

export default GoalDetailDrawer
