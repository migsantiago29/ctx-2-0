import pb from '@/lib/pocketbase/client'
import type {
  Ciclo,
  Avaliacao,
  Pulso,
  Comentario,
  Notificacao,
  ConfiguracaoGeral,
  FarolStatus,
} from '@/types/ctx'

export const rotinaService = {
  // Buscar configuração geral (se a rotina e o pulso estão ativos)
  async getConfiguracao(): Promise<ConfiguracaoGeral | null> {
    try {
      return await pb
        .collection('configuracoes')
        .getFirstListItem<ConfiguracaoGeral>('chave = "geral"')
    } catch {
      return null
    }
  },

  // Alternar rotina ativa / pulso ativo (Admin)
  async setRotinaAtiva(rotinaAtiva: boolean): Promise<boolean> {
    const acao = rotinaAtiva ? 'reativar_rotina' : 'pausar_rotina'
    const res = await pb.send<{ success: boolean; rotina_ativa: boolean }>(
      '/backend/v1/ctx/admin-rotina',
      {
        method: 'POST',
        body: { acao, rotina_ativa: rotinaAtiva },
      },
    )
    return !!res?.success
  },

  async setPulsoAtivo(pulsoAtivo: boolean): Promise<boolean> {
    const acao = pulsoAtivo ? 'ligar_pulso' : 'desligar_pulso'
    const res = await pb.send<{ success: boolean; pulso_ativo: boolean }>(
      '/backend/v1/ctx/admin-rotina',
      {
        method: 'POST',
        body: { acao, pulso_ativo: pulsoAtivo },
      },
    )
    return !!res?.success
  },

  // Buscar ciclos abertos
  async getCiclosAbertos(): Promise<Ciclo[]> {
    try {
      return await pb.collection('ciclos').getFullList<Ciclo>({
        filter: 'status = "aberto"',
        sort: '-fechamento',
      })
    } catch {
      return []
    }
  },

  // Buscar todos os ciclos (Admin)
  async getAllCiclos(): Promise<Ciclo[]> {
    try {
      return await pb.collection('ciclos').getFullList<Ciclo>({
        sort: '-created',
      })
    } catch {
      return []
    }
  },

  // Ações de ciclo (Admin)
  async fecharCiclo(cicloId: string): Promise<boolean> {
    const res = await pb.send<{ success: boolean }>('/backend/v1/ctx/admin-rotina', {
      method: 'POST',
      body: { acao: 'fechar_ciclo', ciclo_id: cicloId },
    })
    return !!res?.success
  },

  async reabrirCiclo(cicloId: string): Promise<boolean> {
    const res = await pb.send<{ success: boolean }>('/backend/v1/ctx/admin-rotina', {
      method: 'POST',
      body: { acao: 'reabrir_ciclo', ciclo_id: cicloId },
    })
    return !!res?.success
  },

  async ajustarDatasCiclo(
    cicloId: string,
    abertura: string,
    fechamento: string,
    titulo?: string,
    referencia?: string,
  ): Promise<boolean> {
    const res = await pb.send<{ success: boolean }>('/backend/v1/ctx/admin-rotina', {
      method: 'POST',
      body: { acao: 'ajustar_datas', ciclo_id: cicloId, abertura, fechamento, titulo, referencia },
    })
    return !!res?.success
  },

  async criarCicloManual(dados: {
    tipo: 'pulso_semanal' | 'avaliacao_mensal'
    referencia: string
    titulo?: string
    abertura: string
    fechamento: string
  }): Promise<string | null> {
    const res = await pb.send<{ success: boolean; ciclo_id: string }>(
      '/backend/v1/ctx/admin-rotina',
      {
        method: 'POST',
        body: { acao: 'criar_ciclo', ...dados },
      },
    )
    return res?.ciclo_id || null
  },

  async lembrarPendentes(cicloId: string, colaboradorIds?: string[]): Promise<number> {
    const res = await pb.send<{ success: boolean; lembretes_enviados: number }>(
      '/backend/v1/ctx/admin-rotina',
      {
        method: 'POST',
        body: { acao: 'lembrar_pendentes', ciclo_id: cicloId, colaborador_ids: colaboradorIds },
      },
    )
    return res?.lembretes_enviados || 0
  },

  // Salvar Avaliação Mensal
  async salvarAvaliacao(payload: {
    ciclo_id: string
    meta_id: string
    farol: FarolStatus
    avancou: string
    proximo_passo: string
    ajuda_colaborador?: string | null
    ajuda_texto?: string
    evidencia_link?: string
    evidencia_arquivo?: File | null
  }): Promise<{ success: boolean; avaliacao_id?: string }> {
    // Se houver arquivo, faz upload via FormData ou endpoint seguro
    if (payload.evidencia_arquivo) {
      // Cria FormData caso tenha arquivo
      const formData = new FormData()
      formData.append('ciclo', payload.ciclo_id)
      formData.append('meta', payload.meta_id)
      formData.append('farol', payload.farol)
      formData.append('avancou', payload.avancou)
      formData.append('proximo_passo', payload.proximo_passo)
      if (payload.ajuda_colaborador) formData.append('ajuda_colaborador', payload.ajuda_colaborador)
      if (payload.ajuda_texto) formData.append('ajuda_texto', payload.ajuda_texto)
      if (payload.evidencia_link) formData.append('evidencia_link', payload.evidencia_link)
      formData.append('evidencia_arquivo', payload.evidencia_arquivo)
    }

    const res = await pb.send<{ success: boolean; avaliacao_id: string }>(
      '/backend/v1/ctx/avaliacoes',
      {
        method: 'POST',
        body: {
          ciclo_id: payload.ciclo_id,
          meta_id: payload.meta_id,
          farol: payload.farol,
          avancou: payload.avancou,
          proximo_passo: payload.proximo_passo,
          ajuda_colaborador: payload.ajuda_colaborador || null,
          ajuda_texto: payload.ajuda_texto || '',
          evidencia_link: payload.evidencia_link || '',
        },
      },
    )

    // Se tiver arquivo de evidência, faz o upload no registro criado
    if (payload.evidencia_arquivo && res?.avaliacao_id) {
      try {
        const fileData = new FormData()
        fileData.append('evidencia_arquivo', payload.evidencia_arquivo)
        await pb.collection('avaliacoes').update(res.avaliacao_id, fileData)
      } catch (errUpload) {
        console.error('Erro ao anexar arquivo de evidência:', errUpload)
      }
    }

    return res
  },

  // Salvar Pulso Semanal em lote
  async salvarPulsos(
    cicloId: string,
    itens: Array<{
      meta_id: string
      resposta: 'avancei' | 'sem_avanco' | 'travado'
      bloqueio_texto?: string
      feedback_texto?: string
    }>,
  ): Promise<boolean> {
    const res = await pb.send<{ success: boolean; total: number }>('/backend/v1/ctx/pulsos', {
      method: 'POST',
      body: { ciclo_id: cicloId, itens },
    })
    return !!res?.success
  },

  // Comentários em Avaliação
  async adicionarComentario(avaliacaoId: string, texto: string): Promise<string | null> {
    const res = await pb.send<{ success: boolean; comentario_id: string }>(
      '/backend/v1/ctx/comentarios',
      {
        method: 'POST',
        body: { avaliacao_id: avaliacaoId, texto },
      },
    )
    return res?.comentario_id || null
  },

  async getComentariosAvaliacao(avaliacaoId: string): Promise<Comentario[]> {
    try {
      return await pb.collection('comentarios').getFullList<Comentario>({
        filter: `avaliacao = "${avaliacaoId}"`,
        expand: 'autor',
        sort: 'created',
      })
    } catch {
      return []
    }
  },

  // Resolver pedido de ajuda
  async resolverPedidoAjuda(avaliacaoId: string): Promise<boolean> {
    try {
      await pb.collection('avaliacoes').update(avaliacaoId, {
        ajuda_status: 'resolvido',
      })
      return true
    } catch {
      return false
    }
  },

  // Buscar histórico de avaliações de uma meta
  async getAvaliacoesMeta(metaId: string): Promise<Avaliacao[]> {
    try {
      return await pb.collection('avaliacoes').getFullList<Avaliacao>({
        filter: `meta = "${metaId}"`,
        expand: 'ciclo,preenchido_por,ajuda_colaborador',
        sort: '-created',
      })
    } catch {
      return []
    }
  },

  // Notificações do usuário autenticado
  async getNotificacoes(): Promise<Notificacao[]> {
    try {
      return await pb.collection('notificacoes').getFullList<Notificacao>({
        sort: '-created',
        limit: 50,
      })
    } catch {
      return []
    }
  },

  async marcarNotificacaoLida(id: string): Promise<void> {
    try {
      await pb.collection('notificacoes').update(id, { lida: true })
    } catch {
      /* ignore */
    }
  },

  async marcarTodasLidas(ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        await pb.collection('notificacoes').update(id, { lida: true })
      } catch {
        /* ignore */
      }
    }
  },

  // URL para download do CSV seguro
  getExportCsvUrl(
    tipo: 'avaliacoes' | 'pulsos',
    cicloId = '',
    projetoId = '',
    areaId = '',
  ): string {
    const base = import.meta.env.VITE_POCKETBASE_URL || ''
    const params = new URLSearchParams()
    params.set('tipo', tipo)
    if (cicloId) params.set('ciclo_id', cicloId)
    if (projetoId) params.set('projeto_id', projetoId)
    if (areaId) params.set('area_id', areaId)
    return `${base}/backend/v1/ctx/export-csv?${params.toString()}`
  },
}
