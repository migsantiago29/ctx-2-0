import type { RecordModel } from 'pocketbase'

export interface UserProfile extends RecordModel {
  email: string
  name?: string
  avatar?: string
  area?: string
}

export interface ProjetoEstrategico extends RecordModel {
  nome: string
  descricao?: string
}

export interface Indicador extends RecordModel {
  meta: string
  nome: string
  valor_atual?: number
  valor_meta?: number
  tendencia?: 'subindo' | 'descendo' | 'estavel'
  historico?: number[]
}

export interface Processo extends RecordModel {
  meta: string
  nome: string
  status: 'pendente' | 'concluido'
}

export interface Meta extends RecordModel {
  titulo: string
  descricao?: string
  projeto: string
  owner: string
  status: 'em andamento' | 'concluida' | 'atrasada'
  timeframe?: string
  progresso?: number
  // Expanded relations
  expand?: {
    projeto?: ProjetoEstrategico
    owner?: UserProfile
  }
}

export interface MetaWithDetails extends Meta {
  indicadoresList?: Indicador[]
  processosList?: Processo[]
}

export interface FluxogramaEtapa extends RecordModel {
  ordem: number
  etapa: string
  area: string
  evidencia?: string
  subpassos?: string[]
}

export interface Area extends RecordModel {
  nome: string
  descricao?: string
}
