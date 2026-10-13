import type { Area, Processo } from '@/types/ctx'

export interface ProcessNode {
  id: string
  codigo: string
  nome: string
  area: string
  observacao?: string
  isDecision: boolean
  decisionLabels?: { sim?: string; nao?: string }
  etapasAnterioresIds: string[]
  etapasSucessorasIds: string[]
  col: number
  laneIndex: number
  x: number
  y: number
  width: number
  height: number
}

export interface EdgeConnection {
  id: string
  fromId: string
  toId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  isBackward: boolean // retorno / ciclo de correção
  label?: string // "Sim" | "Não" | undefined
}

export interface SwimlaneInfo {
  nome: string
  ordem: number
  laneIndex: number
  y: number
  height: number
  tipo?: string
}

export interface DiagramLayout {
  nodes: ProcessNode[]
  edges: EdgeConnection[]
  swimlanes: SwimlaneInfo[]
  width: number
  height: number
  nodeMap: Map<string, ProcessNode>
}

const NODE_WIDTH = 210
const NODE_HEIGHT = 80
const HORIZONTAL_GAP = 90
const VERTICAL_GAP = 30
const SWIMLANE_PADDING_TOP = 50
const SWIMLANE_PADDING_BOTTOM = 25
const LANE_HEADER_WIDTH = 220

/**
 * Checks if a process has a decision observation (e.g. "Se Não → X; Se Sim → Y")
 */
export function parseDecision(obs?: string): {
  isDecision: boolean
  labels?: { sim?: string; nao?: string }
} {
  if (!obs) return { isDecision: false }
  const lower = obs.toLowerCase()
  if (lower.includes('se não') || lower.includes('se sim') || lower.includes('completo?')) {
    // Tentar extrair destinos
    let simTarget = ''
    let naoTarget = ''
    const simMatch = obs.match(/se\s+sim\s*(?:→|->)\s*([A-Za-z0-9]+)/i)
    if (simMatch) simTarget = simMatch[1].toUpperCase()
    const naoMatch = obs.match(/se\s+n(?:ã|a)o\s*(?:→|->)\s*([A-Za-z0-9]+)/i)
    if (naoMatch) naoTarget = naoMatch[1].toUpperCase()

    return {
      isDecision: true,
      labels: {
        sim: simTarget,
        nao: naoTarget,
      },
    }
  }
  return { isDecision: false }
}

/**
 * Computes deterministic swimlane-based DAG layout for processes
 */
