import { X, CheckCircle2, Clock, Calendar, Compass, BarChart3, ListChecks } from 'lucide-react'
import type { MetaWithDetails } from '@/types/ctx'
import Sparkline, { TrendBadge } from './Sparkline'

interface GoalDetailDrawerProps {
  goal: MetaWithDetails | null
  onClose: () => void
}

export default function GoalDetailDrawer({ goal, onClose }: GoalDetailDrawerProps) {
  if (!goal) return null

  const progresso = Math.min(Math.max(goal.progresso || 0, 0), 100)
  const statusColor =
    goal.status === 'concluida'
      ? 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/30'
      : goal.status === 'atrasada'
        ? 'text-red-400 bg-red-950/40 border-red-500/30'
        : 'text-[#FFD400] bg-[#FFD400]/10 border-[#FFD400]/30'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer: 380px on desktop, full screen on mobile */}
      <div className="relative w-full md:w-[420px] bg-[#111111] border-l border-[#262626] h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-250 overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-[#262626] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FFD400]" />
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
          {/* Strategic Project Pill */}
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFD400]/15 text-[#FFD400] text-xs font-semibold border border-[#FFD400]/30 mb-2">
              <Compass className="w-3.5 h-3.5" />
              Projeto: {goal.expand?.projeto?.nome || 'Estratégico'}
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">{goal.titulo}</h2>
          </div>

          {/* Timeframe & Status */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF] bg-[#171717] px-2.5 py-1 rounded-md border border-[#262626]">
              <Calendar className="w-3.5 h-3.5 text-[#FFD400]" />
              {goal.timeframe || 'Período vigente'}
            </span>
            <span
              className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border ${statusColor}`}
            >
              {goal.status}
            </span>
          </div>

          {/* Description */}
          {goal.descricao && (
            <div className="p-3.5 rounded-lg bg-[#171717] border border-[#262626]/80 text-sm text-[#D1D5DB] leading-relaxed">
              {goal.descricao}
            </div>
          )}

          {/* Progress Bar (larger) */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-[#9CA3AF] uppercase tracking-wider">Progresso Geral</span>
              <span className="text-[#FFD400] font-mono text-base font-bold">{progresso}%</span>
            </div>
            <div className="h-3 w-full bg-[#1C1C1C] rounded-full overflow-hidden border border-[#262626]">
              <div
                className="h-full bg-[#FFD400] transition-all duration-700 ease-out rounded-full"
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>

          {/* Complete Indicators Block */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#FFD400]" />
                <h4 className="text-xs uppercase tracking-wider font-bold text-white">
                  Indicadores de Acompanhamento
                </h4>
              </div>
              <span className="text-[11px] text-[#9CA3AF] font-mono">
                {goal.indicadoresList?.length || 0} ativo(s)
              </span>
            </div>

            {!goal.indicadoresList || goal.indicadoresList.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] py-2">
                Nenhum indicador cadastrado para esta meta.
              </p>
            ) : (
              <div className="space-y-3">
                {goal.indicadoresList.map((ind) => (
                  <div
                    key={ind.id}
                    className="p-3.5 rounded-lg bg-[#161616] border border-[#262626] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{ind.nome}</p>
                      <TrendBadge tendencia={ind.tendencia} />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-xs text-[#9CA3AF]">Atual / Meta: </span>
                        <span className="text-sm font-mono font-bold text-white">
                          {ind.valor_atual ?? 0} <span className="text-[#9CA3AF]">/</span>{' '}
                          {ind.valor_meta ?? 0}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-[#9CA3AF] mb-0.5">Últimos períodos</span>
                        <Sparkline
                          data={ind.historico}
                          tendencia={ind.tendencia}
                          width={100}
                          height={26}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Complete Processes Block */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-[#FFD400]" />
                <h4 className="text-xs uppercase tracking-wider font-bold text-white">
                  Processos & Tarefas a Realizar
                </h4>
              </div>
              <span className="text-[11px] text-[#9CA3AF] font-mono">
                {goal.processosList?.filter((p) => p.status === 'concluido').length || 0}/
                {goal.processosList?.length || 0}
              </span>
            </div>

            {!goal.processosList || goal.processosList.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] py-2">Nenhum processo mapeado para esta meta.</p>
            ) : (
              <div className="space-y-2">
                {goal.processosList.map((proc) => {
                  const isConcluido = proc.status === 'concluido'
                  return (
                    <div
                      key={proc.id}
                      className="p-3 rounded-lg bg-[#161616] border border-[#262626] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isConcluido ? (
                          <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-[#FFD400] shrink-0" />
                        )}
                        <span
                          className={`text-xs truncate ${
                            isConcluido ? 'line-through text-[#9CA3AF]' : 'text-white font-medium'
                          }`}
                        >
                          {proc.nome}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded shrink-0 ${
                          isConcluido
                            ? 'bg-[#22C55E]/15 text-[#22C55E]'
                            : 'bg-[#FFD400]/15 text-[#FFD400]'
                        }`}
                      >
                        {isConcluido ? 'Concluído' : 'Pendente'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-[#262626] bg-[#141414]">
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
