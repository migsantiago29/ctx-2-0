import type { Area, Processo } from '@/types/ctx'

export interface ProcessNode {
  id: string
  codigo: string
  nome: string
  area: string
  observacao?: string
  isDecision: boolean
  isMilestone: boolean
  decisionLabels?: { sim?: string; nao?: string }
  etapasAnterioresIds: string[]
  etapasSucessorasIds: string[]
  col: number
  row: number
  x: number
  y: number
  width: number
  height: number
  laneIndex: number
}

export interface EdgeConnection {
  id: string
  fromId: string
  toId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  isBackward: boolean // retorno / ciclo de correção ou para trás no X
  label?: string // "Sim" | "Não" | undefined
  fromSide: 'right' | 'left' | 'top' | 'bottom'
  toSide: 'right' | 'left' | 'top' | 'bottom'
}

export interface Swimlane {
  id: string
  nome: string
  tipo?: string
  ordem: number
  y: number
  height: number
  nodeCount: number
}

export interface DiagramLayout {
  nodes: ProcessNode[]
  edges: EdgeConnection[]
  lanes: Swimlane[]
  width: number
  height: number
  nodeMap: Map<string, ProcessNode>
  totalCols: number
  totalRows: number
}

// Dimensões aprimoradas para acomodar texto completo com folga e sem truncamento
export const NODE_WIDTH = 260
export const NODE_HEIGHT = 110
export const LANE_HEADER_WIDTH = 220
export const HORIZONTAL_GAP = 70
export const LANE_PADDING_Y = 24
export const LANE_GAP = 28
export const CANVAS_PADDING_X = 40
export const CANVAS_PADDING_Y = 40

/**
 * Extrai o prefixo de letras e o sufixo numérico de um código de processo
 * Ex.: "V01" -> { prefix: "V", num: 1 }
 *      "ADM12" -> { prefix: "ADM", num: 12 }
 *      "ML09" -> { prefix: "ML", num: 9 }
 */
export function parseCodigoNumber(codigo: string): { prefix: string; num: number } {
  const match = codigo.trim().match(/^([A-Za-z]+)(\d+)$/)
  if (match) {
    return {
      prefix: match[1].toUpperCase(),
      num: parseInt(match[2], 10),
    }
  }
  const fallbackNum = codigo.match(/\d+/)
  return {
    prefix: codigo.replace(/\d+/g, '').toUpperCase(),
    num: fallbackNum ? parseInt(fallbackNum[0], 10) : 999999,
  }
}

/**
 * Comparador para ordenação numérica do sufixo do código (V01, V02... V10, V11...)
 */
export function compareCodigosNumericos(a: string, b: string): number {
  const parsedA = parseCodigoNumber(a)
  const parsedB = parseCodigoNumber(b)
  if (parsedA.prefix !== parsedB.prefix) {
    const prefixDiff = parsedA.prefix.localeCompare(parsedB.prefix)
    if (prefixDiff !== 0) return prefixDiff
  }
  if (parsedA.num !== parsedB.num) {
    return parsedA.num - parsedB.num
  }
  return a.localeCompare(b, undefined, { numeric: true })
}

/**
 * Analisa se um processo possui instrução condicional de decisão (ex.: "Se Não → X; Se Sim → Y")
 */
