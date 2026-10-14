// pocketbase/hooks/fluxograma.js
// Endpoints server-side para persistência e limpeza atômica da disposição do fluxograma
// Evita 429 Too Many Requests do client rate-limiter ao salvar 180+ nós individualmente,
// garante atomicidade transacional e validação segura de perfil admin.

routerAdd('POST', '/backend/v1/ctx/fluxograma/save-positions', (e) => {
  // 1. Checar autenticação de admin ou superuser
  const authRecord = e.auth
  const isSuper = e.hasSuperuserAuth ? e.hasSuperuserAuth() : false
  const isAdmin =
    authRecord && (authRecord.get('role') === 'admin' || authRecord.getString('role') === 'admin')

  if (!isSuper && !isAdmin) {
    throw new ForbiddenError('Apenas administradores podem alterar a disposição do fluxograma.')
  }

  // 2. Extrair payload
  const info = e.requestInfo()
  const body = (info && info.body) || {}
  const positions = body.positions

  if (!Array.isArray(positions)) {
    throw new BadRequestError('O campo "positions" deve ser um array com as posições dos nós.')
  }

  // 3. Executar em transação para garantir atomicidade e consistência
  e.app.runInTransaction((txApp) => {
    const col = txApp.findCollectionByNameOrId('fluxograma_posicoes')

    // Truncar ou deletar posições existentes para evitar duplicidade ou inconsistências
    // Como queremos upsert limpo de toda a disposição ativa do diagrama:
    txApp.db().newQuery('DELETE FROM fluxograma_posicoes').execute()

    // Inserir as novas posições
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      if (!p) continue
      const procId = String(p.processo_id || '').trim()
      const procCodigo = String(p.processo_codigo || '').trim()
      const x = typeof p.x === 'number' ? p.x : parseFloat(p.x)
      const y = typeof p.y === 'number' ? p.y : parseFloat(p.y)

      if (!procId || isNaN(x) || isNaN(y)) {
        continue
      }

      const record = new Record(col)
      record.set('processo_id', procId)
      record.set('processo_codigo', procCodigo)
      record.set('x', Math.round(x))
      record.set('y', Math.round(y))
      txApp.save(record)
    }
  })

  return e.json(200, {
    success: true,
    count: positions.length,
    message: 'Disposição do fluxograma salva com sucesso!',
  })
})

routerAdd('POST', '/backend/v1/ctx/fluxograma/reset-positions', (e) => {
  // 1. Checar autenticação de admin ou superuser
  const authRecord = e.auth
  const isSuper = e.hasSuperuserAuth ? e.hasSuperuserAuth() : false
  const isAdmin =
    authRecord && (authRecord.get('role') === 'admin' || authRecord.getString('role') === 'admin')

  if (!isSuper && !isAdmin) {
    throw new ForbiddenError(
      'Apenas administradores podem restaurar a disposição automática do fluxograma.',
    )
  }

  // 2. Deletar todas as posições salvas
  e.app.runInTransaction((txApp) => {
    txApp.db().newQuery('DELETE FROM fluxograma_posicoes').execute()
  })

  return e.json(200, {
    success: true,
    message: 'Disposição automática restaurada com sucesso!',
  })
})
