import { useMemo, useState } from 'react'
import { ArrowRight, ArrowLeft, Network, X } from 'lucide-react'
import type { Area, Processo } from '@/types/ctx'
import { computeAreaLinks, type AreaLink } from '@/lib/areaLinks'

// Cores do mapa: saída (entrega) no amarelo da marca, entrada (recebe) em azul
// amarelo da marca no escuro, dourado escuro no modo claro (legível no branco)
const COR_ENTREGA = 'rgb(var(--ctx-brand))'
const COR_RECEBE = '#3B82F6'

const VIEW_W = 1000
const VIEW_H = 760
const CENTER_X = VIEW_W / 2
const CENTER_Y = VIEW_H / 2
// Áreas numa elipse (mais larga que alta, como a tela)
const RADIUS_X = 395
const RADIUS_Y = 318
const BOX_W = 180
const BOX_H = 54

interface Props {
  areas: Area[]
  processos: Processo[]
  /** Abre o processo no Diagrama */
  onOpenProcess?: (codigo: string) => void
}

type Selection = { kind: 'area'; area: string } | { kind: 'link'; from: string; to: string } | null

/**
 * Mapa das áreas: uma caixa por área, em círculo na ordem do fluxo, e uma seta para cada
 * par de áreas que tem passagem de processo (espessura = número de passagens).
 * Clicar numa área destaca o que ela entrega (amarelo) e recebe (azul); clicar numa seta
 * lista os processos daquela passagem.
 */