export function parseDecision(obs?: string): {
  isDecision: boolean
  labels?: { sim?: string; nao?: string }
} {
  if (!obs) return { isDecision: false }
  const lower = obs.toLowerCase()
  if (lower.includes('se não') || lower.includes('se sim') || lower.includes('completo?')) {
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
 * Verifica se um processo pertence ao grupo Milestone
 */
export function isMilestoneProcess(areaName?: string, codigo?: string): boolean {
  if (areaName && areaName.trim().toLowerCase() === 'milestone') return true
  if (codigo && codigo.trim().toUpperCase().startsWith('ML')) return true
  return false
}

/**
 * Calcula layout de Fluxograma baseado em Raias Horizontais (Swimlanes) por área da empresa.
 * - Cada área ocupa uma faixa horizontal (swimlane), ordenada pelo campo ordem_no_fluxo da coleção 'areas'.
 * - O nome da área fica no início da raia (cabeçalho à esquerda).
 * - Dentro de cada raia, os blocos de processos seguem a ordem 01, 02, 03, 04... da esquerda para a direita.
 * - Processos do grupo 'Milestone' são identificados para renderização em losango.
 * - Setas conectam os processos entre etapas anteriores e sucessoras, inclusive cruzando raias.
 * - Posições salvas customizadas pelo administrador prevalecem caso existam.
 */
export function computeDiagramLayout(
  rawAreas: Area[],
  rawProcessos: Processo[],
  customPositions?: Map<string, { x: number; y: number }>,
): DiagramLayout {
  if (!rawProcessos || rawProcessos.length === 0) {
    return {
      nodes: [],
      edges: [],
      lanes: [],
      width: 1200,
      height: 800,
      nodeMap: new Map(),
      totalCols: 0,
      totalRows: 0,
    }
  }

  // 1. Organizar áreas ordenadas por ordem_no_fluxo
  const sortedAreas = [...rawAreas].sort((a, b) => {
    const ordA = a.ordem_no_fluxo ?? 999
    const ordB = b.ordem_no_fluxo ?? 999
    if (ordA !== ordB) return ordA - ordB
    return a.nome.localeCompare(b.nome)
  })

  // Agrupar processos por área (normalizando nome)
  const procsByArea = new Map<string, Processo[]>()
  rawProcessos.forEach((p) => {
    const areaName = (p.area || 'Outros').trim()
    if (!procsByArea.has(areaName)) {
      procsByArea.set(areaName, [])
    }
    procsByArea.get(areaName)!.push(p)
  })

  // Ordenar processos dentro de cada área por código numérico crescente (01, 02, 03...)
  procsByArea.forEach((procList) => {
    procList.sort((a, b) => compareCodigosNumericos(a.codigo, b.codigo))
  })

  // Lista definitiva de áreas a exibir como raias:
  // Primeiro as áreas cadastradas (filtrando apenas as que possuem processos ou todas as ordenadas)
  // Seguidas de eventuais áreas presentes nos processos que não constam na coleção areas
  const laneAreas: {
    id: string
    nome: string
    tipo?: string
    ordem: number
    processos: Processo[]
  }[] = []
  const registeredAreaNames = new Set<string>()

  sortedAreas.forEach((area) => {
    const trimmedNome = area.nome.trim()
    registeredAreaNames.add(trimmedNome.toLowerCase())
    const procs = procsByArea.get(trimmedNome) || []
    if (procs.length > 0) {
      laneAreas.push({
        id: area.id,
        nome: trimmedNome,
        tipo: area.tipo,
        ordem: area.ordem_no_fluxo ?? 999,
        processos: procs,
      })
    }
  })

  // Áreas extras presentes nos processos que não constam na tabela oficial de áreas
  procsByArea.forEach((procs, areaName) => {
    if (!registeredAreaNames.has(areaName.toLowerCase()) && procs.length > 0) {
      laneAreas.push({
        id: `extra-${areaName}`,
        nome: areaName,
        tipo: 'área',
        ordem: 999,
        processos: procs,
      })
    }
  })

  // 2. Determinar layout de raias e posicionamento horizontal (da esquerda para a direita)
  const lanes: Swimlane[] = []
  const nodes: ProcessNode[] = []
  const nodeMap = new Map<string, ProcessNode>()

  let currentY = CANVAS_PADDING_Y
  let maxColCount = 0

  laneAreas.forEach((laneItem, laneIdx) => {
    const count = laneItem.processos.length
    if (count > maxColCount) maxColCount = count

    const laneHeight = NODE_HEIGHT + LANE_PADDING_Y * 2
    lanes.push({
      id: laneItem.id,
      nome: laneItem.nome,
      tipo: laneItem.tipo,
      ordem: laneItem.ordem,
      y: currentY,
      height: laneHeight,
      nodeCount: count,
    })

    const nodeY = currentY + LANE_PADDING_Y

    laneItem.processos.forEach((proc, colIndex) => {
      const decisionInfo = parseDecision(proc.observacao)
      const milestone = isMilestoneProcess(proc.area, proc.codigo)

      // Início horizontal das caixas após o cabeçalho da raia
      const autoX =
        CANVAS_PADDING_X +
        LANE_HEADER_WIDTH +
        HORIZONTAL_GAP +
        colIndex * (NODE_WIDTH + HORIZONTAL_GAP)
      const autoY = nodeY

      // Se houver posição customizada salva pelo admin (por ID ou por Código), usa ela
      const customPos =
        customPositions?.get(proc.id) || customPositions?.get(proc.codigo.trim().toUpperCase())

      const finalX = customPos ? customPos.x : autoX
      const finalY = customPos ? customPos.y : autoY

      const nodeObj: ProcessNode = {
        id: proc.id,
        codigo: proc.codigo,
        nome: proc.nome,
        area: proc.area,
        observacao: proc.observacao,
        isDecision: decisionInfo.isDecision,
        isMilestone: milestone,
        decisionLabels: decisionInfo.labels,
        etapasAnterioresIds: proc.etapas_anteriores || [],
        etapasSucessorasIds: proc.etapas_sucessoras || [],
        col: colIndex,
        row: laneIdx,
        x: finalX,
        y: finalY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        laneIndex: laneIdx,
      }

      nodes.push(nodeObj)
      nodeMap.set(proc.id, nodeObj)
    })

    currentY += laneHeight + LANE_GAP
  })

  // 3. Construir conexões / arestas com portas inteligentes
  // Regra padrão: do lado direito (Right) da origem para o lado esquerdo (Left) do destino
  // Em caso de retorno / ciclo / destino à esquerda (toNode.x <= fromNode.x):
  // curvas suaves inteligentes pelo topo ou pela base para evitar sobreposição
  const edges: EdgeConnection[] = []

  nodes.forEach((fromNode) => {
    fromNode.etapasSucessorasIds.forEach((toId) => {
      const toNode = nodeMap.get(toId)
      if (!toNode) return

      const isBackward = toNode.x <= fromNode.x + 30

      // Identificar rótulo Sim / Não se origem for decisão
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

      let fromX: number
      let fromY: number
      let toX: number
      let toY: number
      let fromSide: 'right' | 'left' | 'top' | 'bottom'
      let toSide: 'right' | 'left' | 'top' | 'bottom'

      if (isBackward) {
        // Conexão de retorno / ciclo de correção:
        if (Math.abs(toNode.x - fromNode.x) < 40) {
          if (toNode.y > fromNode.y) {
            // De cima para baixo no mesmo alinhamento
            fromX = fromNode.x + fromNode.width / 2
            fromY = fromNode.y + fromNode.height
            toX = toNode.x + toNode.width / 2
            toY = toNode.y
            fromSide = 'bottom'
            toSide = 'top'
          } else {
            // De baixo para cima (arco pela direita)
            fromX = fromNode.x + fromNode.width
            fromY = fromNode.y + fromNode.height / 2
            toX = toNode.x + toNode.width
            toY = toNode.y + toNode.height / 2
            fromSide = 'right'
            toSide = 'right'
          }
        } else {
          // Retorno para posição à esquerda:
          const goViaTop = fromNode.y < toNode.y
          if (goViaTop) {
            fromX = fromNode.x + fromNode.width / 2
            fromY = fromNode.y
            toX = toNode.x + toNode.width / 2
            toY = toNode.y
            fromSide = 'top'
            toSide = 'top'
          } else {
            fromX = fromNode.x + fromNode.width / 2
            fromY = fromNode.y + fromNode.height
            toX = toNode.x + toNode.width / 2
            toY = toNode.y + toNode.height
            fromSide = 'bottom'
            toSide = 'bottom'
          }
        }
      } else {
        // Fluxo progressivo natural (Esquerda -> Direita):
        // Saída pela direita da caixa de origem, entrada pela esquerda da caixa de destino
        fromX = fromNode.x + fromNode.width
        fromY = fromNode.y + fromNode.height / 2
        toX = toNode.x
        toY = toNode.y + toNode.height / 2
        fromSide = 'right'
        toSide = 'left'
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
        fromSide,
        toSide,
      })
    })
  })

  // 4. Determinar dimensões totais do canvas
  let maxX = 0
  let maxY = 0
  nodes.forEach((n) => {
    if (n.x + n.width > maxX) maxX = n.x + n.width
    if (n.y + n.height > maxY) maxY = n.y + n.height
  })

  const autoTotalWidth =
    CANVAS_PADDING_X * 2 +
    LANE_HEADER_WIDTH +
    HORIZONTAL_GAP +
    maxColCount * (NODE_WIDTH + HORIZONTAL_GAP) +
    200

  const autoTotalHeight = currentY + CANVAS_PADDING_Y

  const totalWidth = Math.max(autoTotalWidth, maxX + CANVAS_PADDING_X + 150, 2400)
  const totalHeight = Math.max(autoTotalHeight, maxY + CANVAS_PADDING_Y + 100, 1200)

  return {
    nodes,
    edges,
    lanes,
    width: totalWidth,
    height: totalHeight,
    nodeMap,
    totalCols: maxColCount,
    totalRows: lanes.length,
  }
}
