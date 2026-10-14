import { useEffect, useState, useMemo } from 'react'
import {
  Activity,
  Target,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Compass,
  Building2,
  Trophy,
  Calendar,
  Users,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import type { Meta, ProjetoEstrategico, Area, Colaborador, Avaliacao, Ciclo } from '@/types/ctx'
import { rotinaService } from '@/services/rotinaService'

export default function PulsoCTX() {
  const [metas, setMetas] = useState<Meta[]>([])
  const [projetos, setProjetos] = useState<ProjetoEstrategico[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [ultimoCiclo, setUltimoCiclo] = useState<Ciclo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [mList, pList, aList, cList, avList, ciclosList] = await Promise.all([
          pb.collection('metas').getFullList<Meta>({
            sort: 'codigo',
            expand: 'responsaveis,projeto',
          }),
          pb.collection('projetos_estrategicos').getFullList<ProjetoEstrategico>({
            sort: 'codigo',
            expand: 'sponsor',
          }),
          pb.collection('areas').getFullList<Area>({
            sort: 'nome',
          }),
          pb.collection('colaboradores').getFullList<Colaborador>({
            expand: 'area',
          }),
          pb.collection('avaliacoes').getFullList<Avaliacao>({
            sort: '-created',
            expand: 'meta,ciclo,preenchido_por',
          }),
          pb.collection('ciclos').getFullList<Ciclo>({
            sort: '-created',
            limit: 5,
          }),
        ])

        setMetas(mList)
        setProjetos(pList)
        setAreas(aList)
        setColaboradores(cList)
        setAvaliacoes(avList)
        if (ciclosList.length > 0) {
          setUltimoCiclo(ciclosList[0])
        }
      } catch (err) {
        console.error('Erro ao carregar Pulso CTX:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // 1. Números Gerais: total de metas, distribuição por farol, % concluídas e adesão ao último ciclo
  const numerosGerais = useMemo(() => {
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

    // Adesão ao último ciclo (% de avaliações entregues)
    let adesaoUltimoCiclo = 0
    if (ultimoCiclo) {
      // Metas ativas no ciclo
      const metasAtivas = metas.filter((m) => m.status !== 'concluida')
      const totalEsperado = metasAtivas.length || 1
      const entreguesNoCiclo = new Set(
        avaliacoes.filter((a) => a.ciclo === ultimoCiclo.id).map((a) => a.meta),
      ).size
      adesaoUltimoCiclo = Math.round((entreguesNoCiclo / totalEsperado) * 100)
    }

    return {
      total: metas.length,
      verde,
      atencao,
      vermelho,
      concluida,
      sem_atualizacao,
      percentConcluida: Math.round((concluida / total) * 100),
      adesaoUltimoCiclo,
    }
  }, [metas, avaliacoes, ultimoCiclo])

  // 2. Andamento por Projeto Estratégico (barras segmentadas por farol)
  const andamentoProjetos = useMemo(() => {
    return projetos.map((proj) => {
      const metasProj = metas.filter(
        (m) => m.projeto === proj.id || m.projeto_secundario === proj.id,
      )
      const total = metasProj.length || 1
      let verde = 0
      let atencao = 0
      let vermelho = 0
      let concluida = 0
      let sem_atualizacao = 0

      metasProj.forEach((m) => {
        if (m.status === 'verde') verde++
        else if (m.status === 'atencao') atencao++
        else if (m.status === 'vermelho') vermelho++
        else if (m.status === 'concluida') concluida++
        else sem_atualizacao++
      })

      return {
        ...proj,
        totalMetas: metasProj.length,
        verde,
        atencao,
        vermelho,
        concluida,
        sem_atualizacao,
        percentConcluida: Math.round((concluida / total) * 100),
      }
    })
  }, [projetos, metas])

  // 3. Adesão por Área (nunca por pessoa, estritamente por área)
  const adesaoPorArea = useMemo(() => {
    if (!ultimoCiclo) return []

    // Mapear colaboradores por área
    const colabsPorArea = new Map<string, string[]>()
    colaboradores.forEach((c) => {
      if (c.area && !c.sem_metas) {
        if (!colabsPorArea.has(c.area)) colabsPorArea.set(c.area, [])
        colabsPorArea.get(c.area)!.push(c.id)
      }
    })

    const areasList: Array<{
      areaId: string
      nome: string
      totalMetas: number
      entregues: number
      percentAdesao: number
    }> = []

    areas.forEach((area) => {
      const colabIds = colabsPorArea.get(area.id) || []
      if (colabIds.length === 0) return

      // Metas atribuídas a colaboradores desta área
      const metasArea = metas.filter((m) => {
        const respIds = m.getStringSlice ? m.getStringSlice('responsaveis') : m.responsaveis || []
        return respIds.some((rId) => colabIds.includes(rId)) && m.status !== 'concluida'
      })

      if (metasArea.length === 0) return

      const metasAreaIds = metasArea.map((m) => m.id)
      const entreguesNoCiclo = new Set(
        avaliacoes
          .filter((a) => a.ciclo === ultimoCiclo.id && metasAreaIds.includes(a.meta))
          .map((a) => a.meta),
      ).size

      const percent = Math.round((entreguesNoCiclo / metasArea.length) * 100)

      areasList.push({
        areaId: area.id,
        nome: area.nome,
        totalMetas: metasArea.length,
        entregues: entreguesNoCiclo,
        percentAdesao: percent,
      })
    })

    return areasList.sort((a, b) => b.percentAdesao - a.percentAdesao)
  }, [areas, colaboradores, metas, avaliacoes, ultimoCiclo])

  // 4. Mural de Conquistas: metas concluídas, com responsável(is), projeto e data, mais recentes primeiro
  const muralConquistas = useMemo(() => {
    const concluidas = metas.filter((m) => m.status === 'concluida')

    // Mapeia data de conclusão a partir da última avaliação com farol "concluida"
    return concluidas
      .map((m) => {
        const avConcl = avaliacoes.find((a) => a.meta === m.id && a.farol === 'concluida')
        const dataConclusao = avConcl?.created || m.updated
        return {
          meta: m,
          dataConclusao,
          evidenciaLink: avConcl?.evidencia_link,
        }
      })
      .sort((a, b) => new Date(b.dataConclusao).getTime() - new Date(a.dataConclusao).getTime())
  }, [metas, avaliacoes])

  return (
    <div className="space-y-8 pb-12 animate-fade-in">
      {/* Header */}
      <div className="border-b border-[#262626] pb-5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold mb-2">
          <Activity className="w-3.5 h-3.5" />
          <span>Visão Geral da Empresa</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Pulso CTX</h1>
        <p className="text-xs md:text-sm text-[#9CA3AF] mt-1">
          Acompanhamento transparente do progresso estratégico da CTX Cenografia para todos os
          colaboradores.
        </p>
      </div>

      {/* 1. NÚMEROS GERAIS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total de Metas */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#262626] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span className="font-bold uppercase tracking-wider text-[10px]">Total de Metas</span>
            <Target className="w-4 h-4 text-[#FFD400]" />
          </div>
          <span className="block text-3xl font-mono font-black text-white">
            {numerosGerais.total}
          </span>
          <span className="block text-[11px] text-[#666]">Nos 5 Projetos Estratégicos</span>
        </div>

        {/* Metas Concluídas */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#262626] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span className="font-bold uppercase tracking-wider text-[10px]">Concluídas</span>
            <CheckCircle2 className="w-4 h-4 text-[#3B82F6]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-black text-[#3B82F6]">
              {numerosGerais.percentConcluida}%
            </span>
            <span className="text-xs text-[#888] font-mono">
              ({numerosGerais.concluida}/{numerosGerais.total})
            </span>
          </div>
          <span className="block text-[11px] text-[#666]">Critério atingido com evidência</span>
        </div>

        {/* Distribuição por Farol (Em Andamento) */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#262626] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span className="font-bold uppercase tracking-wider text-[10px]">No Ritmo</span>
            <TrendingUp className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-black text-[#22C55E]">
              {numerosGerais.verde}
            </span>
            <span className="text-xs text-[#888] font-mono">metas</span>
          </div>
          <span className="block text-[11px] text-[#666]">
            {numerosGerais.atencao} em atenção • {numerosGerais.vermelho} em risco
          </span>
        </div>

        {/* Adesão ao Último Ciclo */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#262626] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span className="font-bold uppercase tracking-wider text-[10px]">Adesão ao Ciclo</span>
            <Calendar className="w-4 h-4 text-[#FFD400]" />
          </div>
          <span className="block text-3xl font-mono font-black text-[#FFD400]">
            {numerosGerais.adesaoUltimoCiclo}%
          </span>
          <span className="block text-[11px] text-[#666]">
            {ultimoCiclo ? `Ciclo ${ultimoCiclo.referencia}` : 'Aguardando primeiro ciclo'}
          </span>
        </div>
      </div>

      {/* 2. ANDAMENTO POR PROJETO ESTRATÉGICO */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#FFD400]" />
          <h2 className="text-xs uppercase font-extrabold tracking-wider text-white">
            Andamento por Projeto Estratégico
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {andamentoProjetos.map((p) => {
            const total = p.totalMetas || 1
            return (
              <div
                key={p.id}
                className="p-5 rounded-2xl bg-[#111111] border border-[#262626] space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C1C1C] border border-[#333] text-[#FFD400] font-bold">
                      {p.codigo}
                    </span>
                    <h3 className="text-sm font-bold text-white leading-snug">{p.nome}</h3>
                    <p className="text-[11px] text-[#888]">
                      Sponsor: {p.expand?.sponsor?.nome || 'Não definido'}
                    </p>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    <span className="text-lg font-black text-[#3B82F6]">{p.percentConcluida}%</span>
                    <span className="block text-[10px] text-[#666]">{p.totalMetas} metas</span>
                  </div>
                </div>

                {/* Barra segmentada */}
                <div className="space-y-1.5 pt-1">
                  <div className="h-2.5 w-full bg-[#1C1C1C] rounded-full overflow-hidden flex border border-[#2B2B2B]">
                    {p.concluida > 0 && (
                      <div
                        style={{ width: `${(p.concluida / total) * 100}%` }}
                        className="bg-[#3B82F6]"
                      />
                    )}
                    {p.verde > 0 && (
                      <div
                        style={{ width: `${(p.verde / total) * 100}%` }}
                        className="bg-[#22C55E]"
                      />
                    )}
                    {p.atencao > 0 && (
                      <div
                        style={{ width: `${(p.atencao / total) * 100}%` }}
                        className="bg-[#F59E0B]"
                      />
                    )}
                    {p.vermelho > 0 && (
                      <div
                        style={{ width: `${(p.vermelho / total) * 100}%` }}
                        className="bg-[#EF4444]"
                      />
                    )}
                    {p.sem_atualizacao > 0 && (
                      <div
                        style={{ width: `${(p.sem_atualizacao / total) * 100}%` }}
                        className="bg-[#333333]"
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-[10px] text-[#888] font-mono pt-0.5">
                    <span className="text-[#3B82F6]">● {p.concluida}</span>
                    <span className="text-[#22C55E]">● {p.verde}</span>
                    <span className="text-[#F59E0B]">● {p.atencao}</span>
                    <span className="text-[#EF4444]">● {p.vermelho}</span>
                    <span className="text-[#666]">● {p.sem_atualizacao}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 3. ADESÃO POR ÁREA (SEM RANKING INDIVIDUAL) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#FFD400]" />
            <h2 className="text-xs uppercase font-extrabold tracking-wider text-white">
              Adesão por Área no Ciclo Atual
            </h2>
          </div>
          <span className="text-[11px] text-[#9CA3AF]">
            Visão coletiva por departamento (sem rankings individuais)
          </span>
        </div>

        {adesaoPorArea.length === 0 ? (
          <div className="p-6 rounded-2xl bg-[#111111] border border-[#262626] text-center text-xs text-[#666]">
            Nenhum ciclo fechado com metas registradas por área até o momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {adesaoPorArea.map((item) => (
              <div
                key={item.areaId}
                className="p-4 rounded-xl bg-[#111111] border border-[#262626] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white truncate">{item.nome}</span>
                  <span className="text-xs font-mono font-bold text-[#FFD400]">
                    {item.percentAdesao}%
                  </span>
                </div>

                <div className="h-2 w-full bg-[#1C1C1C] rounded-full overflow-hidden border border-[#242424]">
                  <div
                    className="h-full bg-[#FFD400] rounded-full transition-all duration-500"
                    style={{ width: `${item.percentAdesao}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-[#666]">
                  <span>
                    {item.entregues} de {item.totalMetas} metas avaliadas
                  </span>
                  <span>{item.percentAdesao === 100 ? '✅ 100% no prazo' : 'Em andamento'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. MURAL DE CONQUISTAS */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-[#FFD400]" />
          <h2 className="text-xs uppercase font-extrabold tracking-wider text-white">
            Mural de Conquistas da CTX
          </h2>
        </div>

        {muralConquistas.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#111111] border border-[#262626] text-center space-y-2">
            <Sparkles className="w-8 h-8 text-[#FFD400]/40 mx-auto" />
            <h3 className="text-sm font-bold text-white">Nenhuma meta concluída ainda</h3>
            <p className="text-xs text-[#888] max-w-sm mx-auto">
              Conforme os ciclos de avaliação avançarem e as metas forem cumpridas, elas aparecerão
              aqui com as comemorações da equipe!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {muralConquistas.map((item) => {
              const responsaveisList = item.meta.expand?.responsaveis || []
              const projetoNome = item.meta.expand?.projeto?.nome || 'Projeto Estratégico'

              return (
                <div
                  key={item.meta.id}
                  className="p-5 rounded-2xl bg-[#111111] border border-[#22C55E]/40 shadow-lg shadow-[#22C55E]/5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#22C55E]/15 text-[#22C55E] font-bold border border-[#22C55E]/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{item.meta.codigo}</span>
                    </span>
                    <span className="text-[10px] text-[#666]">
                      {new Date(item.dataConclusao).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-white leading-snug">
                      {item.meta.titulo}
                    </h4>
                    <p className="text-[11px] text-[#9CA3AF] mt-1">{projetoNome}</p>
                  </div>

                  {responsaveisList.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-[#D1D5DB] pt-1 border-t border-[#222]">
                      <Users className="w-3.5 h-3.5 text-[#FFD400] shrink-0" />
                      <span className="truncate">
                        {responsaveisList.map((r) => r.nome).join(', ')}
                      </span>
                    </div>
                  )}

                  {item.evidenciaLink && (
                    <div className="pt-1">
                      <a
                        href={item.evidenciaLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#FFD400] hover:underline inline-flex items-center gap-1"
                      >
                        <span>Ver evidência entregue</span>
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
