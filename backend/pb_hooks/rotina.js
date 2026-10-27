// pocketbase/hooks/rotina.js
// Gestão da rotina de acompanhamento das metas (Pulso semanal e Avaliação mensal),
// notificações no app, criação de ciclos e exportação segura em CSV.

// 1. Endpoint para Salvar/Atualizar Avaliação Mensal
// Atualiza o status da meta com o farol mais recente
// Dispara notificações:
// - Pedido de ajuda: colaborador escolhido, sponsor do projeto principal e admins
// - Meta concluída: todos os colaboradores/usuários
routerAdd('POST', '/backend/v1/ctx/avaliacoes', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    throw new ForbiddenError('Sessão expirada ou não autenticada.')
  }

  const info = e.requestInfo()
  const body = (info && info.body) || {}

  const cicloId = body.ciclo_id
  const metaId = body.meta_id
  const farol = body.farol // 'verde' | 'atencao' | 'vermelho' | 'concluida'
  const avancou = (body.avancou || '').trim()
  const proximoPasso = (body.proximo_passo || '').trim()
  const ajudaColaborador = body.ajuda_colaborador || null
  const ajudaTexto = (body.ajuda_texto || '').trim()
  const evidenciaLink = (body.evidencia_link || '').trim()

  if (!cicloId || !metaId || !farol || !avancou || !proximoPasso) {
    throw new BadRequestError('Ciclo, meta, farol, o que avançou e próximo passo são obrigatórios.')
  }

  if (farol === 'concluida' && !evidenciaLink && !body.evidencia_arquivo) {
    throw new BadRequestError(
      'Evidência (link ou arquivo) é obrigatória quando o farol for "Concluída".',
    )
  }

  // Helper local para criar notificação
  const notifyUser = (destinatarioId, tipo, texto, link) => {
    try {
      if (!destinatarioId) return
      const nCol = e.app.findCollectionByNameOrId('notificacoes')
      const nRec = new Record(nCol)
      nRec.set('destinatario', destinatarioId)
      nRec.set('tipo', tipo)
      nRec.set('texto', texto)
      nRec.set('link', link || '/')
      nRec.set('lida', false)
      e.app.save(nRec)
    } catch (errN) {
      console.error('Erro ao salvar notificacao:', errN)
    }
  }

  // Verificar ciclo
  const ciclo = e.app.findRecordById('ciclos', cicloId)
  if (!ciclo) throw new BadRequestError('Ciclo não encontrado.')
  if (ciclo.getString('status') !== 'aberto') {
    throw new BadRequestError('Este ciclo já está fechado e não aceita mais respostas.')
  }

  // Verificar meta
  const meta = e.app.findRecordById('metas', metaId)
  if (!meta) throw new BadRequestError('Meta não encontrada.')

  // Identificar colaborador do usuário
  let colab = null
  try {
    colab = e.app.findFirstRecordByData('colaboradores', 'usuario', authRecord.id)
  } catch (_) {
    try {
      colab = e.app.findFirstRecordByData('colaboradores', 'email', authRecord.email())
    } catch (_) {}
  }

  const isAdmin = authRecord.getString('role') === 'admin'
  const responsaveisIds = meta.getStringSlice ? meta.getStringSlice('responsaveis') : []

  if (!isAdmin && colab && responsaveisIds.length > 0 && !responsaveisIds.includes(colab.id)) {
    throw new ForbiddenError('Você só pode preencher avaliações para metas em que é responsável.')
  }

  const colabId = colab ? colab.id : authRecord.id

  // Buscar se já existe avaliação para este ciclo e meta
  let avaliacao = null
  let isNew = false
  try {
    const list = e.app.findRecordsByFilter(
      'avaliacoes',
      `ciclo = "${cicloId}" && meta = "${metaId}"`,
      '',
      1,
      0,
    )
    if (list.length > 0) avaliacao = list[0]
  } catch (_) {}

  const avaliacoesCol = e.app.findCollectionByNameOrId('avaliacoes')
  if (!avaliacao) {
    isNew = true
    avaliacao = new Record(avaliacoesCol)
    avaliacao.set('ciclo', cicloId)
    avaliacao.set('meta', metaId)
  }

  avaliacao.set('preenchido_por', colabId)
  avaliacao.set('farol', farol)
  avaliacao.set('avancou', avancou)
  avaliacao.set('proximo_passo', proximoPasso)

  if (ajudaColaborador && ajudaTexto) {
    avaliacao.set('ajuda_colaborador', ajudaColaborador)
    avaliacao.set('ajuda_texto', ajudaTexto)
    if (isNew || !avaliacao.getString('ajuda_status')) {
      avaliacao.set('ajuda_status', 'aberto')
    }
  } else if (!isNew && !ajudaColaborador) {
    avaliacao.set('ajuda_colaborador', null)
    avaliacao.set('ajuda_texto', '')
  }

  if (evidenciaLink) {
    avaliacao.set('evidencia_link', evidenciaLink)
  }

  e.app.save(avaliacao)

  // 4. O farol da avaliação mensal mais recente atualiza o status da meta
  meta.set('status', farol)
  if (farol === 'concluida') {
    meta.set('progresso', 100)
  }
  e.app.save(meta)

  // Disparos de notificações
  // C.3 Pedido de ajuda: destinatario escolhido, sponsor do projeto principal e admin
  if (ajudaColaborador && ajudaTexto) {
    try {
      const helperColab = e.app.findRecordById('colaboradores', ajudaColaborador)
      const helperUserId = helperColab ? helperColab.getString('usuario') : null

      const remetenteNome = colab ? colab.getString('nome') : authRecord.getString('name')
      const metaTitulo = meta.getString('titulo')
      const txtAjuda = `${remetenteNome} pediu sua ajuda na meta "${meta.getString('codigo')} - ${metaTitulo}": "${ajudaTexto}"`

      if (helperUserId && helperUserId !== authRecord.id) {
        notifyUser(helperUserId, 'pedido_ajuda', txtAjuda, `/projetos/${meta.getString('projeto')}`)
      }

      // Sponsor do projeto
      const projId = meta.getString('projeto')
      if (projId) {
        try {
          const proj = e.app.findRecordById('projetos_estrategicos', projId)
          const sponsorColabId = proj.getString('sponsor')
          if (sponsorColabId) {
            const sponsorColab = e.app.findRecordById('colaboradores', sponsorColabId)
            const sponsorUserId = sponsorColab.getString('usuario')
            if (
              sponsorUserId &&
              sponsorUserId !== authRecord.id &&
              sponsorUserId !== helperUserId
            ) {
              notifyUser(
                sponsorUserId,
                'pedido_ajuda',
                `Pedido de ajuda no projeto ${proj.getString('codigo')}: ${txtAjuda}`,
                `/projetos/${projId}`,
              )
            }
          }
        } catch (_) {}
      }

      // Administradores
      const admins = e.app.findRecordsByFilter('users', 'role = "admin"', '', 20, 0)
      for (const adm of admins) {
        if (adm.id !== authRecord.id && adm.id !== helperUserId) {
          notifyUser(
            adm.id,
            'pedido_ajuda',
            `[Admin] Pedido de ajuda em meta: ${txtAjuda}`,
            `/projetos/${meta.getString('projeto')}`,
          )
        }
      }
    } catch (errNotif) {
      console.error('Erro ao disparar notificações de pedido de ajuda:', errNotif)
    }
  }

  // C.5 Meta concluída: notificar todos os usuários ativos para o Mural de conquistas
  if (farol === 'concluida') {
    try {
      const allUsers = e.app.findRecordsByFilter('users', '', '', 200, 0)
      const metaCod = meta.getString('codigo')
      const metaNome = meta.getString('titulo')
      for (const u of allUsers) {
        notifyUser(
          u.id,
          'meta_concluida',
          `🎉 Meta concluída: ${metaCod} - ${metaNome}! Confira no Pulso CTX.`,
          '/pulso-ctx',
        )
      }
    } catch (errConcl) {
      console.error('Erro ao notificar meta concluída:', errConcl)
    }
  }

  return e.json(200, {
    success: true,
    avaliacao_id: avaliacao.id,
    meta_status: farol,
  })
})

