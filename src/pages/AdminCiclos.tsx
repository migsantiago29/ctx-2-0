import { useEffect, useState, useMemo } from 'react'
import {
  Sliders,
  Play,
  Pause,
  Clock,
  Calendar,
  Send,
  Download,
  AlertTriangle,
  CheckCircle2,
  Users,
  Flame,
  Check,
  RotateCcw,
  Plus,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import type {
  Ciclo,
  ConfiguracaoGeral,
  Colaborador,
  Meta,
  Avaliacao,
  Pulso,
  Area,
  ProjetoEstrategico,
} from '@/types/ctx'
import { rotinaService } from '@/services/rotinaService'
import { toast } from '@/hooks/use-toast'

export default function AdminCiclos() {
  const [config, setConfig] = useState<ConfiguracaoGeral | null>(null)
  const [ciclos, setCiclos] = useState<Ciclo[]>([])
  const [selectedCicloId, setSelectedCicloId] = useState<string>('')
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [metas, setMetas] = useState<Meta[]>([])
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [pulsos, setPulsos] = useState<Pulso[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [projetos, setProjetos] = useState<ProjetoEstrategico[]>([])

  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [lembrando, setLembrando] = useState(false)

  // Filtros de Exportação CSV
  const [exportTipo, setExportTipo] = useState<'avaliacoes' | 'pulsos'>('avaliacoes')
  const [exportCicloId, setExportCicloId] = useState<string>('')
  const [exportProjetoId, setExportProjetoId] = useState<string>('')
  const [exportAreaId, setExportAreaId] = useState<string>('')

  // Modal Novo Ciclo Manual
  const [novoCicloModal, setNovoCicloModal] = useState(false)
  const [novoTipo, setNovoTipo] = useState<'pulso_semanal' | 'avaliacao_mensal'>('avaliacao_mensal')
  const [novaRef, setNovaRef] = useState('')
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaAbertura, setNovaAbertura] = useState('')
  const [novoFechamento, setNovoFechamento] = useState('')

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [cfg, cList, colabList, mList, avList, pulList, aList, pList] = await Promise.all([
        rotinaService.getConfiguracao(),
        rotinaService.getAllCiclos(),
        pb.collection('colaboradores').getFullList<Colaborador>({ expand: 'area', sort: 'nome' }),
        pb.collection('metas').getFullList<Meta>({ sort: 'codigo' }),
        pb.collection('avaliacoes').getFullList<Avaliacao>({ expand: 'meta,preenchido_por' }),
        pb.collection('pulsos').getFullList<Pulso>(),
        pb.collection('areas').getFullList<Area>({ sort: 'nome' }),
        pb.collection('projetos_estrategicos').getFullList<ProjetoEstrategico>({ sort: 'codigo' }),
      ])

      setConfig(cfg)
      setCiclos(cList)
      if (cList.length > 0 && !selectedCicloId) {
        setSelectedCicloId(cList[0].id)
      }
      setColaboradores(colabList)
      setMetas(mList)
      setAvaliacoes(avList)
      setPulsos(pulList)
      setAreas(aList)
      setProjetos(pList)
    } catch (err) {
      console.error('Erro ao carregar dados de administração de ciclos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // 1. Ações da Rotina Geral (Ativar / Pausar rotina; Ligar/Desligar pulso semanal)
  const handleToggleRotina = async () => {
    setActionLoading(true)
    try {
      const novo = !config?.rotina_ativa
      await rotinaService.setRotinaAtiva(novo)
      setConfig((prev) => (prev ? { ...prev, rotina_ativa: novo } : null))
      toast({
        title: novo ? 'Rotina CTX 2.0 ativada!' : 'Rotina pausada.',
        description: novo
          ? 'Os ciclos semanais e mensais agora rodarão conforme o cronograma oficial.'
          : 'Nenhum ciclo automático será aberto enquanto a rotina estiver pausada.',
      })
    } catch (e) {
      toast({ title: 'Erro ao alterar rotina', variant: 'destructive' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleTogglePulso = async () => {
    setActionLoading(true)
    try {
      const novo = !config?.pulso_ativo
      await rotinaService.setPulsoAtivo(novo)
      setConfig((prev) => (prev ? { ...prev, pulso_ativo: novo } : null))
      toast({
        title: novo ? 'Pulso semanal ligado.' : 'Pulso semanal desligado.',
        description: novo
          ? 'Colaboradores responderão o check-in semanal de 1 minuto.'
          : 'Apenas a avaliação mensal ficará em vigor.',
      })
    } catch (e) {
      toast({ title: 'Erro ao alterar pulso semanal', variant: 'destructive' })
    } finally {
      setActionLoading(false)
    }
  }

  // 2. Ações de Ciclo: Fechar / Reabrir / Criar
  const cicloSelecionado = ciclos.find((c) => c.id === selectedCicloId) || null

  const handleToggleStatusCiclo = async (ciclo: Ciclo) => {
    setActionLoading(true)
    try {
      if (ciclo.status === 'aberto') {
        await rotinaService.fecharCiclo(ciclo.id)
        toast({ title: 'Ciclo fechado com sucesso.' })
      } else {
        await rotinaService.reabrirCiclo(ciclo.id)
        toast({ title: 'Ciclo reaberto com sucesso.' })
      }
      await carregarDados()
    } catch (e) {
      toast({ title: 'Erro ao alterar status do ciclo', variant: 'destructive' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleCriarCiclo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novaRef || !novaAbertura || !novoFechamento) {
      toast({ title: 'Preencha todos os campos do ciclo.', variant: 'destructive' })
      return
    }
    setActionLoading(true)
    try {
      await rotinaService.criarCicloManual({
        tipo: novoTipo,
        referencia: novaRef,
        titulo: novoTitulo || novaRef,
        abertura: new Date(novaAbertura).toISOString(),
        fechamento: new Date(novoFechamento).toISOString(),
      })
      toast({
        title: 'Ciclo criado com sucesso!',
        description: 'Notificação enviada aos responsáveis.',
      })
      setNovoCicloModal(false)
      setNovaRef('')
      setNovoTitulo('')
      await carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao criar ciclo',
        description: err instanceof Error ? err.message : 'Falha na criação.',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // 3. Taxa de Adesão e Pendentes do Ciclo Selecionado
  const { taxaAdesao, totalMetasCiclo, totalEntregues, pendentesList } = useMemo(() => {
    if (!cicloSelecionado) {
      return { taxaAdesao: 0, totalMetasCiclo: 0, totalEntregues: 0, pendentesList: [] }
    }

    const isMensal = cicloSelecionado.tipo === 'avaliacao_mensal'
    const metasAtivas = metas.filter((m) => m.status !== 'concluida')

    // Mapear quais metas foram respondidas neste ciclo
    const metasRespondidas = new Set(
      isMensal
        ? avaliacoes.filter((a) => a.ciclo === cicloSelecionado.id).map((a) => a.meta)
        : pulsos.filter((p) => p.ciclo === cicloSelecionado.id).map((p) => p.meta),
    )

    const pendentes: Array<{
      colaborador: Colaborador
      metasPendentes: Meta[]
    }> = []

    // Agrupar por colaborador
    colaboradores.forEach((colab) => {
      if (colab.sem_metas) return

      const metasDoColab = metasAtivas.filter((m) => {
        const respIds = m.getStringSlice ? m.getStringSlice('responsaveis') : m.responsaveis || []
        return respIds.includes(colab.id)
      })

      if (metasDoColab.length === 0) return

      const naoRespondidas = metasDoColab.filter((m) => !metasRespondidas.has(m.id))
      if (naoRespondidas.length > 0) {
        pendentes.push({
          colaborador: colab,
          metasPendentes: naoRespondidas,
        })
      }
    })

    const totalMetasEsperadas = metasAtivas.length || 1
    const totalEnt = metasRespondidas.size
    const adesao = Math.round((totalEnt / totalMetasEsperadas) * 100)

    return {
      taxaAdesao: adesao,
      totalMetasCiclo: metasAtivas.length,
      totalEntregues: totalEnt,
      pendentesList: pendentes,
    }
  }, [cicloSelecionado, metas, avaliacoes, pulsos, colaboradores])

  // Lembrar pendentes
  const handleLembrar = async (colaboradorId?: string) => {
    if (!cicloSelecionado) return
    setLembrando(true)
    try {
      const colabIds = colaboradorId ? [colaboradorId] : pendentesList.map((p) => p.colaborador.id)

      const qtd = await rotinaService.lembrarPendentes(cicloSelecionado.id, colabIds)
      toast({
        title: 'Lembretes enviados!',
        description: `${qtd} colaborador(es) foram notificados no app.`,
      })
    } catch (e) {
      toast({ title: 'Erro ao enviar lembretes', variant: 'destructive' })
    } finally {
      setLembrando(false)
    }
  }

  // URL para exportação CSV
  const exportUrl = rotinaService.getExportCsvUrl(
    exportTipo,
    exportCicloId,
    exportProjetoId,
    exportAreaId,
  )

  return (
    <div className="space-y-8 pb-12 animate-fade-in">
      {/* Cabeçalho */}
      <div className="border-b border-[#262626] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold mb-2">
            <Sliders className="w-3.5 h-3.5" />
            <span>Gestão Estratégica</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Ciclos & Adesão
          </h1>
          <p className="text-xs md:text-sm text-[#9CA3AF] mt-1">
            Controle do acompanhamento semanal/mensal, disparo de lembretes e exportação para a
            Reunião Mensal de Resultados.
          </p>
        </div>

        <button
          onClick={() => setNovoCicloModal(true)}
          className="px-4 py-2.5 rounded-xl bg-[#FFD400] hover:bg-[#E5BE00] text-black font-extrabold text-xs flex items-center gap-2 transition-all shadow-md shadow-[#FFD400]/10 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Ciclo Manual</span>
        </button>
      </div>

      {/* 1. PAINEL DE CONTROLE DA ROTINA (ATIVAR / PAUSAR) */}
      <div className="p-6 rounded-2xl bg-[#111111] border border-[#262626] grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rotina Geral */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-extrabold tracking-wider text-white block">
                Rotina de Acompanhamento
              </span>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                {config?.rotina_ativa
                  ? 'Ativa — Ciclos automáticos estão rodando conforme o cron'
                  : 'Desligada — A rotina começa pausada até o lançamento oficial'}
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                config?.rotina_ativa
                  ? 'bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30'
                  : 'bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30'
              }`}
            >
              {config?.rotina_ativa ? 'Ativa' : 'Pausada'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggleRotina}
            disabled={actionLoading}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
              config?.rotina_ativa
                ? 'bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#EF4444] border border-[#333]'
                : 'bg-[#22C55E] hover:bg-[#1EAE52] text-black shadow-lg shadow-[#22C55E]/20'
            }`}
          >
            {config?.rotina_ativa ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pausar Rotina</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Ativar Rotina no Lançamento Oficial</span>
              </>
            )}
          </button>
        </div>

        {/* Pulso Semanal Ativo / Desligado */}
        <div className="space-y-3 md:border-l md:border-[#222] md:pl-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-extrabold tracking-wider text-white block">
                Pulso Semanal (1 minuto)
              </span>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                {config?.pulso_ativo
                  ? 'Ativo — Segunda a sexta-feira às 18h'
                  : 'Desligado — Somente avaliação mensal'}
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                config?.pulso_ativo
                  ? 'bg-[#FFD400]/15 text-[#FFD400] border border-[#FFD400]/30'
                  : 'bg-[#333] text-[#888]'
              }`}
            >
              {config?.pulso_ativo ? 'Ligado' : 'Desligado'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleTogglePulso}
            disabled={actionLoading}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 bg-[#1C1C1C] hover:bg-[#262626] text-white border border-[#333] transition-all"
          >
            <span>{config?.pulso_ativo ? 'Desligar Pulso Semanal' : 'Ligar Pulso Semanal'}</span>
          </button>
        </div>
      </div>

      {/* 2. ADESÃO E PENDENTES POR CICLO */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#FFD400]" />
            <h2 className="text-xs uppercase font-extrabold tracking-wider text-white">
              Acompanhamento por Ciclo
            </h2>
          </div>

          {/* Seletor de Ciclo */}
          {ciclos.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9CA3AF]">Ciclo:</span>
              <select
                value={selectedCicloId}
                onChange={(e) => setSelectedCicloId(e.target.value)}
                className="bg-[#141414] border border-[#2B2B2B] rounded-xl px-3 py-1.5 text-xs text-white font-bold outline-none cursor-pointer"
              >
                {ciclos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tipo === 'avaliacao_mensal' ? '📅 Mensal' : '⚡ Semanal'}:{' '}
                    {c.titulo || c.referencia} ({c.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {cicloSelecionado ? (
          <div className="p-6 rounded-2xl bg-[#111111] border border-[#262626] space-y-6">
            {/* Topo do Ciclo Selecionado */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#222]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#1C1C1C] border border-[#333] text-[#FFD400] font-black">
                    {cicloSelecionado.referencia}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      cicloSelecionado.status === 'aberto'
                        ? 'bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30'
                        : 'bg-[#666]/15 text-[#888]'
                    }`}
                  >
                    {cicloSelecionado.status}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-white">
                  {cicloSelecionado.titulo || cicloSelecionado.referencia}
                </h3>
                <p className="text-xs text-[#888]">
                  Período: {new Date(cicloSelecionado.abertura).toLocaleDateString('pt-BR')} até{' '}
                  {new Date(cicloSelecionado.fechamento).toLocaleDateString('pt-BR')}
                </p>
              </div>

              {/* Ações de Fechar/Reabrir e Lembrar Geral */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleToggleStatusCiclo(cicloSelecionado)}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-xl bg-[#1A1A1A] hover:bg-[#252525] border border-[#333] text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {cicloSelecionado.status === 'aberto' ? 'Fechar Ciclo' : 'Reabrir Ciclo'}
                  </span>
                </button>

                {cicloSelecionado.status === 'aberto' && pendentesList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleLembrar()}
                    disabled={lembrando}
                    className="px-4 py-2 rounded-xl bg-[#FFD400] hover:bg-[#E5BE00] text-black text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-md shadow-[#FFD400]/10"
                  >
                    {lembrando ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Flame className="w-3.5 h-3.5" />
                    )}
                    <span>Lembrar Todos os Pendentes ({pendentesList.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Barra de Taxa de Adesão */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white uppercase tracking-wider">
                  Taxa de Adesão do Ciclo
                </span>
                <span className="font-mono text-sm font-black text-[#FFD400]">
                  {taxaAdesao}% ({totalEntregues} de {totalMetasCiclo} metas respondidas)
                </span>
              </div>
              <div className="h-3 w-full bg-[#1A1A1A] rounded-full overflow-hidden border border-[#242424]">
                <div
                  className="h-full bg-[#FFD400] rounded-full transition-all duration-500"
                  style={{ width: `${taxaAdesao}%` }}
                />
              </div>
            </div>

            {/* Lista de Colaboradores Pendentes */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-extrabold tracking-wider text-white">
                  Colaboradores com Metas Pendentes ({pendentesList.length})
                </span>
                <span className="text-[11px] text-[#888]">
                  Notificação direta no app do colaborador
                </span>
              </div>

              {pendentesList.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#141414] border border-[#262626] text-center text-xs text-[#22C55E] font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Parabéns! 100% das metas foram preenchidas neste ciclo.</span>
                </div>
              ) : (
                <div className="divide-y divide-[#1F1F1F] border border-[#262626] rounded-xl overflow-hidden bg-[#141414]">
                  {pendentesList.map(({ colaborador, metasPendentes }) => (
                    <div
                      key={colaborador.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-white block">{colaborador.nome}</span>
                        <span className="text-[11px] text-[#888]">
                          {colaborador.cargo || 'Colaborador'} •{' '}
                          <span className="text-[#FFD400]">
                            {metasPendentes.length} meta{metasPendentes.length > 1 ? 's' : ''}{' '}
                            pendente(s): {metasPendentes.map((m) => m.codigo).join(', ')}
                          </span>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLembrar(colaborador.id)}
                        disabled={lembrando}
                        className="py-1.5 px-3 rounded-lg bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#FFD400] border border-[#333] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shrink-0"
                      >
                        <Send className="w-3 h-3" />
                        <span>Lembrar</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-[#666]">
            Nenhum ciclo cadastrado ainda. Ative a rotina ou crie um ciclo manual acima.
          </div>
        )}
      </section>

      {/* 3. EXPORTAÇÃO CSV PARA A REUNIÃO MENSAL DE RESULTADOS */}
      <section className="p-6 rounded-2xl bg-[#111111] border border-[#262626] space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[#FFD400]" />
          <h2 className="text-xs uppercase font-extrabold tracking-wider text-white">
            Exportar Dados em CSV (Reunião Mensal de Resultados)
          </h2>
        </div>
        <p className="text-xs text-[#9CA3AF]">
          Baixe os dados estruturados de avaliações mensais e pulsos para preparar os materiais da
          Reunião Mensal de Resultados da Diretoria.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {/* Tipo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-[#888]">Tipo de Dado</label>
            <select
              value={exportTipo}
              onChange={(e) => setExportTipo(e.target.value as 'avaliacoes' | 'pulsos')}
              className="w-full bg-[#161616] border border-[#2B2B2B] rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
            >
              <option value="avaliacoes">Avaliações Mensais (Farol, Avanços, Próximo Passo)</option>
              <option value="pulsos">Pulsos Semanais (Avancei, Travado, Bloqueios)</option>
            </select>
          </div>

          {/* Ciclo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-[#888]">Ciclo (opcional)</label>
            <select
              value={exportCicloId}
              onChange={(e) => setExportCicloId(e.target.value)}
              className="w-full bg-[#161616] border border-[#2B2B2B] rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
            >
              <option value="">Todos os Ciclos</option>
              {ciclos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titulo || c.referencia}
                </option>
              ))}
            </select>
          </div>

          {/* Projeto */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-[#888]">
              Projeto (opcional)
            </label>
            <select
              value={exportProjetoId}
              onChange={(e) => setExportProjetoId(e.target.value)}
              className="w-full bg-[#161616] border border-[#2B2B2B] rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
            >
              <option value="">Todos os Projetos Estratégicos</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} - {p.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Área */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-[#888]">Área (opcional)</label>
            <select
              value={exportAreaId}
              onChange={(e) => setExportAreaId(e.target.value)}
              className="w-full bg-[#161616] border border-[#2B2B2B] rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
            >
              <option value="">Todas as Áreas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-2">
          <a
            href={exportUrl}
            download
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#FFD400] hover:bg-[#E5BE00] text-black font-extrabold text-xs transition-all shadow-md shadow-[#FFD400]/10"
          >
            <Download className="w-4 h-4" />
            <span>Baixar Arquivo CSV</span>
          </a>
        </div>
      </section>

      {/* Modal Criar Ciclo Manual */}
      {novoCicloModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setNovoCicloModal(false)}
          />

          <div className="relative w-full max-w-md bg-[#111111] border border-[#2B2B2B] rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <h3 className="text-sm font-extrabold text-white">Criar Novo Ciclo Manual</h3>

            <form onSubmit={handleCriarCiclo} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#9CA3AF] mb-1 font-bold">Tipo</label>
                <select
                  value={novoTipo}
                  onChange={(e) =>
                    setNovoTipo(e.target.value as 'pulso_semanal' | 'avaliacao_mensal')
                  }
                  className="w-full bg-[#161616] border border-[#2B2B2B] rounded-lg p-2 text-white outline-none"
                >
                  <option value="avaliacao_mensal">Avaliação Mensal (Abre 25 fecha 05)</option>
                  <option value="pulso_semanal">Pulso Semanal (Abre seg fecha sex)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#9CA3AF] mb-1 font-bold">
                  Referência (ex.: 2026-11 ou 2026-S45)
                </label>
                <input
                  type="text"
                  required
                  value={novaRef}
                  onChange={(e) => setNovaRef(e.target.value)}
                  placeholder="2026-11"
                  className="w-full bg-[#161616] border border-[#2B2B2B] rounded-lg p-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[#9CA3AF] mb-1 font-bold">Título de exibição</label>
                <input
                  type="text"
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Avaliação Mensal de Novembro 2026"
                  className="w-full bg-[#161616] border border-[#2B2B2B] rounded-lg p-2 text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#9CA3AF] mb-1 font-bold">Abertura</label>
                  <input
                    type="date"
                    required
                    value={novaAbertura}
                    onChange={(e) => setNovaAbertura(e.target.value)}
                    className="w-full bg-[#161616] border border-[#2B2B2B] rounded-lg p-2 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1 font-bold">Fechamento</label>
                  <input
                    type="date"
                    required
                    value={novoFechamento}
                    onChange={(e) => setNovoFechamento(e.target.value)}
                    className="w-full bg-[#161616] border border-[#2B2B2B] rounded-lg p-2 text-white outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNovoCicloModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#1A1A1A] text-[#9CA3AF] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#FFD400] text-black font-extrabold hover:bg-[#E5BE00]"
                >
                  Criar Ciclo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
