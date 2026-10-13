import { useEffect, useState, useCallback } from 'react'
import { Target, Sparkles, Clock, Compass } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import useRealtime from '@/hooks/use-realtime'
import type { Meta, MetaWithDetails } from '@/types/ctx'
import GoalDetailDrawer from '@/components/GoalDetailDrawer'

export default function Index() {
  const { user } = useAuth()
  const [metas, setMetas] = useState<MetaWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGoal, setSelectedGoal] = useState<MetaWithDetails | null>(null)

  // Fetch metas (quando existirem na etapa 2)
  const fetchDashboardData = useCallback(async () => {
    if (!user) return
    try {
      const metasRecords = await pb.collection('metas').getFullList<Meta>({
        sort: '-created',
        expand: 'projeto,owner',
      })
      setMetas(metasRecords)
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setMetas([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  useRealtime<Meta>('metas', () => {
    fetchDashboardData()
  })

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
              Acompanhe suas metas, indicadores e processos — e veja sua contribuição direta para a
              CTX Cenografia.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto bg-[#111] px-3 py-1.5 rounded-lg border border-[#262626]">
            <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-xs text-[#9CA3AF]">
              Colaborador: <strong className="text-white">{user?.name || user?.email}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main Section */}
      <section className="space-y-4">
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
          /* Estado vazio exigido pelo briefing para a Etapa 1 */
          <div className="bg-[#111111] border border-[#262626] rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4 my-12 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-[#1A1A1A] border border-[#262626] flex items-center justify-center text-[#FFD400] mx-auto shadow-inner">
              <Target className="w-8 h-8 text-[#FFD400]" />
            </div>
            <h3 className="text-xl font-extrabold text-white tracking-tight">
              Suas metas serão carregadas em breve
            </h3>
            <p className="text-sm text-[#9CA3AF] leading-relaxed">
              Estamos na <strong className="text-white">Etapa 1</strong> de implantação da CTX. As
              áreas, colaboradores e processos operacionais já estão conectados no Organograma e no
              Fluxograma.
            </p>
            <div className="pt-2 flex items-center justify-center gap-2 text-xs text-[#9CA3AF]">
              <Clock className="w-4 h-4 text-[#FFD400]" />
              <span>Metas, projetos e indicadores reais virão na etapa 2.</span>
            </div>
          </div>
        ) : (
          /* Renderização de metas caso já existam */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {metas.map((goal) => {
              const progresso = Math.min(Math.max(goal.progresso || 0, 0), 100)
              return (
                <div
                  key={goal.id}
                  onClick={() => setSelectedGoal(goal)}
                  className="bg-[#111111] border border-[#262626] rounded-xl p-6 hover:border-[#FFD400] cursor-pointer transition-all"
                >
                  <span className="text-xs text-[#FFD400] flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5" />
                    {goal.expand?.projeto?.nome || 'Projeto Estratégico'}
                  </span>
                  <h4 className="text-base font-bold text-white mt-2">{goal.titulo}</h4>
                  <div className="mt-4 pt-2 border-t border-[#262626] flex justify-between text-xs text-[#9CA3AF]">
                    <span>Progresso</span>
                    <span className="font-bold text-white">{progresso}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Goal Detail Drawer se selecionado */}
      {selectedGoal && (
        <GoalDetailDrawer goal={selectedGoal} onClose={() => setSelectedGoal(null)} />
      )}
    </div>
  )
}