export function computeDiagramLayout(rawAreas: Area[], rawProcessos: Processo[]): DiagramLayout {
  // 1. Ordenar raias por ordem_no_fluxo (incluindo tipo 'área' e 'grupo de processos')
  const sortedAreas = [...rawAreas].sort((a, b) => {
    return (a.ordem_no_fluxo || 999) - (b.ordem_no_fluxo || 999)
  })

  // Se houver áreas nos processos que não constam em sortedAreas, adicioná-las no final
  const knownAreaNames = new Set(sortedAreas.map((a) => a.nome.trim().toLowerCase()))
  for (const p of rawProcessos) {
    const areaNorm = (p.area || '').trim().toLowerCase()
    if (areaNorm && !knownAreaNames.has(areaNorm)) {
      sortedAreas.push({
        id: `virtual-${areaNorm}`,
        nome: p.area,
        ordem_no_fluxo: 999,
      } as Area)
      knownAreaNames.add(areaNorm)
    }
  }

  const areaToLaneIdx = new Map<string, number>()
  sortedAreas.forEach((a, idx) => {
    areaToLaneIdx.set(a.nome.trim().toLowerCase(), idx)
  })

  // Mapear processos por ID e por Código
  const procById = new Map<string, Processo>()
  const procByCodigo = new Map<string, Processo>()
  rawProcessos.forEach((p) => {
    procById.set(p.id, p)
    procByCodigo.set(p.codigo.trim().toUpperCase(), p)
  })

  // 2. Determinar colunas topológicas (col/rank da esquerda para a direita)
  // Processos sem etapas anteriores começam na coluna 0 (ou com base nas conexões inbound)
  const inDegree = new Map<string, number>()
  const outMap = new Map<string, string[]>()
  rawProcessos.forEach((p) => {
    inDegree.set(p.id, 0)
    outMap.set(p.id, p.etapas_sucessoras || [])
  })

  // Contar in-degree
  rawProcessos.forEach((p) => {
    const suc = p.etapas_sucessoras || []
    suc.forEach((sucId) => {
      inDegree.set(sucId, (inDegree.get(sucId) || 0) + 1)
    })
  })

  // BFS/Kahn-like topological rank assignment with cycle breaking
  const rankMap = new Map<string, number>()
  rawProcessos.forEach((p) => rankMap.set(p.id, 0))

  // Múltiplas passadas de relaxamento para propagar colunas (máx 20 iterações para evitar ciclos infinitos)
  let changed = true
  let iterations = 0
  while (changed && iterations < 25) {
    changed = false
    iterations++
    for (const p of rawProcessos) {
      const currentRank = rankMap.get(p.id) || 0
      const suc = p.etapas_sucessoras || []
      for (const sucId of suc) {
        const sucProc = procById.get(sucId)
        if (!sucProc) continue
        const sucRank = rankMap.get(sucId) || 0
        // Se a sucessora estiver antes ou na mesma coluna, e não for ciclo óbvio, avança
        if (sucRank <= currentRank) {
          // Detectar se é ciclo inverso (retorno): se sucProc tem ordem_no_fluxo menor ou código já anterior
          // Apenas avançar se não estourar limite excessivo
          if (currentRank + 1 < 40) {
            rankMap.set(sucId, currentRank + 1)
            changed = true
          }
        }
      }
    }
  }

  // Agrupar processos por área (lane)
  const procsInLane = new Map<number, Processo[]>()
  sortedAreas.forEach((_, idx) => procsInLane.set(idx, []))

  rawProcessos.forEach((p) => {
    const laneIdx = areaToLaneIdx.get((p.area || '').trim().toLowerCase()) ?? 0
    if (!procsInLane.has(laneIdx)) procsInLane.set(laneIdx, [])
    procsInLane.get(laneIdx)!.push(p)
  })

  // 3. Dentro de cada raia, organizar os nós no eixo X evitando sobreposição
  // Se múltiplos nós estiverem na mesma coluna em uma raia, empilhar verticalmente dentro da raia
  const laneHeights: number[] = []
  const nodeLayoutData: Array<{
    proc: Processo
    laneIdx: number
    col: number
    subRow: number
  }> = []

  sortedAreas.forEach((_, laneIdx) => {
    const procs = procsInLane.get(laneIdx) || []
    // Ordenar procs pelo rank/col e pelo código
    procs.sort((a, b) => {
      const rA = rankMap.get(a.id) || 0
      const rB = rankMap.get(b.id) || 0
      if (rA !== rB) return rA - rB
      return a.codigo.localeCompare(b.codigo)
    })

    // Resolver colisões na mesma coluna
    const colOccupancy = new Map<number, number>()
    let maxSubRowsInLane = 1

    procs.forEach((p) => {
      const col = rankMap.get(p.id) || 0
      const count = colOccupancy.get(col) || 0
      colOccupancy.set(col, count + 1)
      if (count + 1 > maxSubRowsInLane) {
        maxSubRowsInLane = count + 1
      }
      nodeLayoutData.push({
        proc: p,
        laneIdx,
        col,
        subRow: count,
      })
    })

    const laneHeight =
      SWIMLANE_PADDING_TOP +
      maxSubRowsInLane * NODE_HEIGHT +
      (maxSubRowsInLane - 1) * VERTICAL_GAP +
      SWIMLANE_PADDING_BOTTOM

    laneHeights.push(Math.max(laneHeight, 140))
  })

  // 4. Calcular coordenadas Y acumuladas das raias
  const laneY: number[] = []
  let accumulatedY = 40
  sortedAreas.forEach((_, laneIdx) => {
    laneY.push(accumulatedY)
    accumulatedY += laneHeights[laneIdx]
  })

  // 5. Instanciar nós com posições absolutas
  let maxCol = 1
  nodeLayoutData.forEach((d) => {
    if (d.col > maxCol) maxCol = d.col
  })

  const nodes: ProcessNode[] = []
  const nodeMap = new Map<string, ProcessNode>()

  nodeLayoutData.forEach((d) => {
    const { proc, laneIdx, col, subRow } = d
    const decisionInfo = parseDecision(proc.observacao)

    const x = LANE_HEADER_WIDTH + 40 + col * (NODE_WIDTH + HORIZONTAL_GAP)
    const y = laneY[laneIdx] + SWIMLANE_PADDING_TOP + subRow * (NODE_HEIGHT + VERTICAL_GAP)

    const nodeObj: ProcessNode = {
      id: proc.id,
      codigo: proc.codigo,
      nome: proc.nome,
      area: proc.area,
      observacao: proc.observacao,
      isDecision: decisionInfo.isDecision,
      decisionLabels: decisionInfo.labels,
      etapasAnterioresIds: proc.etapas_anteriores || [],
      etapasSucessorasIds: proc.etapas_sucessoras || [],
      col,
      laneIndex: laneIdx,
      x,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }

    nodes.push(nodeObj)
    nodeMap.set(proc.id, nodeObj)
  })

  // 6. Construir conexões / arestas com identificação de retornos e rótulos
  const edges: EdgeConnection[] = []

  nodes.forEach((fromNode) => {
    fromNode.etapasSucessorasIds.forEach((toId) => {
      const toNode = nodeMap.get(toId)
      if (!toNode) return

      // Se toNode.x <= fromNode.x ou toNode.col <= fromNode.col, é um retorno / ciclo de correção
      const isBackward = toNode.x <= fromNode.x

      // Determinar rótulo Sim / Não se fromNode for decisão
      let label: string | undefined = undefined
      if (fromNode.isDecision && fromNode.decisionLabels) {
        if (
          fromNode.decisionLabels.sim &&
          toNode.codigo.toUpperCase() === fromNode.decisionLabels.sim
        ) {
          label = 'Sim'
        } else if (
          fromNode.decisionLabels.nao &&
          toNode.codigo.toUpperCase() === fromNode.decisionLabels.nao
        ) {
          label = 'Não'
        }
      }

      // Pontos de ancoragem
      let fromX = fromNode.x + fromNode.width
      let fromY = fromNode.y + fromNode.height / 2
      let toX = toNode.x
      let toY = toNode.y + toNode.height / 2

      if (isBackward) {
        // Se é retorno, sai pelo topo ou base e entra pelo topo ou base
        fromX = fromNode.x + fromNode.width / 2
        fromY = fromNode.y + fromNode.height
        toX = toNode.x + toNode.width / 2
        toY = toNode.y + toNode.height
      }

      edges.push({
        id: `${fromNode.id}->${toNode.id}`,
        fromId: fromNode.id,
        toId: toNode.id,
        fromX,
        fromY,
        toX,
        toY,
        isBackward,
        label,
      })
    })
  })

  // Swimlanes
  const swimlanes: SwimlaneInfo[] = sortedAreas.map((area, idx) => ({
    nome: area.nome,
    ordem: area.ordem_no_fluxo || idx + 1,
    laneIndex: idx,
    y: laneY[idx],
    height: laneHeights[idx],
    tipo: area.tipo,
  }))

  const totalWidth = LANE_HEADER_WIDTH + 80 + (maxCol + 1) * (NODE_WIDTH + HORIZONTAL_GAP) + 120
  const totalHeight = accumulatedY + 60

  return {
    nodes,
    edges,
    swimlanes,
    width: Math.max(totalWidth, 1800),
    height: totalHeight,
    nodeMap,
  }
}
