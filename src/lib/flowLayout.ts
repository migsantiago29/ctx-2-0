import type { Area, Processo } from '@/types/ctx'
import {
  buildEdges,
  isMilestoneProcess,
  parseDecision,
  CANVAS_PADDING_X,
  CANVAS_PADDING_Y,
  HORIZONTAL_GAP,
  LANE_GAP,
  LANE_HEADER_WIDTH,
  LANE_PADDING_Y,
  NODE_HEIGHT,
  NODE_WIDTH,
  type DiagramLayout,
  type ProcessNode,
  type Swimlane,
} from '@/lib/diagramLayout'

/** Faixa do diagrama organizado por fluxo: um trecho do ciclo do projeto ou o bloco de apoio */
export interface FlowBand {
  id: string
  titulo: string
  subtitulo: string
  y: number
  height: number
}

// Áreas de apoio (grupo "Admin." do mapa de processos): ficam num bloco próprio, fora dos trechos
const AREAS_APOIO = new Set(['financeiro', 'administrativo', 'rh e pessoas'])
// Largura máxima de um trecho (em colunas) antes de "dobrar" para a linha de baixo
const MAX_COLUNAS_TRECHO = 16
// Um último trecho com até tantas colunas a mais é juntado ao anterior
const SOBRA_MAXIMA = 4
const BAND_HEADER_HEIGHT = 64
const BAND_GAP = 56
const STACK_GAP = 18

const num = (codigo: string) => parseInt(codigo.replace(/\D/g, ''), 10) || 0
const areaKey = (p: Processo) => (p.area || 'Outros').trim()

/**
 * Ordena um grupo de processos em colunas seguindo o fluxo (etapas sucessoras).
 * 1. Encontra os retornos (setas que fecham ciclos). Os Marcos (ML01 → ML13) servem de
 *    "relógio": cada processo herda o último marco que veio antes dele, e uma seta de um
 *    momento posterior para um anterior é retorno (ex.: GP12 → ML06, nova requisição de compra).
 *    Dentro da mesma área, a numeração dos códigos segue o fluxo e ajuda a desempatar.
 * 2. Sem os retornos, cada processo fica na coluna logo depois do seu antecessor mais distante.
 * 3. Quem alimenta outro processo fica logo antes de quem atende (ex.: "Suporte para orçamento").
 */
