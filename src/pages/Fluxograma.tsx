import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  Workflow,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  X,
  ArrowRight,
  ArrowLeft,
  Target,
  Layers,
  HelpCircle,
  FileSpreadsheet,
  List,
  Compass,
  Calendar,
  Users,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Area, Processo, Colaborador, Meta } from '@/types/ctx'
import { computeDiagramLayout, type ProcessNode, type DiagramLayout } from '@/lib/diagramLayout'

export default function Fluxograma() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  const [areas, setAreas] = useState<Area[]>([])
  const [processos, setProcessos] = useState<Processo[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [colaboradorLogado, setColaboradorLogado] = useState<Colaborador | null>(null)
  const [allMetas, setAllMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  // Layout View Controls
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('diagram')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLanes, setSelectedLanes] = useState<string[]>([]) // filter by area names
  const [selectedNode, setSelectedNode] = useState<ProcessNode | null>(null)

  // Zoom & Pan state
  const [zoom, setZoom] = useState(0.85)
  const [pan, setPan] = useState({ x: 30, y: 20 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [areasRes, procsRes, colabsRes, metasRes] = await Promise.all([
          pb.collection('areas').getFullList<Area>({ sort: 'ordem_no_fluxo' }),
          pb.collection('processos').getFullList<Processo>({ sort: 'codigo' }),
          pb.collection('colaboradores').getFullList<Colaborador>(),
          pb
            .collection('metas')
            .getFullList<Meta>({
              expand: 'projeto,projeto_secundario,responsaveis',
              sort: 'codigo',
            })
            .catch(() => []),
        ])

        setAreas(areasRes)
        setProcessos(procsRes)
        setColaboradores(colabsRes)
        setAllMetas(metasRes)

        if (user) {
          const matched = colabsRes.find(
            (c) => c.usuario === user.id || c.email?.toLowerCase() === user.email?.toLowerCase(),
          )
          setColaboradorLogado(matched || null)
        }
      } catch (err) {
        console.error('Erro ao carregar fluxograma:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user])

  // Identificar área do colaborador logado para destacar em amarelo
  const loggedUserArea = useMemo(() => {
    if (colaboradorLogado?.expand?.area?.nome) {
      return colaboradorLogado.expand.area.nome.trim().toLowerCase()
    }
    if (colaboradorLogado?.area) {
      const a = areas.find((ar) => ar.id === colaboradorLogado.area)
      if (a) return a.nome.trim().toLowerCase()
    }
    if (user?.area) {
      return user.area.trim().toLowerCase()
    }
    return ''
  }, [areas, user])

  // MEMOIZED DIAGRAM LAYOUT CALCULATION (Calculado apenas quando areas ou processos mudam!)
  const layout: DiagramLayout = useMemo(() => {
    return computeDiagramLayout(areas, processos)
  }, [areas, processos])

  // Filtragem de raias visíveis
  const filteredSwimlanes = useMemo(() => {
    if (selectedLanes.length === 0) return layout.swimlanes
    return layout.swimlanes.filter((l) => selectedLanes.includes(l.nome))
  }, [layout.swimlanes, selectedLanes])

  const visibleLaneNames = useMemo(() => {
    return new Set(filteredSwimlanes.map((l) => l.nome.trim().toLowerCase()))
  }, [filteredSwimlanes])

  // Nós e conexões visíveis conforme filtros de raias
  const visibleNodes = useMemo(() => {
    return layout.nodes.filter((n) => visibleLaneNames.has(n.area.trim().toLowerCase()))
  }, [layout.nodes, visibleLaneNames])

  // Identificar conexões ativas do nó selecionado
  const activeConnectionIds = useMemo(() => {
    if (!selectedNode) return new Set<string>()
    const set = new Set<string>()
    // Inbound
    selectedNode.etapasAnterioresIds.forEach((fromId) => {
      set.add(`${fromId}->${selectedNode.id}`)
    })
    // Outbound
    selectedNode.etapasSucessorasIds.forEach((toId) => {
      set.add(`${selectedNode.id}->${toId}`)
    })
    return set
  }, [selectedNode])

  const relatedNodeIds = useMemo(() => {
    if (!selectedNode) return new Set<string>()
    const set = new Set<string>()
    set.add(selectedNode.id)
    selectedNode.etapasAnterioresIds.forEach((id) => set.add(id))
    selectedNode.etapasSucessorasIds.forEach((id) => set.add(id))
    return set
  }, [selectedNode])

  // Centralizar em um nó buscado
  const handleSelectSearchNode = (node: ProcessNode) => {
    setSelectedNode(node)
    // Centralizar na viewport
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const targetX = rect.width / 2 - node.x * zoom
      const targetY = rect.height / 2 - node.y * zoom
      setPan({ x: targetX, y: targetY })
    }
  }

  // Busca por código ou nome
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase().trim()
    return layout.nodes.filter(
      (n) => n.codigo.toLowerCase().includes(q) || n.nome.toLowerCase().includes(q),
    )
  }, [layout.nodes, searchQuery])

  // Reset zoom e pan
  const handleResetView = () => {
    setZoom(0.85)
    setPan({ x: 30, y: 20 })
  }

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only left click outside buttons/nodes
    if (e.button !== 0) return
    setIsPanning(true)
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    })
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  // Touch pan & pinch zoom handler
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsPanning(true)
      panStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPanning || e.touches.length !== 1) return
    setPan({
      x: e.touches[0].clientX - panStartRef.current.x,
      y: e.touches[0].clientY - panStartRef.current.y,
    })
  }

  const handleTouchEnd = () => {
    setIsPanning(false)
  }

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 1.8))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.3))

  // Detalhes do nó selecionado para o Drawer
  const selectedNodeDetails = useMemo(() => {
    if (!selectedNode) return null
    const anteriores = selectedNode.etapasAnterioresIds
      .map((id) => layout.nodeMap.get(id))
      .filter(Boolean) as ProcessNode[]

    const sucessoras = selectedNode.etapasSucessorasIds
      .map((id) => layout.nodeMap.get(id))
      .filter(Boolean) as ProcessNode[]

    return {
      node: selectedNode,
      anteriores,
      sucessoras,
    }
  }, [selectedNode, layout.nodeMap])

  // IDs de processos vinculados a metas do colaborador logado
  const userGoalProcessIds = useMemo(() => {
    if (!colaboradorLogado) return new Set<string>()
    const set = new Set<string>()
    allMetas.forEach((meta) => {
      const resp = Array.isArray(meta.responsaveis) ? meta.responsaveis : []
      if (resp.includes(colaboradorLogado.id)) {
        const procs = Array.isArray(meta.processos_vinculados) ? meta.processos_vinculados : []
        procs.forEach((pId) => set.add(pId))
      }
    })
    return set
  }, [allMetas, colaboradorLogado])

  // Selecionar nó automaticamente caso venha o param "?codigo=..." na URL
  useEffect(() => {
    const targetCodigo = searchParams.get('codigo')?.trim().toUpperCase()
    if (!targetCodigo || layout.nodes.length === 0) return

    const matchedNode = layout.nodes.find((n) => n.codigo.toUpperCase() === targetCodigo)
    if (matchedNode) {
      setSelectedNode(matchedNode)
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const targetX = rect.width / 2 - matchedNode.x * zoom
        const targetY = rect.height / 2 - matchedNode.y * zoom
        setPan({ x: targetX, y: targetY })
      }
    }
  }, [searchParams, layout.nodes, zoom])

  // Metas vinculadas ao processo selecionado (no drawer)
  const metasDoProcessoSelecionado = useMemo(() => {
    if (!selectedNode) return []
    return allMetas.filter((meta) => {
      const procs = Array.isArray(meta.processos_vinculados) ? meta.processos_vinculados : []
      return procs.includes(selectedNode.id)
    })
  }, [selectedNode, allMetas])

  // Agrupamento por área para o modo lista (mobile / alternativo)
  const procsGroupedByArea = useMemo(() => {
    const map = new Map<string, ProcessNode[]>()
    layout.swimlanes.forEach((lane) => {
      map.set(lane.nome, [])
    })

    layout.nodes.forEach((n) => {
      if (!map.has(n.area)) map.set(n.area, [])
      map.get(n.area)!.push(n)
    })

    return map
  }, [layout.swimlanes, layout.nodes])

  return (
    <div className="space-y-4 animate-fade-in pb-12 flex flex-col h-[calc(100vh-100px)]">
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#262626] pb-3 shrink-0">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold mb-1">
            <Workflow className="w-3.5 h-3.5" />
            Fluxograma Oficial CTX
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            Diagrama End-to-End da Operação
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1A1A1A] text-[#9CA3AF] border border-[#262626]">
              {layout.nodes.length} nós • {layout.edges.length} conexões
            </span>
          </h1>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Diagrama | Lista (especial para Mobile) */}
          <div className="bg-[#141414] border border-[#262626] rounded-lg p-0.5 flex items-center text-xs">
            <button
              onClick={() => setViewMode('diagram')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'diagram'
                  ? 'bg-[#FFD400] text-black shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>Diagrama</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'list'
                  ? 'bg-[#FFD400] text-black shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>

          {/* Search box with auto-complete */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por código ou nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 md:w-64 bg-[#141414] border border-[#262626] rounded-lg pl-9 pr-7 py-1.5 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#FFD400] transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-[#9CA3AF] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Results dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-[#171717] border border-[#262626] rounded-lg shadow-2xl z-50 divide-y divide-[#222]">
                {searchResults.slice(0, 10).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      handleSelectSearchNode(n)
                      setSearchQuery('')
                    }}
                    className="w-full p-2.5 text-left hover:bg-[#202020] transition-colors flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-mono font-bold text-[#FFD400] text-xs mr-2">
                        {n.codigo}
                      </span>
                      <span className="text-xs text-white truncate">{n.nome}</span>
                      <p className="text-[10px] text-[#9CA3AF] truncate">{n.area}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Zoom Controls */}
          {viewMode === 'diagram' && (
            <div className="flex items-center gap-1 bg-[#141414] border border-[#262626] rounded-lg p-0.5">
              <button
                onClick={handleZoomOut}
                className="p-1.5 text-[#9CA3AF] hover:text-white hover:bg-[#202020] rounded"
                title="Reduzir zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-mono text-[#9CA3AF] px-1">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 text-[#9CA3AF] hover:text-white hover:bg-[#202020] rounded"
                title="Aumentar zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetView}
                className="p-1.5 text-[#9CA3AF] hover:text-white hover:bg-[#202020] rounded"
                title="Resetar visão"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Empty State se ainda não importou */}
      {layout.nodes.length === 0 && !loading && (
        <div className="flex-1 bg-[#111111] border border-[#262626] rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4">
          <FileSpreadsheet className="w-12 h-12 text-[#FFD400] opacity-80" />
          <h3 className="text-lg font-bold text-white">Nenhum processo no banco de dados</h3>
          <p className="text-xs text-[#9CA3AF] max-w-md">
            O fluxo completo será gerado automaticamente quando o Administrador realizar o upload
            das 3 planilhas oficiais na seção de Administração.
          </p>
        </div>
      )}

      {/* MODO 1: DIAGRAMA INTERATIVO (CANVAS COM SWIMLANES, DAG, ZOOM E MINIMAPA) */}
      {viewMode === 'diagram' && layout.nodes.length > 0 && (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex-1 relative bg-[#090909] border border-[#262626] rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none"
        >
          {/* Canvas Wrapper transformado com pan e zoom */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: layout.width,
              height: layout.height,
              transition: isPanning ? 'none' : 'transform 0.05s ease-out',
            }}
            className="absolute top-0 left-0"
          >
            {/* SVG Background Layer para Linhas das Raias e Conexões/Arestas */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={layout.width}
              height={layout.height}
              style={{ overflow: 'visible' }}
            >
              <defs>
                {/* Marcador de seta normal (amarelo) */}
                <marker
                  id="arrow-default"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#FFD400" />
                </marker>

                {/* Marcador de seta esmaecida */}
                <marker
                  id="arrow-dimmed"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#3A3A3A" />
                </marker>

                {/* Marcador de seta tracejada de retorno */}
                <marker
                  id="arrow-backward"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#FF9900" />
                </marker>
              </defs>

              {/* Linhas divisórias das Swimlanes */}
              {layout.swimlanes.map((lane) => (
                <g key={`lane-line-${lane.nome}`}>
                  <rect
                    x={0}
                    y={lane.y}
                    width={layout.width}
                    height={lane.height}
                    fill={lane.laneIndex % 2 === 0 ? '#0B0B0B' : '#0F0F0F'}
                    stroke="#1E1E1E"
                    strokeWidth="1"
                  />
                  {/* Linha de separação */}
                  <line
                    x1={0}
                    y1={lane.y}
                    x2={layout.width}
                    y2={lane.y}
                    stroke="#262626"
                    strokeWidth="1"
                  />
                </g>
              ))}

              {/* Renderização de TODAS as Conexões / Arestas */}
              {layout.edges.map((edge) => {
                const isSelectedEdge = activeConnectionIds.has(edge.id)
                const isAnySelected = selectedNode !== null
                const opacity = isAnySelected ? (isSelectedEdge ? 1 : 0.12) : 0.75
                const strokeColor = edge.isBackward
                  ? '#FF9900'
                  : isSelectedEdge
                    ? '#FFD400'
                    : '#A3A3A3'
                const strokeWidth = isSelectedEdge ? 2.5 : 1.5
                const markerId =
                  isAnySelected && !isSelectedEdge
                    ? 'url(#arrow-dimmed)'
                    : edge.isBackward
                      ? 'url(#arrow-backward)'
                      : 'url(#arrow-default)'

                // Curva de Bézier suave
                let d = ''
                if (edge.isBackward) {
                  // Caminho curvo por baixo ou por cima para retorno/ciclo
                  const midY = Math.max(edge.fromY, edge.toY) + 50
                  d = `M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${midY}, ${edge.toX} ${midY}, ${edge.toX} ${edge.toY}`
                } else {
                  // Fluxo principal para frente
                  const deltaX = Math.max((edge.toX - edge.fromX) / 2, 40)
                  d = `M ${edge.fromX} ${edge.fromY} C ${edge.fromX + deltaX} ${edge.fromY}, ${edge.toX - deltaX} ${edge.toY}, ${edge.toX} ${edge.toY}`
                }

                // Ponto médio para rótulo Sim / Não
                const labelX = (edge.fromX + edge.toX) / 2
                const labelY = (edge.fromY + edge.toY) / 2 - 8

                return (
                  <g key={edge.id} opacity={opacity}>
                    <path
                      d={d}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={edge.isBackward ? '6,4' : 'none'}
                      markerEnd={markerId}
                      className="transition-opacity duration-200"
                    />
                    {edge.label && (
                      <g transform={`translate(${labelX}, ${labelY})`}>
                        <rect
                          x={-18}
                          y={-10}
                          width={36}
                          height={20}
                          rx={4}
                          fill="#141414"
                          stroke={edge.label === 'Sim' ? '#22C55E' : '#EF4444'}
                          strokeWidth="1"
                        />
                        <text
                          textAnchor="middle"
                          dy="4"
                          fill={edge.label === 'Sim' ? '#22C55E' : '#EF4444'}
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="sans-serif"
                        >
                          {edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Headers fixados à esquerda das Raias (Swimlane Labels) */}
            {layout.swimlanes.map((lane) => {
              const isUserLane = loggedUserArea && lane.nome.trim().toLowerCase() === loggedUserArea

              return (
                <div
                  key={`header-${lane.nome}`}
                  style={{
                    position: 'absolute',
                    top: lane.y,
                    left: 0,
                    width: 220,
                    height: lane.height,
                  }}
                  className={`border-r border-[#262626] p-4 flex flex-col justify-center bg-[#0D0D0D]/95 backdrop-blur-sm z-10 transition-colors ${
                    isUserLane ? 'border-r-2 border-r-[#FFD400]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-[#1C1C1C] text-[#FFD400] text-[10px] font-mono font-bold flex items-center justify-center shrink-0 border border-[#262626]">
                      {lane.ordem}
                    </span>
                    <h3 className="text-xs font-extrabold text-white tracking-tight leading-snug">
                      {lane.nome}
                    </h3>
                  </div>

                  {lane.tipo && lane.tipo.includes('grupo') && (
                    <span className="mt-1 text-[9px] uppercase font-bold text-[#FFD400] bg-[#FFD400]/10 px-1.5 py-0.5 rounded w-max border border-[#FFD400]/20">
                      Milestone
                    </span>
                  )}

                  {isUserLane && (
                    <span className="mt-1 text-[9px] uppercase font-bold text-[#FFD400] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FFD400] animate-pulse" />
                      Sua Área
                    </span>
                  )}
                </div>
              )
            })}

            {/* NÓS DO DIAGRAMA (Caixas retangulares ou Losangos para Decisão) */}
            {layout.nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id
              const isRelated = relatedNodeIds.has(node.id)
              const isAnySelected = selectedNode !== null
              const isUserArea = loggedUserArea && node.area.trim().toLowerCase() === loggedUserArea
              const isUserGoalProc = userGoalProcessIds.has(node.id)
              const hasYellowBorder = isUserArea || isUserGoalProc

              // Opacidade para destacar rota selecionada
              const opacity = isAnySelected ? (isRelated ? 1 : 0.22) : 1

              // Se for ponto de decisão (ex.: O01), renderiza como LOSANGO
              if (node.isDecision) {
                return (
                  <div
                    key={node.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedNode(node)
                    }}
                    style={{
                      position: 'absolute',
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      height: node.height,
                      opacity,
                    }}
                    className={`cursor-pointer transition-all duration-200 z-20 flex items-center justify-center ${
                      isSelected ? 'scale-105 z-30' : 'hover:scale-102'
                    }`}
                  >
                    {/* Losango em SVG */}
                    <div className="relative w-full h-full flex items-center justify-center">
                      <svg viewBox="0 0 200 80" className="w-full h-full drop-shadow-md">
                        <polygon
                          points="100,2 196,40 100,78 4,40"
                          fill="#171717"
                          stroke={isSelected ? '#FFD400' : hasYellowBorder ? '#FFD400' : '#EAB308'}
                          strokeWidth={isSelected ? '3' : hasYellowBorder ? '2.5' : '1.5'}
                        />
                      </svg>

                      {/* Conteúdo textual centralizado no losango */}
                      <div className="absolute inset-0 px-8 flex flex-col items-center justify-center text-center pointer-events-none">
                        <span className="font-mono font-black text-xs text-[#FFD400]">
                          {node.codigo}
                        </span>
                        <p className="text-[11px] font-bold text-white line-clamp-2 leading-tight mt-0.5">
                          {node.nome}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              }

              // Caixa padrão (Retangular)
              return (
                <div
                  key={node.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedNode(node)
                  }}
                  style={{
                    position: 'absolute',
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                    opacity,
                  }}
                  className={`bg-[#121212] border rounded-xl p-3 shadow-lg cursor-pointer transition-all duration-200 z-20 flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#FFD400] ring-2 ring-[#FFD400]/60 scale-105 z-30'
                      : hasYellowBorder
                        ? 'border-2 border-[#FFD400] hover:scale-102'
                        : 'border-[#262626] hover:border-[#FFD400]/60 hover:scale-102'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-xs text-[#FFD400]">
                      {node.codigo}
                    </span>
                    <span className="text-[10px] font-mono text-[#9CA3AF] truncate max-w-[100px]">
                      {node.area}
                    </span>
                  </div>

                  <p className="text-[11px] font-medium text-white line-clamp-2 leading-tight">
                    {node.nome}
                  </p>

                  <div className="flex items-center justify-between text-[9px] font-mono text-[#888] pt-1 border-t border-[#222]">
                    <span>
                      &larr; {node.etapasAnterioresIds.length} | &rarr;{' '}
                      {node.etapasSucessorasIds.length}
                    </span>
                    {node.etapasAnterioresIds.length === 0 &&
                      node.etapasSucessorasIds.length === 0 && (
                        <span className="text-zinc-500 italic">avulso</span>
                      )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Minimapa Flutuante (canto inferior direito) */}
          <div className="absolute bottom-4 right-4 w-44 h-32 bg-[#141414]/90 border border-[#262626] rounded-xl p-2 shadow-2xl backdrop-blur-md hidden sm:block pointer-events-none z-30">
            <div className="flex items-center justify-between text-[9px] uppercase font-bold text-[#9CA3AF] mb-1">
              <span>Minimapa</span>
              <Compass className="w-3 h-3 text-[#FFD400]" />
            </div>
            <div className="relative w-full h-[88px] bg-[#0A0A0A] rounded border border-[#222] overflow-hidden">
              {/* Pontos dos nós */}
              {layout.nodes.map((n) => {
                const mapX = (n.x / layout.width) * 160
                const mapY = (n.y / layout.height) * 88
                return (
                  <div
                    key={`mini-${n.id}`}
                    style={{ left: mapX, top: mapY }}
                    className={`absolute w-1 h-1 rounded-full ${
                      selectedNode?.id === n.id ? 'bg-[#FFD400] w-2 h-2 z-10' : 'bg-[#555]'
                    }`}
                  />
                )
              })}
              {/* Viewport Box no Minimapa */}
              {containerRef.current && (
                <div
                  style={{
                    left: Math.max(0, (-pan.x / (layout.width * zoom)) * 160),
                    top: Math.max(0, (-pan.y / (layout.height * zoom)) * 88),
                    width: Math.min(
                      160,
                      (containerRef.current.clientWidth / (layout.width * zoom)) * 160,
                    ),
                    height: Math.min(
                      88,
                      (containerRef.current.clientHeight / (layout.height * zoom)) * 88,
                    ),
                  }}
                  className="absolute border border-[#FFD400]/70 bg-[#FFD400]/10 rounded-sm pointer-events-none"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODO 2: LISTA POR ÁREAS (RESPONSIVO / MOBILE) */}
      {viewMode === 'list' && layout.nodes.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {Array.from(procsGroupedByArea.entries()).map(([areaNome, procs]) => {
            const isUserLane = loggedUserArea && areaNome.trim().toLowerCase() === loggedUserArea

            return (
              <div
                key={areaNome}
                className={`bg-[#111111] border rounded-2xl p-5 space-y-3 ${
                  isUserLane ? 'border-[#FFD400]' : 'border-[#262626]'
                }`}
              >
                <div className="flex items-center justify-between border-b border-[#262626] pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{areaNome}</h3>
                    {isUserLane && (
                      <span className="text-[10px] font-bold text-[#FFD400] bg-[#FFD400]/10 px-2 py-0.5 rounded border border-[#FFD400]/30">
                        Sua Área
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-[#9CA3AF]">{procs.length} processos</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {procs.map((node) => {
                    const isUserGoalProc = userGoalProcessIds.has(node.id)
                    const hasYellowBorder = isUserLane || isUserGoalProc

                    return (
                      <div
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={`p-3 rounded-xl border bg-[#161616] cursor-pointer hover:border-[#FFD400] transition-colors flex flex-col justify-between ${
                          selectedNode?.id === node.id
                            ? 'border-[#FFD400] ring-1 ring-[#FFD400]'
                            : hasYellowBorder
                              ? 'border-[#FFD400]'
                              : 'border-[#262626]'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-xs text-[#FFD400]">
                              {node.codigo}
                            </span>
                            {node.isDecision && (
                              <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded">
                                Decisão
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-white line-clamp-2">{node.nome}</p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-[#222] flex items-center justify-between text-[10px] text-[#9CA3AF]">
                          <span>&larr; {node.etapasAnterioresIds.length} anteriores</span>
                          <span>&rarr; {node.etapasSucessorasIds.length} sucessores</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* PAINEL LATERAL (DRAWER AO CLICAR EM UM PROCESSO) */}
      {selectedNodeDetails && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedNode(null)}
          />

          <div className="relative w-full md:w-[480px] bg-[#111111] border-l border-[#262626] h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-250 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[#262626] flex items-center justify-between bg-[#141414]">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-[#FFD400]" />
                <span className="text-xs uppercase tracking-wider font-bold text-[#9CA3AF]">
                  Detalhes do Processo
                </span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#1E1E1E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo scrollável */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Processo Card */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-black text-[#FFD400]">
                    {selectedNodeDetails.node.codigo}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#1F1F1F] text-white border border-[#2E2E2E]">
                    {selectedNodeDetails.node.area}
                  </span>
                </div>
                <h2 className="text-base font-bold text-white leading-snug">
                  {selectedNodeDetails.node.nome}
                </h2>
                {selectedNodeDetails.node.observacao && (
                  <div className="mt-2 p-2.5 rounded bg-[#1C1C1C] border border-[#FFD400]/30 text-xs text-[#D1D5DB]">
                    <span className="font-semibold text-[#FFD400] block mb-0.5">
                      Observação / Regra:
                    </span>
                    {selectedNodeDetails.node.observacao}
                  </div>
                )}
              </div>

              {/* Vem de (Etapas Anteriores) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-white flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4 text-[#FFD400]" />
                    Vem de ({selectedNodeDetails.anteriores.length})
                  </h4>
                </div>

                {selectedNodeDetails.anteriores.length > 0 ? (
                  <div className="space-y-2">
                    {selectedNodeDetails.anteriores.map((ant) => (
                      <div
                        key={ant.id}
                        onClick={() => setSelectedNode(ant)}
                        className="p-3 rounded-lg bg-[#161616] border border-[#262626] hover:border-[#FFD400] transition-colors cursor-pointer flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-[#FFD400] text-xs mr-2">
                            {ant.codigo}
                          </span>
                          <span className="text-xs text-white">{ant.nome}</span>
                          <p className="text-[10px] text-[#9CA3AF] mt-0.5">{ant.area}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-[#161616] border border-[#262626] text-xs text-[#9CA3AF]">
                    Início de fluxo — sem etapas anteriores.
                  </div>
                )}
              </div>

              {/* Vai para (Etapas Sucessoras) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-white flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-[#FFD400]" />
                    Vai para ({selectedNodeDetails.sucessoras.length})
                  </h4>
                </div>

                {selectedNodeDetails.sucessoras.length > 0 ? (
                  <div className="space-y-2">
                    {selectedNodeDetails.sucessoras.map((suc) => (
                      <div
                        key={suc.id}
                        onClick={() => setSelectedNode(suc)}
                        className="p-3 rounded-lg bg-[#161616] border border-[#262626] hover:border-[#FFD400] transition-colors cursor-pointer flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-[#FFD400] text-xs mr-2">
                            {suc.codigo}
                          </span>
                          <span className="text-xs text-white">{suc.nome}</span>
                          <p className="text-[10px] text-[#9CA3AF] mt-0.5">{suc.area}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-[#161616] border border-[#262626] text-xs text-[#9CA3AF]">
                    Fim de fluxo — sem etapas sucessoras mapeadas.
                  </div>
                )}
              </div>

              {/* Metas vinculadas a este processo */}
              <div className="space-y-3 pt-2 border-t border-[#262626]">
                <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-white flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#FFD400]" />
                    Metas Vinculadas ({metasDoProcessoSelecionado.length})
                  </h4>
                </div>

                {metasDoProcessoSelecionado.length > 0 ? (
                  <div className="space-y-2.5">
                    {metasDoProcessoSelecionado.map((meta) => {
                      const respNames = (meta.expand?.responsaveis || [])
                        .map((r) => r.nome)
                        .join(', ')

                      return (
                        <div
                          key={meta.id}
                          className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C1C1C] border border-[#333] text-[#FFD400] font-bold">
                                {meta.codigo}
                              </span>
                              {meta.expand?.projeto && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFD400] text-black font-extrabold">
                                  {meta.expand.projeto.nome}
                                </span>
                              )}
                              {meta.expand?.projeto_secundario && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#FFD400]/70 text-[#FFD400] font-bold bg-transparent">
                                  {meta.expand.projeto_secundario.nome}
                                </span>
                              )}
                            </div>
                            {meta.trimestre && (
                              <span className="text-[10px] font-mono text-[#9CA3AF]">
                                {meta.trimestre}
                              </span>
                            )}
                          </div>

                          <h5 className="text-xs font-bold text-white leading-snug">
                            {meta.titulo}
                          </h5>

                          {respNames && (
                            <div className="flex items-center gap-1.5 text-[11px] text-[#9CA3AF] pt-1 border-t border-[#222]">
                              <Users className="w-3 h-3 text-[#FFD400] shrink-0" />
                              <span className="truncate">
                                Responsável(is): <strong className="text-white">{respNames}</strong>
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-[#161616] border border-[#262626] text-xs text-[#9CA3AF]">
                    Nenhuma meta diretamente vinculada a este processo.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#262626] bg-[#141414]">
              <button
                onClick={() => setSelectedNode(null)}
                className="w-full py-2.5 bg-[#1C1C1C] hover:bg-[#262626] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors"
              >
                Fechar painel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
