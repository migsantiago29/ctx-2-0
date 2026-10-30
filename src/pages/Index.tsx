import { useEffect, useState, useCallback, useMemo } from 'react'
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
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRightLeft,
  Flame,
  CheckCircle2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectPermissions } from '@/hooks/useProjectPermissions'
import useRealtime from '@/hooks/use-realtime'
import { formatProjectLabel } from '@/lib/projectUtils'
import { getFarolLabel } from '@/lib/farolUtils'
import type {
  Meta,
  MetaWithDetails,
  Colaborador,
  Indicador,
  Processo,
  ProjetoEstrategico,
  Ciclo,
  Avaliacao,
  Pulso,
  Area,
} from '@/types/ctx'
import GoalDetailDrawer from '@/components/GoalDetailDrawer'
import { ModalPulsoSemanal } from '@/components/ModalPulsoSemanal'
import { ModalAvaliacaoMensal } from '@/components/ModalAvaliacaoMensal'
import { rotinaService } from '@/services/rotinaService'

export default function Index() {
  const { user } = useAuth()
  const { canAccessProjects } = useProjectPermissions()
  const navigate = useNavigate()

  // Estados principais
  const [metas, setMetas] = useState<MetaWithDetails[]>([])
  const [projetos, setProjetos] = useState<ProjetoEstrategico[]>([])
  const [processosDaArea, setProcessosDaArea] = useState<Processo[]>([])
  const [areasMap, setAreasMap] = useState<Map<string, Area>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedGoal, setSelectedGoal] = useState<MetaWithDetails | null>(null)

  // Colaborador associado ao usuário logado
  const [colaboradorLogado, setColaboradorLogado] = useState<Colaborador | null>(null)
  const [allColabs, setAllColabs] = useState<Colaborador[]>([])
  const [viewingColabId, setViewingColabId] = useState<string>('')

  // Rotina & Ciclos
  const [ciclosAbertos, setCiclosAbertos] = useState<Ciclo[]>([])
  const [modalPulsoAberto, setModalPulsoAberto] = useState(false)
  const [modalAvaliacaoAberto, setModalAvaliacaoAberto] = useState(false)
  const [cicloAtivoModal, setCicloAtivoModal] = useState<Ciclo | null>(null)

  // Indicador de constância do colaborador
  const [constancia, setConstancia] = useState<{ entregues: number; total: number }>({
    entregues: 0,
    total: 0,
  })

  // Mobile: coluna de processos recolhível
  const [processosExpandedMobile, setProcessosExpandedMobile] = useState(false)

  const isAdmin = user?.role === 'admin'
  const isReadOnlyMode =
    isAdmin && viewingColabId !== '' && viewingColabId !== colaboradorLogado?.id

  // Carregar todos os colaboradores se admin
  useEffect(() => {
    async function fetchAdminColabs() {
      if (!user || user.role !== 'admin') return
      try {
        const list = await pb.collection('colaboradores').getFullList<Colaborador>({
          sort: 'nome',
          expand: 'area',
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
          expand: 'area',
        })
        if (list.items.length > 0) {
          const colab = list.items[0]
          setColaboradorLogado(colab)
          setViewingColabId(colab.id)
        } else if (user.role === 'admin') {
          const first = await pb
            .collection('colaboradores')
            .getFirstListItem<Colaborador>('', { expand: 'area' })
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

  // Colaborador ativo na exibição
  const activeColaborador = allColabs.find((c) => c.id === viewingColabId) || colaboradorLogado

  // Carregar áreas do sistema para mapeamento
  useEffect(() => {
    async function loadAreas() {
      try {
        const list = await pb.collection('areas').getFullList<Area>()
        const map = new Map<string, Area>()
        list.forEach((a) => map.set(a.id, a))
        setAreasMap(map)
      } catch {
        /* intentionally ignored */
      }
    }
    loadAreas()
  }, [])

  // Carregar dados gerais do dashboard
  const fetchDashboardData = useCallback(async () => {
    const targetColabId = viewingColabId || colaboradorLogado?.id
    if (!targetColabId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // 1. Ciclos Abertos & Configuração
      const config = await rotinaService.getConfiguracao()
      let ciclos: Ciclo[] = []
      if (config?.rotina_ativa) {
        ciclos = await rotinaService.getCiclosAbertos()
        setCiclosAbertos(ciclos)
      } else {
        setCiclosAbertos([])
      }

      // 2. Metas do colaborador
      const metasRecords = await pb.collection('metas').getFullList<Meta>({
        filter: `responsaveis ~ "${targetColabId}"`,
        expand: 'projeto,projeto_secundario,responsaveis,processos_vinculados',
        sort: 'codigo',
      })

      // 3. Todos os Projetos Estratégicos (P1..P5) + Todas as metas para calcular distribuição
      const [todosProjetos, todasMetas, todosProcessos] = await Promise.all([
        pb.collection('projetos_estrategicos').getFullList<ProjetoEstrategico>({
          sort: 'codigo',
          expand: 'sponsor',
        }),
        pb.collection('metas').getFullList<Meta>({
          sort: 'codigo',
        }),
        pb.collection('processos').getFullList<Processo>({
          sort: 'codigo',
          expand: 'etapas_anteriores,etapas_sucessoras',
        }),
      ])

      // Calcular farol/metas por projeto
      const projMap = new Map<
        string,
        {
          total: number
          verde: number
          atencao: number
          vermelho: number
          concluida: number
          sem_atualizacao: number
        }
      >()
      todosProjetos.forEach((p) => {
        projMap.set(p.id, {
          total: 0,
          verde: 0,
          atencao: 0,
          vermelho: 0,
          concluida: 0,
          sem_atualizacao: 0,
        })
      })

      todasMetas.forEach((m) => {
        const pId = m.projeto
        const stats = projMap.get(pId)
        if (stats) {
          stats.total++
          if (m.status === 'verde') stats.verde++
          else if (m.status === 'atencao') stats.atencao++
          else if (m.status === 'vermelho') stats.vermelho++
          else if (m.status === 'concluida') stats.concluida++
          else stats.sem_atualizacao++
        }
      })

      const projetosWithStats: ProjetoEstrategico[] = todosProjetos.map((p) => {
        const stats = projMap.get(p.id) || {
          total: 0,
          verde: 0,
          atencao: 0,
          vermelho: 0,
          concluida: 0,
          sem_atualizacao: 0,
        }
        return {
          ...p,
          totalMetas: stats.total,
          metasCount: stats,
        }
      })
      setProjetos(projetosWithStats)

      // 4. Detalhes das metas do colaborador + última avaliação mensal de cada
      let detailedMetas: MetaWithDetails[] = []
      if (metasRecords.length > 0) {
        const metaIds = metasRecords.map((m) => m.id)
        const filterQueries = metaIds.map((id) => `meta="${id}"`).join(' || ')

        const [indicadores, avaliacoes, pulsos] = await Promise.all([
          pb
            .collection('indicadores')
            .getFullList<Indicador>({
              filter: filterQueries,
              sort: 'ordem',
            })
            .catch(() => []),
          pb
            .collection('avaliacoes')
            .getFullList<Avaliacao>({
              filter: filterQueries,
              sort: '-created',
              expand: 'ciclo',
            })
            .catch(() => []),
          pb
            .collection('pulsos')
            .getFullList<Pulso>({
              filter: filterQueries,
              sort: '-created',
            })
            .catch(() => []),
        ])

        const indMap = new Map<string, Indicador[]>()
        indicadores.forEach((i) => {
          if (!indMap.has(i.meta)) indMap.set(i.meta, [])
          indMap.get(i.meta)!.push(i)
        })

        const avMap = new Map<string, Avaliacao>()
        avaliacoes.forEach((av) => {
          if (!avMap.has(av.meta)) avMap.set(av.meta, av)
        })

        const pulsoMap = new Map<string, Pulso>()
        pulsos.forEach((p) => {
          if (!pulsoMap.has(p.meta)) pulsoMap.set(p.meta, p)
        })

        const procMap = new Map<string, Processo>()
        todosProcessos.forEach((p) => procMap.set(p.id, p))

        detailedMetas = metasRecords.map((meta) => {
          const procsList: Processo[] = []
          if (Array.isArray(meta.processos_vinculados)) {
            for (const pId of meta.processos_vinculados) {
              const proc = procMap.get(pId)
              if (proc) procsList.push(proc)
            }
          }

          return {
            ...meta,
            indicadoresList: indMap.get(meta.id) || [],
            processosList: procsList,
            ultimaAvaliacao: avMap.get(meta.id),
            ultimoPulso: pulsoMap.get(meta.id),
          }
        })
      }
      setMetas(detailedMetas)

      // 5. Processos da Área do colaborador
      const areaId = activeColaborador?.area
      let areaNome = ''
      if (areaId) {
        try {
          const areaObj =
            areasMap.get(areaId) || (await pb.collection('areas').getOne<Area>(areaId))
          areaNome = areaObj?.nome || ''
        } catch {
          /* intentionally ignored */
        }
      }

      // Filtrar processos pela área (nome ou código da área)
      const procsDaArea = todosProcessos.filter((p) => {
        if (!areaNome && !areaId) return false
        return (
          p.area?.toLowerCase() === areaNome?.toLowerCase() ||
          p.area?.toLowerCase() === areaId?.toLowerCase()
        )
      })
      setProcessosDaArea(procsDaArea)

      // 6. Constância do colaborador (avaliações no prazo / total de ciclos)
      const allCiclosPassados = await pb.collection('ciclos').getFullList<Ciclo>({
        sort: 'created',
      })
      if (allCiclosPassados.length > 0 && detailedMetas.length > 0) {
        // Quantos ciclos o colaborador preencheu
        const avaliacoesDoColab = await pb.collection('avaliacoes').getFullList<Avaliacao>({
          filter: `preenchido_por = "${targetColabId}"`,
        })
        const ciclosRespondidos = new Set(avaliacoesDoColab.map((a) => a.ciclo)).size
        setConstancia({
          entregues: ciclosRespondidos,
          total: allCiclosPassados.length,
        })
      } else {
        setConstancia({ entregues: 0, total: allCiclosPassados.length })
      }
    } catch (err) {
      console.error('Erro ao carregar Meu Painel:', err)
    } finally {
      setLoading(false)
    }
  }, [viewingColabId, colaboradorLogado, activeColaborador, areasMap])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  useRealtime<Meta>('metas', () => fetchDashboardData())
  useRealtime<Avaliacao>('avaliacoes', () => fetchDashboardData())
  useRealtime<Ciclo>('ciclos', () => fetchDashboardData())

  // Metas do colaborador por projeto para verificar contribuição
  const metasDoColabPorProjeto = useMemo(() => {
    const map = new Map<string, number>()
    metas.forEach((m) => {
      if (m.projeto) map.set(m.projeto, (map.get(m.projeto) || 0) + 1)
      if (m.projeto_secundario)
        map.set(m.projeto_secundario, (map.get(m.projeto_secundario) || 0) + 1)
    })
    return map
  }, [metas])

  // Processos vinculados às metas do colaborador para marcar ponto amarelo
  const processosComPontoAmarelo = useMemo(() => {
    const set = new Set<string>()
    metas.forEach((m) => {
      if (Array.isArray(m.processos_vinculados)) {
        m.processos_vinculados.forEach((pId) => set.add(pId))
      }
    })
    return set
  }, [metas])

  // Análise da cadeia de processos da área: "Recebe de" e "Entrega para"
  const { recebeDe, entregaPara } = useMemo(() => {
    const recebeSet = new Set<string>()
    const entregaSet = new Set<string>()

    const areaNomeAtual =
      (activeColaborador?.area ? areasMap.get(activeColaborador.area)?.nome : '') || ''

    processosDaArea.forEach((proc) => {
      // Etapas anteriores -> Recebe de
      if (proc.expand?.etapas_anteriores) {
        proc.expand.etapas_anteriores.forEach((ant) => {
          if (ant.area && ant.area !== areaNomeAtual && ant.area !== proc.area) {
            recebeSet.add(ant.area)
          }
        })
      }
      // Etapas sucessoras -> Entrega para
      if (proc.expand?.etapas_sucessoras) {
        proc.expand.etapas_sucessoras.forEach((suc) => {
          if (suc.area && suc.area !== areaNomeAtual && suc.area !== proc.area) {
            entregaSet.add(suc.area)
          }
        })
      }
    })

    return {
      recebeDe: Array.from(recebeSet),
      entregaPara: Array.from(entregaSet),
    }
  }, [processosDaArea, activeColaborador, areasMap])

  // Acompanhamento pendente para a faixa amarela
  const pendenciaAtual = useMemo(() => {
    if (metas.length === 0 || ciclosAbertos.length === 0) return null

    // 1. Checa avaliação mensal primeiro
    const mensal = ciclosAbertos.find((c) => c.tipo === 'avaliacao_mensal')
    if (mensal) {
      // Metas ativas não concluídas
      const metasPendentes = metas.filter((m) => {
        if (m.status === 'concluida') return false
        // Se a última avaliação desta meta não é deste ciclo, está pendente
        return m.ultimaAvaliacao?.ciclo !== mensal.id
      })

      if (metasPendentes.length > 0) {
        const dataLimite = new Date(mensal.fechamento).toLocaleDateString('pt-BR')
        return {
          tipo: 'avaliacao_mensal' as const,
          ciclo: mensal,
          titulo: `Avaliação mensal (${mensal.referencia}) aberta até ${dataLimite} — ${metasPendentes.length} meta(s) pendente(s)`,
          metasPendentes,
        }
      }
    }

    // 2. Checa pulso semanal
    const pulso = ciclosAbertos.find((c) => c.tipo === 'pulso_semanal')
    if (pulso) {
      const metasPendentesPulso = metas.filter((m) => {
        if (m.status === 'concluida') return false
        return m.ultimoPulso?.ciclo !== pulso.id
      })
      if (metasPendentesPulso.length > 0) {
        const dataLimite = new Date(pulso.fechamento).toLocaleDateString('pt-BR')
        return {
          tipo: 'pulso_semanal' as const,
          ciclo: pulso,
          titulo: `Pulso semanal (${pulso.referencia}) aberto até ${dataLimite} — ${metasPendentesPulso.length} meta(s) pendente(s)`,
          metasPendentes: metasPendentesPulso,
        }
      }
    }

    return null
  }, [metas, ciclosAbertos])

  const abrirFormularioAcompanhamento = (pendencia: NonNullable<typeof pendenciaAtual>) => {
    setCicloAtivoModal(pendencia.ciclo)
    if (pendencia.tipo === 'pulso_semanal') {
      setModalPulsoAberto(true)
    } else {
      setModalAvaliacaoAberto(true)
    }
  }

  // Nome da área do colaborador para cabeçalho da coluna
  const nomeAreaColab =
    (activeColaborador?.area && areasMap.get(activeColaborador.area)?.nome) ||
    activeColaborador?.cargo ||
    'Sua Área'

  const semMetas = !!activeColaborador?.sem_metas

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Banner de Modo Somente Leitura para Administrador */}
      {isReadOnlyMode && (
        <div className="p-3.5 rounded-xl bg-[#FFD400]/10 border border-[#FFD400]/40 flex items-center justify-between text-xs text-ctx-brand">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 shrink-0 text-ctx-brand" />
            <span>
              <strong>Modo de Leitura (Admin):</strong> Visualizando painel de{' '}
              <strong className="text-ctx-fg underline">{activeColaborador?.nome}</strong>.
            </span>
          </div>
          <button
            onClick={() => setViewingColabId(colaboradorLogado?.id || '')}
            className="px-2.5 py-1 rounded bg-[#FFD400] text-black font-extrabold hover:bg-[#E5BE00] transition-colors"
          >
            Voltar ao meu painel
          </button>
        </div>
      )}

      {/* 1. CABEÇALHO: Saudação com Nome, Cargo e Área */}
      <div className="border-b border-ctx-262626 pb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-ctx-brand text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Planejamento Estratégico CTX 2.0</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-ctx-fg tracking-tight">
              Olá, {activeColaborador?.nome || user?.name || 'Colaborador'}
            </h1>
            <p className="text-xs md:text-sm text-ctx-9ca3af mt-1 flex flex-wrap items-center gap-2">
              <span>{activeColaborador?.cargo || 'Colaborador'}</span>
              <span>•</span>
              <span className="text-ctx-brand font-semibold">{nomeAreaColab}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && allColabs.length > 0 && (
              <div className="flex items-center gap-2 bg-ctx-141414 border border-ctx-2b2b2b px-3 py-1.5 rounded-xl">
                <span className="text-xs text-ctx-9ca3af font-medium whitespace-nowrap">
                  Ver painel de:
                </span>
                <select
                  value={viewingColabId}
                  onChange={(e) => setViewingColabId(e.target.value)}
                  className="bg-transparent text-xs text-ctx-fg font-bold outline-none cursor-pointer pr-1"
                >
                  {allColabs.map((c) => (
                    <option key={c.id} value={c.id} className="bg-ctx-1a1a1a text-ctx-fg">
                      {c.nome} {c.id === colaboradorLogado?.id ? '(Você)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. AVISO DE ACOMPANHAMENTO: Faixa amarela no topo */}
      {pendenciaAtual && (
        <div className="p-4 rounded-2xl bg-[#FFD400] text-black border border-[#E5BE00] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-[#FFD400]/10 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-black" />
            </div>
            <div>
              <p className="font-extrabold text-xs sm:text-sm leading-snug">
                {pendenciaAtual.titulo}
              </p>
              <p className="text-[11px] text-black/80 font-medium">
                Mantenha seus registros em dia para a Reunião Mensal de Resultados
              </p>
            </div>
          </div>
          <button
            onClick={() => abrirFormularioAcompanhamento(pendenciaAtual)}
            className="px-4 py-2.5 rounded-xl bg-black hover:bg-ctx-1a1a1a text-ctx-brand font-black text-xs flex items-center justify-center gap-2 transition-all shrink-0 shadow-md"
          >
            <span>Preencher agora</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. FAIXA "PROJETOS CTX 2.0" (Carrossel Horizontal Mobile / Lado a Lado Desktop) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-ctx-brand" />
            <h2 className="text-xs uppercase font-extrabold tracking-wider text-ctx-fg">
              Projetos Estratégicos CTX 2.0
            </h2>
          </div>
          <span className="text-[11px] text-ctx-9ca3af">
            {canAccessProjects
              ? 'Clique para ver metas e andamento do projeto'
              : 'Andamento dos projetos estratégicos'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 overflow-x-auto pb-1 scrollbar-none">
          {projetos.map((proj) => {
            const metasQtd = metasDoColabPorProjeto.get(proj.id) || 0
            const isSponsor = proj.sponsor === activeColaborador?.id
            const participa = metasQtd > 0 || isSponsor

            const counts = proj.metasCount || {
              total: 0,
              verde: 0,
              atencao: 0,
              vermelho: 0,
              concluida: 0,
              sem_atualizacao: 0,
            }
            const total = counts.total || 1

            return (
              <div
                key={proj.id}
                onClick={() => {
                  if (canAccessProjects) {
                    navigate(`/projetos/${proj.id}`)
                  }
                }}
                className={`group relative p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                  canAccessProjects ? 'cursor-pointer' : 'cursor-default'
                } ${
                  participa
                    ? 'border-[#FFD400] bg-ctx-141414 shadow-md shadow-[#FFD400]/5'
                    : 'border-ctx-242424 bg-ctx-0e0e0e opacity-60 grayscale hover:opacity-100 hover:grayscale-0'
                }`}
              >
                <div>
                  {/* Badges de Contribuição & Sponsor */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-ctx-1c1c1c border border-ctx-333333 text-ctx-brand font-extrabold">
                      {proj.codigo}
                    </span>
                    {isSponsor && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFD400] text-black font-extrabold">
                        Sponsor
                      </span>
                    )}
                    {metasQtd > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFD400]/15 text-ctx-brand border border-[#FFD400]/30 font-bold">
                        Você: {metasQtd} meta{metasQtd > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-ctx-fg group-hover:text-ctx-brand transition-colors leading-snug truncate">
                    {proj.nome}
                  </h3>
                  <p className="text-[11px] text-ctx-9ca3af line-clamp-1 mt-0.5">
                    Sponsor: {proj.expand?.sponsor?.nome || 'Não definido'}
                  </p>
                </div>

                {/* Barra Segmentada de Faróis da Empresa */}
                <div className="space-y-1.5 pt-2 border-t border-ctx-222222">
                  <div className="flex justify-between items-center text-[10px] text-ctx-888888">
                    <span>{counts.total} metas</span>
                    <span className="font-mono text-ctx-d1d5db">
                      {Math.round((counts.concluida / total) * 100)}% concl.
                    </span>
                  </div>

                  {/* Barra Segmentada */}
                  <div className="h-2 w-full bg-ctx-1c1c1c rounded-full overflow-hidden flex border border-ctx-2b2b2b">
                    {counts.concluida > 0 && (
                      <div
                        style={{ width: `${(counts.concluida / total) * 100}%` }}
                        className="bg-[#3B82F6]"
                        title={`Concluídas: ${counts.concluida}`}
                      />
                    )}
                    {counts.verde > 0 && (
                      <div
                        style={{ width: `${(counts.verde / total) * 100}%` }}
                        className="bg-[#22C55E]"
                        title={`No ritmo: ${counts.verde}`}
                      />
                    )}
                    {counts.atencao > 0 && (
                      <div
                        style={{ width: `${(counts.atencao / total) * 100}%` }}
                        className="bg-[#F59E0B]"
                        title={`Atenção: ${counts.atencao}`}
                      />
                    )}
                    {counts.vermelho > 0 && (
                      <div
                        style={{ width: `${(counts.vermelho / total) * 100}%` }}
                        className="bg-[#EF4444]"
                        title={`Travado: ${counts.vermelho}`}
                      />
                    )}
                    {counts.sem_atualizacao > 0 && (
                      <div
                        style={{ width: `${(counts.sem_atualizacao / total) * 100}%` }}
                        className="bg-ctx-333333"
                        title={`Sem atualização: ${counts.sem_atualizacao}`}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* LAYOUT PRINCIPAL: 2/3 Minhas Metas + 1/3 Processos da Minha Área */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA PRINCIPAL: Minhas Metas (2/3 da largura no desktop = col-span-8) */}
        <div
          className={`${semMetas ? 'lg:col-span-12 order-2' : 'lg:col-span-8 order-1'} space-y-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-ctx-brand" />
              <h2 className="text-xs uppercase font-extrabold tracking-wider text-ctx-fg">
                Minhas Metas ({metas.length})
              </h2>
            </div>
            {pendenciaAtual && (
              <button
                onClick={() => abrirFormularioAcompanhamento(pendenciaAtual)}
                className="text-xs text-ctx-brand hover:underline flex items-center gap-1 font-bold"
              >
                <span>Responder ciclo</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-44 bg-ctx-111111 border border-ctx-262626 rounded-2xl animate-pulse p-4"
                />
              ))}
            </div>
          ) : metas.length === 0 ? (
            <div className="bg-ctx-111111 border border-ctx-262626 rounded-2xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-ctx-1a1a1a flex items-center justify-center text-ctx-brand mx-auto">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-ctx-fg">Nenhuma meta atribuída</h3>
              <p className="text-xs text-ctx-9ca3af max-w-sm mx-auto leading-relaxed">
                {semMetas
                  ? 'Você está configurado como participante sem metas diretas no planejamento.'
                  : 'Nenhuma meta vinculada a este colaborador no momento.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {metas.map((goal) => {
                const av = goal.ultimaAvaliacao
                const farol = av?.farol
                const farolColor =
                  farol === 'verde'
                    ? '#22C55E'
                    : farol === 'atencao'
                      ? '#F59E0B'
                      : farol === 'concluida'
                        ? '#3B82F6'
                        : farol === 'vermelho'
                          ? '#EF4444'
                          : null

                const dataAvaliacao = av?.created
                  ? new Date(av.created).toLocaleDateString('pt-BR')
                  : null

                const responsaveisList = goal.expand?.responsaveis || []
                const coResponsaveis = responsaveisList.filter(
                  (r) => r.id !== activeColaborador?.id,
                )

                return (
                  <div
                    key={goal.id}
                    onClick={() => setSelectedGoal(goal)}
                    className="group bg-ctx-111111 border border-ctx-262626 hover:border-[#FFD400] rounded-2xl p-5 cursor-pointer transition-all flex flex-col justify-between space-y-3 hover:shadow-xl hover:shadow-[#FFD400]/5"
                  >
                    <div className="space-y-2.5">
                      {/* Topo: Código + Projeto */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-ctx-1c1c1c border border-ctx-333333 text-ctx-brand font-bold">
                          {goal.codigo}
                        </span>

                        {goal.expand?.projeto && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFD400] text-black font-extrabold">
                            {formatProjectLabel(goal.expand.projeto)}
                          </span>
                        )}

                        {goal.expand?.projeto_secundario && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#FFD400]/70 text-ctx-brand font-bold">
                            {formatProjectLabel(goal.expand.projeto_secundario)}
                          </span>
                        )}
                      </div>

                      {/* Título da Meta */}
                      <h3 className="text-sm font-bold text-ctx-fg group-hover:text-ctx-brand transition-colors leading-snug line-clamp-2">
                        {goal.titulo}
                      </h3>

                      {/* Prazo */}
                      {goal.prazo && (
                        <div className="flex items-center gap-1 text-[11px] text-ctx-9ca3af">
                          <Calendar className="w-3.5 h-3.5 text-ctx-brand" />
                          <span>
                            Prazo:{' '}
                            {new Date(goal.prazo).toLocaleDateString('pt-BR', {
                              timeZone: 'UTC',
                            })}
                          </span>
                        </div>
                      )}

                      {/* Próximo passo informado na última avaliação */}
                      {av?.proximo_passo ? (
                        <div className="p-2.5 rounded-xl bg-ctx-161616 border border-ctx-242424 text-xs">
                          <span className="text-[10px] uppercase font-bold text-ctx-brand block mb-0.5">
                            Próximo passo:
                          </span>
                          <p className="text-ctx-d1d5db text-[11px] line-clamp-2 leading-relaxed">
                            {av.proximo_passo}
                          </p>
                        </div>
                      ) : (
                        <div className="text-[11px] text-ctx-666666 italic">
                          Nenhum próximo passo registrado ainda.
                        </div>
                      )}
                    </div>

                    {/* Rodapé: Farol da última avaliação mensal OU "Sem atualização" */}
                    <div className="pt-3 border-t border-ctx-262626 flex items-center justify-between text-xs">
                      {farol && farolColor ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full animate-pulse"
                            style={{ backgroundColor: farolColor }}
                          />
                          <span
                            className="font-bold uppercase tracking-wider text-[11px]"
                            style={{ color: farolColor }}
                          >
                            {getFarolLabel(farol)}
                          </span>
                          {dataAvaliacao && (
                            <span className="text-[10px] text-ctx-666666">em {dataAvaliacao}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-ctx-1c1c1c border border-ctx-2b2b2b text-ctx-9ca3af font-bold">
                          Sem atualização
                        </span>
                      )}

                      <span className="text-[11px] text-ctx-888888 group-hover:text-ctx-fg flex items-center gap-1 transition-colors">
                        <span>Ver detalhes</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* COLUNA LATERAL: Processos da Minha Área (1/3 no desktop = col-span-4) */}
        <div
          className={`${semMetas ? 'lg:col-span-12 order-1' : 'lg:col-span-4 order-2'} space-y-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-ctx-brand" />
              <h2 className="text-xs uppercase font-extrabold tracking-wider text-ctx-fg">
                Processos da Área — {nomeAreaColab}
              </h2>
            </div>
            {/* Mobile: Toggle para recolher */}
            <button
              onClick={() => setProcessosExpandedMobile(!processosExpandedMobile)}
              className="lg:hidden p-1 rounded-lg text-ctx-9ca3af hover:text-ctx-fg bg-ctx-161616"
            >
              {processosExpandedMobile ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className={`space-y-4 ${processosExpandedMobile ? 'block' : 'hidden lg:block'}`}>
            {/* 5.a Bloco "Minha área na cadeia": Recebe de / Entrega para */}
            <div className="p-4 rounded-2xl bg-ctx-141414 border border-ctx-262626 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-ctx-brand" />
                <h3 className="text-xs font-bold text-ctx-fg uppercase tracking-wider">
                  Minha Área na Cadeia
                </h3>
              </div>

              {/* Recebe de */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-ctx-9ca3af block">
                  Recebe de:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {recebeDe.length > 0 ? (
                    recebeDe.map((area, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-ctx-1c1c1c border border-ctx-2f2f2f text-ctx-d1d5db font-medium"
                      >
                        {area}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-ctx-666666 italic">
                      Início da cadeia ou sem conexões registradas
                    </span>
                  )}
                </div>
              </div>

              {/* Entrega para */}
              <div className="space-y-1.5 pt-1 border-t border-ctx-222222">
                <span className="text-[10px] uppercase font-bold text-ctx-9ca3af block">
                  Entrega para:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {entregaPara.length > 0 ? (
                    entregaPara.map((area, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-ctx-1c1c1c border border-ctx-2f2f2f text-ctx-d1d5db font-medium"
                      >
                        {area}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-ctx-666666 italic">
                      Final da cadeia ou sem conexões registradas
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 5.b Lista de Processos da Área */}
            <div className="p-4 rounded-2xl bg-ctx-141414 border border-ctx-262626 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-ctx-222222">
                <span className="text-xs font-bold text-ctx-fg">
                  Processos ({processosDaArea.length})
                </span>
                <span className="text-[10px] text-ctx-666666">Ponto amarelo = com meta</span>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1 divide-y divide-ctx-1f1f1f">
                {processosDaArea.length === 0 ? (
                  <p className="text-xs text-ctx-666666 py-3 text-center">
                    Nenhum processo cadastrado para esta área.
                  </p>
                ) : (
                  processosDaArea.map((p) => {
                    const temMeta = processosComPontoAmarelo.has(p.id)
                    return (
                      <div
                        key={p.id}
                        onClick={() =>
                          navigate(`/fluxograma?processo=${encodeURIComponent(p.codigo)}`)
                        }
                        className="py-2 px-2 hover:bg-ctx-1c1c1c rounded-lg transition-colors cursor-pointer flex items-center justify-between gap-2 group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {temMeta && (
                            <span
                              className="w-2 h-2 rounded-full bg-[#FFD400] shrink-0 shadow-sm shadow-[#FFD400]"
                              title="Vinculado às suas metas"
                            />
                          )}
                          <span className="font-mono text-xs font-bold text-ctx-brand shrink-0">
                            {p.codigo}
                          </span>
                          <span className="text-xs text-ctx-d1d5db group-hover:text-ctx-fg truncate">
                            {p.nome}
                          </span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-ctx-555555 group-hover:text-ctx-fg shrink-0" />
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. RODAPÉ DO PAINEL: "Sua constância" */}
      <div className="p-4 rounded-2xl bg-ctx-111111 border border-ctx-262626 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FFD400]/10 border border-[#FFD400]/30 flex items-center justify-center text-ctx-brand font-bold">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-ctx-fg">Sua Constância no CTX 2.0</p>
            <p className="text-ctx-9ca3af text-[11px]">
              Avaliações entregues no prazo sobre o total de ciclos desde o início da rotina
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-sm font-mono font-black text-ctx-brand">
              {constancia.entregues} de {constancia.total} ciclos
            </span>
            <span className="block text-[10px] text-ctx-666666">
              {constancia.total > 0
                ? `${Math.round((constancia.entregues / constancia.total) * 100)}% de pontualidade`
                : 'Nenhum ciclo fechado'}
            </span>
          </div>
        </div>
      </div>

      {/* Drawer de Detalhes da Meta com Timeline & Comentários */}
      {selectedGoal && (
        <GoalDetailDrawer
          goal={selectedGoal}
          currentUserProfile={user}
          onClose={() => setSelectedGoal(null)}
        />
      )}

      {/* Modal Pulso Semanal */}
      {modalPulsoAberto && cicloAtivoModal && (
        <ModalPulsoSemanal
          ciclo={cicloAtivoModal}
          metas={metas}
          onClose={() => setModalPulsoAberto(false)}
          onSuccess={() => fetchDashboardData()}
        />
      )}

      {/* Modal Avaliação Mensal */}
      {modalAvaliacaoAberto && cicloAtivoModal && (
        <ModalAvaliacaoMensal
          ciclo={cicloAtivoModal}
          metas={metas}
          todosColaboradores={allColabs}
          onClose={() => setModalAvaliacaoAberto(false)}
          onSuccess={() => fetchDashboardData()}
        />
      )}
    </div>
  )
}