// 2. Endpoint para Salvar Pulso Semanal em lote para o colaborador
routerAdd('POST', '/backend/v1/ctx/pulsos', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    throw new ForbiddenError('Sessão expirada ou não autenticada.')
  }

  const info = e.requestInfo()
  const body = (info && info.body) || {}

  const cicloId = body.ciclo_id
  const itens = body.itens || [] // Array de { meta_id, resposta: 'avancei'|'sem_avanco'|'travado', bloqueio_texto }

  if (!cicloId || !Array.isArray(itens) || itens.length === 0) {
    throw new BadRequestError('Ciclo e itens de resposta são obrigatórios.')
  }

  const ciclo = e.app.findRecordById('ciclos', cicloId)
  if (!ciclo) throw new BadRequestError('Ciclo não encontrado.')
  if (ciclo.getString('status') !== 'aberto') {
    throw new BadRequestError('Este ciclo de pulso já está fechado.')
  }

  // Identificar colaborador
  let colab = null
  try {
    colab = e.app.findFirstRecordByData('colaboradores', 'usuario', authRecord.id)
  } catch (_) {
    try {
      colab = e.app.findFirstRecordByData('colaboradores', 'email', authRecord.email())
    } catch (_) {}
  }

  const colabId = colab ? colab.id : authRecord.id
  const pulsosCol = e.app.findCollectionByNameOrId('pulsos')

  e.app.runInTransaction((txApp) => {
    for (const item of itens) {
      const metaId = item.meta_id
      const resposta = item.resposta
      const bloqueio = (item.bloqueio_texto || '').trim()
      const feedback = (item.feedback_texto || '').trim()

      if (!metaId || !resposta) continue

      let pulsoRec = null
      try {
        const existing = txApp.findRecordsByFilter(
          'pulsos',
          `ciclo = "${cicloId}" && colaborador = "${colabId}" && meta = "${metaId}"`,
          '',
          1,
          0,
        )
        if (existing.length > 0) pulsoRec = existing[0]
      } catch (_) {}

      if (!pulsoRec) {
        pulsoRec = new Record(pulsosCol)
        pulsoRec.set('ciclo', cicloId)
        pulsoRec.set('colaborador', colabId)
        pulsoRec.set('meta', metaId)
      }

      pulsoRec.set('resposta', resposta)
      pulsoRec.set('bloqueio_texto', bloqueio)
      pulsoRec.set('feedback_texto', feedback)
      txApp.save(pulsoRec)
    }
  })

  return e.json(200, { success: true, total: itens.length })
})

