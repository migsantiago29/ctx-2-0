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
  totalMetas?: number
  metasCount?: {
    total: number
    verde: number
    atencao: number
    vermelho: number
    concluida: number
    sem_atualizacao: number
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
  status:
    | 'sem atualização'
    | 'em andamento'
    | 'concluida'
    | 'atrasada'
    | 'verde'
    | 'atencao'
    | 'vermelho'
  progresso?: number
  expand?: {
    projeto?: ProjetoEstrategico
    projeto_secundario?: ProjetoEstrategico
    responsaveis?: Colaborador[]
    processos_vinculados?: Processo[]
  }
}

export type FarolStatus = 'verde' | 'atencao' | 'vermelho' | 'concluida'

export interface Ciclo extends RecordModel {
  tipo: 'pulso_semanal' | 'avaliacao_mensal'
  referencia: string
  titulo?: string
  abertura: string
  fechamento: string
  status: 'aberto' | 'fechado'
}

export interface Avaliacao extends RecordModel {
  ciclo: string
  meta: string
  preenchido_por: string
  farol: FarolStatus
  avancou: string
  proximo_passo: string
  ajuda_colaborador?: string
  ajuda_texto?: string
  ajuda_status?: 'aberto' | 'resolvido'
  evidencia_link?: string
  evidencia_arquivo?: string
  expand?: {
    ciclo?: Ciclo
    meta?: Meta
    preenchido_por?: Colaborador
    ajuda_colaborador?: Colaborador
  }
}

export interface Pulso extends RecordModel {
  ciclo: string
  colaborador: string
  meta: string
  resposta: 'avancei' | 'sem_avanco' | 'travado'
  bloqueio_texto?: string
  expand?: {
    ciclo?: Ciclo
    colaborador?: Colaborador
    meta?: Meta
  }
}

export interface Comentario extends RecordModel {
  avaliacao: string
  autor: string
  texto: string
  expand?: {
    autor?: UserProfile
  }
}

export interface Notificacao extends RecordModel {
  destinatario: string
  tipo: 'ciclo_aberto' | 'lembrete' | 'pedido_ajuda' | 'comentario' | 'meta_concluida'
  texto: string
  link?: string
  lida: boolean
}

export interface ConfiguracaoGeral extends RecordModel {
  chave: string
  rotina_ativa: boolean
  pulso_ativo: boolean
  valor?: string
}

export interface MetaWithDetails extends Meta {
  indicadoresList?: Indicador[]
  processosList?: Processo[]
  ultimaAvaliacao?: Avaliacao
  ultimoPulso?: Pulso
}

export interface FluxogramaEtapa extends RecordModel {
  ordem: number
  etapa: string
  area: string
  evidencia?: string
  subpassos?: string[]
}

export interface FluxogramaPosicao extends RecordModel {
  processo_id: string
  processo_codigo: string
  x: number
  y: number
}
