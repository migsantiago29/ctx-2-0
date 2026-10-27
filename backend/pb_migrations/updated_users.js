// pocketbase/migrations/updated_users.js
// Migração inicial de atualização do schema da coleção padrão users (_pb_users_auth_)
// Adiciona os campos de apoio de perfil utilizados pela aplicação CTX Cenografia

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('area')) {
      users.fields.add(new TextField({ name: 'area' }))
    }

    if (!users.fields.getByName('cargo')) {
      users.fields.add(new TextField({ name: 'cargo' }))
    }

    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          values: ['colaborador', 'admin'],
          maxSelect: 1,
        }),
      )
    }

    if (!users.fields.getByName('must_change_password')) {
      users.fields.add(new BoolField({ name: 'must_change_password' }))
    }

    // Regras de acesso padrão para users
    users.listRule = "@request.auth.id != ''"
    users.viewRule = "@request.auth.id != ''"
    users.createRule = "@request.auth.role = 'admin' || @request.auth.id != ''"
    users.updateRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.deleteRule = 'id = @request.auth.id'

    app.save(users)
  },
  (app) => {
    // Reversão
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      if (users.fields.getByName('must_change_password'))
        users.fields.removeByName('must_change_password')
      if (users.fields.getByName('role')) users.fields.removeByName('role')
      if (users.fields.getByName('cargo')) users.fields.removeByName('cargo')
      if (users.fields.getByName('area')) users.fields.removeByName('area')
      app.save(users)
    } catch (_) {}
  },
)