// 3. Endpoint para Adicionar Comentário em Avaliação
// Notifica o colaborador responsável pela avaliação
routerAdd('POST', '/backend/v1/ctx/comentarios', (e) => {
  const authRecord = e.auth
  if (!authRecord) throw new ForbiddenError('Não autenticado.')

  const info = e.requestInfo()
  const body = (info && info.body) || {}
  const avaliacaoId = body.avaliacao_id
  const texto = (body.texto || '').trim()

  if (!avaliacaoId || !texto) {
    throw new BadRequestError('Avaliação e texto do comentário são obrigatórios.')
  }

  const avaliacao = e.app.findRecordById('avaliacoes', avaliacaoId)
  if (!avaliacao) throw new BadRequestError('Avaliação não encontrada.')

  const comentariosCol = e.app.findCollectionByNameOrId('comentarios')
  const coment = new Record(comentariosCol)
  coment.set('avaliacao', avaliacaoId)
  coment.set('autor', authRecord.id)
  coment.set('texto', texto)
  e.app.save(coment)

  // Notificar quem preencheu a avaliação
  try {
    const colabPreencheuId = avaliacao.getString('preenchido_por')
    const colabPreencheu = e.app.findRecordById('colaboradores', colabPreencheuId)
    const destinatarioUserId = colabPreencheu ? colabPreencheu.getString('usuario') : null
    if (destinatarioUserId && destinatarioUserId !== authRecord.id) {
      const meta = e.app.findRecordById('metas', avaliacao.getString('meta'))
      const autorNome = authRecord.getString('name') || 'Alguém'
      const nCol = e.app.findCollectionByNameOrId('notificacoes')
      const nRec = new Record(nCol)
      nRec.set('destinatario', destinatarioUserId)
      nRec.set('tipo', 'comentario')
      nRec.set(
        'texto',
        `💬 ${autorNome} comentou na avaliação da meta ${meta.getString('codigo')}: "${texto.slice(0, 60)}..."`,
      )
      nRec.set('link', '/')
      nRec.set('lida', false)
      e.app.save(nRec)
    }
  } catch (errNotif) {
    console.error('Erro ao notificar comentário:', errNotif)
  }

  return e.json(200, { success: true, comentario_id: coment.id })
})

