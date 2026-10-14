/**
 * Rótulos e cores padronizados dos faróis do CTX 2.0
 *
 * Mapeamento:
 * - 'verde' -> "No ritmo" (#22C55E)
 * - 'atencao' -> "Atenção" (#F59E0B - âmbar)
 * - 'vermelho' -> "Travado" (#EF4444)
 * - 'concluida' -> "Concluída" (#3B82F6)
 * - 'sem atualização' -> "Sem atualização" (#9CA3AF / #333333)
 */

export function getFarolLabel(status?: string | null): string {
  if (!status) return 'Sem atualização'
  const st = status.toLowerCase().trim()
  switch (st) {
    case 'verde':
    case 'no ritmo':
      return 'No ritmo'
    case 'atencao':
    case 'atenção':
      return 'Atenção'
    case 'vermelho':
    case 'travado':
      return 'Travado'
    case 'concluida':
    case 'concluída':
      return 'Concluída'
    case 'sem atualização':
    case 'sem atualizacao':
      return 'Sem atualização'
    case 'em andamento':
      return 'Em andamento'
    case 'atrasada':
      return 'Atrasada'
    default:
      return status
  }
}

export function getFarolColor(status?: string | null): string | null {
  if (!status) return null
  const st = status.toLowerCase().trim()
  switch (st) {
    case 'verde':
    case 'no ritmo':
      return '#22C55E'
    case 'atencao':
    case 'atenção':
      return '#F59E0B'
    case 'vermelho':
    case 'travado':
      return '#EF4444'
    case 'concluida':
    case 'concluída':
      return '#3B82F6'
    case 'sem atualização':
    case 'sem atualizacao':
      return '#9CA3AF'
    default:
      return null
  }
}
