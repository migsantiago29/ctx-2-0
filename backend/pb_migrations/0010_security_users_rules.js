// 0010 — Segurança da coleção users (migração para hospedagem própria)
// - Colaborador pode editar o próprio cadastro, mas NÃO o campo "role" (evita virar admin sozinho)
// - Só administradores criam ou excluem contas
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.createRule = "@request.auth.role = 'admin'"
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || (id = @request.auth.id && @request.body.role:isset = false))"
    users.deleteRule = "@request.auth.role = 'admin'"
    app.save(users)

    // A conta do Miguel é criada pela migração 0002 com a senha de demonstração do Skip,
    // que está no código. Obriga a troca dessa senha no primeiro login.
    try {
      const miguel = app.findAuthRecordByEmail('_pb_users_auth_', 'miguel.santiago@ctxcenografia.com.br')
      miguel.set('must_change_password', true)
      app.save(miguel)
    } catch (_) {}
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.createRule = "@request.auth.role = 'admin' || @request.auth.id != ''"
    users.updateRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.deleteRule = 'id = @request.auth.id'
    app.save(users)
  },
)
