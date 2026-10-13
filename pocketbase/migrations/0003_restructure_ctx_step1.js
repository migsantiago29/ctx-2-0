migrate(
  (app) => {
    // ========================================================
    // 1. Limpeza de registros genéricos das tabelas anteriores
    // ========================================================
    const tablesToClean = [
      'processos',
      'indicadores',
      'metas',
      'projetos_estrategicos',
      'fluxograma',
      'areas',
    ]

    for (const t of tablesToClean) {
      try {
        if (app.hasTable(t)) {
          app.db().newQuery(`DELETE FROM ${t}`).execute()
        }
      } catch (_) {}
    }

    // Apagar os 10 usuários fictícios (manter apenas miguel.santiago@ctxcenografia.com.br)
    try {
      app
        .db()
        .newQuery("DELETE FROM users WHERE email != 'miguel.santiago@ctxcenografia.com.br'")
        .execute()
    } catch (_) {}

    // ========================================================
    // 2. Atualizar a coleção users (cargo, role, must_change_password)
    // ========================================================
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!usersCol.fields.getByName('cargo')) {
      usersCol.fields.add(new TextField({ name: 'cargo' }))
    }
    if (!usersCol.fields.getByName('role')) {
      usersCol.fields.add(
        new SelectField({
          name: 'role',
          values: ['colaborador', 'admin'],
          maxSelect: 1,
        }),
      )
    }
    if (!usersCol.fields.getByName('must_change_password')) {
      usersCol.fields.add(new BoolField({ name: 'must_change_password' }))
    }

    // Regras de acesso
    usersCol.listRule = "@request.auth.id != ''"
    usersCol.viewRule = "@request.auth.id != ''"
    usersCol.createRule = "@request.auth.role = 'admin' || @request.auth.id != ''"
    usersCol.updateRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    app.save(usersCol)

    // Conceder role "admin" para miguel.santiago@ctxcenografia.com.br
    try {
      app
        .db()
        .newQuery(
          "UPDATE users SET role = 'admin', must_change_password = 0 WHERE email = 'miguel.santiago@ctxcenografia.com.br'",
        )
        .execute()
    } catch (_) {}

    // ========================================================
    // 3. Atualizar coleção areas: ordem_no_fluxo, tipo, regras de API
    // ========================================================
    const areasCol = app.findCollectionByNameOrId('areas')
    if (!areasCol.fields.getByName('ordem_no_fluxo')) {
      areasCol.fields.add(new NumberField({ name: 'ordem_no_fluxo', onlyInt: true }))
    }
    if (!areasCol.fields.getByName('tipo')) {
      areasCol.fields.add(
        new SelectField({
          name: 'tipo',
          values: ['área', 'grupo de processos'],
          maxSelect: 1,
        }),
      )
    }
    areasCol.listRule = "@request.auth.id != ''"
    areasCol.viewRule = "@request.auth.id != ''"
    areasCol.createRule = "@request.auth.id != ''"
    areasCol.updateRule = "@request.auth.id != ''"
    areasCol.deleteRule = "@request.auth.id != ''"
    app.save(areasCol)

    // ========================================================
    // 4. Nova coleção colaboradores: codigo, nome, cargo, area, email, sem_metas, usuario
    // ========================================================
    let colabCol
    try {
      colabCol = app.findCollectionByNameOrId('colaboradores')
    } catch (_) {
      colabCol = new Collection({
        name: 'colaboradores',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'codigo', type: 'text', required: true },
          { name: 'nome', type: 'text', required: true },
          { name: 'cargo', type: 'text' },
          {
            name: 'area',
            type: 'relation',
            collectionId: areasCol.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
          { name: 'email', type: 'text' },
          { name: 'sem_metas', type: 'bool' },
          {
            name: 'usuario',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
            cascadeDelete: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_colaboradores_codigo ON colaboradores (codigo)',
          'CREATE INDEX idx_colaboradores_email ON colaboradores (email)',
        ],
      })
      app.save(colabCol)
    }

    // ========================================================
    // 5. Reestruturar coleção processos
    // ========================================================
    const procCol = app.findCollectionByNameOrId('processos')
    // Remover índices antigos que apontavam para 'meta' e 'status'
    try {
      procCol.removeIndex('idx_processos_meta')
    } catch (_) {}
    try {
      procCol.removeIndex('idx_processos_status')
    } catch (_) {}

    // Remover campos antigos: meta, status
    if (procCol.fields.getByName('meta')) {
      procCol.fields.removeByName('meta')
    }
    if (procCol.fields.getByName('status')) {
      procCol.fields.removeByName('status')
    }

    // Adicionar novos campos: codigo, area (texto), etapas_anteriores, etapas_sucessoras, observacao
    if (!procCol.fields.getByName('codigo')) {
      procCol.fields.add(new TextField({ name: 'codigo', required: true }))
    }
    if (!procCol.fields.getByName('area')) {
      procCol.fields.add(new TextField({ name: 'area', required: true }))
    }
    if (!procCol.fields.getByName('observacao')) {
      procCol.fields.add(new TextField({ name: 'observacao' }))
    }
    if (!procCol.fields.getByName('etapas_anteriores')) {
      procCol.fields.add(
        new RelationField({
          name: 'etapas_anteriores',
          collectionId: procCol.id,
          maxSelect: 50,
          cascadeDelete: false,
        }),
      )
    }
    if (!procCol.fields.getByName('etapas_sucessoras')) {
      procCol.fields.add(
        new RelationField({
          name: 'etapas_sucessoras',
          collectionId: procCol.id,
          maxSelect: 50,
          cascadeDelete: false,
        }),
      )
    }

    // Ajustar regras da coleção processos
    procCol.listRule = "@request.auth.id != ''"
    procCol.viewRule = "@request.auth.id != ''"
    procCol.createRule = "@request.auth.id != ''"
    procCol.updateRule = "@request.auth.id != ''"
    procCol.deleteRule = "@request.auth.id != ''"
    procCol.addIndex('idx_processos_codigo', true, 'codigo', '')
    procCol.addIndex('idx_processos_area', false, 'area', '')
    app.save(procCol)

    // ========================================================
    // 6. Remover coleção fluxograma que deixa de ser usada
    // ========================================================
    try {
      const fluxCol = app.findCollectionByNameOrId('fluxograma')
      app.delete(fluxCol)
    } catch (_) {}
  },
  (app) => {
    // Reversão opcional
  },
)