// 4. Endpoint de Administração: Ativar/Pausar rotina, abrir/fechar ciclo, ajustar datas
routerAdd('POST', '/backend/v1/ctx/admin-rotina', (e) => {
  const authRecord = e.auth
  const isSuper = e.hasSuperuserAuth ? e.hasSuperuserAuth() : false
  let userRole = ''
  let userEmail = ''
  if (authRecord) {
    try {
      userRole =
        authRecord.getString('role') || (authRecord.get ? authRecord.get('role') : '') || ''
    } catch (_) {}
    try {
      userEmail =
        (typeof authRecord.email === 'function'
          ? authRecord.email()
          : authRecord.getString('email')) || ''
    } catch (_) {}
  }
  const isProtectedAdmin = userEmail.toLowerCase() === 'miguel.santiago@ctxcenografia.com.br'
  const isAdmin = isSuper || isProtectedAdmin || userRole === 'admin'
  if (!isAdmin) {
    throw new ForbiddenError('Apenas administradores podem executar esta operação.')
  }

  const info = e.requestInfo()
  const body = (info && info.body) || {}
  const acao = body.acao

  const configCol = e.app.findCollectionByNameOrId('configuracoes')
  let config = null
  try {
    config = e.app.findFirstRecordByData('configuracoes', 'chave', 'geral')
  } catch (_) {
    config = new Record(configCol)
    config.set('chave', 'geral')
    config.set('rotina_ativa', false)
    config.set('pulso_ativo', true)
    e.app.save(config)
  }

  if (acao === 'toggle_rotina' || acao === 'pausar_rotina' || acao === 'reativar_rotina') {
    let novoValor = false
    if (acao === 'pausar_rotina') {
      novoValor = false
    } else if (acao === 'reativar_rotina') {
      novoValor = true
    } else {
      novoValor =
        body.rotina_ativa !== undefined ? !!body.rotina_ativa : !config.getBool('rotina_ativa')
    }
    config.set('rotina_ativa', novoValor)
    e.app.save(config)
    return e.json(200, { success: true, rotina_ativa: novoValor })
  }

  if (acao === 'toggle_pulso' || acao === 'ligar_pulso' || acao === 'desligar_pulso') {
    let novoValor = false
    if (acao === 'ligar_pulso') {
      novoValor = true
    } else if (acao === 'desligar_pulso') {
      novoValor = false
    } else {
      novoValor =
        body.pulso_ativo !== undefined ? !!body.pulso_ativo : !config.getBool('pulso_ativo')
    }
    config.set('pulso_ativo', novoValor)
    e.app.save(config)
    return e.json(200, { success: true, pulso_ativo: novoValor })
  }

  if (acao === 'criar_ciclo') {
    const tipo = body.tipo
    const referencia = (body.referencia || '').trim()
    const titulo = (body.titulo || '').trim()
    const abertura = body.abertura
    const fechamento = body.fechamento

    if (!tipo || !referencia || !abertura || !fechamento) {
      throw new BadRequestError('Tipo, referência, abertura e fechamento são obrigatórios.')
    }

    const ciclosCol = e.app.findCollectionByNameOrId('ciclos')
    let ciclo = null
    try {
      ciclo = e.app.findFirstRecordByData('ciclos', 'referencia', referencia)
    } catch (_) {}

    if (ciclo && ciclo.getString('tipo') === tipo) {
      throw new BadRequestError(
        `Já existe um ciclo do tipo ${tipo} com a referência ${referencia}.`,
      )
    }

    const novoCiclo = new Record(ciclosCol)
    novoCiclo.set('tipo', tipo)
    novoCiclo.set('referencia', referencia)
    novoCiclo.set('titulo', titulo || referencia)
    novoCiclo.set('abertura', abertura)
    novoCiclo.set('fechamento', fechamento)
    novoCiclo.set('status', 'aberto')
    e.app.save(novoCiclo)

    // Notificar colaboradores com metas ativas sobre a abertura do ciclo
    try {
      const metasAtivas = e.app.findRecordsByFilter('metas', 'status != "concluida"', '', 300, 0)
      const userIdsToNotify = new Set()
      for (const m of metasAtivas) {
        const respIds = m.getStringSlice ? m.getStringSlice('responsaveis') : []
        for (const rId of respIds) {
          try {
            const colab = e.app.findRecordById('colaboradores', rId)
            const uId = colab ? colab.getString('usuario') : null
            if (uId) userIdsToNotify.add(uId)
          } catch (_) {}
        }
      }

      const nomeTipo = tipo === 'pulso_semanal' ? 'Pulso semanal' : 'Avaliação mensal'
      const notifCol = e.app.findCollectionByNameOrId('notificacoes')
      for (const uId of userIdsToNotify) {
        const nr = new Record(notifCol)
        nr.set('destinatario', uId)
        nr.set('tipo', 'ciclo_aberto')
        nr.set(
          'texto',
          `Novo ciclo aberto: ${nomeTipo} (${referencia}). Preencha suas metas no Meu Painel!`,
        )
        nr.set('link', '/')
        nr.set('lida', false)
        e.app.save(nr)
      }
    } catch (errNotif) {
      console.error('Erro ao notificar ciclo aberto:', errNotif)
    }

    return e.json(200, { success: true, ciclo_id: novoCiclo.id })
  }

  if (acao === 'fechar_ciclo' || acao === 'reabrir_ciclo') {
    const cicloId = body.ciclo_id
    if (!cicloId) throw new BadRequestError('ID do ciclo obrigatório.')
    let ciclo = null
    try {
      ciclo = e.app.findRecordById('ciclos', cicloId)
    } catch (_) {
      throw new BadRequestError('Ciclo não encontrado.')
    }
    if (!ciclo) throw new BadRequestError('Ciclo não encontrado.')

    const novoStatus = acao === 'fechar_ciclo' ? 'fechado' : 'aberto'
    ciclo.set('status', novoStatus)
    e.app.save(ciclo)
    return e.json(200, { success: true, status: novoStatus })
  }

  if (acao === 'ajustar_datas') {
    const cicloId = body.ciclo_id
    if (!cicloId) throw new BadRequestError('ID do ciclo obrigatório.')
    let ciclo = null
    try {
      ciclo = e.app.findRecordById('ciclos', cicloId)
    } catch (_) {
      throw new BadRequestError('Ciclo não encontrado.')
    }
    if (!ciclo) throw new BadRequestError('Ciclo não encontrado.')

    if (body.abertura) ciclo.set('abertura', body.abertura)
    if (body.fechamento) ciclo.set('fechamento', body.fechamento)
    if (body.titulo !== undefined) ciclo.set('titulo', body.titulo)
    if (body.referencia !== undefined && body.referencia.trim())
      ciclo.set('referencia', body.referencia.trim())
    e.app.save(ciclo)
    return e.json(200, { success: true, ciclo_id: ciclo.id })
  }

  if (acao === 'lembrar_pendentes') {
    const cicloId = body.ciclo_id
    const colabIds = body.colaborador_ids || []
    if (!cicloId) throw new BadRequestError('ID do ciclo obrigatório.')

    let ciclo = null
    try {
      ciclo = e.app.findRecordById('ciclos', cicloId)
    } catch (_) {
      throw new BadRequestError('Ciclo não encontrado.')
    }
    if (!ciclo) throw new BadRequestError('Ciclo não encontrado.')
    const isMensal = ciclo.getString('tipo') === 'avaliacao_mensal'
    let count = 0

    const userIds = new Set()
    for (const cId of colabIds) {
      try {
        const colab = e.app.findRecordById('colaboradores', cId)
        const uId = colab ? colab.getString('usuario') : null
        if (uId) userIds.add(uId)
      } catch (_) {}
    }

    const tipoNome = isMensal ? 'Avaliação mensal' : 'Pulso semanal'
    const notifCol = e.app.findCollectionByNameOrId('notificacoes')
    for (const uId of userIds) {
      const nr = new Record(notifCol)
      nr.set('destinatario', uId)
      nr.set('tipo', 'lembrete')
      nr.set(
        `⚠️ Lembrete: faltam metas a preencher no ciclo de ${tipoNome} (${ciclo.getString('referencia')}). Não deixe para depois!`,
      )
      nr.set('link', '/')
      nr.set('lida', false)
      e.app.save(nr)
      count++
    }

    return e.json(200, { success: true, lembretes_enviados: count })
  }

  throw new BadRequestError('Ação desconhecida.')
})

