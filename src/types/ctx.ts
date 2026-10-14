import type { RecordModel } from 'pocketbase'

export interface UserProfile extends RecordModel {
  email: string
  name?: string
  avatar?: string
  area?: string
  cargo?: string
  role?: 'colaborador' | 'admin'
  must_change_password?: boolean
}

export interface Area extends RecordModel {
  nome: string
  ordem_no_fluxo?: number
  tipo?: 'área' | 'grupo de processos'
  descricao?: string
}

export interface Colaborador extends RecordModel {
  codigo: string
  nome: string
  cargo?: string
  area?: string
  email?: string
  sem_metas?: boolean
  usuario?: string
  expand?: {
    area?: Area
    usuario?: UserProfile
  }
}

export interface Processo extends RecordModel {
  codigo: string
  nome: string
  area: string
  etapas_anteriores?: string[]
  etapas_sucessoras?: string[]
  observacao?: string
  expand?: {
    etapas_anteriores?: Processo[]
    etapas_sucessoras?: Processo[]
  }
}

export interface ProjetoEstrategico extends RecordModel {
  codigo: string
  nome: string
  descricao?: string
  sponsor?: string
  expand?: {
    sponsor?: Colaborador
  }
}

export interface Indicador extends RecordModel {
  meta: string
  nome: string
  ordem?: number
  alvo?: string
  valor_atual?: number
  valor_meta?: number
  tendencia?: 'subindo' | 'descendo' | 'estavel'
  historico?: number[]
}

export interface Meta extends RecordModel {
  codigo: string
  titulo: string
  descricao?: string
  projeto: string // projeto principal
  projeto_secundario?: string
  responsaveis?: string[]
  periodicidade?: string
  prazo?: string
  trimestre?: string
  processos_vinculados?: string[]
  valor_alvo_a_definir?: boolean
  status: 'sem atualização' | 'em andamento' | 'concluida' | 'atrasada'
  progresso?: number
  expand?: {
    projeto?: ProjetoEstrategico
    projeto_secundario?: ProjetoEstrategico
    responsaveis?: Colaborador[]
    processos_vinculados?: Processo[]
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
