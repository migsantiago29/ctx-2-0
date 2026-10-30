import { useEffect, useState, useMemo } from 'react'
import {
  Users,
  Building2,
  Crown,
  ChevronRight,
  X,
  UserCheck,
  Layers,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import type { Area, Colaborador, Processo } from '@/types/ctx'

export default function Organograma() {
  const [areas, setAreas] = useState<Area[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [processos, setProcessos] = useState<Processo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [mobileExpandedArea, setMobileExpandedArea] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch areas: apenas tipo === 'área' (o grupo 'Milestone' aparece SOMENTE no Fluxograma)
        // Ordenadas por ordem_no_fluxo
        const areasRes = await pb.collection('areas').getFullList<Area>({
          sort: 'ordem_no_fluxo',
        })
        const filteredAreas = areasRes.filter((a) => a.tipo === 'área' || !a.tipo)
        setAreas(filteredAreas)

        // Fetch colaboradores (expand area)
        const colabsRes = await pb.collection('colaboradores').getFullList<Colaborador>({
          sort: 'nome',
          expand: 'area,usuario',
        })
        setColaboradores(colabsRes)

        // Fetch processos
        const procsRes = await pb.collection('processos').getFullList<Processo>({
          sort: 'codigo',
        })
        setProcessos(procsRes)
      } catch (err) {
        console.error('Erro ao carregar organograma:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Agrupar colaboradores por ID e por Nome da área
  const colabsByArea = useMemo(() => {
    const byAreaMap: Record<string, Colaborador[]> = {}
    for (const c of colaboradores) {
      // Pode vincular por c.area (ID) ou c.expand?.area?.nome
      const keyId = c.area
      if (keyId) {
        if (!byAreaMap[keyId]) byAreaMap[keyId] = []
        byAreaMap[keyId].push(c)
      }
    }
    return byAreaMap
  }, [colaboradores])

  // Agrupar processos por área (processos.area é TEXTO com o mesmo nome usado em areas.nome)
  const procsByAreaName = useMemo(() => {
    const map: Record<string, Processo[]> = {}
    for (const p of processos) {
      const areaNorm = (p.area || '').trim().toLowerCase()
      if (!map[areaNorm]) map[areaNorm] = []
      map[areaNorm].push(p)
    }
    return map
  }, [processos])

  // Obter colaboradores de uma área específica
  const getColabsForArea = (area: Area): Colaborador[] => {
    // Busca direta por relation ID
    const byId = colabsByArea[area.id] || []
    if (byId.length > 0) return byId
    // Fallback por nome expandido
    return colaboradores.filter(
      (c) =>
        c.expand?.area?.nome?.trim().toLowerCase() === area.nome.trim().toLowerCase() ||
        c.expand?.usuario?.area?.trim().toLowerCase() === area.nome.trim().toLowerCase(),
    )
  }

  // Obter processos de uma área específica
  const getProcsForArea = (area: Area): Processo[] => {
    return procsByAreaName[area.nome.trim().toLowerCase()] || []
  }

  const toggleMobileAccordion = (areaNome: string) => {
    setMobileExpandedArea((prev) => (prev === areaNome ? null : areaNome))
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="border-b border-ctx-262626 pb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-ctx-brand text-xs font-semibold mb-2">
          <Users className="w-3.5 h-3.5" />
          Estrutura Organizacional
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ctx-fg tracking-tight">
          Organograma da CTX
        </h1>
        <p className="text-sm text-ctx-9ca3af mt-1">
          Diretoria Executiva conectada às {areas.length > 0 ? areas.length : '13'} áreas
          operacionais da CTX Cenografia, com colaboradores e processos estruturados.
        </p>
      </div>

      {areas.length === 0 && !loading && (
        <div className="bg-ctx-111111 border border-ctx-262626 rounded-xl p-10 text-center max-w-lg mx-auto space-y-3">
          <FileSpreadsheet className="w-10 h-10 text-ctx-brand mx-auto opacity-70" />
          <h3 className="text-base font-bold text-ctx-fg">Nenhuma área cadastrada ainda</h3>
          <p className="text-xs text-ctx-9ca3af">
            O administrador pode importar as planilhas oficiais na seção de Administração para
            visualizar a estrutura completa.
          </p>
        </div>
      )}

      {/* TOP-DOWN TREE STRUCTURE */}
      {areas.length > 0 && (
        <div className="space-y-8">
          {/* ROOT NODE: Diretoria CTX */}
          <div className="flex flex-col items-center">
            <div className="bg-ctx-111111 border-2 border-[#FFD400] rounded-xl p-5 shadow-2xl max-w-sm w-full text-center relative group hover:shadow-[#FFD400]/10 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#FFD400] text-black font-black flex items-center justify-center text-sm mx-auto mb-2.5 shadow-md shadow-[#FFD400]/30">
                <Crown className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-base font-extrabold text-ctx-fg tracking-tight">
                Diretoria Executiva CTX
              </h2>
              <p className="text-xs text-ctx-9ca3af mt-1">
                Liderança & Governança Integrada da Operação
              </p>
              <div className="mt-3 pt-2.5 border-t border-ctx-262626 flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                <span className="text-[11px] font-mono text-ctx-9ca3af">
                  {areas.length} Áreas Operacionais Conectadas
                </span>
              </div>
            </div>

            {/* Vertical Connector Stem */}
            <div className="w-0.5 h-8 bg-gradient-to-b from-[#FFD400] to-ctx-262626" />
            <div className="w-6 h-6 rounded-full bg-ctx-1a1a1a border border-[#FFD400] text-ctx-brand flex items-center justify-center -my-3 z-10 text-[10px]">
              <ArrowDown className="w-3.5 h-3.5" />
            </div>
            <div className="w-0.5 h-8 bg-ctx-262626" />
          </div>

          {/* 13 AREAS — DESKTOP / TABLET GRID (hidden on small mobile) */}
          <div className="hidden sm:block">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs uppercase tracking-wider font-bold text-ctx-9ca3af flex items-center gap-2">
                <Building2 className="w-4 h-4 text-ctx-brand" />
                Áreas Operacionais ({areas.length})
              </h3>
              <span className="text-xs text-ctx-9ca3af">
                Clique em uma área para ver equipe e processos mapeados
              </span>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div
                    key={i}
                    className="h-36 bg-ctx-111111 border border-ctx-262626 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {areas.map((area) => {
                  const colabs = getColabsForArea(area)
                  const procs = getProcsForArea(area)
                  const count = colabs.length

                  return (
                    <div
                      key={area.id}
                      onClick={() => setSelectedArea(area)}
                      className="group bg-ctx-111111 border border-ctx-262626 rounded-xl p-5 shadow-sm hover:border-[#FFD400] hover:-translate-y-1 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-bold text-ctx-fg group-hover:text-ctx-brand transition-colors leading-snug">
                            {area.nome}
                          </h4>
                          <ChevronRight className="w-4 h-4 text-ctx-9ca3af group-hover:text-ctx-brand transition-colors shrink-0" />
                        </div>

                        {area.ordem_no_fluxo && (
                          <span className="inline-block text-[10px] font-mono text-ctx-9ca3af">
                            Fluxo: #{area.ordem_no_fluxo}
                          </span>
                        )}
                      </div>

                      <div className="pt-4 border-t border-ctx-262626/80 flex items-center justify-between text-xs mt-3">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ctx-brand bg-[#FFD400]/10 px-2 py-0.5 rounded-full border border-[#FFD400]/25">
                          <Users className="w-3 h-3" />
                          {count} {count === 1 ? 'colaborador' : 'colaboradores'}
                        </span>
                        <span className="text-[11px] font-mono text-ctx-9ca3af">
                          {procs.length} proc.
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 13 AREAS — MOBILE VERTICAL ACCORDION (visible only on small mobile) */}
          <div className="block sm:hidden space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-ctx-262626">
              <h3 className="text-xs uppercase tracking-wider font-bold text-ctx-9ca3af">
                Áreas Operacionais ({areas.length})
              </h3>
              <span className="text-[11px] text-ctx-9ca3af">Toque para expandir</span>
            </div>

            {areas.map((area) => {
              const isExpanded = mobileExpandedArea === area.nome
              const colabs = getColabsForArea(area)
              const procs = getProcsForArea(area)

              return (
                <div
                  key={area.id}
                  className={`bg-ctx-111111 border rounded-xl overflow-hidden transition-all ${
                    isExpanded ? 'border-[#FFD400]' : 'border-ctx-262626'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleMobileAccordion(area.nome)}
                    className="w-full p-4 flex items-center justify-between text-left"
                  >
                    <div className="min-w-0 pr-2">
                      <h4 className="text-sm font-bold text-ctx-fg">{area.nome}</h4>
                      <p className="text-xs text-ctx-9ca3af line-clamp-1 mt-0.5">
                        {procs.length} processos mapeados
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#FFD400]/10 text-ctx-brand border border-[#FFD400]/20">
                        {colabs.length} colab.
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-ctx-brand" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-ctx-9ca3af" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-ctx-262626 space-y-4 bg-ctx-141414 animate-in fade-in duration-200">
                      {/* Equipe */}
                      <div>
                        <p className="text-xs uppercase tracking-wider font-semibold text-ctx-9ca3af mb-2 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-ctx-brand" />
                          Equipe da Área ({colabs.length})
                        </p>
                        {colabs.length > 0 ? (
                          <div className="space-y-2">
                            {colabs.map((c) => (
                              <div
                                key={c.id}
                                className="p-2.5 rounded-lg bg-ctx-191919 border border-ctx-262626 flex items-center gap-2.5"
                              >
                                <div className="w-7 h-7 rounded-full bg-ctx-262626 flex items-center justify-center text-xs font-bold text-ctx-brand">
                                  {c.nome ? c.nome.charAt(0).toUpperCase() : 'C'}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-ctx-fg truncate">
                                    {c.nome}
                                  </p>
                                  <p className="text-[10px] text-ctx-9ca3af truncate">
                                    {c.cargo || c.email}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-ctx-191919 border border-ctx-262626 text-xs text-ctx-9ca3af">
                            Nenhum colaborador atribuído diretamente a esta área.
                          </div>
                        )}
                      </div>

                      {/* Processos da Área */}
                      <div>
                        <p className="text-xs uppercase tracking-wider font-semibold text-ctx-9ca3af mb-2 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-ctx-brand" />
                          Processos da Área ({procs.length})
                        </p>
                        {procs.length > 0 ? (
                          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                            {procs.map((p) => (
                              <div
                                key={p.id}
                                className="p-2 rounded bg-ctx-191919 border border-ctx-262626 text-xs"
                              >
                                <span className="font-mono font-bold text-ctx-brand mr-1.5">
                                  {p.codigo}
                                </span>
                                <span className="text-ctx-fg">{p.nome}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-ctx-9ca3af">Nenhum processo mapeado.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AREA DETAIL SLIDE-IN DRAWER (Desktop / Tablet) */}
      {selectedArea && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedArea(null)}
          />

          <div className="relative w-full md:w-[460px] bg-ctx-111111 border-l border-ctx-262626 h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-250 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-ctx-262626 flex items-center justify-between bg-ctx-141414">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-ctx-brand" />
                <h3 className="text-xs uppercase tracking-wider font-bold text-ctx-9ca3af">
                  Detalhe da Área CTX
                </h3>
              </div>
              <button
                onClick={() => setSelectedArea(null)}
                className="p-1.5 rounded-lg text-ctx-9ca3af hover:text-ctx-fg hover:bg-ctx-1e1e1e"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase text-ctx-brand font-semibold tracking-wider">
                    Área Operacional
                  </span>
                  {selectedArea.ordem_no_fluxo && (
                    <span className="text-xs font-mono text-ctx-9ca3af bg-ctx-181818 px-2 py-0.5 rounded border border-ctx-262626">
                      Posição no Fluxo: #{selectedArea.ordem_no_fluxo}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-black text-ctx-fg mt-1">{selectedArea.nome}</h2>
              </div>

              {/* People Section: lista de colaboradores (nome e cargo) */}
              {(() => {
                const colabs = getColabsForArea(selectedArea)
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-ctx-262626">
                      <h4 className="text-xs uppercase tracking-wider font-bold text-ctx-fg flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-ctx-brand" />
                        Colaboradores da Área
                      </h4>
                      <span className="text-[11px] font-mono text-ctx-9ca3af">
                        {colabs.length} colaborador(es)
                      </span>
                    </div>

                    {colabs.length > 0 ? (
                      <div className="space-y-2">
                        {colabs.map((c) => (
                          <div
                            key={c.id}
                            className="p-3 rounded-lg bg-ctx-161616 border border-ctx-262626 flex items-center gap-3"
                          >
                            <div className="w-9 h-9 rounded-full bg-ctx-1c1c1c border border-ctx-262626 flex items-center justify-center font-bold text-sm text-ctx-brand">
                              {c.nome ? c.nome.charAt(0).toUpperCase() : 'C'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-ctx-fg truncate">{c.nome}</p>
                              <p className="text-[11px] text-ctx-brand truncate">
                                {c.cargo || 'Cargo não informado'}
                              </p>
                              {c.email && (
                                <p className="text-[10px] text-ctx-9ca3af truncate">{c.email}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-ctx-161616 border border-ctx-262626 text-center space-y-1">
                        <p className="text-xs font-semibold text-ctx-fg">Nenhum colaborador</p>
                        <p className="text-[11px] text-ctx-9ca3af">
                          Não há colaboradores vinculados a esta área no momento.
                        </p>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Processes list (lendo processos.area) */}
              {(() => {
                const procs = getProcsForArea(selectedArea)
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-ctx-262626">
                      <h4 className="text-xs uppercase tracking-wider font-bold text-ctx-fg flex items-center gap-2">
                        <Layers className="w-4 h-4 text-ctx-brand" />
                        Processos da Área ({procs.length})
                      </h4>
                    </div>

                    {procs.length > 0 ? (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {procs.map((p) => (
                          <div
                            key={p.id}
                            className="p-3 rounded-lg bg-ctx-161616 border border-ctx-262626 space-y-1"
                          >
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono font-bold text-ctx-brand text-xs shrink-0">
                                {p.codigo}
                              </span>
                              <span className="text-xs font-semibold text-ctx-fg">{p.nome}</span>
                            </div>
                            {p.observacao && (
                              <p className="text-[11px] text-ctx-9ca3af italic pl-2 border-l border-[#FFD400]/40 mt-1">
                                {p.observacao}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-ctx-161616 border border-ctx-262626 text-center text-xs text-ctx-9ca3af">
                        Nenhum processo registrado nesta área.
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-ctx-262626 bg-ctx-141414">
              <button
                onClick={() => setSelectedArea(null)}
                className="w-full py-2.5 bg-ctx-1c1c1c hover:bg-ctx-262626 text-ctx-fg text-xs font-semibold rounded-lg border border-ctx-333333 transition-colors"
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
