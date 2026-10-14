migrate(
  (app) => {
    // Buscar coleções necessárias para relações
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const colabCol = app.findCollectionByNameOrId('colaboradores')
    const metasCol = app.findCollectionByNameOrId('metas')

    // 1. Atualizar opções de status na coleção metas para aceitar faróis:
    // ['sem atualização', 'em andamento', 'concluida', 'atrasada', 'verde', 'atencao', 'vermelho']
    if (metasCol) {
      if (metasCol.fields.getByName('status')) {
        metasCol.fields.removeByName('status')
      }
      metasCol.fields.add(
        new SelectField({
          name: 'status',
          values: [
            'sem atualização',
            'verde',
            'atencao',
            'vermelho',
            'concluida',
            'em andamento',
            'atrasada',
          ],
          maxSelect: 1,
        }),
      )
      metasCol.listRule = "@request.auth.id != ''"
      metasCol.viewRule = "@request.auth.id != ''"
      metasCol.createRule = "@request.auth.id != ''"
      metasCol.updateRule = "@request.auth.id != ''"
      metasCol.deleteRule = "@request.auth.id != ''"
      app.save(metasCol)
    }

    // 2. Collection: configuracoes
    if (!app.hasTable('configuracoes')) {
      const configCol = new Collection({
        name: 'configuracoes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'chave', type: 'text', required: true },
          { name: 'rotina_ativa', type: 'bool' },
          { name: 'pulso_ativo', type: 'bool' },
          { name: 'valor', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_configuracoes_chave ON configuracoes (chave)'],
      })
      app.save(configCol)

      // Criar registro padrão de configuração: rotina desligada por padrão
      try {
        const record = new Record(configCol)
        record.set('chave', 'geral')
        record.set('rotina_ativa', false)
        record.set('pulso_ativo', true)
        app.save(record)
      } catch (_) {}
    }

    // 3. Collection: ciclos
    // tipo: 'pulso_semanal' | 'avaliacao_mensal'
    // referencia: ex "2026-11" ou "2026-S45"
    // abertura: date
    // fechamento: date
    // status: 'aberto' | 'fechado'
    if (!app.hasTable('ciclos')) {
      const ciclosCol = new Collection({
        name: 'ciclos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['pulso_semanal', 'avaliacao_mensal'],
            maxSelect: 1,
          },
          { name: 'referencia', type: 'text', required: true },
          { name: 'titulo', type: 'text' },
          { name: 'abertura', type: 'date', required: true },
          { name: 'fechamento', type: 'date', required: true },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['aberto', 'fechado'],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_ciclos_tipo_ref ON ciclos (tipo, referencia)',
          'CREATE INDEX idx_ciclos_status ON ciclos (status)',
        ],
      })
      app.save(ciclosCol)
    }

    const ciclosCol = app.findCollectionByNameOrId('ciclos')

    // 4. Collection: avaliacoes
    // Farol: Verde ("no ritmo para cumprir no prazo"), Atencao ("em risco, mas com plano"), Vermelho ("não cumpre sem ajuda ou decisão"), Concluida ("critério da meta atingido")
    if (!app.hasTable('avaliacoes')) {
      const avaliacoesCol = new Collection({
        name: 'avaliacoes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          {
            name: 'ciclo',
            type: 'relation',
            required: true,
            collectionId: ciclosCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'meta',
            type: 'relation',
            required: true,
            collectionId: metasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'preenchido_por',
            type: 'relation',
            required: true,
            collectionId: colabCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'farol',
            type: 'select',
            required: true,
            values: ['verde', 'atencao', 'vermelho', 'concluida'],
            maxSelect: 1,
          },
          { name: 'avancou', type: 'text', required: true },
          { name: 'proximo_passo', type: 'text', required: true },
          {
            name: 'ajuda_colaborador',
            type: 'relation',
            collectionId: colabCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'ajuda_texto', type: 'text' },
          {
            name: 'ajuda_status',
            type: 'select',
            values: ['aberto', 'resolvido'],
            maxSelect: 1,
          },
          { name: 'evidencia_link', type: 'text' },
          {
            name: 'evidencia_arquivo',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760, // 10MB
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_avaliacoes_ciclo_meta ON avaliacoes (ciclo, meta)',
          'CREATE INDEX idx_avaliacoes_farol ON avaliacoes (farol)',
          'CREATE INDEX idx_avaliacoes_ajuda ON avaliacoes (ajuda_status)',
        ],
      })
      app.save(avaliacoesCol)
    }

    const avaliacoesCol = app.findCollectionByNameOrId('avaliacoes')

    // 5. Collection: pulsos
    if (!app.hasTable('pulsos')) {
      const pulsosCol = new Collection({
        name: 'pulsos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          {
            name: 'ciclo',
            type: 'relation',
            required: true,
            collectionId: ciclosCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'colaborador',
            type: 'relation',
            required: true,
            collectionId: colabCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'meta',
            type: 'relation',
            required: true,
            collectionId: metasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'resposta',
            type: 'select',
            required: true,
            values: ['avancei', 'sem_avanco', 'travado'],
            maxSelect: 1,
          },
          { name: 'bloqueio_texto', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_pulsos_ciclo_colab_meta ON pulsos (ciclo, colaborador, meta)',
          'CREATE INDEX idx_pulsos_resposta ON pulsos (resposta)',
        ],
      })
      app.save(pulsosCol)
    }

    // 6. Collection: comentarios
    if (!app.hasTable('comentarios')) {
      const comentariosCol = new Collection({
        name: 'comentarios',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && autor = @request.auth.id",
        deleteRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || autor = @request.auth.id)",
        fields: [
          {
            name: 'avaliacao',
            type: 'relation',
            required: true,
            collectionId: avaliacoesCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'autor',
            type: 'relation',
            required: true,
            collectionId: usersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'texto', type: 'text', required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_comentarios_avaliacao ON comentarios (avaliacao)'],
      })
      app.save(comentariosCol)
    }

    // 7. Collection: notificacoes
    // tipo: 'ciclo_aberto' | 'lembrete' | 'pedido_ajuda' | 'comentario' | 'meta_concluida'
    if (!app.hasTable('notificacoes')) {
      const notificacoesCol = new Collection({
        name: 'notificacoes',
        type: 'base',
        listRule: "@request.auth.id != '' && destinatario = @request.auth.id",
        viewRule: "@request.auth.id != '' && destinatario = @request.auth.id",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && destinatario = @request.auth.id",
        deleteRule: "@request.auth.id != '' && destinatario = @request.auth.id",
        fields: [
          {
            name: 'destinatario',
            type: 'relation',
            required: true,
            collectionId: usersCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['ciclo_aberto', 'lembrete', 'pedido_ajuda', 'comentario', 'meta_concluida'],
            maxSelect: 1,
          },
          { name: 'texto', type: 'text', required: true },
          { name: 'link', type: 'text' },
          { name: 'lida', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_notificacoes_dest_lida ON notificacoes (destinatario, lida, created DESC)',
        ],
      })
      app.save(notificacoesCol)
    }
  },
  (app) => {
    const toDelete = [
      'notificacoes',
      'comentarios',
      'pulsos',
      'avaliacoes',
      'ciclos',
      'configuracoes',
    ]
    for (const name of toDelete) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    }
  },
)
