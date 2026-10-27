migrate(
  (app) => {
    // 1. projetos_estrategicos
    const projetos = new Collection({
      name: 'projetos_estrategicos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_projetos_estrategicos_nome ON projetos_estrategicos (nome)',
      ],
    })
    app.save(projetos)
    const projetosId = app.findCollectionByNameOrId('projetos_estrategicos').id

    // 2. metas
    const metas = new Collection({
      name: 'metas',
      type: 'base',
      listRule: 'owner = @request.auth.id',
      viewRule: 'owner = @request.auth.id',
      createRule: 'owner = @request.auth.id',
      updateRule: 'owner = @request.auth.id',
      deleteRule: 'owner = @request.auth.id',
      fields: [
        { name: 'titulo', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        {
          name: 'projeto',
          type: 'relation',
          required: true,
          collectionId: projetosId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          values: ['em andamento', 'concluida', 'atrasada'],
          maxSelect: 1,
        },
        { name: 'timeframe', type: 'text' },
        { name: 'progresso', type: 'number', min: 0, max: 100 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_metas_owner ON metas (owner)',
        'CREATE INDEX idx_metas_projeto ON metas (projeto)',
        'CREATE INDEX idx_metas_status ON metas (status)',
      ],
    })
    app.save(metas)
    const metasId = app.findCollectionByNameOrId('metas').id

    // 3. indicadores
    const indicadores = new Collection({
      name: 'indicadores',
      type: 'base',
      listRule: 'meta.owner = @request.auth.id',
      viewRule: 'meta.owner = @request.auth.id',
      createRule: 'meta.owner = @request.auth.id',
      updateRule: 'meta.owner = @request.auth.id',
      deleteRule: 'meta.owner = @request.auth.id',
      fields: [
        {
          name: 'meta',
          type: 'relation',
          required: true,
          collectionId: metasId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true },
        { name: 'valor_atual', type: 'number' },
        { name: 'valor_meta', type: 'number' },
        {
          name: 'tendencia',
          type: 'select',
          values: ['subindo', 'descendo', 'estavel'],
          maxSelect: 1,
        },
        { name: 'historico', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_indicadores_meta ON indicadores (meta)'],
    })
    app.save(indicadores)

    // 4. processos
    const processos = new Collection({
      name: 'processos',
      type: 'base',
      listRule: 'meta.owner = @request.auth.id',
      viewRule: 'meta.owner = @request.auth.id',
      createRule: 'meta.owner = @request.auth.id',
      updateRule: 'meta.owner = @request.auth.id',
      deleteRule: 'meta.owner = @request.auth.id',
      fields: [
        {
          name: 'meta',
          type: 'relation',
          required: true,
          collectionId: metasId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true },
        { name: 'status', type: 'select', values: ['pendente', 'concluido'], maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_processos_meta ON processos (meta)',
        'CREATE INDEX idx_processos_status ON processos (status)',
      ],
    })
    app.save(processos)

    // 5. fluxograma
    const fluxograma = new Collection({
      name: 'fluxograma',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'ordem', type: 'number', required: true, onlyInt: true },
        { name: 'etapa', type: 'text', required: true },
        { name: 'area', type: 'text', required: true },
        { name: 'evidencia', type: 'text' },
        { name: 'subpassos', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_fluxograma_ordem ON fluxograma (ordem)'],
    })
    app.save(fluxograma)

    // 6. areas
    const areas = new Collection({
      name: 'areas',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_areas_nome ON areas (nome)'],
    })
    app.save(areas)

    // Add area field to users collection if not present so each collaborator can be linked to their area
    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      if (!usersCol.fields.getByName('area')) {
        usersCol.fields.add(new TextField({ name: 'area' }))
        app.save(usersCol)
      }
    } catch (_) {}
  },
  (app) => {
    const toDelete = [
      'processos',
      'indicadores',
      'metas',
      'projetos_estrategicos',
      'fluxograma',
      'areas',
    ]
    for (const name of toDelete) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    }
  },
)