function layerGroup(group: Processo[]) {
  const byId = new Map(group.map((p) => [p.id, p]))
  const out = new Map(group.map((p) => [p.id, (p.etapas_sucessoras || []).filter((id) => byId.has(id))]))
  const pred = new Map<string, string[]>(group.map((p) => [p.id, []]))
  out.forEach((succs, u) => succs.forEach((v) => pred.get(v)!.push(u)))

  // Distância a partir das origens (menor caminho)
  const dist = new Map<string, number>()
  const queue = group.filter((p) => pred.get(p.id)!.length === 0).map((p) => p.id)
  queue.forEach((id) => dist.set(id, 0))
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i]
    for (const v of out.get(u)!) {
      if (!dist.has(v)) {
        dist.set(v, dist.get(u)! + 1)
        queue.push(v)
      }
    }
  }
  group.forEach((p) => {
    if (!dist.has(p.id)) dist.set(p.id, 0)
  })

  const isMarco = (id: string) => {
    const p = byId.get(id)!
    return isMilestoneProcess(p.area, p.codigo)
  }
  // Volta dentro da mesma área para um código menor (ex.: O10 → O05)
  const isVoltaNaArea = (u: string, v: string) => {
    const a = byId.get(u)!
    const b = byId.get(v)!
    return areaKey(a) === areaKey(b) && num(a.codigo) > num(b.codigo)
  }
  // "Relógio" de marcos: maior marco encontrado andando para trás até bater em marcos
  const ultimoMarco = new Map<string, number>()
  for (const p of group) {
    if (isMarco(p.id)) {
      ultimoMarco.set(p.id, num(p.codigo))
      continue
    }
    let best = 0
    const seen = new Set([p.id])
    const stack = [p.id]
    while (stack.length) {
      const y = stack.pop()!
      for (const z of pred.get(y)!) {
        if (seen.has(z) || isVoltaNaArea(z, y)) continue
        seen.add(z)
        if (isMarco(z)) best = Math.max(best, num(byId.get(z)!.codigo))
        else stack.push(z)
      }
    }
    ultimoMarco.set(p.id, best)
  }

  const back = new Set<string>()
  const key = (u: string, v: string) => `${u}->${v}`
  const reaches = (from: string, to: string) => {
    const seen = new Set([from])
    const stack = [from]
    while (stack.length) {
      const x = stack.pop()!
      if (x === to) return true
      for (const y of out.get(x)!) {
        if (!back.has(key(x, y)) && !seen.has(y)) {
          seen.add(y)
          stack.push(y)
        }
      }
    }
    return false
  }
  const allEdges: [string, string][] = []
  out.forEach((succs, u) => succs.forEach((v) => allEdges.push([u, v])))
  const lm = (id: string) => ultimoMarco.get(id)!
  const d = (id: string) => dist.get(id)!
  const code = (id: string) => byId.get(id)!.codigo
  allEdges.sort(
    ([u1, v1], [u2, v2]) =>
      lm(v1) - lm(u1) - (lm(v2) - lm(u2)) ||
      d(v1) - d(u1) - (d(v2) - d(u2)) ||
      `${code(u1)}${code(v1)}`.localeCompare(`${code(u2)}${code(v2)}`),
  )
  for (const [u, v] of allEdges) {
    if ((lm(u) > lm(v) || d(v) <= d(u)) && reaches(v, u)) back.add(key(u, v))
  }

  // Coluna = 1 + coluna do antecessor mais distante (sem os retornos)
  const col = new Map<string, number>()
  const visiting = new Set<string>()
  const layer = (v: string): number => {
    if (col.has(v)) return col.get(v)!
    if (visiting.has(v)) return 0
    visiting.add(v)
    const ps = pred.get(v)!.filter((u) => !back.has(key(u, v)))
    const c = ps.length === 0 ? 0 : 1 + Math.max(...ps.map(layer))
    visiting.delete(v)
    col.set(v, c)
    return c
  }
  group.forEach((p) => layer(p.id))
  // Quem alimenta outro processo fica o mais perto possível dele (logo antes do primeiro que atende).
  // Assim, cadeias de apoio (ex.: CS03 → CS04 → CS02, AL12 → AL14 → AL16) ficam junto de quem usam,
  // e não no começo do fluxo. Processos finais (sem sucessor) ficam onde estão.
  const fwdOf = (id: string) => out.get(id)!.filter((s) => !back.has(key(id, s)))
  const isFinal = (id: string) => fwdOf(id).length === 0
  const ordemReversa = [...group].sort((a, b) => col.get(b.id)! - col.get(a.id)!)
  for (const p of ordemReversa) {
    // processos finais não seguram quem os alimenta no começo (eles vão para depois, abaixo)
    const fwd = fwdOf(p.id).filter((s) => !isFinal(s))
    if (fwd.length === 0) continue
    const target = Math.min(...fwd.map((s) => col.get(s)!)) - 1
    if (target > col.get(p.id)!) col.set(p.id, target)
  }
  // Processos finais: logo depois do seu antecessor mais distante
  const ordemDireta = [...group].sort((a, b) => col.get(a.id)! - col.get(b.id)!)
  for (const p of ordemDireta) {
    if (!isFinal(p.id)) continue
    const ps = pred.get(p.id)!.filter((u) => !back.has(key(u, p.id)))
    if (ps.length) col.set(p.id, Math.max(...ps.map((u) => col.get(u)!)) + 1)
  }
  return { col, back }
}

/** Divide as colunas do ciclo em trechos de até MAX_COLUNAS_TRECHO, cortando logo depois de um Marco */
function cutBands(lastCol: number, marcoCols: number[]) {
  const cuts: [number, number][] = []
  let start = 0
  while (start <= lastCol) {
    const limit = start + MAX_COLUNAS_TRECHO - 1
    const ok = marcoCols.filter((c) => c >= start && c <= limit)
    let end = limit < lastCol && ok.length ? ok[ok.length - 1] : Math.min(lastCol, limit)
    if (lastCol - end <= SOBRA_MAXIMA) end = lastCol
    cuts.push([start, end])
    start = end + 1
  }
  return cuts
}