export function MapaAreas({ areas, processos, onOpenProcess }: Props) {
  const { links, areas: areaNames } = useMemo(() => computeAreaLinks(processos), [processos])
  const [selection, setSelection] = useState<Selection>(null)

  // Ordem das áreas no círculo: ordem_no_fluxo da coleção areas
  const ordered = useMemo(() => {
    const ordem = new Map(areas.map((a) => [a.nome.trim(), a.ordem_no_fluxo ?? 999]))
    return [...areaNames].sort(
      (a, b) => (ordem.get(a) ?? 999) - (ordem.get(b) ?? 999) || a.localeCompare(b),
    )
  }, [areas, areaNames])

  const positions = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    ordered.forEach((nome, i) => {
      const ang = -Math.PI / 2 + (i / ordered.length) * Math.PI * 2
      m.set(nome, { x: CENTER_X + RADIUS_X * Math.cos(ang), y: CENTER_Y + RADIUS_Y * Math.sin(ang) })
    })
    return m
  }, [ordered])

  const totalPassagens = links.reduce((s, l) => s + l.handoffs.length, 0)
  const selArea = selection?.kind === 'area' ? selection.area : null
  const selLink =
    selection?.kind === 'link'
      ? links.find((l) => l.fromArea === selection.from && l.toArea === selection.to) || null
      : null

  const linkState = (l: AreaLink): 'entrega' | 'recebe' | 'selecionada' | 'apagada' | 'normal' => {
    if (selLink) return l === selLink ? 'selecionada' : 'apagada'
    if (selArea) {
      if (l.fromArea === selArea) return 'entrega'
      if (l.toArea === selArea) return 'recebe'
      return 'apagada'
    }
    return 'normal'
  }

  // Curva de uma área para outra: dobra para o centro e para o lado, separando ida e volta
  const geometry = (l: AreaLink) => {
    const a = positions.get(l.fromArea)!
    const b = positions.get(l.toArea)!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    // começa e termina na borda das caixas
    const pad = Math.min(BOX_W / 2 / (Math.abs(ux) || 1e-6), BOX_H / 2 / (Math.abs(uy) || 1e-6)) + 4
    const sx = a.x + ux * pad
    const sy = a.y + uy * pad
    const ex = b.x - ux * (pad + 4)
    const ey = b.y - uy * (pad + 4)
    const mx = (sx + ex) / 2
    const my = (sy + ey) / 2
    // desloca para o centro e para a direita do sentido (ida e volta não se sobrepõem)
    const toCx = (CENTER_X - mx) * 0.2
    const toCy = (CENTER_Y - my) * 0.2
    const side = 22
    const cx = mx + toCx - uy * side
    const cy = my + toCy + ux * side
    // ponto no meio da curva (t = 0.5) para o número
    const lx = 0.25 * sx + 0.5 * cx + 0.25 * ex
    const ly = 0.25 * sy + 0.5 * cy + 0.25 * ey
    return { d: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`, lx, ly }
  }

  const areaTotals = (nome: string) => ({
    entrega: links.filter((l) => l.fromArea === nome).reduce((s, l) => s + l.handoffs.length, 0),
    recebe: links.filter((l) => l.toArea === nome).reduce((s, l) => s + l.handoffs.length, 0),
  })

  if (ordered.length === 0) {
    return (
      <div className="bg-ctx-111111 border border-ctx-262626 rounded-2xl p-10 text-center text-sm text-ctx-9ca3af">
        Nenhum processo cadastrado ainda. Importe os processos em Administração → Importação.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
      {/* MAPA */}
      <div className="bg-ctx-111111 border border-ctx-262626 rounded-2xl p-3 md:p-4 relative">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
          <p className="text-xs text-ctx-9ca3af">
            {ordered.length} áreas • {links.length} ligações • {totalPassagens} passagens de processo
          </p>
          <div className="flex items-center gap-3 text-[11px] text-ctx-9ca3af">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded" style={{ background: COR_ENTREGA }} /> Entrega para
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded" style={{ background: COR_RECEBE }} /> Recebe de
            </span>
            <span>Seta mais grossa = mais passagens</span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label="Mapa de ligações entre as áreas"
          onClick={() => setSelection(null)}
        >
          <defs>
            {[
              ['mapa-seta-normal', 'rgb(var(--ctx-737373))'],
              ['mapa-seta-entrega', COR_ENTREGA],
              ['mapa-seta-recebe', COR_RECEBE],
              ['mapa-seta-apagada', 'rgb(var(--ctx-333333))'],
            ].map(([id, cor]) => (
              <marker
                key={id}
                id={id}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" style={{ fill: cor }} />
              </marker>
            ))}
          </defs>

          {/* Setas: as apagadas primeiro, as destacadas por cima */}
          {[...links]
            .sort((a, b) => {
              const rank = (l: AreaLink) => (linkState(l) === 'apagada' ? 0 : linkState(l) === 'normal' ? 1 : 2)
              return rank(a) - rank(b)
            })
            .map((l) => {
              const st = linkState(l)
              const { d, lx, ly } = geometry(l)
              const n = l.handoffs.length
              const cor =
                st === 'entrega' || st === 'selecionada'
                  ? COR_ENTREGA
                  : st === 'recebe'
                    ? COR_RECEBE
                    : st === 'apagada'
                      ? 'rgb(var(--ctx-333333))'
                      : 'rgb(var(--ctx-737373))'
              const marker =
                st === 'entrega' || st === 'selecionada'
                  ? 'mapa-seta-entrega'
                  : st === 'recebe'
                    ? 'mapa-seta-recebe'
                    : st === 'apagada'
                      ? 'mapa-seta-apagada'
                      : 'mapa-seta-normal'
              const destacada = st !== 'normal' && st !== 'apagada'
              return (
                <g
                  key={`${l.fromArea}→${l.toArea}`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelection({ kind: 'link', from: l.fromArea, to: l.toArea })
                  }}
                >
                  <title>{`${l.fromArea} → ${l.toArea}: ${n} passage${n > 1 ? 'ns' : 'm'}`}</title>
                  {/* área de clique mais larga e invisível */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={d}
                    fill="none"
                    style={{ stroke: cor }}
                    strokeWidth={1.2 + Math.min(n, 8) * 0.7}
                    strokeOpacity={st === 'apagada' ? 0.2 : st === 'normal' ? 0.4 : 1}
                    markerEnd={`url(#${marker})`}
                  />
                  {destacada && (
                    <g transform={`translate(${lx}, ${ly})`}>
                      <circle r={11} style={{ fill: 'rgb(var(--ctx-111111))', stroke: cor }} strokeWidth={1.5} />
                      <text
                        textAnchor="middle"
                        dy="4"
                        fontSize="11"
                        fontWeight="700"
                        style={{ fill: 'rgb(var(--ctx-fg))' }}
                      >
                        {n}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}

          {/* Caixas das áreas */}
          {ordered.map((nome) => {
            const p = positions.get(nome)!
            const t = areaTotals(nome)
            const isSel = selArea === nome || selLink?.fromArea === nome || selLink?.toArea === nome
            const ligada =
              !!selArea && links.some((l) => (l.fromArea === selArea && l.toArea === nome) || (l.toArea === selArea && l.fromArea === nome))
            const apagada = (selArea || selLink) && !isSel && !ligada
            return (
              <g
                key={nome}
                transform={`translate(${p.x - BOX_W / 2}, ${p.y - BOX_H / 2})`}
                className="cursor-pointer"
                opacity={apagada ? 0.35 : 1}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelection(selArea === nome ? null : { kind: 'area', area: nome })
                }}
              >
                <title>{`${nome}: entrega ${t.entrega} • recebe ${t.recebe}`}</title>
                <rect
                  width={BOX_W}
                  height={BOX_H}
                  rx={10}
                  style={{
                    fill: isSel ? 'rgb(var(--ctx-1c1806))' : 'rgb(var(--ctx-161616))',
                    stroke: isSel ? COR_ENTREGA : 'rgb(var(--ctx-333333))',
                  }}
                  strokeWidth={isSel ? 2 : 1}
                />
                <text
                  x={BOX_W / 2}
                  y={23}
                  textAnchor="middle"
                  fontSize="15"
                  fontWeight="700"
                  style={{ fill: 'rgb(var(--ctx-fg))' }}
                >
                  {nome.length > 21 ? nome.slice(0, 20) + '…' : nome}
                </text>
                <text x={BOX_W / 2} y={42} textAnchor="middle" fontSize="12.5" style={{ fill: 'rgb(var(--ctx-9ca3af))' }}>
                  ↗ entrega {t.entrega} · ↙ recebe {t.recebe}
                </text>
              </g>
            )
          })}

          {!selection && (
            <text
              x={CENTER_X}
              y={CENTER_Y}
              textAnchor="middle"
              fontSize="13"
              style={{ fill: 'rgb(var(--ctx-9ca3af))' }}
            >
              Clique numa área ou numa seta
            </text>
          )}
        </svg>
      </div>

      {/* PAINEL DE DETALHES */}
      <div className="bg-ctx-111111 border border-ctx-262626 rounded-2xl p-4 space-y-4 xl:max-h-[780px] xl:overflow-y-auto">
        {selLink ? (
          <LinkDetails link={selLink} onClose={() => setSelection(null)} onOpenProcess={onOpenProcess} />
        ) : selArea ? (
          <AreaDetails
            area={selArea}
            links={links}
            onClose={() => setSelection(null)}
            onSelectLink={(l) => setSelection({ kind: 'link', from: l.fromArea, to: l.toArea })}
          />
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-ctx-fg flex items-center gap-2">
              <Network className="w-4 h-4 text-ctx-brand" /> Principais ligações entre áreas
            </h3>
            <p className="text-xs text-ctx-9ca3af">
              Passagens que atravessam um Marco (ML) contam como ligação direta entre as áreas.
            </p>
            <ul className="space-y-1.5">
              {links.slice(0, 12).map((l) => (
                <li key={`${l.fromArea}→${l.toArea}`}>
                  <LinkRow link={l} onClick={() => setSelection({ kind: 'link', from: l.fromArea, to: l.toArea })} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function LinkRow({ link, onClick, accent }: { link: AreaLink; onClick: () => void; accent?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 text-left text-xs px-3 py-2 rounded-lg bg-ctx-161616 border border-ctx-262626 hover:border-[#FFD400]/60 transition-colors"
    >
      <span className="text-ctx-d1d5db truncate">
        {link.fromArea} <span className="text-ctx-666666">→</span> {link.toArea}
      </span>
      <span
        className="shrink-0 font-mono font-bold px-1.5 py-0.5 rounded"
        style={{ color: accent, background: 'rgb(var(--ctx-1f1f1f))' }}
      >
        {link.handoffs.length}
      </span>
    </button>
  )
}

function AreaDetails({
  area,
  links,
  onClose,
  onSelectLink,
}: {
  area: string
  links: AreaLink[]
  onClose: () => void
  onSelectLink: (l: AreaLink) => void
}) {
  const sai = links.filter((l) => l.fromArea === area)
  const entra = links.filter((l) => l.toArea === area)
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ctx-9ca3af font-semibold">Área</p>
          <h3 className="text-base font-bold text-ctx-fg">{area}</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded text-ctx-9ca3af hover:text-ctx-fg" aria-label="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>
      <section className="space-y-1.5">
        <h4 className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'rgb(var(--ctx-brand))' }}>
          <ArrowRight className="w-3.5 h-3.5" /> Entrega para ({sai.length})
        </h4>
        {sai.length === 0 && <p className="text-xs text-ctx-9ca3af italic">Nenhuma passagem para outras áreas.</p>}
        {sai.map((l) => (
          <LinkRow key={l.toArea} link={l} onClick={() => onSelectLink(l)} accent="rgb(var(--ctx-brand))" />
        ))}
      </section>
      <section className="space-y-1.5">
        <h4 className="text-xs font-bold flex items-center gap-1.5" style={{ color: COR_RECEBE }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Recebe de ({entra.length})
        </h4>
        {entra.length === 0 && <p className="text-xs text-ctx-9ca3af italic">Não recebe de outras áreas.</p>}
        {entra.map((l) => (
          <LinkRow key={l.fromArea} link={l} onClick={() => onSelectLink(l)} accent={COR_RECEBE} />
        ))}
      </section>
      <p className="text-[11px] text-ctx-9ca3af">Clique numa ligação para ver os processos.</p>
    </div>
  )
}

function LinkDetails({
  link,
  onClose,
  onOpenProcess,
}: {
  link: AreaLink
  onClose: () => void
  onOpenProcess?: (codigo: string) => void
}) {
  const n = link.handoffs.length
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ctx-9ca3af font-semibold">
            {n} passage{n > 1 ? 'ns' : 'm'}
          </p>
          <h3 className="text-base font-bold text-ctx-fg">
            {link.fromArea} <span className="text-ctx-brand">→</span> {link.toArea}
          </h3>
        </div>
        <button onClick={onClose} className="p-1 rounded text-ctx-9ca3af hover:text-ctx-fg" aria-label="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="space-y-2">
        {link.handoffs.map((h) => (
          <li key={`${h.fromId}-${h.toId}`} className="rounded-lg bg-ctx-161616 border border-ctx-262626 p-2.5 text-xs space-y-1.5">
            <ProcLine codigo={h.fromCodigo} nome={h.fromNome} onOpen={onOpenProcess} />
            <div className="flex items-center gap-1.5 pl-1 text-[11px] text-ctx-9ca3af">
              <ArrowRight className="w-3 h-3 text-ctx-brand" />
              {h.viaMarcos.length > 0 ? <span>via marco {h.viaMarcos.join(' → ')}</span> : <span>entrega direta</span>}
            </div>
            <ProcLine codigo={h.toCodigo} nome={h.toNome} onOpen={onOpenProcess} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProcLine({ codigo, nome, onOpen }: { codigo: string; nome: string; onOpen?: (c: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(codigo)}
      className="w-full text-left flex gap-2 hover:underline decoration-ctx-brand/60"
      title="Ver no Diagrama"
    >
      <span className="font-mono font-bold text-ctx-brand shrink-0">{codigo}</span>
      <span className="text-ctx-d1d5db">{nome}</span>
    </button>
  )
}
