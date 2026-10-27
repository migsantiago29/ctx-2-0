migrate(
  (app) => {
    // 1. Atualizar regras da coleção ciclos para permitir updates e criações por administradores
    // e fallback por email protegido
    try {
      const ciclosCol = app.findCollectionByNameOrId('ciclos')
      if (ciclosCol) {
        ciclosCol.listRule = "@request.auth.id != ''"
        ciclosCol.viewRule = "@request.auth.id != ''"
        ciclosCol.createRule =
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'miguel.santiago@ctxcenografia.com.br')"
        ciclosCol.updateRule =
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'miguel.santiago@ctxcenografia.com.br')"
        ciclosCol.deleteRule =
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'miguel.santiago@ctxcenografia.com.br')"
        app.save(ciclosCol)
      }
    } catch (errCiclos) {
      console.log('Erro ao atualizar regras da colecao ciclos:', errCiclos)
    }

    // 2. Atualizar regras da coleção configuracoes
    try {
      const configCol = app.findCollectionByNameOrId('configuracoes')
      if (configCol) {
        configCol.listRule = "@request.auth.id != ''"
        configCol.viewRule = "@request.auth.id != ''"
        configCol.createRule =
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'miguel.santiago@ctxcenografia.com.br')"
        configCol.updateRule =
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'miguel.santiago@ctxcenografia.com.br')"
        configCol.deleteRule =
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'miguel.santiago@ctxcenografia.com.br')"
        app.save(configCol)
      }
    } catch (errCfg) {
      console.log('Erro ao atualizar regras da colecao configuracoes:', errCfg)
    }

    // 3. Garantir que miguel.santiago@ctxcenografia.com.br tem role 'admin'
    try {
      app
        .db()
        .newQuery(
          "UPDATE users SET role = 'admin' WHERE email = 'miguel.santiago@ctxcenografia.com.br'",
        )
        .execute()
    } catch (_) {}
  },
  (app) => {
    // Reversão
    try {
      const ciclosCol = app.findCollectionByNameOrId('ciclos')
      if (ciclosCol) {
        ciclosCol.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
        ciclosCol.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
        ciclosCol.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
        app.save(ciclosCol)
      }
    } catch (_) {}

    try {
      const configCol = app.findCollectionByNameOrId('configuracoes')
      if (configCol) {
        configCol.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
        configCol.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
        configCol.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
        app.save(configCol)
      }
    } catch (_) {}
  },
)
