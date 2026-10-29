// 0011 — Reaplica as regras de segurança da coleção users (as mesmas da 0010)
// O PocketBase roda as migrações em ordem alfabética: "updated_users.js" (sem número) roda depois
// da 0010 e regravava as regras antigas, deixando um colaborador mudar o próprio "role" para admin.
// Num banco que já aplicou "updated_users.js" (o do Fly.io), esta migração corrige as regras.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.createRule = "@request.auth.role = 'admin'"
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || (id = @request.auth.id && @request.body.role:isset = false))"
    users.deleteRule = "@request.auth.role = 'admin'"
    app.save(users)
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
