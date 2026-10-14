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
  row: number
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
  // Direções dos terminais para roteamento suave
  fromSide: 'right' | 'left' | 'top' | 'bottom'
  toSide: 'right' | 'left' | 'top' | 'bottom'
}

export interface DiagramLayout {
  nodes: ProcessNode[]
  edges: EdgeConnection[]
  width: number
  height: number
  nodeMap: Map<string, ProcessNode>
  totalCols: number
  totalRows: number
}

// Dimensões aprimoradas para acomodar texto completo com folga e sem truncamento
export const NODE_WIDTH = 260
export const NODE_HEIGHT = 110
const HORIZONTAL_GAP = 120
const VERTICAL_GAP = 40
const CANVAS_PADDING_X = 80
const CANVAS_PADDING_Y = 80

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
 * Calcula layout DAG unificado e fluido, da esquerda para a direita (início ao fim do fluxo).
 * Sem divisão em raias horizontais (swimlanes desconsideradas na geometria visual),
 * agrupando e ordenando logicamente etapa a etapa.
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
      width: 1200,
      height: 800,
      nodeMap: new Map(),
      totalCols: 0,
      totalRows: 0,
    }
  }

  // Mapa de ordem macro das áreas como guia de desempate e afinidade de fluxo
  const areaOrderMap = new Map<string, number>()
  rawAreas.forEach((a) => {
    areaOrderMap.set(a.nome.trim().toLowerCase(), a.ordem_no_fluxo || 99)
  })

  // Mapear processos por ID e por Código
  const procById = new Map<string, Processo>()
  const procByCodigo = new Map<string, Processo>()
  rawProcessos.forEach((p) => {
    procById.set(p.id, p)
    procByCodigo.set(p.codigo.trim().toUpperCase(), p)
  })

  // 1. Identificar ciclos de retorno conhecidos ou com código anterior para tratá-los como backward
  // Por exemplo, em retornos (ex.: O02 -> V03, ou links de feedback), o rank não deve explodir
  const isDirectCycle = (fromId: string, toId: string): boolean => {
    const fromP = procById.get(fromId)
    const toP = procById.get(toId)
    if (!fromP || !toP) return false
    // Se toP tem fromP explicitamente em suas sucessoras também
    if (toP.etapas_sucessoras?.includes(fromId)) return true
    return false
  }

  // 2. Ranking topológico de colunas (0 = nós de entrada sem dependência anterior ou iniciais)
  const rankMap = new Map<string, number>()
  rawProcessos.forEach((p) => {
    // Se não tem etapas anteriores, rank base 0
    rankMap.set(p.id, 0)
  })

  // Relaxamento iterativo de ranking (Longest Path DAG) com quebra de ciclos
  let changed = true
  let iterations = 0
  const MAX_ITERATIONS = 35

  while (changed && iterations < MAX_ITERATIONS) {
    changed = false
    iterations++
    for (const p of rawProcessos) {
      const currentRank = rankMap.get(p.id) || 0
      const sucessoras = p.etapas_sucessoras || []
      for (const sucId of sucessoras) {
        if (!procById.has(sucId)) continue
        if (isDirectCycle(p.id, sucId)) continue

        const sucRank = rankMap.get(sucId) || 0
        if (sucRank <= currentRank) {
          // Detectar se não é retorno de correção explícito pelo código
          // (ex.: O02 voltando para V03)
          const sucProc = procById.get(sucId)!
          const pAreaOrder = areaOrderMap.get((p.area || '').trim().toLowerCase()) || 99
          const sucAreaOrder = areaOrderMap.get((sucProc.area || '').trim().toLowerCase()) || 99

          // Se a sucessora for de uma área muito anterior e houver loop, tratamos como backward
          const isAreaBackjump = sucAreaOrder < pAreaOrder - 2

          if (!isAreaBackjump && currentRank + 1 < 50) {
            rankMap.set(sucId, currentRank + 1)
            changed = true
          }
        }
      }
    }
  }

  // Agrupar processos por coluna/rank
  const procsByCol = new Map<number, Processo[]>()
  rawProcessos.forEach((p) => {
    const col = rankMap.get(p.id) || 0
    if (!procsByCol.has(col)) procsByCol.set(col, [])
    procsByCol.get(col)!.push(p)
  })

  // Encontrar coluna máxima
  let maxCol = 0
  for (const col of procsByCol.keys()) {
    if (col > maxCol) maxCol = col
  }

  // 3. Ordenação vertical (Y) dentro de cada coluna para minimizar cruzamento de arestas
  // Ordena com base em:
  // a) Área (ordem_no_fluxo da área como bloco lógico)
  // b) Média do Y/índice das etapas anteriores (barycenter heuristic)
  // c) Código do processo
  const colNodeOrder = new Map<number, Processo[]>()
  const previousYMap = new Map<string, number>()

  for (let c = 0; c <= maxCol; c++) {
    const procs = procsByCol.get(c) || []

    procs.sort((a, b) => {
      // 1. Ordem macro da área
      const areaA = areaOrderMap.get((a.area || '').trim().toLowerCase()) ?? 99
      const areaB = areaOrderMap.get((b.area || '').trim().toLowerCase()) ?? 99
      if (areaA !== areaB) return areaA - areaB

      // 2. Baricentro das etapas anteriores (quem vem do topo fica no topo)
      let baryA = 0
      let countA = 0
      for (const antId of a.etapas_anteriores || []) {
        if (previousYMap.has(antId)) {
          baryA += previousYMap.get(antId)!
          countA++
        }
      }
      const avgA = countA > 0 ? baryA / countA : 0

      let baryB = 0
      let countB = 0
      for (const antId of b.etapas_anteriores || []) {
        if (previousYMap.has(antId)) {
          baryB += previousYMap.get(antId)!
          countB++
        }
      }
      const avgB = countB > 0 ? baryB / countB : 0

      if (avgA !== avgB) return avgA - avgB

      // 3. Código alfanumérico estável
      return a.codigo.localeCompare(b.codigo, undefined, { numeric: true })
    })

    colNodeOrder.set(c, procs)

    // Armazenar índice estimado para guiar as próximas colunas
    procs.forEach((p, idx) => {
      previousYMap.set(p.id, idx)
    })
  }

  // 4. Determinar número máximo de linhas para dimensionamento
  let maxRows = 1
  for (const procs of colNodeOrder.values()) {
    if (procs.length > maxRows) maxRows = procs.length
  }

  // 5. Instanciar nós com coordenadas no espaço contínuo da esquerda para a direita
  const nodes: ProcessNode[] = []
  const nodeMap = new Map<string, ProcessNode>()

  for (let col = 0; col <= maxCol; col++) {
    const procs = colNodeOrder.get(col) || []
    const colCount = procs.length

    // Centralização vertical suave na coluna para distribuir os nós harmoniosamente
    // Colunas com poucos nós não ficam presas ao topo absoluto se puderem ser centralizadas suavemente
    const colVerticalOffset = 0 // Alinhamento consistente a partir do topo

    procs.forEach((proc, row) => {
      const decisionInfo = parseDecision(proc.observacao)

      // Se houver posição customizada salva pelo admin (por ID ou por Código), usa ela; senão fallback para automático
      const customPos =
        customPositions?.get(proc.id) || customPositions?.get(proc.codigo.trim().toUpperCase())
      const autoX = CANVAS_PADDING_X + col * (NODE_WIDTH + HORIZONTAL_GAP)
      const autoY = CANVAS_PADDING_Y + colVerticalOffset + row * (NODE_HEIGHT + VERTICAL_GAP)

      const finalX = customPos ? customPos.x : autoX
      const finalY = customPos ? customPos.y : autoY

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
        row,
        x: finalX,
        y: finalY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }

      nodes.push(nodeObj)
      nodeMap.set(proc.id, nodeObj)
    })
  }

  // 6. Construir conexões / arestas com portas inteligentes
  // Regra padrão: do lado direito (Right) da origem para o lado esquerdo (Left) do destino
  // Em caso de retorno/ciclo (toNode.col <= fromNode.col):
  //   - Se o destino estiver à esquerda, sair pela esquerda/base e entrar pelo topo/direita com curva elegante
  const edges: EdgeConnection[] = []

  nodes.forEach((fromNode) => {
    fromNode.etapasSucessorasIds.forEach((toId) => {
      const toNode = nodeMap.get(toId)
      if (!toNode) return

      // Retorno se o destino estiver em coluna anterior ou igual
      const isBackward = toNode.col <= fromNode.col || toNode.x <= fromNode.x

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
        // Se toNode estiver no mesmo X/coluna (empilhado verticalmente):
        if (Math.abs(toNode.x - fromNode.x) < 40) {
          if (toNode.y > fromNode.y) {
            // De cima para baixo na mesma coluna
            fromX = fromNode.x + fromNode.width / 2
            fromY = fromNode.y + fromNode.height
            toX = toNode.x + toNode.width / 2
            toY = toNode.y
            fromSide = 'bottom'
            toSide = 'top'
          } else {
            // De baixo para cima na mesma coluna (arco pela direita)
            fromX = fromNode.x + fromNode.width
            fromY = fromNode.y + fromNode.height / 2
            toX = toNode.x + toNode.width
            toY = toNode.y + toNode.height / 2
            fromSide = 'right'
            toSide = 'right'
          }
        } else {
          // Retorno para uma coluna anterior:
          // Sai pelo topo ou base da caixa e entra pelo topo ou base da caixa destino
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
        // Conexão padrão DIREITA da origem para ESQUERDA do destino!
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

  // Determinar dimensões totais levando em conta nós customizados que podem ter sido arrastados para posições maiores
  let maxX = 0
  let maxY = 0
  nodes.forEach((n) => {
    if (n.x + n.width > maxX) maxX = n.x + n.width
    if (n.y + n.height > maxY) maxY = n.y + n.height
  })

  const autoTotalWidth = CANVAS_PADDING_X * 2 + (maxCol + 1) * (NODE_WIDTH + HORIZONTAL_GAP)
  const autoTotalHeight = CANVAS_PADDING_Y * 2 + maxRows * (NODE_HEIGHT + VERTICAL_GAP) + 100

  const totalWidth = Math.max(autoTotalWidth, maxX + CANVAS_PADDING_X, 1800)
  const totalHeight = Math.max(autoTotalHeight, maxY + CANVAS_PADDING_Y, 1000)

  return {
    nodes,
    edges,
    width: totalWidth,
    height: totalHeight,
    nodeMap,
    totalCols: maxCol + 1,
    totalRows: maxRows,
  }
}