// 5. Endpoint para Exportar Dados em CSV (Avaliações e Pulsos)
routerAdd('GET', '/backend/v1/ctx/export-csv', (e) => {
  const authRecord = e.auth
  const isSuper = e.hasSuperuserAuth ? e.hasSuperuserAuth() : false
  let userRole = ''
  let userEmail = ''
  if (authRecord) {
    try {
      userRole =
        authRecord.getString('role') || (authRecord.get ? authRecord.get('role') : '') || ''
    } catch (_) {}
    try {
      userEmail =
        (typeof authRecord.email === 'function'
          ? authRecord.email()
          : authRecord.getString('email')) || ''
    } catch (_) {}
  }
  const isProtectedAdmin = userEmail.toLowerCase() === 'miguel.santiago@ctxcenografia.com.br'
  const isAdmin = isSuper || isProtectedAdmin || userRole === 'admin'
  if (!isAdmin) {
    throw new ForbiddenError('Apenas administradores podem exportar dados.')
  }
  const req = e.requestInfo()
  const query = (req && req.query) || {}
  const tipo = query.tipo || 'avaliacoes'
  const cicloId = query.ciclo_id || ''
  const projetoId = query.projeto_id || ''
  const areaId = query.area_id || ''

  e.response.header().set('Content-Type', 'text/csv; charset=utf-8')
  e.response
    .header()
    .set('Content-Disposition', `attachment; filename="ctx_export_${tipo}_${Date.now()}.csv"`)

  let csvContent = '\uFEFF' // UTF-8 BOM

  if (tipo === 'avaliacoes') {
    csvContent +=
      'Ciclo;Referência;Código Meta;Título Meta;Projeto;Área;Preenchido Por;Farol;O que avançou;Próximo Passo;Ajuda Solicitada Para;Ajuda Texto;Ajuda Status;Evidência Link;Data Preenchimento\n'

    let filter = 'id != ""'
    if (cicloId) filter += ` && ciclo = "${cicloId}"`

    const avaliacoes = e.app.findRecordsByFilter('avaliacoes', filter, '-created', 1000, 0)
    for (const a of avaliacoes) {
      try {
        const meta = e.app.findRecordById('metas', a.getString('meta'))
        const ciclo = e.app.findRecordById('ciclos', a.getString('ciclo'))
        const colab = e.app.findRecordById('colaboradores', a.getString('preenchido_por'))

        if (
          projetoId &&
          meta.getString('projeto') !== projetoId &&
          meta.getString('projeto_secundario') !== projetoId
        ) {
          continue
        }
        if (areaId && colab && colab.getString('area') !== areaId) {
          continue
        }

        let projNome = ''
        try {
          const proj = e.app.findRecordById('projetos_estrategicos', meta.getString('projeto'))
          projNome = proj.getString('nome')
        } catch (_) {}

        let ajudaNome = ''
        const ajudaId = a.getString('ajuda_colaborador')
        if (ajudaId) {
          try {
            const h = e.app.findRecordById('colaboradores', ajudaId)
            ajudaNome = h.getString('nome')
          } catch (_) {}
        }

        let areaNome = ''
        if (colab && colab.getString('area')) {
          try {
            const areaRec = e.app.findRecordById('areas', colab.getString('area'))
            areaNome = areaRec.getString('nome')
          } catch (_) {}
        }

        const safe = (val) =>
          `"${String(val || '')
            .replace(/"/g, '""')
            .replace(/\n/g, ' ')}"`

        const rawFarol = a.getString('farol')
        const farolLabel =
          rawFarol === 'verde'
            ? 'No ritmo'
            : rawFarol === 'vermelho'
              ? 'Travado'
              : rawFarol === 'atencao'
                ? 'Atenção'
                : rawFarol === 'concluida'
                  ? 'Concluída'
                  : rawFarol

        csvContent +=
          [
            safe(ciclo ? ciclo.getString('titulo') : ''),
            safe(ciclo ? ciclo.getString('referencia') : ''),
            safe(meta.getString('codigo')),
            safe(meta.getString('titulo')),
            safe(projNome),
            safe(areaNome),
            safe(colab ? colab.getString('nome') : ''),
            safe(farolLabel),
            safe(a.getString('avancou')),
            safe(a.getString('proximo_passo')),
            safe(ajudaNome),
            safe(a.getString('ajuda_texto')),
            safe(a.getString('ajuda_status')),
            safe(a.getString('evidencia_link')),
            safe(a.getString('created')),
          ].join(';') + '\n'
      } catch (errRow) {}
    }
  } else {
    csvContent +=
      'Ciclo;Referência;Código Meta;Título Meta;Colaborador;Área;Resposta;Bloqueio;Feedback;Data\n'
    let filter = 'id != ""'
    if (cicloId) filter += ` && ciclo = "${cicloId}"`

    const pulsos = e.app.findRecordsByFilter('pulsos', filter, '-created', 2000, 0)
    for (const p of pulsos) {
      try {
        const meta = e.app.findRecordById('metas', p.getString('meta'))
        const ciclo = e.app.findRecordById('ciclos', p.getString('ciclo'))
        const colab = e.app.findRecordById('colaboradores', p.getString('colaborador'))

        if (
          projetoId &&
          meta.getString('projeto') !== projetoId &&
          meta.getString('projeto_secundario') !== projetoId
        ) {
          continue
        }
        if (areaId && colab && colab.getString('area') !== areaId) {
          continue
        }

        let areaNome = ''
        if (colab && colab.getString('area')) {
          try {
            const areaRec = e.app.findRecordById('areas', colab.getString('area'))
            areaNome = areaRec.getString('nome')
          } catch (_) {}
        }

        const safe = (val) =>
          `"${String(val || '')
            .replace(/"/g, '""')
            .replace(/\n/g, ' ')}"`

        csvContent +=
          [
            safe(ciclo ? ciclo.getString('titulo') : ''),
            safe(ciclo ? ciclo.getString('referencia') : ''),
            safe(meta.getString('codigo')),
            safe(meta.getString('titulo')),
            safe(colab ? colab.getString('nome') : ''),
            safe(areaNome),
            safe(p.getString('resposta')),
            safe(p.getString('bloqueio_texto')),
            safe(p.getString('feedback_texto')),
            safe(p.getString('created')),
          ].join(';') + '\n'
      } catch (errRow) {}
    }
  }

  return e.string(200, csvContent)
})

