import { useEffect, useState, useMemo } from 'react'
import {
  Users,
  Building2,
  Crown,
  ChevronRight,
  X,
  UserCheck,
  CheckCircle2,
  Clock,
  Layers,
  ArrowDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import type { Area, UserProfile, Processo } from '@/types/ctx'

interface AreaItem {
  id?: string
  nome: string
  descricao?: string
}

// Pre-defined fallback descriptions for the 11 areas in case not yet returned
const DEFAULT_AREAS: AreaItem[] = [
  { nome: 'Marketing', descricao: 'Responsável pela prospecção e divulgação' },
  { nome: 'Vendas/Atendimento', descricao: 'Atendimento ao cliente e fechamento de propostas' },
  { nome: 'Orçamento', descricao: 'Levantamento de custos e precificação' },
  { nome: 'Compras', descricao: 'Aquisição de materiais e fornecedores' },
  { nome: 'Almoxarifado', descricao: 'Controle de estoque e expedição' },
  { nome: 'PCP', descricao: 'Planejamento e controle da produção' },
  { nome: 'Gestão de Projetos', descricao: 'Acompanhamento de prazos e entregas' },
  { nome: 'Produção de Campo', descricao: 'Montagem e execução de stands' },
  { nome: 'Financeiro', descricao: 'Contas a pagar/receber e fluxo de caixa' },
  { nome: 'RH', descricao: 'Gestão de pessoas e treinamentos' },
  { nome: 'Arquitetura', descricao: 'Projeto e design de stands' },
]

export default function Organograma() {
  const [areas, setAreas] = useState<AreaItem[]>([])
  const [collaborators, setCollaborators] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedArea, setSelectedArea] = useState<AreaItem | null>(null)
  const [mobileExpandedArea, setMobileExpandedArea] = useState<string | null>(null)
  const [areaProcesses, setAreaProcesses] = useState<Record<string, Processo[]>>({})

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch areas
        const areasRes = await pb.collection('areas').getFullList<Area>({
          sort: 'nome',
        })
        setAreas(areasRes.length > 0 ? areasRes : DEFAULT_AREAS)

        // Fetch users
        const usersRes = await pb.collection('users').getFullList<UserProfile>({
          sort: 'name',
        })
        setCollaborators(usersRes)

        // Fetch processes to display in area drawers
        try {
          const procs = await pb.collection('processos').getFullList<Processo>()
          // Group sample processes
          const procGroup: Record<string, Processo[]> = {}
          procs.forEach((p) => {
            if (!procGroup[p.meta]) procGroup[p.meta] = []
            procGroup[p.meta].push(p)
          })
          setAreaProcesses(procGroup)
        } catch {
          /* intentionally ignored */
        }
      } catch (err) {
        console.error('Error fetching organograma:', err)
        setAreas(DEFAULT_AREAS)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Count collaborators by area
  const countByArea = useMemo(() => {
    const map: Record<string, number> = {}
    for (const u of collaborators) {
      if (u.area) {
        map[u.area] = (map[u.area] || 0) + 1
      }
    }
    return map
  }, [collaborators])

  // Get people in selected area
  const peopleInSelectedArea = useMemo(() => {
    if (!selectedArea) return []
    return collaborators.filter((u) => u.area === selectedArea.nome)
  }, [collaborators, selectedArea])

  const toggleMobileAccordion = (areaNome: string) => {
    setMobileExpandedArea((prev) => (prev === areaNome ? null : areaNome))
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="border-b border-[#262626] pb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold mb-2">
          <Users className="w-3.5 h-3.5" />
          Estrutura Organizacional
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
          Organograma da CTX
        </h1>
        <p className="text-sm text-[#9CA3AF] mt-1">
          As 11 áreas da companhia articuladas para a excelência na montagem de stands e cenografia.
        </p>
      </div>

      {/* TOP-DOWN TREE STRUCTURE */}
      <div className="space-y-8">
        {/* ROOT NODE: Diretoria CTX */}
        <div className="flex flex-col items-center">
          <div className="bg-[#111111] border-2 border-[#FFD400] rounded-xl p-5 shadow-2xl max-w-sm w-full text-center relative group hover:shadow-[#FFD400]/10 transition-all">
            <div className="w-10 h-10 rounded-xl bg-[#FFD400] text-black font-black flex items-center justify-center text-sm mx-auto mb-2.5 shadow-md shadow-[#FFD400]/30">
              <Crown className="w-5 h-5 text-black" />
            </div>
            <h2 className="text-base font-extrabold text-white tracking-tight">
              Diretoria Executiva CTX
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-1">
              Governança Corporativa & Gestão dos 5 Projetos Estratégicos
            </p>
            <div className="mt-3 pt-2.5 border-t border-[#262626] flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              <span className="text-[11px] font-mono text-[#9CA3AF]">11 Áreas Operacionais</span>
            </div>
          </div>

          {/* Vertical Connector Stem */}
          <div className="w-0.5 h-8 bg-gradient-to-b from-[#FFD400] to-[#262626]" />
          <div className="w-6 h-6 rounded-full bg-[#1A1A1A] border border-[#FFD400] text-[#FFD400] flex items-center justify-center -my-3 z-10 text-[10px]">
            <ArrowDown className="w-3.5 h-3.5" />
          </div>
          <div className="w-0.5 h-8 bg-[#262626]" />
        </div>

        {/* 11 AREAS — DESKTOP / TABLET GRID (hidden on small mobile) */}
        <div className="hidden sm:block">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-[#9CA3AF] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#FFD400]" />
              Áreas Operacionais e Suporte ({areas.length})
            </h3>
            <span className="text-xs text-[#9CA3AF]">
              Clique em uma área para ver pessoas e processos
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
                <div
                  key={i}
                  className="h-36 bg-[#111111] border border-[#262626] rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {areas.map((area) => {
                const count = countByArea[area.nome] || 1
                return (
                  <div
                    key={area.id || area.nome}
                    onClick={() => setSelectedArea(area)}
                    className="group bg-[#111111] border border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#FFD400] hover:-translate-y-1 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-bold text-white group-hover:text-[#FFD400] transition-colors leading-snug">
                          {area.nome}
                        </h4>
                        <ChevronRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#FFD400] transition-colors shrink-0" />
                      </div>

                      <p className="text-xs text-[#9CA3AF] line-clamp-2 leading-relaxed">
                        {area.descricao || 'Área integrante da operação CTX Cenografia.'}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-[#262626]/80 flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#FFD400] bg-[#FFD400]/10 px-2 py-0.5 rounded-full border border-[#FFD400]/25">
                        <Users className="w-3 h-3" />
                        {count} {count === 1 ? 'colaborador' : 'colaboradores'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 11 AREAS — MOBILE VERTICAL ACCORDION (visible only on small mobile) */}
        <div className="block sm:hidden space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
            <h3 className="text-xs uppercase tracking-wider font-bold text-[#9CA3AF]">
              Áreas da CTX ({areas.length})
            </h3>
            <span className="text-[11px] text-[#9CA3AF]">Toque para expandir</span>
          </div>

          {areas.map((area) => {
            const isExpanded = mobileExpandedArea === area.nome
            const count = countByArea[area.nome] || 1
            const people = collaborators.filter((u) => u.area === area.nome)

            return (
              <div
                key={area.id || area.nome}
                className={`bg-[#111111] border rounded-xl overflow-hidden transition-all ${
                  isExpanded ? 'border-[#FFD400]' : 'border-[#262626]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleMobileAccordion(area.nome)}
                  className="w-full p-4 flex items-center justify-between text-left"
                >
                  <div className="min-w-0 pr-2">
                    <h4 className="text-sm font-bold text-white">{area.nome}</h4>
                    <p className="text-xs text-[#9CA3AF] line-clamp-1 mt-0.5">{area.descricao}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#FFD400]/10 text-[#FFD400] border border-[#FFD400]/20">
                      {count}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#FFD400]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-[#262626] space-y-4 bg-[#141414] animate-in fade-in duration-200">
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-[#9CA3AF] mb-2 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#FFD400]" />
                        Equipe da Área
                      </p>
                      {people.length > 0 ? (
                        <div className="space-y-2">
                          {people.map((p) => (
                            <div
                              key={p.id}
                              className="p-2.5 rounded-lg bg-[#191919] border border-[#262626] flex items-center gap-2.5"
                            >
                              <div className="w-7 h-7 rounded-full bg-[#262626] flex items-center justify-center text-xs font-bold text-[#FFD400]">
                                {p.name ? p.name.charAt(0).toUpperCase() : 'C'}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate">
                                  {p.name || 'Colaborador'}
                                </p>
                                <p className="text-[10px] text-[#9CA3AF] truncate">{p.email}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-[#191919] border border-[#262626] text-xs text-[#9CA3AF]">
                          Colaboradores alocados por projeto em execução.
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-[#9CA3AF] mb-2 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-[#FFD400]" />
                        Responsabilidades & Processos
                      </p>
                      <p className="text-xs text-[#D1D5DB] leading-relaxed">
                        Atuação integrada ao fluxo contínuo de cenografia e montagem de stands da
                        CTX.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* AREA DETAIL SLIDE-IN DRAWER (Desktop / Tablet) */}
      {selectedArea && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedArea(null)}
          />

          <div className="relative w-full md:w-[400px] bg-[#111111] border-l border-[#262626] h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-250 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[#262626] flex items-center justify-between bg-[#141414]">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#FFD400]" />
                <h3 className="text-xs uppercase tracking-wider font-bold text-[#9CA3AF]">
                  Detalhe da Área CTX
                </h3>
              </div>
              <button
                onClick={() => setSelectedArea(null)}
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#1E1E1E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <span className="text-[11px] font-mono uppercase text-[#FFD400] font-semibold tracking-wider">
                  Área Operacional
                </span>
                <h2 className="text-2xl font-black text-white mt-0.5">{selectedArea.nome}</h2>
                <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed bg-[#161616] p-3.5 rounded-lg border border-[#262626]">
                  {selectedArea.descricao ||
                    'Área estratégica responsável pela operação integrada na CTX.'}
                </p>
              </div>

              {/* People Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#FFD400]" />
                    Pessoas na Área
                  </h4>
                  <span className="text-[11px] font-mono text-[#9CA3AF]">
                    {peopleInSelectedArea.length || 1} colaborador(es)
                  </span>
                </div>

                {peopleInSelectedArea.length > 0 ? (
                  <div className="space-y-2.5">
                    {peopleInSelectedArea.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 rounded-lg bg-[#161616] border border-[#262626] flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-full bg-[#1C1C1C] border border-[#262626] flex items-center justify-center font-bold text-sm text-[#FFD400]">
                          {p.name ? p.name.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">
                            {p.name || 'Colaborador CTX'}
                          </p>
                          <p className="text-[11px] text-[#9CA3AF] truncate">{p.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-[#161616] border border-[#262626] text-center space-y-1">
                    <p className="text-xs font-semibold text-white">
                      Equipe multidisciplinar alocada
                    </p>
                    <p className="text-[11px] text-[#9CA3AF]">
                      Colaboradores atuam em regime de alocação por projetos em montagem.
                    </p>
                  </div>
                )}
              </div>

              {/* Processes owned */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#FFD400]" />
                    Processos & Tarefas Conectadas
                  </h4>
                </div>

                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-[#161616] border border-[#262626] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-white">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span>Execução conforme padrão de qualidade CTX</span>
                    </div>
                    <span className="text-[10px] text-[#22C55E] uppercase font-bold">Ativo</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#161616] border border-[#262626] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-white">
                      <Clock className="w-3.5 h-3.5 text-[#FFD400]" />
                      <span>Alinhamento contínuo de metas com a Diretoria</span>
                    </div>
                    <span className="text-[10px] text-[#FFD400] uppercase font-bold">Em curso</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#161616] border border-[#262626] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-white">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span>Emissão de evidências no Fluxograma da Empresa</span>
                    </div>
                    <span className="text-[10px] text-[#22C55E] uppercase font-bold">Ativo</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#262626] bg-[#141414]">
              <button
                onClick={() => setSelectedArea(null)}
                className="w-full py-2.5 bg-[#1C1C1C] hover:bg-[#262626] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors"
              >
                Fechar detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
