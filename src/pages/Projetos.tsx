import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Compass,
  Target,
  Users,
  Calendar,
  AlertTriangle,
  HelpCircle,
  MessageSquare,
  CheckCircle2,
  ExternalLink,
  Send,
  Loader2,
  Lock,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import type {
  ProjetoEstrategico,
  MetaWithDetails,
  Colaborador,
  Avaliacao,
  Comentario,
} from '@/types/ctx'
import { rotinaService } from '@/services/rotinaService'
import { toast } from '@/hooks/use-toast'
import GoalDetailDrawer from '@/components/GoalDetailDrawer'

export default function Projetos() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [projetos, setProjetos] = useState<ProjetoEstrategico[]>([])
  const [selectedProjetoId, setSelectedProjetoId] = useState<string>('')
  const [metas, setMetas] = useState<MetaWithDetails[]>([])
  const [avaliacoesMap, setAvaliacoesMap] = useState<Map<string, Avaliacao>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedGoal, setSelectedGoal] = useState<MetaWithDetails | null>(null)

  // Pedidos de ajuda abertos do projeto
  const [pedidosAjuda, setPedidosAjuda] = useState<Avaliacao[]>([])
  const [resolvendoAjuda, setResolvendoAjuda] = useState<string | null>(null)

  // Comentários rápidos
  const [comentariosMap, setComentariosMap] = useState<Record<string, Comentario[]>>({})
  const [novoComentario, setNovoComentario] = useState<Record<string, string>>({})
  const [enviandoComentario, setEnviandoComentario] = useState<string | null>(null)

  // Colaborador logado
  const [colaboradorLogado, setColaboradorLogado] = useState<Colaborador | null>(null)

  const isAdmin = user?.role === 'admin'

  // Identificar colaborador e verificar permissão de acesso
  useEffect(() => {
    async function loadColabAndCheckPermission() {
      if (!user) return
      try {
        let colab: Colaborador | null = null
        try {
          colab = await pb
            .collection('colaboradores')
            .getFirstListItem<Colaborador>(`usuario="${user.id}"`)
          setColaboradorLogado(colab)
        } catch {
          /* intentionally ignored */
        }

        // Se for admin, tem acesso liberado
        if (isAdmin) return

        // Se não for admin, verificar se é sponsor de algum projeto estratégico
        if (colab) {
          const sponsorList = await pb
            .collection('projetos_estrategicos')
            .getList<ProjetoEstrategico>(1, 1, {
              filter: `sponsor = "${colab.id}"`,
            })
          if (sponsorList.totalItems === 0) {
            toast({
              title: 'Acesso restrito',
              description: 'A página de Projetos é restrita a administradores e sponsors.',
              variant: 'destructive',
            })
            navigate('/', { replace: true })
          }
        } else {
          toast({
            title: 'Acesso restrito',
            description: 'A página de Projetos é restrita a administradores e sponsors.',
            variant: 'destructive',
          })
          navigate('/', { replace: true })
        }
      } catch (err) {
        console.error('Erro ao verificar permissão em Projetos:', err)
      }
    }
    loadColabAndCheckPermission()
  }, [user, isAdmin, navigate])

  // Carregar todos os Projetos Estratégicos (P1..P5)
  useEffect(() => {
    async function loadProjetos() {
      try {
        const list = await pb.collection('projetos_estrategicos').getFullList<ProjetoEstrategico>({
          sort: 'codigo',
          expand: 'sponsor',
        })
        setProjetos(list)
        if (id) {
          setSelectedProjetoId(id)
        } else if (list.length > 0) {
          setSelectedProjetoId(list[0].id)
        }
      } catch (e) {
        console.error('Erro ao carregar projetos:', e)
      }
    }
    loadProjetos()
  }, [id])

  // Atualizar URL ao trocar projeto selecionado
  const handleSelectProjeto = (projId: string) => {
    setSelectedProjetoId(projId)
    navigate(`/projetos/${projId}`)
  }

  const currentProjeto = useMemo(() => {
    return projetos.find((p) => p.id === selectedProjetoId) || null
  }, [projetos, selectedProjetoId])

  const isSponsor =
    currentProjeto?.sponsor && colaboradorLogado && currentProjeto.sponsor === colaboradorLogado.id

  // Carregar metas e avaliações do projeto selecionado
  useEffect(() => {
    if (!selectedProjetoId) return

    async function loadProjectData() {
      setLoading(true)
      try {
        // Metas cujo projeto principal ou secundário seja o selecionado
        const metasRecords = await pb.collection('metas').getFullList<MetaWithDetails>({
          filter: `projeto = "${selectedProjetoId}" || projeto_secundario = "${selectedProjetoId}"`,
          expand: 'responsaveis,projeto,projeto_secundario,processos_vinculados',
          sort: 'codigo',
        })

        // Buscar últimas avaliações das metas
        if (metasRecords.length > 0) {
          const metaIds = metasRecords.map((m) => m.id)
          const filterQueries = metaIds.map((mid) => `meta="${mid}"`).join(' || ')

          const avs = await pb.collection('avaliacoes').getFullList<Avaliacao>({
            filter: filterQueries,
            sort: '-created',
            expand: 'preenchido_por,ajuda_colaborador',
          })

          const avMap = new Map<string, Avaliacao>()
          const helps: Avaliacao[] = []

          avs.forEach((a) => {
            if (!avMap.has(a.meta)) {
              avMap.set(a.meta, a)
            }
            // Pedidos de ajuda abertos deste projeto
            if (a.ajuda_texto && a.ajuda_status !== 'resolvido') {
              helps.push(a)
            }
          })

          setAvaliacoesMap(avMap)
          setPedidosAjuda(helps)

          // Carregar comentários das avaliações visíveis
          for (const av of avs) {
            rotinaService.getComentariosAvaliacao(av.id).then((comms) => {
              setComentariosMap((prev) => ({ ...prev, [av.id]: comms }))
            })
          }
        } else {
          setAvaliacoesMap(new Map())
          setPedidosAjuda([])
        }

        setMetas(metasRecords)
      } catch (err) {
        console.error('Erro ao carregar dados do projeto:', err)
      } finally {
        setLoading(false)
      }
    }

    loadProjectData()
  }, [selectedProjetoId])

  // Distribuição das metas por farol e % de concluídas
  const stats = useMemo(() => {
    const total = metas.length || 1
    let verde = 0
    let atencao = 0
    let vermelho = 0
    let concluida = 0
    let sem_atualizacao = 0

    metas.forEach((m) => {
      if (m.status === 'verde') verde++
      else if (m.status === 'atencao') atencao++
      else if (m.status === 'vermelho') vermelho++
      else if (m.status === 'concluida') concluida++
      else sem_atualizacao++
    })

    return {
      total: metas.length,
      verde,
      atencao,
      vermelho,
      concluida,
      sem_atualizacao,
      percentConcluida: Math.round((concluida / total) * 100),
    }
  }, [metas])

  // Agrupamento das metas por farol
  const metasPorFarol = useMemo(() => {
    const grupos: Record<string, MetaWithDetails[]> = {
      concluida: [],
      verde: [],
      atencao: [],
      vermelho: [],
      'sem atualização': [],
    }

    metas.forEach((m) => {
      const st = m.status || 'sem atualização'
      if (grupos[st]) {
        grupos[st].push(m)
      } else {
        grupos['sem atualização'].push(m)
      }
    })

    return grupos
  }, [metas])

  // Regra D.3: O farol de todas as metas é visível a todos os usuários.
  // Os textos das avaliações ("o que avançou", "próximo passo", evidência) são visíveis
  // apenas aos responsáveis da meta, ao sponsor do projeto e ao administrador.
  const podeVerTextosMeta = (meta: MetaWithDetails) => {
    if (isAdmin) return true
    if (isSponsor) return true
    if (!colaboradorLogado) return false
    const respIds = meta.getStringSlice
      ? meta.getStringSlice('responsaveis')
      : meta.responsaveis || []
    return respIds.includes(colaboradorLogado.id)
  }

  // Resolver pedido de ajuda
  const handleResolverAjuda = async (avaliacaoId: string) => {
    setResolvendoAjuda(avaliacaoId)
    try {
      await rotinaService.resolverPedidoAjuda(avaliacaoId)
      setPedidosAjuda((prev) => prev.filter((a) => a.id !== avaliacaoId))
      toast({
        title: 'Pedido de ajuda resolvido!',
        description: 'O status do pedido foi atualizado para resolvido.',
      })
    } catch (e) {
      toast({
        title: 'Erro ao resolver pedido',
        variant: 'destructive',
      })
    } finally {
      setResolvendoAjuda(null)
    }
  }

  // Enviar comentário na avaliação (Sponsor e Admin podem comentar)
  const handleEnviarComentario = async (avaliacaoId: string) => {
    const texto = novoComentario[avaliacaoId]?.trim()
    if (!texto) return
    setEnviandoComentario(avaliacaoId)
    try {
      await rotinaService.adicionarComentario(avaliacaoId, texto)
      const comms = await rotinaService.getComentariosAvaliacao(avaliacaoId)
      setComentariosMap((prev) => ({ ...prev, [avaliacaoId]: comms }))
      setNovoComentario((prev) => ({ ...prev, [avaliacaoId]: '' }))
      toast({
        title: 'Comentário enviado!',
        description: 'Seu retorno foi registrado com sucesso.',
      })
    } catch (e) {
      toast({
        title: 'Erro ao enviar comentário',
        variant: 'destructive',
      })
    } finally {
      setEnviandoComentario(null)
    }
  }

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Abas dos Projetos Estratégicos (P1..P5) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-ctx-262626">
        {projetos.map((proj) => {
          const isSelected = proj.id === selectedProjetoId
          return (
            <button
              key={proj.id}
              onClick={() => handleSelectProjeto(proj.id)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all flex items-center gap-2 ${
                isSelected
                  ? 'bg-[#FFD400] text-black shadow-md shadow-[#FFD400]/20'
                  : 'bg-ctx-141414 text-ctx-9ca3af hover:text-ctx-fg hover:bg-ctx-1e1e1e border border-ctx-262626'
              }`}
            >
              <span className="font-mono">{proj.codigo}</span>
              <span>{proj.nome}</span>
            </button>
          )
        })}
      </div>

      {currentProjeto ? (
        <div className="space-y-6">
          {/* 1. Cabeçalho do Projeto */}
          <div className="p-6 rounded-2xl bg-ctx-111111 border border-ctx-262626 space-y-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-ctx-1c1c1c border border-ctx-333333 text-ctx-brand font-black">
                    {currentProjeto.codigo}
                  </span>
                  <span className="text-xs text-ctx-9ca3af uppercase tracking-wider font-semibold">
                    Projeto Estratégico CTX 2.0
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-ctx-fg tracking-tight">
                  {currentProjeto.nome}
                </h1>
                {currentProjeto.descricao && (
                  <p className="text-sm text-ctx-9ca3af max-w-2xl leading-relaxed">
                    {currentProjeto.descricao}
                  </p>
                )}
                <div className="flex items-center gap-2 text-xs text-ctx-9ca3af pt-1">
                  <Users className="w-4 h-4 text-ctx-brand" />
                  <span>
                    Sponsor:{' '}
                    <strong className="text-ctx-fg">
                      {currentProjeto.expand?.sponsor?.nome || 'Não definido'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Indicadores de Conclusão e Total */}
              <div className="flex flex-wrap items-center gap-4 bg-ctx-141414 p-4 rounded-xl border border-ctx-262626 shrink-0">
                <div className="text-center px-2">
                  <span className="block text-2xl font-mono font-black text-ctx-fg">
                    {stats.total}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-ctx-666666">Total Metas</span>
                </div>
                <div className="w-px h-10 bg-ctx-262626" />
                <div className="text-center px-2">
                  <span className="block text-2xl font-mono font-black text-[#3B82F6]">
                    {stats.percentConcluida}%
                  </span>
                  <span className="text-[10px] uppercase font-bold text-ctx-666666">Concluídas</span>
                </div>
              </div>
            </div>

            {/* Barra Segmentada de Faróis do Projeto */}
            <div className="space-y-2 pt-2 border-t border-ctx-222222">
              <div className="flex flex-wrap items-center justify-between text-xs gap-2">
                <span className="text-ctx-888888">Distribuição por Farol:</span>
                <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                  <span className="text-[#3B82F6] font-bold">● {stats.concluida} Concluída</span>
                  <span className="text-[#22C55E] font-bold">● {stats.verde} No ritmo</span>
                  <span className="text-[#F59E0B] font-bold">● {stats.atencao} Atenção</span>
                  <span className="text-[#EF4444] font-bold">● {stats.vermelho} Travado</span>
                  <span className="text-ctx-666666 font-bold">
                    ● {stats.sem_atualizacao} Sem atualização
                  </span>
                </div>
              </div>

              <div className="h-2.5 w-full bg-ctx-1c1c1c rounded-full overflow-hidden flex border border-ctx-2b2b2b">
                {stats.concluida > 0 && (
                  <div
                    style={{ width: `${(stats.concluida / stats.total) * 100}%` }}
                    className="bg-[#3B82F6]"
                  />
                )}
                {stats.verde > 0 && (
                  <div
                    style={{ width: `${(stats.verde / stats.total) * 100}%` }}
                    className="bg-[#22C55E]"
                  />
                )}
                {stats.atencao > 0 && (
                  <div
                    style={{ width: `${(stats.atencao / stats.total) * 100}%` }}
                    className="bg-[#F59E0B]"
                  />
                )}
                {stats.vermelho > 0 && (
                  <div
                    style={{ width: `${(stats.vermelho / stats.total) * 100}%` }}
                    className="bg-[#EF4444]"
                  />
                )}
                {stats.sem_atualizacao > 0 && (
                  <div
                    style={{ width: `${(stats.sem_atualizacao / stats.total) * 100}%` }}
                    className="bg-ctx-333333"
                  />
                )}
              </div>
            </div>
          </div>

          {/* 5. Bloco "Pedidos de ajuda" abertos do projeto */}
          {pedidosAjuda.length > 0 && (
            <div className="p-5 rounded-2xl bg-[#F59E0B]/5 border border-[#F59E0B]/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-[#F59E0B]" />
                  <h3 className="text-sm font-black text-ctx-fg uppercase tracking-wider">
                    Pedidos de Ajuda Abertos ({pedidosAjuda.length})
                  </h3>
                </div>
                <span className="text-[11px] text-[#F59E0B]">
                  Sponsor, admin, autor ou chamado podem resolver
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {pedidosAjuda.map((help) => {
                  const meta = metas.find((m) => m.id === help.meta)
                  const autorColab = help.expand?.preenchido_por?.nome || 'Colaborador'
                  const helperColab = help.expand?.ajuda_colaborador?.nome || 'Alguém'

                  // Pode resolver se for sponsor, admin, quem pediu ou quem foi chamado
                  const podeResolver =
                    isAdmin ||
                    isSponsor ||
                    (colaboradorLogado &&
                      (help.preenchido_por === colaboradorLogado.id ||
                        help.ajuda_colaborador === colaboradorLogado.id))

                  return (
                    <div
                      key={help.id}
                      className="p-4 rounded-xl bg-ctx-141414 border border-ctx-2b2b2b flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-mono text-ctx-brand font-bold">
                            {meta?.codigo || 'Meta'}
                          </span>
                          <span className="text-ctx-888888">
                            {new Date(help.created).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-ctx-fg">{meta?.titulo}</h4>
                        <p className="text-xs text-ctx-e5e5e5 bg-ctx-1a1a1a p-2.5 rounded-lg border border-ctx-262626 leading-relaxed">
                          "{help.ajuda_texto}"
                        </p>
                        <p className="text-[10px] text-ctx-9ca3af">
                          De: <strong className="text-ctx-fg">{autorColab}</strong> → Para:{' '}
                          <strong className="text-[#F59E0B]">{helperColab}</strong>
                        </p>
                      </div>

                      {podeResolver && (
                        <div className="pt-2 border-t border-ctx-222222">
                          <button
                            type="button"
                            onClick={() => handleResolverAjuda(help.id)}
                            disabled={resolvendoAjuda === help.id}
                            className="w-full py-1.5 px-3 rounded-lg bg-[#22C55E]/15 hover:bg-[#22C55E]/25 text-[#22C55E] border border-[#22C55E]/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            {resolvendoAjuda === help.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Marcar como Resolvido</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 2. Metas do Projeto Agrupadas por Farol */}
          <div className="space-y-6">
            {(
              [
                { key: 'concluida', title: 'Concluídas', color: '#3B82F6' },
                { key: 'verde', title: 'No ritmo', color: '#22C55E' },
                { key: 'atencao', title: 'Atenção — Em risco com plano', color: '#F59E0B' },
                { key: 'vermelho', title: 'Travado — Não cumpre sem ajuda', color: '#EF4444' },
                { key: 'sem atualização', title: 'Sem Atualização', color: '#888888' },
              ] as const
            ).map((grupo) => {
              const items = metasPorFarol[grupo.key] || []
              if (items.length === 0) return null

              return (
                <div key={grupo.key} className="space-y-3">
                  <div className="flex items-center gap-2 pb-1 border-b border-ctx-222222">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: grupo.color }}
                    />
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-ctx-fg">
                      {grupo.title} ({items.length})
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((m) => {
                      const av = avaliacoesMap.get(m.id)
                      const isPrincipal = m.projeto === selectedProjetoId
                      const podeVerDetalhes = podeVerTextosMeta(m)
                      const responsaveisList = m.expand?.responsaveis || []

                      return (
                        <div
                          key={m.id}
                          onClick={() => setSelectedGoal(m)}
                          className="group bg-ctx-111111 border border-ctx-262626 hover:border-[#FFD400] rounded-2xl p-5 cursor-pointer transition-all flex flex-col justify-between space-y-3 hover:shadow-xl hover:shadow-[#FFD400]/5"
                        >
                          <div className="space-y-2.5">
                            {/* Linha superior: Código + Tag Principal/Secundário */}
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-ctx-1c1c1c border border-ctx-333333 text-ctx-brand font-bold">
                                {m.codigo}
                              </span>

                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  isPrincipal
                                    ? 'bg-[#FFD400]/15 text-ctx-brand border border-[#FFD400]/30'
                                    : 'bg-ctx-1f1f1f text-ctx-9ca3af border border-ctx-333333'
                                }`}
                              >
                                {isPrincipal ? 'Projeto Principal' : 'Secundário'}
                              </span>
                            </div>

                            {/* Título da meta */}
                            <h4 className="text-sm font-bold text-ctx-fg group-hover:text-ctx-brand transition-colors leading-snug line-clamp-2">
                              {m.titulo}
                            </h4>

                            {/* Responsáveis */}
                            {responsaveisList.length > 0 && (
                              <div className="flex items-center gap-1.5 text-xs text-ctx-9ca3af">
                                <Users className="w-3.5 h-3.5 text-ctx-brand shrink-0" />
                                <span className="truncate">
                                  {responsaveisList.map((r) => r.nome).join(', ')}
                                </span>
                              </div>
                            )}

                            {/* Textos de Avaliação com Restrição de Visibilidade D.3 */}
                            {av ? (
                              podeVerDetalhes ? (
                                <div className="space-y-1.5 pt-1 text-xs">
                                  <div className="p-2 rounded-lg bg-ctx-161616 border border-ctx-222222">
                                    <span className="text-[10px] uppercase font-bold text-ctx-brand block mb-0.5">
                                      Avançou:
                                    </span>
                                    <p className="text-ctx-d1d5db text-[11px] line-clamp-2">
                                      {av.avancou}
                                    </p>
                                  </div>
                                  <div className="p-2 rounded-lg bg-ctx-161616 border border-ctx-222222">
                                    <span className="text-[10px] uppercase font-bold text-ctx-brand block mb-0.5">
                                      Próximo passo:
                                    </span>
                                    <p className="text-ctx-d1d5db text-[11px] line-clamp-2">
                                      {av.proximo_passo}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2.5 rounded-lg bg-ctx-141414 border border-ctx-222222 flex items-center gap-2 text-xs text-ctx-666666">
                                  <Lock className="w-3.5 h-3.5 shrink-0" />
                                  <span className="text-[11px]">
                                    Detalhamento visível aos responsáveis e sponsor.
                                  </span>
                                </div>
                              )
                            ) : null}
                          </div>

                          {/* Rodapé: Farol e data */}
                          <div className="pt-3 border-t border-ctx-262626 flex items-center justify-between text-xs">
                            <span
                              className="font-bold uppercase tracking-wider text-[11px]"
                              style={{ color: grupo.color }}
                            >
                              ●{' '}
                              {grupo.key === 'verde'
                                ? 'No ritmo'
                                : grupo.key === 'vermelho'
                                  ? 'Travado'
                                  : grupo.key}
                            </span>
                            <span className="text-[11px] text-ctx-888888 group-hover:text-ctx-fg flex items-center gap-1">
                              <span>Ver timeline</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-xs text-ctx-666666">Nenhum projeto encontrado.</div>
      )}

      {/* Drawer com histórico e comentários */}
      {selectedGoal && (
        <GoalDetailDrawer
          goal={selectedGoal}
          currentUserProfile={user}
          onClose={() => setSelectedGoal(null)}
        />
      )}
    </div>
  )
}
