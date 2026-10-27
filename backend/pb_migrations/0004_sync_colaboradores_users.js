/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Sincronizar as 21 contas de usuários e ligar aos colaboradores
    const colabsCol = app.findCollectionByNameOrId('colaboradores')
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // Obter colaboradores existentes
    const colabs = app.findAllRecords('colaboradores')

    for (const c of colabs) {
      const email = (c.getString('email') || '').trim().toLowerCase()
      const nome = c.getString('nome') || ''
      const cargo = c.getString('cargo') || ''
      const areaId = c.getString('area') || ''

      if (!email) continue

      let userRecord = null
      try {
        userRecord = app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {
        userRecord = null
      }

      if (!userRecord) {
        userRecord = new Record(usersCol)
        userRecord.setEmail(email)
        userRecord.setPassword('CTX@2027')
        userRecord.setVerified(true)
        userRecord.set('name', nome)
        userRecord.set('cargo', cargo)
        userRecord.set('area', areaId)
        userRecord.set(
          'role',
          email === 'miguel.santiago@ctxcenografia.com.br' ? 'admin' : 'colaborador',
        )
        userRecord.set(
          'must_change_password',
          email === 'miguel.santiago@ctxcenografia.com.br' ? false : true,
        )
        app.save(userRecord)
      } else {
        userRecord.set('name', nome)
        if (cargo) userRecord.set('cargo', cargo)
        if (areaId) userRecord.set('area', areaId)
        userRecord.setVerified(true)
        if (email === 'miguel.santiago@ctxcenografia.com.br') {
          userRecord.set('role', 'admin')
          userRecord.set('must_change_password', false)
        }
        app.save(userRecord)
      }

      // Vincular colaborador ao usuário
      if (userRecord && c.getString('usuario') !== userRecord.id) {
        c.set('usuario', userRecord.id)
        app.save(c)
      }
    }
  },
  (app) => {
    // down migration
  },
)
