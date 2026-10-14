migrate(
  (app) => {
    // Criação da coleção fluxograma_posicoes para armazenar posições personalizadas X/Y
    // Definida pelo administrador no Editor de Diagrama.
    const collection = new Collection({
      name: 'fluxograma_posicoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'processo_id', type: 'text', required: true },
        { name: 'processo_codigo', type: 'text', required: true },
        { name: 'x', type: 'number', required: true },
        { name: 'y', type: 'number', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_fluxograma_posicoes_id ON fluxograma_posicoes (processo_id)',
        'CREATE INDEX idx_fluxograma_posicoes_cod ON fluxograma_posicoes (processo_codigo)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fluxograma_posicoes')
      app.delete(col)
    } catch (_) {}
  },
)
