import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Target,
  TrendingUp,
  Clock,
  Compass,
  ArrowUpRight,
  Sparkles,
  ChevronRight,
  TrendingDown,
  Minus,
  CheckCircle2,
  Calendar,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import useRealtime from '@/hooks/use-realtime'
import type { Meta, Indicador, Processo, MetaWithDetails } from '@/types/ctx'
import GoalDetailDrawer from '@/components/GoalDetailDrawer'

export default function Index() {
  const { user } = useAuth()
  const [metas, setMetas] = useState<MetaWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGoal, setSelectedGoal] = useState<MetaWithDetails | null>(null)

  // Fetch all goals for the logged-in user + their related indicators & processes
  const fetchDashboardData = useCallback(async () => {
    if (!user) return
    try {
      // 1. Fetch user's metas (RLS restricts to owner = current user)
      const metasRecords = await pb.collection('metas').getFullList<Meta>({
        sort: '-created',
        expand: 'projeto,owner',
      })

      // 2. Fetch all indicators for these metas
      const metaIds = metasRecords.map((m) => m.id)
      let indicators: Indicador[] = []
      let processos: Processo[] = []

      if (metaIds.length > 0) {
        indicators = await pb.collection('indicadores').getFullList<Indicador>({
          sort: 'nome',
        })
        processos = await pb.collection('processos').getFullList<Processo>({
          sort: 'nome',
        })
      }

      // Group indicators and processes by meta id
      const indicatorsByMeta: Record<string, Indicador[]> = {}
      for (const ind of indicators) {
        if (!indicatorsByMeta[ind.meta]) indicatorsByMeta[ind.meta] = []
        indicatorsByMeta[ind.meta].push(ind)
      }

      const processosByMeta: Record<string, Processo[]> = {}
      for (const proc of processos) {
        if (!processosByMeta[proc.meta]) processosByMeta[proc.meta] = []
        processosByMeta[proc.meta].push(proc)
      }

      const enrichedMetas: MetaWithDetails[] = metasRecords.map((m) => ({
        ...m,
        indicadoresList: indicatorsByMeta[m.id] || [],
        processosList: processosByMeta[m.id] || [],
      }))

      setMetas(enrichedMetas)
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  // Real-time listener for changes in 'metas' collection
  useRealtime<Meta>('metas', () => {
    fetchDashboardData()
  })

  // Summary statistics calculation
  const summaryStats = useMemo(() => {
    const totalActiveGoals = metas.filter((m) => m.status === 'em andamento').length
    const totalGoals = metas.length

    // Average progress
    const avgProgress =
      totalGoals > 0
        ? Math.round(metas.reduce((acc, m) => acc + (m.progresso || 0), 0) / totalGoals)
        : 0

    // Total pending processes across all goals
    const totalPendingProcesses = metas.reduce((acc, m) => {
      const pending = (m.processosList || []).filter((p) => p.status === 'pendente').length
      return acc + pending
    }, 0)

    return {
      activeGoals: totalActiveGoals,
      avgProgress,
      pendingProcesses: totalPendingProcesses,
    }
  }, [metas])

  // If a goal is open in drawer, keep it synced with metas array
  useEffect(() => {
    if (selectedGoal) {
      const updated = metas.find((m) => m.id === selectedGoal.id)
      if (updated) setSelectedGoal(updated)
    }
  }, [metas, selectedGoal])

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="border-b border-[#262626] pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Painel Individual do Colaborador
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Meu Painel
            </h1>
            <p className="text-sm text-[#9CA3AF] mt-1">
              Acompanhe suas metas, indicadores e processos — e veja sua contribuição direta para os
              5 Projetos Estratégicos da CTX.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto bg-[#111] px-3 py-1.5 rounded-lg border border-[#262626]">
            <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-xs text-[#9CA3AF]">
              Colaborador: <strong className="text-white">{user?.name || 'Miguel Santiago'}</strong>
            </span>
          </div>
        </div>

        {/* Central Strategic Chain Visual Ribbon */}
        <div className="mt-5 p-3 rounded-lg bg-[#111111] border border-[#262626] hidden lg:flex items-center justify-between text-xs text-[#9CA3AF]">
          <div className="flex items-center gap-2 font-medium text-white">
            <span className="w-2 h-2 rounded-full bg-[#FFD400]" />
            <span className="text-[#FFD400] uppercase tracking-wider font-bold text-[10px]">
              Espinha Dorsal CTX:
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#171717] border border-[#262626] text-white">
              1. Projeto Estratégico
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[#FFD400]" />
            <span className="px-2 py-0.5 rounded bg-[#171717] border border-[#262626] text-[#FFD400] font-semibold">
              2. Meta Individual
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[#FFD400]" />
            <span className="px-2 py-0.5 rounded bg-[#171717] border border-[#262626] text-white">
              3. Colaborador (Você)
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[#FFD400]" />
            <span className="px-2 py-0.5 rounded bg-[#171717] border border-[#262626] text-white">
              4. Indicadores + Processos
            </span>
          </div>
        </div>
      </div>

      {/* Summary Strip (3 Mini-Stats) */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Stat 1: Metas Ativas */}
        <div className="bg-[#111111] border border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#FFD400]/40 transition-all flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-[#9CA3AF]">
              Metas Ativas
            </p>
            <p className="text-2xl md:text-3xl font-black text-white mt-1 tabular-nums">
              {summaryStats.activeGoals}
              <span className="text-xs font-normal text-[#9CA3AF] ml-1.5">
                / {metas.length} total
              </span>
            </p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">Em andamento neste trimestre</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] flex items-center justify-center shrink-0">
            <Target className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 2: Progresso Médio */}
        <div className="bg-[#111111] border border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#FFD400]/40 transition-all flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-[#9CA3AF]">
              Progresso Médio
            </p>
            <p className="text-2xl md:text-3xl font-black text-[#FFD400] mt-1 tabular-nums">
              {summaryStats.avgProgress}%
            </p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">Média ponderada dos indicadores</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 3: Processos Pendentes */}
        <div className="bg-[#111111] border border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#FFD400]/40 transition-all flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-[#9CA3AF]">
              Processos Pendentes
            </p>
            <p className="text-2xl md:text-3xl font-black text-white mt-1 tabular-nums">
              {summaryStats.pendingProcesses}
            </p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">Tarefas a concluir nas metas</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </section>

      {/* Main Section: Minhas Metas */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-[#FFD400]" />
              Minhas Metas
            </h2>
            <p className="text-xs text-[#9CA3AF]">
              Metas atreladas a você e aos Projetos Estratégicos da CTX. Clique em um card para ver
              detalhes.
            </p>
          </div>
          <span className="text-xs font-mono text-[#9CA3AF] bg-[#111] px-3 py-1 rounded-md border border-[#262626] self-start sm:self-auto">
            {metas.length} meta(s) atribuída(s)
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-64 bg-[#111111] border border-[#262626] rounded-xl animate-pulse p-6"
              />
            ))}
          </div>
        ) : metas.length === 0 ? (
          /* Empty state */
          <div className="bg-[#111111] border border-[#262626] rounded-xl p-12 text-center max-w-lg mx-auto space-y-4 my-8">
            <div className="w-16 h-16 rounded-full bg-[#1A1A1A] border border-[#262626] flex items-center justify-center text-[#9CA3AF] mx-auto">
              <Target className="w-8 h-8 text-[#FFD400]" />
            </div>
            <h3 className="text-lg font-bold text-white">Nenhuma meta atrelada a você ainda</h3>
            <p className="text-sm text-[#9CA3AF]">
              Fale com o RH ou seu gestor para saber mais. Suas metas individuais aparecerão aqui
              assim que forem atribuídas no sistema.
            </p>
          </div>
        ) : (
          /* Goal Cards Grid: 1 col mobile, 2 tablet, 3 desktop */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {metas.map((goal, idx) => {
              const progresso = Math.min(Math.max(goal.progresso || 0, 0), 100)
              const statusBadgeColor =
                goal.status === 'concluida'
                  ? 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30'
                  : goal.status === 'atrasada'
                    ? 'bg-red-950/40 text-red-400 border-red-500/30'
                    : 'bg-[#FFD400]/15 text-[#FFD400] border-[#FFD400]/30'

              return (
                <div
                  key={goal.id}
                  onClick={() => setSelectedGoal(goal)}
                  className="group bg-[#111111] border border-[#262626] rounded-xl p-6 shadow-md hover:border-[#FFD400] hover:-translate-y-1 hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="space-y-4">
                    {/* Top: Strategic Project Badge & Hover action */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFD400]/15 text-[#FFD400] text-[11px] font-semibold border border-[#FFD400]/30 tracking-tight truncate max-w-[85%]">
                        <Compass className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {goal.expand?.projeto?.nome || 'Projeto Estratégico'}
                        </span>
                      </span>
                      <ArrowUpRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#FFD400] transition-colors shrink-0" />
                    </div>

                    {/* Goal Title */}
                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-[#FFD400] transition-colors leading-snug line-clamp-2">
                        {goal.titulo}
                      </h3>
                      {goal.descricao && (
                        <p className="text-xs text-[#9CA3AF] mt-1.5 line-clamp-2 leading-relaxed">
                          {goal.descricao}
                        </p>
                      )}
                    </div>

                    {/* Meta info line (timeframe + status) */}
                    <div className="flex items-center justify-between text-xs text-[#9CA3AF] pt-1">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-[#FFD400]" />
                        {goal.timeframe || 'Q1 2026'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase border ${statusBadgeColor}`}
                      >
                        {goal.status}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#9CA3AF] font-medium text-[11px]">Progresso</span>
                        <span className="text-white font-mono font-bold text-xs tabular-nums">
                          {progresso}%
                        </span>
                      </div>
                      <div className="h-2 w-full bg-[#1C1C1C] rounded-full overflow-hidden border border-[#262626]">
                        <div
                          className="h-full bg-[#FFD400] transition-all duration-600 ease-out rounded-full"
                          style={{ width: `${progresso}%` }}
                        />
                      </div>
                    </div>

                    {/* Indicadores block (1-3 rows) */}
                    <div className="space-y-2 pt-2 border-t border-[#262626]/80">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
                        <span>Indicadores</span>
                        <span className="font-mono text-[10px]">
                          {goal.indicadoresList?.length || 0}
                        </span>
                      </div>

                      {!goal.indicadoresList || goal.indicadoresList.length === 0 ? (
                        <p className="text-xs text-[#525252] italic">Nenhum indicador atrelado</p>
                      ) : (
                        <div className="space-y-1.5">
                          {goal.indicadoresList.slice(0, 3).map((ind) => (
                            <div
                              key={ind.id}
                              className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[#171717] border border-[#262626]/60"
                            >
                              <span className="text-white truncate max-w-[150px] font-medium">
                                {ind.nome}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono text-[11px] text-[#9CA3AF]">
                                  {ind.valor_atual ?? 0}/{ind.valor_meta ?? 0}
                                </span>
                                {ind.tendencia === 'subindo' ? (
                                  <TrendingUp className="w-3.5 h-3.5 text-[#22C55E]" />
                                ) : ind.tendencia === 'descendo' ? (
                                  <TrendingDown className="w-3.5 h-3.5 text-[#EF4444]" />
                                ) : (
                                  <Minus className="w-3.5 h-3.5 text-[#FFD400]" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Processos block (chips at bottom) */}
                  <div className="space-y-2 pt-4 border-t border-[#262626]/80 mt-4">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
                      <span>Processos</span>
                      <span className="font-mono text-[10px]">
                        {goal.processosList?.filter((p) => p.status === 'concluido').length || 0}/
                        {goal.processosList?.length || 0} feitos
                      </span>
                    </div>

                    {!goal.processosList || goal.processosList.length === 0 ? (
                      <p className="text-xs text-[#525252] italic">Nenhum processo mapeado</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {goal.processosList.slice(0, 3).map((proc) => (
                          <span
                            key={proc.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                              proc.status === 'concluido'
                                ? 'bg-[#171717] border-[#22C55E]/40 text-[#D1D5DB]'
                                : 'bg-[#171717] border-[#FFD400]/50 text-white'
                            }`}
                          >
                            {proc.status === 'concluido' ? (
                              <CheckCircle2 className="w-3 h-3 text-[#22C55E] shrink-0" />
                            ) : (
                              <Clock className="w-3 h-3 text-[#FFD400] shrink-0" />
                            )}
                            <span className="truncate max-w-[130px]">{proc.nome}</span>
                          </span>
                        ))}
                        {goal.processosList.length > 3 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] text-[#9CA3AF] bg-[#171717] border border-[#262626]">
                            +{goal.processosList.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Goal Detail Drawer (slides from right on desktop, fullscreen on mobile) */}
      <GoalDetailDrawer goal={selectedGoal} onClose={() => setSelectedGoal(null)} />
    </div>
  )
}
