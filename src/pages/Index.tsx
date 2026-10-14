import { useEffect, useState, useCallback } from 'react'
import {
  Target,
  Sparkles,
  Calendar,
  Users,
  Compass,
  AlertCircle,
  Eye,
  Workflow,
  ExternalLink,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import useRealtime from '@/hooks/use-realtime'
import type { Meta, MetaWithDetails, Colaborador, Indicador, Processo } from '@/types/ctx'
import GoalDetailDrawer from '@/components/GoalDetailDrawer'

export default function Index() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [metas, setMetas] = useState<MetaWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGoal, setSelectedGoal] = useState<MetaWithDetails | null>(null)

  // Colaborador associado ao usuário logado
  const [colaboradorLogado, setColaboradorLogado] = useState<Colaborador | null>(null)

  // Administrador: lista de colaboradores e seleção de visualização
  const [allColabs, setAllColabs] = useState<Colaborador[]>([])
  const [viewingColabId, setViewingColabId] = useState<string>('')

  const isAdmin = user?.role === 'admin'
  const isReadOnlyMode =
    isAdmin && viewingColabId !== '' && viewingColabId !== colaboradorLogado?.id

  // Carregar colaboradores se for admin
  useEffect(() => {
    async function fetchAdminColabs() {
      if (!user || user.role !== 'admin') return
      try {
        const list = await pb.collection('colaboradores').getFullList<Colaborador>({
          sort: 'nome',
        })
        setAllColabs(list)
      } catch (err) {
        console.error('Erro ao listar colaboradores para admin:', err)
      }
    }
    fetchAdminColabs()
  }, [user])

  // Identificar colaborador logado
  useEffect(() => {
    async function identifyColab() {
      if (!user) return
      try {
        const list = await pb.collection('colaboradores').getList<Colaborador>(1, 1, {
          filter: `usuario="${user.id}"`,
        })
        if (list.items.length > 0) {
          const colab = list.items[0]
          setColaboradorLogado(colab)
          setViewingColabId(colab.id)
        } else if (user.role === 'admin') {
          // Se for admin sem colaborador direto, seleciona o primeiro da lista
          const first = await pb.collection('colaboradores').getFirstListItem<Colaborador>('')
          if (first) {
            setColaboradorLogado(first)
            setViewingColabId(first.id)
          }
        }
      } catch (err) {
        console.error('Erro ao identificar colaborador logado:', err)
      }
    }
    identifyColab()
  }, [user])

  // Busca metas do colaborador visualizado (via campo responsaveis)
  const fetchDashboardData = useCallback(async () => {
    const targetColabId = viewingColabId || colaboradorLogado?.id
    if (!targetColabId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // Metas cujo campo responsaveis contém o targetColabId
      const metasRecords = await pb.collection('metas').getFullList<Meta>({
        filter: `responsaveis ~ "${targetColabId}"`,
        expand: 'projeto,projeto_secundario,responsaveis,processos_vinculados',
        sort: 'codigo',
      })

      if (metasRecords.length > 0) {
        const metaIds = metasRecords.map((m) => m.id)
        const filterQueries = metaIds.map((id) => `meta="${id}"`).join(' || ')

        const [indicadores, todosProcessos] = await Promise.all([
          pb
            .collection('indicadores')
            .getFullList<Indicador>({
              filter: filterQueries,
              sort: 'ordem',
            })
            .catch(() => []),
          pb
            .collection('processos')
            .getFullList<Processo>()
            .catch(() => []),
        ])

        const indMapByMeta = new Map<string, Indicador[]>()
        indicadores.forEach((ind) => {
          if (!indMapByMeta.has(ind.meta)) indMapByMeta.set(ind.meta, [])
          indMapByMeta.get(ind.meta)!.push(ind)
        })

        const procMapById = new Map<string, Processo>()
        todosProcessos.forEach((p) => procMapById.set(p.id, p))

        const detailed: MetaWithDetails[] = metasRecords.map((meta) => {
          const procsList: Processo[] = []
          if (Array.isArray(meta.processos_vinculados)) {
            for (const pId of meta.processos_vinculados) {
              const p = procMapById.get(pId)
              if (p) procsList.push(p)
            }
          }

          return {
            ...meta,
            indicadoresList: indMapByMeta.get(meta.id) || [],
            processosList: procsList,
          }
        })

        setMetas(detailed)
      } else {
        setMetas([])
      }
    } catch (err) {
      console.error('Erro ao carregar metas do colaborador:', err)
      setMetas([])
    } finally {
      setLoading(false)
    }
  }, [viewingColabId, colaboradorLogado])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  useRealtime<Meta>('metas', () => {
    fetchDashboardData()
  })

  // Colaborador em exibição atual
  const activeColaborador = allColabs.find((c) => c.id === viewingColabId) || colaboradorLogado

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

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Banner de Modo Somente Leitura para Administrador */}
      {isReadOnlyMode && (
        <div className="p-3.5 rounded-xl bg-[#FFD400]/10 border border-[#FFD400]/40 flex items-center justify-between text-xs text-[#FFD400]">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 shrink-0 text-[#FFD400]" />
            <span>
              <strong>Modo de Leitura (Admin):</strong> Você está visualizando o painel de{' '}
              <strong className="text-white underline">{activeColaborador?.nome}</strong> em modo
              somente leitura.
            </span>
          </div>
          <button
            onClick={() => setViewingColabId(colaboradorLogado?.id || '')}
            className="px-2.5 py-1 rounded bg-[#FFD400] text-black font-extrabold hover:bg-[#E5BE00] transition-colors shrink-0"
          >
            Voltar ao meu painel
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="border-b border-[#262626] pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              {isReadOnlyMode ? 'Visualização Administrativa' : 'Painel Individual do Colaborador'}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Meu Painel
            </h1>
            <p className="text-sm text-[#9CA3AF] mt-1">
              Acompanhe suas metas, indicadores e processos — e veja sua contribuição direta para a
              CTX Cenografia.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor "Ver painel de:" exclusivo para Administrador */}
            {isAdmin && allColabs.length > 0 && (
              <div className="flex items-center gap-2 bg-[#141414] border border-[#2B2B2B] px-3 py-1.5 rounded-xl">
                <span className="text-xs text-[#9CA3AF] font-medium whitespace-nowrap">
                  Ver painel de:
                </span>
                <select
                  value={viewingColabId}
                  onChange={(e) => setViewingColabId(e.target.value)}
                  className="bg-transparent text-xs text-white font-bold outline-none cursor-pointer pr-1"
                >
                  {allColabs.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#1A1A1A] text-white">
                      {c.nome} {c.id === colaboradorLogado?.id ? '(Você)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 bg-[#111] px-3 py-1.5 rounded-xl border border-[#262626]">
              <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
              <span className="text-xs text-[#9CA3AF]">
                Colaborador:{' '}
                <strong className="text-white">
                  {activeColaborador?.nome || user?.name || user?.email}
                </strong>
              </span>
            </div>
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
          /* Estado vazio para colaborador sem metas ou antes da importação */
          <div className="bg-[#111111] border border-[#262626] rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4 my-12 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-[#1A1A1A] border border-[#262626] flex items-center justify-center text-[#FFD400] mx-auto shadow-inner">
              <Target className="w-8 h-8 text-[#FFD400]" />
            </div>
            <h3 className="text-xl font-extrabold text-white tracking-tight">
              Nenhuma meta atribuída
            </h3>
            <p className="text-sm text-[#9CA3AF] leading-relaxed">
              {activeColaborador?.sem_metas ? (
                <span>
                  O colaborador <strong className="text-white">{activeColaborador.nome}</strong>{' '}
                  está configurado como participante sem metas diretas no plano de gestão.
                </span>
              ) : (
                <span>
                  As metas para este colaborador ainda não foram importadas ou atribuídas. Acesse{' '}
                  <strong className="text-white">Administration → Importação &amp; Acessos</strong>{' '}
                  para carregar as metas da Etapa 2.
                </span>
              )}
            </p>
          </div>
        ) : (
          /* Grid de Cards de Metas Reais */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {metas.map((goal) => {
              const hasProgresso =
                goal.progresso !== undefined && goal.progresso !== null && !isNaN(goal.progresso)
              const progresso = hasProgresso
                ? Math.min(Math.max(goal.progresso || 0, 0), 100)
                : null
              const prazoFormatado = formatPrazo(goal.prazo)
              const responsaveisList = goal.expand?.responsaveis || []

              // Corresponsáveis (outros responsáveis além do colaborador visualizado)
              const coResponsaveis = responsaveisList.filter((r) => r.id !== activeColaborador?.id)

              return (
                <div
                  key={goal.id}
                  onClick={() => setSelectedGoal(goal)}
                  className="group bg-[#111111] border border-[#262626] hover:border-[#FFD400] rounded-2xl p-6 cursor-pointer transition-all flex flex-col justify-between space-y-4 hover:shadow-xl hover:shadow-[#FFD400]/5"
                >
                  <div className="space-y-3">
                    {/* Linha de topo: Código + Pills de Projetos */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C1C1C] border border-[#333] text-[#FFD400] font-bold">
                        {goal.codigo}
                      </span>

                      {/* Projeto Principal: Sólido */}
                      {goal.expand?.projeto && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#FFD400] text-black font-extrabold shadow-sm">
                          {goal.expand.projeto.nome}
                        </span>
                      )}

                      {/* Projeto Secundário: Outline */}
                      {goal.expand?.projeto_secundario && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-[#FFD400]/70 text-[#FFD400] font-bold bg-transparent">
                          {goal.expand.projeto_secundario.nome}
                        </span>
                      )}
                    </div>

                    {/* Título da Meta */}
                    <h3 className="text-base font-bold text-white group-hover:text-[#FFD400] transition-colors leading-snug">
                      {goal.titulo}
                    </h3>

                    {/* Aviso se valor_alvo_a_definir = sim */}
                    {goal.valor_alvo_a_definir && (
                      <div className="p-2 rounded-lg bg-[#FFD400]/10 border border-[#FFD400]/25 flex items-start gap-1.5 text-[11px] text-[#FFD400]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Valor-alvo a definir na revisão trimestral de abril/2027</span>
                      </div>
                    )}

                    {/* Metadados: Prazo e Trimestre */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#9CA3AF] pt-1">
                      {prazoFormatado && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#FFD400]" />
                          <span>{prazoFormatado}</span>
                        </span>
                      )}

                      {goal.trimestre && (
                        <span className="font-mono px-1.5 py-0.5 rounded bg-[#1C1C1C] border border-[#2B2B2B] text-white font-bold text-[11px]">
                          {goal.trimestre}
                        </span>
                      )}
                    </div>

                    {/* Corresponsáveis quando houver */}
                    {coResponsaveis.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF] bg-[#161616] p-2 rounded-lg border border-[#242424]">
                        <Users className="w-3.5 h-3.5 text-[#FFD400] shrink-0" />
                        <span className="truncate">
                          Corresponsável(is):{' '}
                          <strong className="text-white">
                            {coResponsaveis.map((r) => r.nome).join(', ')}
                          </strong>
                        </span>
                      </div>
                    )}

                    {/* Indicadores listando nome e alvo (sem tendência/sparkline no card) */}
                    {goal.indicadoresList && goal.indicadoresList.length > 0 && (
                      <div className="pt-1 space-y-1.5 border-t border-[#222]">
                        <span className="text-[10px] uppercase font-mono text-[#666] block">
                          Indicadores ({goal.indicadoresList.length}):
                        </span>
                        <div className="space-y-1">
                          {goal.indicadoresList.slice(0, 3).map((ind) => (
                            <div
                              key={ind.id}
                              className="flex items-center justify-between text-xs gap-2 py-0.5"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                {ind.ordem && (
                                  <span className="text-[10px] font-mono text-[#666]">
                                    #{ind.ordem}
                                  </span>
                                )}
                                <span className="text-[#D1D5DB] truncate text-[11px]">
                                  {ind.nome}
                                </span>
                              </div>
                              {ind.alvo ? (
                                <span className="text-[11px] font-mono font-bold text-[#FFD400] shrink-0">
                                  {ind.alvo}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[#666] italic shrink-0">
                                  a definir
                                </span>
                              )}
                            </div>
                          ))}
                          {goal.indicadoresList.length > 3 && (
                            <span className="text-[10px] text-[#666] block pt-0.5">
                              +{goal.indicadoresList.length - 3} indicador(es) a mais
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Chips de processos vinculados no card */}
                    {goal.processosList && goal.processosList.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] uppercase font-mono text-[#666] block mb-1">
                          Processos Vinculados ({goal.processosList.length}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {goal.processosList.slice(0, 3).map((proc) => (
                            <button
                              key={proc.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/processos?codigo=${encodeURIComponent(proc.codigo)}`)
                              }}
                              title={`${proc.codigo} - ${proc.nome}`}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#181818] hover:bg-[#222] border border-[#2B2B2B] hover:border-[#FFD400]/60 text-[11px] text-[#D1D5DB] transition-colors max-w-full"
                            >
                              <span className="font-mono text-[#FFD400] font-bold shrink-0">
                                {proc.codigo}
                              </span>
                              <span className="truncate max-w-[120px] text-[10px] text-[#A3A3A3]">
                                {proc.nome}
                              </span>
                              <ExternalLink className="w-2.5 h-2.5 text-[#666] shrink-0" />
                            </button>
                          ))}
                          {goal.processosList.length > 3 && (
                            <span className="text-[10px] text-[#666] self-center">
                              +{goal.processosList.length - 3} mais
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rodapé do Card: Selo "Sem atualização" OU Barra de Progresso */}
                  <div className="pt-3 border-t border-[#262626]">
                    {!hasProgresso ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#666]">Progresso</span>
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1C1C1C] border border-[#2B2B2B] text-[#9CA3AF] font-bold">
                          Sem atualização
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-[#9CA3AF]">Progresso</span>
                          <span className="font-mono font-bold text-[#FFD400]">{progresso}%</span>
                        </div>
                        <div className="h-2 w-full bg-[#1C1C1C] rounded-full overflow-hidden border border-[#262626]">
                          <div
                            className="h-full bg-[#FFD400] rounded-full"
                            style={{ width: `${progresso}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Drawer de Detalhes da Meta */}
      {selectedGoal && (
        <GoalDetailDrawer goal={selectedGoal} onClose={() => setSelectedGoal(null)} />
      )}
    </div>
  )
}
