import type { Processo } from '@/types/ctx'
import { isMilestoneProcess } from '@/lib/diagramLayout'

/** Uma passagem de um processo de uma área para um processo de outra área */
export interface AreaHandoff {
  fromId: string
  fromCodigo: string
  fromNome: string
  toId: string
  toCodigo: string
  toNome: string
  /** Marcos (ML..) atravessados no caminho, ex.: ["ML05"] */
  viaMarcos: string[]
}

/** Todas as passagens de uma área para outra */
export interface AreaLink {
  fromArea: string
  toArea: string
  handoffs: AreaHandoff[]
}

export interface ProcessAreaLinks {
  recebeDe: string[]
  entregaPara: string[]
}

export interface AreaLinksResult {
  links: AreaLink[]
  /** Áreas (sem Marcos) que aparecem nos processos */
  areas: string[]
  /** Para cada processo (id): de quais áreas recebe e para quais entrega */
  byProcess: Map<string, ProcessAreaLinks>
}

/**
 * Calcula as ligações entre áreas a partir das etapas sucessoras dos processos.
 * Marcos (área "Milestone" / códigos ML..) não são tratados como área: a passagem
 * atravessa o marco até o próximo processo real, guardando o marco em `viaMarcos`.
 * Ex.: ARQ09 → ML05 → GP05 vira Arquitetura → Gestão de Projetos (via ML05).
 */
export function computeAreaLinks(processos: Processo[]): AreaLinksResult {
  const byId = new Map(processos.map((p) => [p.id, p]))
  const areaOf = (p: Processo) => (p.area || 'Outros').trim()
  const isMarco = (p: Processo) => isMilestoneProcess(p.area, p.codigo)

  const linkMap = new Map<string, AreaLink>()
  const recebe = new Map<string, Set<string>>()
  const entrega = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, id: string, area: string) => {
    if (!map.has(id)) map.set(id, new Set())
    map.get(id)!.add(area)
  }

  // Destinos reais (não-marco) de um processo, atravessando cadeias de marcos
  const realTargets = (start: Processo) => {
    const out: { target: Processo; via: string[] }[] = []
    const visit = (p: Processo, via: string[], seen: Set<string>) => {
      for (const nextId of p.etapas_sucessoras || []) {
        const next = byId.get(nextId)
        if (!next || seen.has(next.id)) continue
        if (isMarco(next)) {
          visit(next, [...via, next.codigo], new Set([...seen, next.id]))
        } else {
          out.push({ target: next, via })
        }
      }
    }
    visit(start, [], new Set([start.id]))
    return out
  }

  const areaSet = new Set<string>()
  for (const from of processos) {
    if (isMarco(from)) continue
    const fromArea = areaOf(from)
    areaSet.add(fromArea)
    const seenPairs = new Set<string>()
    for (const { target, via } of realTargets(from)) {
      const toArea = areaOf(target)
      if (toArea === fromArea || seenPairs.has(target.id)) continue
      seenPairs.add(target.id)
      const key = `${fromArea}→${toArea}`
      if (!linkMap.has(key)) linkMap.set(key, { fromArea, toArea, handoffs: [] })
      linkMap.get(key)!.handoffs.push({
        fromId: from.id,
        fromCodigo: from.codigo,
        fromNome: from.nome,
        toId: target.id,
        toCodigo: target.codigo,
        toNome: target.nome,
        viaMarcos: via,
      })
      add(entrega, from.id, toArea)
      add(recebe, target.id, fromArea)
    }
  }

  const byProcess = new Map<string, ProcessAreaLinks>()
  for (const p of processos) {
    const r = [...(recebe.get(p.id) || [])].sort()
    const e = [...(entrega.get(p.id) || [])].sort()
    if (r.length || e.length) byProcess.set(p.id, { recebeDe: r, entregaPara: e })
  }

  return {
    links: [...linkMap.values()].sort((a, b) => b.handoffs.length - a.handoffs.length),
    areas: [...areaSet],
    byProcess,
  }
}