/**
 * Diagrama organizado pelo fluxo, inspirado no mapa "Processos mapeados":
 * - o ciclo do projeto (Comercial + Operação) é lido da esquerda para a direita e "dobra" em
 *   trechos que terminam num Marco (ex.: até ML02 Venda realizada), como linhas de um texto;
 * - dentro de cada trecho, uma raia por área (Marcos em cima, como linha do tempo);
 * - Financeiro, Administrativo e RH ficam num bloco de apoio no final.
 * Posições salvas pelo administrador continuam valendo.
 */
export function computeFlowLayout(
  rawAreas: Area[],
  rawProcessos: Processo[],
  customPositions?: Map<string, { x: number; y: number }>,
): DiagramLayout & { bands: FlowBand[] } {
  const ordemArea = new Map(rawAreas.map((a) => [a.nome.trim(), a.ordem_no_fluxo ?? 999]))
  const tipoArea = new Map(rawAreas.map((a) => [a.nome.trim(), a.tipo]))
  const byId = new Map(rawProcessos.map((p) => [p.id, p]))
  const isApoioArea = (p: Processo) => AREAS_APOIO.has(areaKey(p).toLowerCase())

  // Marcos ligados só a processos de apoio (ex.: ML03 Recebimento de cliente) vão para o apoio
  const vizinhos = new Map<string, string[]>()
  rawProcessos.forEach((p) => {
    const ids = [...(p.etapas_sucessoras || []), ...(p.etapas_anteriores || [])]
    vizinhos.set(p.id, ids.filter((id) => byId.has(id)))
  })
  const isApoio = (p: Processo) => {
    if (isApoioArea(p)) return true
    if (!isMilestoneProcess(p.area, p.codigo)) return false
    const vs = vizinhos.get(p.id)!
    return vs.length > 0 && vs.every((id) => isApoioArea(byId.get(id)!))
  }
  const ciclo = rawProcessos.filter((p) => !isApoio(p))
  const apoio = rawProcessos.filter((p) => isApoio(p))

  const backKeys = new Set<string>()
  const colOf = new Map<string, number>()
  const bandDefs: { titulo: string; subtitulo: string; start: number; end: number; procs: Processo[] }[] = []

  if (ciclo.length) {
    const { col, back } = layerGroup(ciclo)
    back.forEach((k) => backKeys.add(k))
    const lastCol = Math.max(...col.values())
    const marcos = ciclo
      .filter((p) => isMilestoneProcess(p.area, p.codigo))
      .sort((a, b) => col.get(a.id)! - col.get(b.id)!)
    const cuts = cutBands(lastCol, [...new Set(marcos.map((m) => col.get(m.id)!))])
    const marcoNaColuna = (c: number) => marcos.find((m) => col.get(m.id) === c)
    let anterior: Processo | undefined
    cuts.forEach(([start, end], i) => {
      const fim = marcoNaColuna(end)
      const desde = anterior ? `Depois de ${anterior.codigo} ${anterior.nome}` : 'Início do fluxo'
      const ate = fim && end !== lastCol ? `até ${fim.codigo} ${fim.nome}` : 'até o encerramento'
      bandDefs.push({
        titulo: `Trecho ${i + 1}`,
        subtitulo: `${desde} ${ate}`,
        start,
        end,
        procs: ciclo.filter((p) => col.get(p.id)! >= start && col.get(p.id)! <= end),
      })
      anterior = fim
    })
    ciclo.forEach((p) => colOf.set(p.id, col.get(p.id)!))
  }
  if (apoio.length) {
    const { col, back } = layerGroup(apoio)
    back.forEach((k) => backKeys.add(k))
    apoio.forEach((p) => colOf.set(p.id, col.get(p.id)!))
    bandDefs.push({
      titulo: 'Apoio',
      subtitulo: 'Financeiro, Administrativo e RH',
      start: 0,
      end: Math.max(...col.values()),
      procs: apoio,
    })
  }

  // Posicionamento: trechos um abaixo do outro; dentro do trecho, uma raia por área
  const nodes: ProcessNode[] = []
  const nodeMap = new Map<string, ProcessNode>()
  const lanes: Swimlane[] = []
  const bands: FlowBand[] = []
  let currentY = CANVAS_PADDING_Y
  let maxCols = 0
  let laneIndex = 0

  bandDefs.forEach((band, bandIdx) => {
    const bandY = currentY
    currentY += BAND_HEADER_HEIGHT
    maxCols = Math.max(maxCols, band.end - band.start + 1)

    const porArea = new Map<string, Processo[]>()
    band.procs.forEach((p) => {
      const k = areaKey(p)
      if (!porArea.has(k)) porArea.set(k, [])
      porArea.get(k)!.push(p)
    })
    const areaNomes = [...porArea.keys()].sort((a, b) => {
      const ma = a.toLowerCase() === 'milestone' ? -1 : 0
      const mb = b.toLowerCase() === 'milestone' ? -1 : 0
      return ma - mb || (ordemArea.get(a) ?? 999) - (ordemArea.get(b) ?? 999) || a.localeCompare(b)
    })

    areaNomes.forEach((nome) => {
      const procs = porArea.get(nome)!
      const porColuna = new Map<number, Processo[]>()
      procs.forEach((p) => {
        const c = colOf.get(p.id)! - band.start
        if (!porColuna.has(c)) porColuna.set(c, [])
        porColuna.get(c)!.push(p)
      })
      const pilha = Math.max(...[...porColuna.values()].map((l) => l.length))
      const laneHeight = pilha * NODE_HEIGHT + (pilha - 1) * STACK_GAP + LANE_PADDING_Y * 2
      lanes.push({
        id: `${band.titulo}-${nome}`,
        nome,
        tipo: tipoArea.get(nome),
        ordem: ordemArea.get(nome) ?? 999,
        y: currentY,
        height: laneHeight,
        nodeCount: procs.length,
      })

      // Colunas da esquerda para a direita; na mesma célula, ordem pela altura média dos antecessores
      ;[...porColuna.keys()]
        .sort((a, b) => a - b)
        .forEach((c) => {
          const cell = porColuna.get(c)!
          const alturaAntecessores = (p: Processo) => {
            const ys = (p.etapas_anteriores || [])
              .map((id) => nodeMap.get(id)?.y)
              .filter((y): y is number => y !== undefined)
            return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : Number.MAX_SAFE_INTEGER
          }
          cell
            .sort((a, b) => alturaAntecessores(a) - alturaAntecessores(b) || num(a.codigo) - num(b.codigo))
            .forEach((p, stackIdx) => {
              const decision = parseDecision(p.observacao)
              const autoX = CANVAS_PADDING_X + LANE_HEADER_WIDTH + HORIZONTAL_GAP + c * (NODE_WIDTH + HORIZONTAL_GAP)
              const autoY = currentY + LANE_PADDING_Y + stackIdx * (NODE_HEIGHT + STACK_GAP)
              const custom = customPositions?.get(p.id) || customPositions?.get(p.codigo.trim().toUpperCase())
              const node: ProcessNode = {
                id: p.id,
                codigo: p.codigo,
                nome: p.nome,
                area: p.area,
                observacao: p.observacao,
                isDecision: decision.isDecision,
                isMilestone: isMilestoneProcess(p.area, p.codigo),
                decisionLabels: decision.labels,
                etapasAnterioresIds: p.etapas_anteriores || [],
                etapasSucessorasIds: p.etapas_sucessoras || [],
                col: c,
                row: laneIndex,
                x: custom ? custom.x : autoX,
                y: custom ? custom.y : autoY,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                laneIndex,
              }
              nodes.push(node)
              nodeMap.set(p.id, node)
            })
        })
      currentY += laneHeight + LANE_GAP
      laneIndex++
    })

    bands.push({
      id: `band-${bandIdx}`,
      titulo: band.titulo,
      subtitulo: band.subtitulo,
      y: bandY,
      height: currentY - LANE_GAP - bandY,
    })
    currentY += BAND_GAP - LANE_GAP
  })

  const edges = buildEdges(nodes, nodeMap, {
    isReturn: (from, to) => backKeys.has(`${from.id}->${to.id}`),
  })

  let maxX = 0
  let maxY = 0
  nodes.forEach((n) => {
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  })
  const autoWidth =
    CANVAS_PADDING_X * 2 + LANE_HEADER_WIDTH + HORIZONTAL_GAP + maxCols * (NODE_WIDTH + HORIZONTAL_GAP) + 120

  return {
    nodes,
    edges,
    lanes,
    bands,
    width: Math.max(autoWidth, maxX + CANVAS_PADDING_X + 150, 1600),
    height: Math.max(currentY + CANVAS_PADDING_Y, maxY + CANVAS_PADDING_Y + 100, 1000),
    nodeMap,
    totalCols: maxCols,
    totalRows: lanes.length,
  }
}
