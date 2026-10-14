import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Workflow,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  ArrowRight,
  ArrowLeft,
  Target,
  FileSpreadsheet,
  List,
  Compass,
  Users,
  Save,
  RotateCcw,
  Edit3,
  AlertTriangle,
  Move,
  Loader2,
  Info,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import type { Area, Processo, Colaborador, Meta, FluxogramaPosicao } from '@/types/ctx'
import {
  computeDiagramLayout,
  type ProcessNode,
  type DiagramLayout,
  type EdgeConnection,
  type Swimlane,
  NODE_WIDTH,
  NODE_HEIGHT,
  LANE_HEADER_WIDTH,
} from '@/lib/diagramLayout'

/**
 * Gera o path SVG cúbico (smooth bezier) entre os dois pontos da aresta
 * considerando os lados de origem e destino para máxima fluidez.
 */
function buildSmoothPath(edge: EdgeConnection): string {
  const { fromX, fromY, toX, toY, fromSide, toSide, isBackward } = edge

  if (isBackward) {
    if (fromSide === 'right' && toSide === 'right') {
      // Loop pelo lado direito
      const loopWidth = 45
      const c1X = fromX + loopWidth
      const c1Y = fromY
      const c2X = toX + loopWidth
      const c2Y = toY
      return `M ${fromX} ${fromY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${toX} ${toY}`
    }
    if (fromSide === 'bottom' && toSide === 'top') {
      const midY = (fromY + toY) / 2
      return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`
    }
    if (fromSide === 'top' && toSide === 'top') {
      const curveHeight = Math.max(30, Math.abs(toX - fromX) * 0.15)
      const topArcY = Math.min(fromY, toY) - curveHeight
      return `M ${fromX} ${fromY} C ${fromX} ${topArcY}, ${toX} ${topArcY}, ${toX} ${toY}`
    }
    // bottom to bottom
    const curveHeight = Math.max(30, Math.abs(toX - fromX) * 0.15)
    const bottomArcY = Math.max(fromY, toY) + curveHeight
    return `M ${fromX} ${fromY} C ${fromX} ${bottomArcY}, ${toX} ${bottomArcY}, ${toX} ${toY}`
  }

  // Conexão direta progressiva: fromSide='right', toSide='left'
  const dx = toX - fromX
  const dy = toY - fromY

  // Controle horizontal proporcional à distância horizontal
  // Garante que a curva saia perfeitamente na horizontal da direita e entre suavemente na esquerda
  const tension = Math.max(Math.min(dx * 0.5, 140), 40)
  const c1X = fromX + tension
  const c1Y = fromY
  const c2X = toX - tension
  const c2Y = toY

  return `M ${fromX} ${fromY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${toX} ${toY}`
}

export default function Fluxograma() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  const isAdmin = user?.role === 'admin'

  const [areas, setAreas] = useState<Area[]>([])
  const [processos, setProcessos] = useState<Processo[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [colaboradorLogado, setColaboradorLogado] = useState<Colaborador | null>(null)
  const [allMetas, setAllMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)

  // Posições customizadas salvas no banco
  const [savedPositions, setSavedPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map(),
  )
  // Posições em rascunho durante edição
  const [editingPositions, setEditingPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map(),
  )

  // Modo Editor de Diagrama (exclusivo admin)
  const [isEditMode, setIsEditMode] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showExitConfirmDialog, setShowExitConfirmDialog] = useState(false)

  // Dragging node state no modo edição
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const dragStartPosRef = useRef<{
    clientX: number
    clientY: number
    initialNodeX: number
    initialNodeY: number
  }>({ clientX: 0, clientY: 0, initialNodeX: 0, initialNodeY: 0 })
  const hasMovedDuringDragRef = useRef(false)

  // Layout View Controls
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('diagram')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('all')
  const [selectedNode, setSelectedNode] = useState<ProcessNode | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Zoom & Pan state
  const [zoom, setZoom] = useState(0.75)
  const [pan, setPan] = useState({ x: 50, y: 50 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch initial data + posições salvas
  const fetchData = async () => {
    try {
      const [areasRes, procsRes, colabsRes, metasRes, posRes] = await Promise.all([
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
        pb
          .collection('fluxograma_posicoes')
          .getFullList<FluxogramaPosicao>()
          .catch(() => []),
      ])

      setAreas(areasRes)
      setProcessos(procsRes)
      setColaboradores(colabsRes)
      setAllMetas(metasRes)

      const posMap = new Map<string, { x: number; y: number }>()
      posRes.forEach((p) => {
        if (p.processo_id) {
          posMap.set(p.processo_id, { x: p.x, y: p.y })
        }
        if (p.processo_codigo) {
          posMap.set(p.processo_codigo.trim().toUpperCase(), { x: p.x, y: p.y })
        }
      })
      setSavedPositions(posMap)
      setEditingPositions(new Map(posMap))

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

  useEffect(() => {
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
  }, [areas, user, colaboradorLogado])

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

  // Determina as posições a passar para o gerador de layout:
  // No modo edição, usamos editingPositions; fora dele, usamos savedPositions.
  const activePositionsMap = useMemo(() => {
    return isEditMode ? editingPositions : savedPositions
  }, [isEditMode, editingPositions, savedPositions])

  // DIAGRAM LAYOUT CALCULATION (respeitando posições salvas/editadas e fallback automático)
  const layout: DiagramLayout = useMemo(() => {
    return computeDiagramLayout(areas, processos, activePositionsMap)
  }, [areas, processos, activePositionsMap])

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

  // Lista única de nomes de áreas presentes nos processos para o filtro de realce
  const availableAreas = useMemo(() => {
    const set = new Set<string>()
    processos.forEach((p) => {
      if (p.area) set.add(p.area.trim())
    })
    return Array.from(set).sort()
  }, [processos])

  // Alternar seleção ao clicar em um nó: se já estiver selecionado, desseleciona (ou seleciona novo)
  // Nota: o clique no nó destaca as conexões e NÃO abre o drawer diretamente.
  // Se mudar de nó com drawer já aberto, fecha o drawer ou mantém fechado até o usuário clicar em "Ver detalhes".
  const handleToggleNodeSelection = (node: ProcessNode) => {
    setSelectedNode((prev) => {
      if (prev?.id === node.id) {
        setIsDrawerOpen(false)
        return null
      }
      setIsDrawerOpen(false)
      return node
    })
  }

  // Centralizar em um nó buscado (destaca e não abre drawer diretamente)
  const handleSelectSearchNode = (node: ProcessNode) => {
    setSelectedNode(node)
    setIsDrawerOpen(false)
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const targetX = rect.width / 2 - (node.x + node.width / 2) * zoom
      const targetY = rect.height / 2 - (node.y + node.height / 2) * zoom
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

  // Reset zoom e pan para visão geral
  const handleResetView = () => {
    setZoom(0.75)
    setPan({ x: 50, y: 50 })
  }

  // Handlers para o modo edição (arrastar nós) e pan do canvas
  const handleNodeMouseDown = (e: React.MouseEvent, node: ProcessNode) => {
    if (!isEditMode) return
    if (e.button !== 0) return
    e.stopPropagation()

    setDraggingNodeId(node.id)
    hasMovedDuringDragRef.current = false
    dragStartPosRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialNodeX: node.x,
      initialNodeY: node.y,
    }
  }

  const handleNodeTouchStart = (e: React.TouchEvent, node: ProcessNode) => {
    if (!isEditMode) return
    if (e.touches.length !== 1) return
    e.stopPropagation()

    setDraggingNodeId(node.id)
    hasMovedDuringDragRef.current = false
    dragStartPosRef.current = {
      clientX: e.touches[0].clientX,
      clientY: e.touches[0].clientY,
      initialNodeX: node.x,
      initialNodeY: node.y,
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsPanning(true)
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }

  // Clicar no fundo do canvas desmarca a seleção ativa (sem interferir caso tenha arrastado)
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (hasMovedDuringDragRef.current) return
    // Apenas se o clique foi direto no canvas/wrapper e não em um nó (os nós dão stopPropagation)
    if (selectedNode && !isEditMode) {
      setSelectedNode(null)
      setIsDrawerOpen(false)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeId) {
      const dx = (e.clientX - dragStartPosRef.current.clientX) / zoom
      const dy = (e.clientY - dragStartPosRef.current.clientY) / zoom

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMovedDuringDragRef.current = true
      }

      const newX = Math.max(20, Math.round(dragStartPosRef.current.initialNodeX + dx))
      const newY = Math.max(20, Math.round(dragStartPosRef.current.initialNodeY + dy))

      setEditingPositions((prev) => {
        const next = new Map(prev)
        next.set(draggingNodeId, { x: newX, y: newY })
        return next
      })
      setHasUnsavedChanges(true)
      return
    }

    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      })
    }
  }

  const handleMouseUp = () => {
    if (draggingNodeId) {
      setDraggingNodeId(null)
    }
    setIsPanning(false)
  }

  // Touch handlers
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
    if (draggingNodeId && e.touches.length === 1) {
      const dx = (e.touches[0].clientX - dragStartPosRef.current.clientX) / zoom
      const dy = (e.touches[0].clientY - dragStartPosRef.current.clientY) / zoom

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMovedDuringDragRef.current = true
      }

      const newX = Math.max(20, Math.round(dragStartPosRef.current.initialNodeX + dx))
      const newY = Math.max(20, Math.round(dragStartPosRef.current.initialNodeY + dy))

      setEditingPositions((prev) => {
        const next = new Map(prev)
        next.set(draggingNodeId, { x: newX, y: newY })
        return next
      })
      setHasUnsavedChanges(true)
      return
    }

    if (!isPanning || e.touches.length !== 1) return
    setPan({
      x: e.touches[0].clientX - panStartRef.current.x,
      y: e.touches[0].clientY - panStartRef.current.y,
    })
  }

  const handleTouchEnd = () => {
    if (draggingNodeId) {
      setDraggingNodeId(null)
    }
    setIsPanning(false)
  }

  // Salvar posições personalizadas no PocketBase
  const handleSavePositions = async () => {
    if (!isAdmin) return
    setIsSaving(true)
    try {
      // Montar lista com todas as posições ativas dos nós editados
      const positionsPayload: {
        processo_id: string
        processo_codigo: string
        x: number
        y: number
      }[] = []

      editingPositions.forEach((pos, procId) => {
        const proc = processos.find((p) => p.id === procId)
        const codigo = proc?.codigo || ''
        positionsPayload.push({
          processo_id: procId,
          processo_codigo: codigo,
          x: Math.round(pos.x),
          y: Math.round(pos.y),
        })
      })

      // Envio atômico em requisição única para o endpoint privilegiado server-side
      // Evita o erro 429 Too Many Requests ao salvar 180+ nós em paralelo
      await pb.send<{ success: boolean; message: string }>(
        '/backend/v1/ctx/fluxograma/save-positions',
        {
          method: 'POST',
          body: {
            positions: positionsPayload,
          },
        },
      )

      setSavedPositions(new Map(editingPositions))
      setHasUnsavedChanges(false)

      toast({
        title: 'Disposição salva com sucesso!',
        description:
          'A nova organização do fluxograma agora está visível para todos os colaboradores.',
      })
    } catch (err: unknown) {
      console.error('Erro ao salvar disposição:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as novas posições no servidor.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Voltar ao automático (limpa todas as posições salvas e restaura layout automático)
  const handleResetToAutomatic = async () => {
    if (!isAdmin) return
    const confirmReset = window.confirm(
      'Tem certeza que deseja restaurar o layout automático padrão? Isso apagará todas as posições salvas do diagrama.',
    )
    if (!confirmReset) return

    setIsSaving(true)
    try {
      // Limpeza atômica em requisição única para o endpoint privilegiado server-side
      await pb.send<{ success: boolean; message: string }>(
        '/backend/v1/ctx/fluxograma/reset-positions',
        {
          method: 'POST',
        },
      )

      setSavedPositions(new Map())
      setEditingPositions(new Map())
      setHasUnsavedChanges(false)
      setIsEditMode(false)

      toast({
        title: 'Layout automático restaurado',
        description: 'O fluxograma voltou a utilizar o posicionamento automático padrão.',
      })
    } catch (err: unknown) {
      console.error('Erro ao resetar posições:', err)
      toast({
        title: 'Erro ao restaurar',
        description: 'Não foi possível limpar as posições salvas.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Sair do modo edição avisando sobre alterações pendentes
  const handleCancelOrExitEdit = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirmDialog(true)
    } else {
      setIsEditMode(false)
      setEditingPositions(new Map(savedPositions))
    }
  }

  const handleConfirmExitWithoutSaving = () => {
    setEditingPositions(new Map(savedPositions))
    setHasUnsavedChanges(false)
    setIsEditMode(false)
    setShowExitConfirmDialog(false)
  }

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 1.8))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.25))

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

  // Selecionar nó automaticamente caso venha o param "?codigo=..." na URL
  useEffect(() => {
    const targetCodigo = searchParams.get('codigo')?.trim().toUpperCase()
    if (!targetCodigo || layout.nodes.length === 0) return

    const matchedNode = layout.nodes.find((n) => n.codigo.toUpperCase() === targetCodigo)
    if (matchedNode) {
      setSelectedNode(matchedNode)
      setIsDrawerOpen(false)
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const targetX = rect.width / 2 - (matchedNode.x + matchedNode.width / 2) * zoom
        const targetY = rect.height / 2 - (matchedNode.y + matchedNode.height / 2) * zoom
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

  // Mapa de ordem_no_fluxo das áreas para ordenar os grupos da Lista
  const areaOrderMap = useMemo(() => {
    const m = new Map<string, number>()
    areas.forEach((a) => {
      m.set(a.nome.trim().toLowerCase(), a.ordem_no_fluxo ?? 999)
    })
    return m
  }, [areas])

  // Agrupamento por área para o modo lista (mobile / alternativo)
  // 1. Áreas ordenadas por ordem_no_fluxo
  // 2. Processos de cada área ordenados por código alfanumérico natural (V01, V02, V03...)
  const sortedAreaGroups = useMemo(() => {
    const map = new Map<string, ProcessNode[]>()
    layout.nodes.forEach((n) => {
      const areaKey = n.area?.trim() || 'Sem Área'
      if (!map.has(areaKey)) map.set(areaKey, [])
      map.get(areaKey)!.push(n)
    })

    // Ordenar nós internamente em cada área por código (ex: V01, V02, V03...)
    map.forEach((nodeList) => {
      nodeList.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
    })

    // Ordenar grupos de área pela ordem_no_fluxo da coleção 'areas'
    const sortedEntries = Array.from(map.entries()).sort(([areaA], [areaB]) => {
      const orderA = areaOrderMap.get(areaA.toLowerCase()) ?? 999
      const orderB = areaOrderMap.get(areaB.toLowerCase()) ?? 999
      if (orderA !== orderB) return orderA - orderB
      return areaA.localeCompare(areaB, undefined, { numeric: true })
    })

    return sortedEntries
  }, [layout.nodes, areaOrderMap])

  return (
    <div className="space-y-4 animate-fade-in pb-12 flex flex-col h-[calc(100vh-100px)]">
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#262626] pb-3 shrink-0">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold mb-1">
            <Workflow className="w-3.5 h-3.5" />
            Fluxograma CTX
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            Fluxo Operacional de Ponta a Ponta
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1A1A1A] text-[#9CA3AF] border border-[#262626]">
              {layout.nodes.length} processos • {layout.edges.length} conexões
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

          {/* Filtro rápido por área (destaca caixas da área selecionada sem ocultar conexões) */}
          <div className="relative">
            <select
              value={selectedAreaFilter}
              onChange={(e) => setSelectedAreaFilter(e.target.value)}
              className="bg-[#141414] border border-[#262626] rounded-lg px-2.5 py-1.5 text-xs text-[#D1D5DB] focus:outline-none focus:border-[#FFD400] transition-colors cursor-pointer"
            >
              <option value="all">Todas as Áreas ({layout.nodes.length})</option>
              {availableAreas.map((areaName) => (
                <option key={areaName} value={areaName}>
                  {areaName}
                </option>
              ))}
            </select>
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
                className="w-52 md:w-60 bg-[#141414] border border-[#262626] rounded-lg pl-9 pr-7 py-1.5 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#FFD400] transition-colors"
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

          {/* Botão de Modo Edição para Administrador */}
          {isAdmin && viewMode === 'diagram' && (
            <div className="flex items-center gap-2">
              {!isEditMode ? (
                <button
                  onClick={() => {
                    // Inicializa as posições de rascunho com as posições visíveis atuais de cada nó
                    const initialMap = new Map<string, { x: number; y: number }>()
                    layout.nodes.forEach((n) => {
                      initialMap.set(n.id, { x: n.x, y: n.y })
                    })
                    setEditingPositions(initialMap)
                    setIsEditMode(true)
                    setHasUnsavedChanges(false)
                    setSelectedNode(null)
                    setIsDrawerOpen(false)
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1E1E1E] text-white border border-[#333] hover:border-[#FFD400] text-xs font-bold transition-all flex items-center gap-1.5"
                  title="Editar disposição dos processos no diagrama"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#FFD400]" />
                  <span>Editar Diagrama</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-[#171717] p-1 rounded-lg border border-[#FFD400]/40 shadow-lg">
                  <button
                    disabled={isSaving}
                    onClick={handleSavePositions}
                    className="px-3 py-1.5 rounded-md bg-[#FFD400] hover:bg-[#e6bf00] text-black font-extrabold text-xs transition-all flex items-center gap-1.5 shadow"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Salvar disposição</span>
                  </button>

                  <button
                    disabled={isSaving}
                    onClick={handleResetToAutomatic}
                    className="px-2.5 py-1.5 rounded-md bg-[#222] hover:bg-[#2A2A2A] text-[#D1D5DB] hover:text-white text-xs font-semibold transition-all flex items-center gap-1 border border-[#333]"
                    title="Limpar posições personalizadas e restaurar layout automático"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Voltar ao automático</span>
                  </button>

                  <button
                    disabled={isSaving}
                    onClick={handleCancelOrExitEdit}
                    className="px-2.5 py-1.5 rounded-md bg-[#1F1F1F] hover:bg-[#282828] text-[#9CA3AF] hover:text-white text-xs font-semibold transition-all"
                    title="Sair do modo edição"
                  >
                    Sair
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Barra de alerta do Modo Edição Ativo */}
      {isEditMode && (
        <div className="bg-[#FFD400]/10 border border-[#FFD400]/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-white">
            <Move className="w-4 h-4 text-[#FFD400] shrink-0" />
            <span>
              <strong className="text-[#FFD400]">Modo Edição Ativo:</strong> Clique e arraste
              qualquer caixa de processo para posicioná-la livremente no canvas. As conexões
              seguirão a nova posição.
            </span>
            {hasUnsavedChanges && (
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/40">
                Alterações não salvas
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[#A3A3A3]">
            <span className="hidden md:inline">Desktop-first: ideal para tela cheia e mouse</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSavePositions}
                disabled={isSaving}
                className="font-bold text-[#FFD400] hover:underline"
              >
                Salvar agora
              </button>
              <span>•</span>
              <button onClick={handleCancelOrExitEdit} className="hover:underline">
                Sair da edição
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Empty State */}
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

      {/* MODO 1: DIAGRAMA INTERATIVO COM RAIAS HORIZONTAIS POR ÁREA */}
      {viewMode === 'diagram' && layout.nodes.length > 0 && (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleCanvasClick}
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
            {/* CAMADA DE RAIAS HORIZONTAIS (SWIMLANES POR ÁREA) */}
            <div className="absolute inset-0 pointer-events-none z-0">
              {layout.lanes.map((lane) => {
                const isUserLane =
                  loggedUserArea && lane.nome.trim().toLowerCase() === loggedUserArea
                const isSelectedArea =
                  selectedAreaFilter !== 'all' &&
                  lane.nome.trim().toLowerCase() === selectedAreaFilter.trim().toLowerCase()
                const isMilestoneLane = lane.nome.trim().toLowerCase() === 'milestone'

                return (
                  <div
                    key={lane.id}
                    style={{
                      position: 'absolute',
                      top: lane.y,
                      left: 40,
                      width: layout.width - 80,
                      height: lane.height,
                    }}
                    className={`rounded-2xl border transition-all duration-300 ${
                      isMilestoneLane
                        ? 'bg-[#181404]/60 border-[#FFD400]/40 ring-1 ring-[#FFD400]/20'
                        : isUserLane
                          ? 'bg-[#15140e]/70 border-[#FFD400]/50 shadow-lg'
                          : isSelectedArea
                            ? 'bg-[#161616] border-[#FFD400]/60'
                            : 'bg-[#0d0d0d]/85 border-[#202020]'
                    }`}
                  >
                    {/* Cabeçalho da Raia (Nome da área no início da raia horizontal) */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: LANE_HEADER_WIDTH,
                      }}
                      className={`flex flex-col justify-center px-4 rounded-l-2xl border-r ${
                        isMilestoneLane
                          ? 'bg-[#221c05] border-[#FFD400]/40'
                          : isUserLane
                            ? 'bg-[#1c1806] border-[#FFD400]/40'
                            : 'bg-[#131313] border-[#222]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isMilestoneLane
                              ? 'bg-[#FFD400] text-black'
                              : isUserLane
                                ? 'bg-[#FFD400] text-black'
                                : 'bg-[#222] text-[#9CA3AF]'
                          }`}
                        >
                          {String(lane.ordem).padStart(2, '0')}
                        </span>
                        {isMilestoneLane && (
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#FFD400] px-1.5 py-0.5 rounded bg-[#FFD400]/10 border border-[#FFD400]/30">
                            Marcos
                          </span>
                        )}
                        {isUserLane && !isMilestoneLane && (
                          <span className="text-[9px] font-bold uppercase text-[#FFD400] px-1 py-0.5 rounded bg-[#FFD400]/10 border border-[#FFD400]/30">
                            Sua Área
                          </span>
                        )}
                      </div>

                      <h3
                        title={lane.nome}
                        className={`text-sm font-extrabold leading-tight tracking-tight truncate ${
                          isMilestoneLane
                            ? 'text-[#FFD400]'
                            : isUserLane
                              ? 'text-white'
                              : 'text-[#E5E7EB]'
                        }`}
                      >
                        {lane.nome}
                      </h3>

                      <span className="text-[10px] font-mono text-[#737373] mt-1">
                        {lane.nodeCount} {lane.nodeCount === 1 ? 'processo' : 'processos'}
                      </span>
                    </div>

                    {/* Linha guia horizontal suave da raia */}
                    <div className="absolute top-1/2 left-[220px] right-4 h-px bg-white/[0.03] pointer-events-none" />
                  </div>
                )
              })}
            </div>

            {/* SVG Background Layer para Conexões Suaves (Curvas Bézier) */}
            <svg
              className="absolute inset-0 pointer-events-none z-10"
              width={layout.width}
              height={layout.height}
              style={{ overflow: 'visible' }}
            >
              <defs>
                {/* Marcador de seta amarela destacada (#FFD400) com tamanho realçado */}
                <marker
                  id="arrow-highlighted"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#FFD400" />
                </marker>

                {/* Marcador de seta padrão (amarelo) quando não há seleção */}
                <marker
                  id="arrow-default"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#FFD400" />
                </marker>

                {/* Marcador de seta esmaecida (quando outro processo está selecionado) */}
                <marker
                  id="arrow-dimmed"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#2E2E2E" />
                </marker>

                {/* Marcador de seta de retorno / ciclo não selecionado (laranja suave) */}
                <marker
                  id="arrow-backward"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#FF9900" />
                </marker>
              </defs>

              {/* Renderização de TODAS as Conexões / Arestas Fluidas (inclusive entre raias) */}
              {layout.edges.map((edge) => {
                const isSelectedEdge = activeConnectionIds.has(edge.id)
                const isAnySelected = selectedNode !== null

                // Opacidade: setas não selecionadas ficam bem esmaecidas (0.05), a selecionada brilha em 1.0
                const opacity = isAnySelected ? (isSelectedEdge ? 1 : 0.05) : 0.65

                // Cor: se selecionada (inclusive retorno), TODAS as conexões ativas ficam em AMARELO marca (#FFD400)
                // Se não selecionada: retornos em #FF9900 e fluxo normal em cinza #737373
                const strokeColor = isSelectedEdge
                  ? '#FFD400'
                  : edge.isBackward
                    ? '#FF9900'
                    : '#737373'

                // Espessura: aumentada para 3.5 quando destacada (vs 1.6 normal)
                const strokeWidth = isSelectedEdge ? 3.5 : 1.6

                // Marcador no fim da seta:
                // - Se a aresta estiver selecionada: arrow-highlighted (amarela, tamanho 8)
                // - Se houver outra seleção ativa: arrow-dimmed
                // - Se nenhuma seleção ativa: arrow-backward (para retornos) ou arrow-default
                const markerId = isSelectedEdge
                  ? 'url(#arrow-highlighted)'
                  : isAnySelected
                    ? 'url(#arrow-dimmed)'
                    : edge.isBackward
                      ? 'url(#arrow-backward)'
                      : 'url(#arrow-default)'

                // Curva de Bézier suave
                const pathData = buildSmoothPath(edge)

                // Ponto médio para rótulo Sim / Não
                const labelX = (edge.fromX + edge.toX) / 2
                const labelY = (edge.fromY + edge.toY) / 2 - 10

                return (
                  <g key={edge.id} opacity={opacity}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={edge.isBackward ? (isSelectedEdge ? '7,4' : '6,4') : 'none'}
                      markerEnd={markerId}
                      className="transition-opacity duration-200"
                    />
                    {edge.label && (
                      <g transform={`translate(${labelX}, ${labelY})`}>
                        <rect
                          x={-20}
                          y={-10}
                          width={40}
                          height={20}
                          rx={4}
                          fill="#141414"
                          stroke={edge.label === 'Sim' ? '#22C55E' : '#EF4444'}
                          strokeWidth="1.2"
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

            {/* NÓS DO DIAGRAMA (Caixas nas raias ou Losangos para Milestone e Decisão) */}
            {layout.nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id
              const isDirectNeighbor =
                selectedNode !== null && !isSelected && relatedNodeIds.has(node.id)
              const isRelated = relatedNodeIds.has(node.id)
              const isAnySelected = selectedNode !== null
              const isUserArea = loggedUserArea && node.area.trim().toLowerCase() === loggedUserArea
              const isUserGoalProc = userGoalProcessIds.has(node.id)
              const matchesAreaFilter =
                selectedAreaFilter === 'all' ||
                node.area.trim().toLowerCase() === selectedAreaFilter.trim().toLowerCase()

              const isDraggingThis = draggingNodeId === node.id
              const hasYellowBorder = isUserArea || isUserGoalProc
              const isMilestone = node.isMilestone

              // Opacidade para destacar rota selecionada ou filtro de área
              // As caixas não relacionadas ficam bem esmaecidas (0.12) enquanto selecionado
              let opacity = 1
              if (isAnySelected && !isEditMode) {
                opacity = isSelected ? 1 : isDirectNeighbor ? 1 : 0.12
              } else if (selectedAreaFilter !== 'all' && !isEditMode) {
                opacity = matchesAreaFilter ? 1 : 0.25
              }

              // Estilo de cursor e drag
              const cursorClass = isEditMode
                ? isDraggingThis
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : 'cursor-pointer'

              // CASO 1: PROCESSOS DO GRUPO "MILESTONE" -> RENDERIZADOS EM LOSANGO (DIAMOND)
              if (isMilestone) {
                return (
                  <div
                    key={node.id}
                    title={`${node.codigo} - ${node.nome} (${node.area})`}
                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                    onTouchStart={(e) => handleNodeTouchStart(e, node)}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (hasMovedDuringDragRef.current) return
                      handleToggleNodeSelection(node)
                    }}
                    style={{
                      position: 'absolute',
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      height: node.height,
                      opacity,
                      transition: isDraggingThis
                        ? 'none'
                        : 'box-shadow 0.2s ease, transform 0.2s ease',
                    }}
                    className={`${cursorClass} z-20 flex items-center justify-center ${
                      isDraggingThis
                        ? 'z-40 scale-105 shadow-2xl ring-2 ring-[#FFD400]'
                        : isSelected
                          ? 'scale-105 z-30 drop-shadow-[0_0_12px_rgba(255,212,0,0.45)]'
                          : isDirectNeighbor
                            ? 'z-25 scale-102 ring-1 ring-[#FFD400]/70 drop-shadow-[0_0_8px_rgba(255,212,0,0.25)]'
                            : isEditMode
                              ? 'hover:scale-102 hover:ring-1 hover:ring-[#FFD400]/70'
                              : 'hover:scale-102'
                    }`}
                  >
                    <div className="relative w-full h-full flex items-center justify-center">
                      <svg
                        viewBox={`0 0 ${node.width} ${node.height}`}
                        className="w-full h-full drop-shadow-xl"
                      >
                        <polygon
                          points={`${node.width / 2},4 ${node.width - 6},${node.height / 2} ${node.width / 2},${node.height - 4} 6,${node.height / 2}`}
                          fill={isDirectNeighbor ? '#201a07' : '#181507'}
                          stroke={
                            isDraggingThis
                              ? '#FFD400'
                              : isSelected
                                ? '#FFD400'
                                : isDirectNeighbor
                                  ? '#FFD400'
                                  : isEditMode
                                    ? '#FFD400'
                                    : hasYellowBorder
                                      ? '#FFD400'
                                      : '#EAB308'
                          }
                          strokeWidth={
                            isDraggingThis
                              ? '3.5'
                              : isSelected
                                ? '3.5'
                                : isDirectNeighbor
                                  ? '2.5'
                                  : isEditMode
                                    ? '2.2'
                                    : hasYellowBorder
                                      ? '2.8'
                                      : '2'
                          }
                          strokeDasharray={isEditMode ? '4,2' : 'none'}
                        />
                      </svg>

                      {/* Conteúdo textual centralizado no losango de Milestone */}
                      <div className="absolute inset-0 px-9 py-2.5 flex flex-col items-center justify-center text-center pointer-events-none">
                        <div className="flex items-center gap-1.5 justify-center mb-0.5">
                          <span className="font-mono font-black text-xs text-[#FFD400] tracking-wider">
                            {node.codigo}
                          </span>
                          <span className="text-[9px] uppercase font-extrabold text-black bg-[#FFD400] px-1.5 py-0.2 rounded shadow-sm">
                            Milestone
                          </span>
                          {isEditMode && <Move className="w-3 h-3 text-[#FFD400] opacity-80" />}
                        </div>
                        <p
                          title={node.nome}
                          className="text-[12px] font-bold text-white line-clamp-2 leading-tight drop-shadow-sm"
                        >
                          {node.nome}
                        </p>
                        <span className="text-[9px] font-mono text-[#A3A3A3] mt-0.5">
                          &larr; {node.etapasAnterioresIds.length} | &rarr;{' '}
                          {node.etapasSucessorasIds.length}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              }

              // CASO 2: PONTO DE DECISÃO CONDICIONAL (ex.: O01) -> RENDERIZADO COMO LOSANGO COM SIM/NÃO
              if (node.isDecision) {
                return (
                  <div
                    key={node.id}
                    title={`${node.codigo} - ${node.nome} (${node.area})`}
                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                    onTouchStart={(e) => handleNodeTouchStart(e, node)}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (hasMovedDuringDragRef.current) return
                      handleToggleNodeSelection(node)
                    }}
                    style={{
                      position: 'absolute',
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      height: node.height,
                      opacity,
                      transition: isDraggingThis
                        ? 'none'
                        : 'box-shadow 0.2s ease, transform 0.2s ease',
                    }}
                    className={`${cursorClass} z-20 flex items-center justify-center ${
                      isDraggingThis
                        ? 'z-40 scale-105 shadow-2xl ring-2 ring-[#FFD400]'
                        : isSelected
                          ? 'scale-105 z-30 drop-shadow-[0_0_12px_rgba(255,212,0,0.45)]'
                          : isDirectNeighbor
                            ? 'z-25 scale-102 ring-1 ring-[#FFD400]/70 drop-shadow-[0_0_8px_rgba(255,212,0,0.25)]'
                            : isEditMode
                              ? 'hover:scale-102 hover:ring-1 hover:ring-[#FFD400]/70'
                              : 'hover:scale-102'
                    }`}
                  >
                    <div className="relative w-full h-full flex items-center justify-center">
                      <svg
                        viewBox={`0 0 ${node.width} ${node.height}`}
                        className="w-full h-full drop-shadow-lg"
                      >
                        <polygon
                          points={`${node.width / 2},4 ${node.width - 6},${node.height / 2} ${node.width / 2},${node.height - 4} 6,${node.height / 2}`}
                          fill={isDirectNeighbor ? '#1a1810' : '#141414'}
                          stroke={
                            isDraggingThis
                              ? '#FFD400'
                              : isSelected
                                ? '#FFD400'
                                : isDirectNeighbor
                                  ? '#FFD400'
                                  : isEditMode
                                    ? '#FFD400'
                                    : hasYellowBorder
                                      ? '#FFD400'
                                      : '#EAB308'
                          }
                          strokeWidth={
                            isDraggingThis
                              ? '3.5'
                              : isSelected
                                ? '3.5'
                                : isDirectNeighbor
                                  ? '2.4'
                                  : isEditMode
                                    ? '2.2'
                                    : hasYellowBorder
                                      ? '2.5'
                                      : '1.8'
                          }
                          strokeDasharray={isEditMode ? '4,2' : 'none'}
                        />
                      </svg>

                      {/* Conteúdo textual centralizado no losango de Decisão */}
                      <div className="absolute inset-0 px-8 py-3 flex flex-col items-center justify-center text-center pointer-events-none">
                        <div className="flex items-center gap-1.5 justify-center mb-0.5">
                          <span className="font-mono font-black text-xs text-[#FFD400]">
                            {node.codigo}
                          </span>
                          <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                            Decisão
                          </span>
                          {isEditMode && <Move className="w-3 h-3 text-[#FFD400] opacity-80" />}
                        </div>
                        <span className="text-[10px] font-semibold text-[#9CA3AF] mb-1">
                          {node.area}
                        </span>
                        <p className="text-[11px] font-bold text-white line-clamp-2 leading-tight">
                          {node.nome}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              }

              // CASO 3: CAIXA PADRÃO RETANGULAR 260×110px COM CÓDIGO, ÁREA E NOME COMPLETO
              return (
                <div
                  key={node.id}
                  title={`${node.codigo} - ${node.nome} (${node.area})`}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  onTouchStart={(e) => handleNodeTouchStart(e, node)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (hasMovedDuringDragRef.current) return
                    handleToggleNodeSelection(node)
                  }}
                  style={{
                    position: 'absolute',
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                    opacity,
                    transition: isDraggingThis
                      ? 'none'
                      : 'box-shadow 0.2s ease, transform 0.2s ease',
                  }}
                  className={`border rounded-xl p-3 shadow-lg ${cursorClass} z-20 flex flex-col justify-between ${
                    isDirectNeighbor ? 'bg-[#181611]' : 'bg-[#121212]'
                  } ${
                    isDraggingThis
                      ? 'border-[#FFD400] ring-4 ring-[#FFD400]/40 scale-105 z-40 shadow-2xl'
                      : isSelected
                        ? 'border-[#FFD400] ring-3 ring-[#FFD400]/70 scale-105 z-30 shadow-[0_0_20px_rgba(255,212,0,0.35)]'
                        : isDirectNeighbor
                          ? 'border-[#FFD400]/80 ring-1 ring-[#FFD400]/50 z-25 scale-102 shadow-[0_0_12px_rgba(255,212,0,0.18)]'
                          : isEditMode
                            ? 'border-[#FFD400]/80 hover:border-[#FFD400] hover:scale-102 hover:shadow-xl'
                            : hasYellowBorder
                              ? 'border-2 border-[#FFD400] hover:scale-102'
                              : 'border-[#262626] hover:border-[#FFD400]/60 hover:scale-102'
                  }`}
                >
                  {/* Topo do Card: Código em destaque amarelo + Nome da Área completo */}
                  <div className="flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-black text-xs text-[#FFD400] tracking-wide">
                        {node.codigo}
                      </span>
                      {isEditMode && (
                        <span
                          title="Arraste para reposicionar este nó"
                          className="p-0.5 rounded bg-[#FFD400]/15 text-[#FFD400]"
                        >
                          <Move className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                    <span
                      title={node.area}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#1C1C1C] text-[#A3A3A3] border border-[#2B2B2B] truncate max-w-[170px]"
                    >
                      {node.area}
                    </span>
                  </div>

                  {/* Nome do Processo completo legível */}
                  <div className="my-auto py-1">
                    <p
                      title={node.nome}
                      className="text-[12px] font-medium text-white leading-snug line-clamp-3 select-none"
                    >
                      {node.nome}
                    </p>
                  </div>

                  {/* Rodapé: contadores de dependência anterior/sucessora e etiquetas */}
                  <div className="flex items-center justify-between text-[9px] font-mono text-[#777] pt-1.5 border-t border-[#202020] shrink-0">
                    <span>
                      &larr; {node.etapasAnterioresIds.length} | &rarr;{' '}
                      {node.etapasSucessorasIds.length}
                    </span>
                    <div className="flex items-center gap-1">
                      {isEditMode ? (
                        <span className="text-[8px] font-bold text-[#FFD400] uppercase font-sans">
                          Arraste Livre
                        </span>
                      ) : (
                        <>
                          {isUserArea && (
                            <span className="text-[8px] font-bold text-[#FFD400] uppercase">
                              Sua Área
                            </span>
                          )}
                          {isUserGoalProc && (
                            <span className="text-[8px] font-bold text-[#FFD400] uppercase">
                              Sua Meta
                            </span>
                          )}
                          {node.etapasAnterioresIds.length === 0 &&
                            node.etapasSucessorasIds.length === 0 && (
                              <span className="text-zinc-500 italic">avulso</span>
                            )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Botão flutuante "Ver detalhes" fixado no canto inferior esquerdo */}
          {selectedNode && !isEditMode && (
            <div className="absolute bottom-4 left-4 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsDrawerOpen(true)
                }}
                className="group flex items-center gap-2 px-4 py-2.5 bg-[#FFD400] hover:bg-[#ffe033] active:scale-95 text-black font-extrabold text-xs md:text-sm rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_16px_rgba(255,212,0,0.35)] border border-[#FFD400] transition-all cursor-pointer select-none"
                title={`Ver detalhes completos de ${selectedNode.codigo} - ${selectedNode.nome}`}
              >
                <Info className="w-4 h-4 text-black shrink-0 transition-transform group-hover:scale-110" />
                <span>Ver detalhes</span>
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-black/15 text-black ml-0.5">
                  {selectedNode.codigo}
                </span>
              </button>
            </div>
          )}

          {/* Minimapa Flutuante (canto inferior direito) */}
          <div className="absolute bottom-4 right-4 w-48 h-36 bg-[#141414]/90 border border-[#262626] rounded-xl p-2.5 shadow-2xl backdrop-blur-md hidden sm:block pointer-events-none z-30">
            <div className="flex items-center justify-between text-[9px] uppercase font-bold text-[#9CA3AF] mb-1.5">
              <span>Visão Geral do Fluxo</span>
              <Compass className="w-3.5 h-3.5 text-[#FFD400]" />
            </div>
            <div className="relative w-full h-[96px] bg-[#0A0A0A] rounded border border-[#222] overflow-hidden">
              {/* Pontos dos nós */}
              {layout.nodes.map((n) => {
                const mapX = (n.x / layout.width) * 170
                const mapY = (n.y / layout.height) * 96
                const isNodeSelected = selectedNode?.id === n.id
                return (
                  <div
                    key={`mini-${n.id}`}
                    style={{ left: mapX, top: mapY }}
                    className={`absolute rounded-full ${
                      isNodeSelected
                        ? 'bg-[#FFD400] w-2 h-2 -ml-0.5 -mt-0.5 z-10'
                        : 'bg-[#555] w-1 h-1'
                    }`}
                  />
                )
              })}
              {/* Viewport Box no Minimapa */}
              {containerRef.current && (
                <div
                  style={{
                    left: Math.max(0, (-pan.x / (layout.width * zoom)) * 170),
                    top: Math.max(0, (-pan.y / (layout.height * zoom)) * 96),
                    width: Math.min(
                      170,
                      (containerRef.current.clientWidth / (layout.width * zoom)) * 170,
                    ),
                    height: Math.min(
                      96,
                      (containerRef.current.clientHeight / (layout.height * zoom)) * 96,
                    ),
                  }}
                  className="absolute border border-[#FFD400]/70 bg-[#FFD400]/10 rounded-sm pointer-events-none"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Botão flutuante "Ver detalhes" fixado no canto inferior esquerdo no Modo Lista */}
      {viewMode === 'list' && selectedNode && (
        <div className="fixed bottom-6 left-6 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="group flex items-center gap-2 px-4 py-2.5 bg-[#FFD400] hover:bg-[#ffe033] active:scale-95 text-black font-extrabold text-xs md:text-sm rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_16px_rgba(255,212,0,0.35)] border border-[#FFD400] transition-all cursor-pointer select-none"
            title={`Ver detalhes completos de ${selectedNode.codigo} - ${selectedNode.nome}`}
          >
            <Info className="w-4 h-4 text-black shrink-0 transition-transform group-hover:scale-110" />
            <span>Ver detalhes</span>
            <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-black/15 text-black ml-0.5">
              {selectedNode.codigo}
            </span>
          </button>
        </div>
      )}

      {/* MODO 2: LISTA POR ÁREAS (RESPONSIVO / MOBILE) */}
      {viewMode === 'list' && layout.nodes.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {sortedAreaGroups.map(([areaNome, procs]) => {
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
                        onClick={() => handleToggleNodeSelection(node)}
                        className={`p-3.5 rounded-xl border bg-[#161616] cursor-pointer hover:border-[#FFD400] transition-colors flex flex-col justify-between ${
                          selectedNode?.id === node.id
                            ? 'border-[#FFD400] ring-2 ring-[#FFD400]/70 shadow-[0_0_15px_rgba(255,212,0,0.25)]'
                            : relatedNodeIds.has(node.id) && selectedNode !== null
                              ? 'border-[#FFD400]/70 ring-1 ring-[#FFD400]/40'
                              : hasYellowBorder
                                ? 'border-[#FFD400]'
                                : 'border-[#262626]'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-xs text-[#FFD400]">
                              {node.codigo}
                            </span>
                            {node.isDecision && (
                              <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                                Decisão
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-white line-clamp-3 leading-snug">
                            {node.nome}
                          </p>
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

      {/* PAINEL LATERAL (DRAWER AO CLICAR EM 'VER DETALHES') */}
      {isDrawerOpen && selectedNodeDetails && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
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
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#1E1E1E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo scrollável */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Processo Card */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-2.5">
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
                onClick={() => setIsDrawerOpen(false)}
                className="w-full py-2.5 bg-[#1C1C1C] hover:bg-[#262626] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors"
              >
                Fechar painel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO MODAL: CONFIRMAÇÃO DE SAÍDA COM ALTERAÇÕES NÃO SALVAS */}
      {showExitConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#141414] border border-[#2B2B2B] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Alterações não salvas</h3>
                <p className="text-xs text-[#9CA3AF] mt-1 leading-relaxed">
                  Você arrastou processos no diagrama mas ainda não salvou a nova disposição. Se
                  sair agora, as posições editadas nesta sessão serão descartadas.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-[#222]">
              <button
                onClick={() => setShowExitConfirmDialog(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#1E1E1E] hover:bg-[#282828] text-white text-xs font-semibold transition-colors"
              >
                Continuar editando
              </button>
              <button
                onClick={handleConfirmExitWithoutSaving}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 text-xs font-semibold transition-colors"
              >
                Descartar e sair
              </button>
              <button
                onClick={async () => {
                  setShowExitConfirmDialog(false)
                  await handleSavePositions()
                  setIsEditMode(false)
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#FFD400] hover:bg-[#e6bf00] text-black text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar e sair</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