// 6. Cron automação: roda todo dia às 06h UTC
cronAdd('rotina_ciclos_automation', '0 6 * * *', (e) => {
  try {
    let config = null
    try {
      config = e.app.findFirstRecordByData('configuracoes', 'chave', 'geral')
    } catch (_) {
      return
    }

    if (!config || !config.getBool('rotina_ativa')) {
      return
    }

    const agora = new Date()
    const diaMes = agora.getUTCDate()
    const diaSemana = agora.getUTCDay()
    const ano = agora.getUTCFullYear()
    const mes = agora.getUTCMonth() + 1

    const ciclosCol = e.app.findCollectionByNameOrId('ciclos')

    // A. Pulso semanal se pulso_ativo (abre na segunda)
    if (config.getBool('pulso_ativo') && diaSemana === 1) {
      const inicioAno = new Date(Date.UTC(ano, 0, 1))
      const dias = Math.floor((agora - inicioAno) / (24 * 60 * 60 * 1000))
      const semanaNum = Math.ceil((dias + inicioAno.getUTCDay() + 1) / 7)
      const refSemana = `${ano}-S${semanaNum < 10 ? '0' + semanaNum : semanaNum}`

      let existing = null
      try {
        existing = e.app.findFirstRecordByData('ciclos', 'referencia', refSemana)
      } catch (_) {}

      if (!existing) {
        const abertura = new Date(Date.UTC(ano, mes - 1, diaMes, 8, 0, 0))
        const fechamento = new Date(Date.UTC(ano, mes - 1, diaMes + 4, 21, 0, 0))

        const c = new Record(ciclosCol)
        c.set('tipo', 'pulso_semanal')
        c.set('referencia', refSemana)
        c.set('titulo', `Pulso Semanal ${refSemana}`)
        c.set('abertura', abertura.toISOString())
        c.set('fechamento', fechamento.toISOString())
        c.set('status', 'aberto')
        e.app.save(c)
      }
    }

    // B. Avaliação mensal: abre dia 25 e fecha dia 5 do mês seguinte
    if (diaMes === 25) {
      const refMes = `${ano}-${mes < 10 ? '0' + mes : mes}`
      let existing = null
      try {
        existing = e.app.findFirstRecordByData('ciclos', 'referencia', refMes)
      } catch (_) {}

      if (!existing) {
        const abertura = new Date(Date.UTC(ano, mes - 1, 25, 8, 0, 0))
        const proxMes = mes === 12 ? 1 : mes + 1
        const proxAno = mes === 12 ? ano + 1 : ano
        const fechamento = new Date(Date.UTC(proxAno, proxMes - 1, 5, 23, 59, 59))

        const c = new Record(ciclosCol)
        c.set('tipo', 'avaliacao_mensal')
        c.set('referencia', refMes)
        c.set('titulo', `Avaliação Mensal ${refMes}`)
        c.set('abertura', abertura.toISOString())
        c.set('fechamento', fechamento.toISOString())
        c.set('status', 'aberto')
        e.app.save(c)
      }
    }

    // C. Fechamento automático de ciclos vencidos
    const abertos = e.app.findRecordsByFilter('ciclos', 'status = "aberto"', '', 50, 0)
    for (const c of abertos) {
      const fech = new Date(c.getString('fechamento'))
      if (agora > fech) {
        c.set('status', 'fechado')
        e.app.save(c)
      }
    }
  } catch (errCron) {
    console.error('Erro no cron rotina_ciclos_automation:', errCron)
  }
})
