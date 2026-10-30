import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SparklineProps {
  data?: number[]
  tendencia?: 'subindo' | 'descendo' | 'estavel'
  width?: number
  height?: number
}

export default function Sparkline({
  data = [],
  tendencia = 'estavel',
  width = 90,
  height = 24,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <span className="text-[11px] text-ctx-9ca3af">—</span>
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const padding = 3
  const availableWidth = width - padding * 2
  const availableHeight = height - padding * 2

  const points = data.map((val, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * availableWidth
    const y = height - padding - ((val - min) / range) * availableHeight
    return `${x},${y}`
  })

  const pathString = `M ${points.join(' L ')}`

  let strokeColor = '#FFD400'
  if (tendencia === 'subindo') strokeColor = '#22C55E'
  if (tendencia === 'descendo') strokeColor = '#EF4444'

  return (
    <svg width={width} height={height} className="overflow-visible inline-block">
      <path
        d={pathString}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((pt, i) => {
        const [cx, cy] = pt.split(',')
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={i === points.length - 1 ? '3' : '1.5'}
            fill={strokeColor}
          />
        )
      })}
    </svg>
  )
}

export function TrendBadge({
  tendencia = 'estavel',
}: {
  tendencia?: 'subindo' | 'descendo' | 'estavel'
}) {
  if (tendencia === 'subindo') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#22C55E] bg-[#22C55E]/10 px-1.5 py-0.5 rounded">
        <TrendingUp className="w-3 h-3" />
        Alta
      </span>
    )
  }
  if (tendencia === 'descendo') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#EF4444] bg-[#EF4444]/10 px-1.5 py-0.5 rounded">
        <TrendingDown className="w-3 h-3" />
        Queda
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-ctx-brand bg-[#FFD400]/10 px-1.5 py-0.5 rounded">
      <Minus className="w-3 h-3" />
      Estável
    </span>
  )
}
