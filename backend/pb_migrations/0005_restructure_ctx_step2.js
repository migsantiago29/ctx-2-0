migrate(
  (app) => {
    const colabCol = app.findCollectionByNameOrId('colaboradores')
    const procCol = app.findCollectionByNameOrId('processos')
    const projCol = app.findCollectionByNameOrId('projetos_estrategicos')
    const metasCol = app.findCollectionByNameOrId('metas')
    const indCol = app.findCollectionByNameOrId('indicadores')

    // ==========================================================
    // 1. projetos_estrategicos
    //    - codigo (texto único, ex. P1..P5)
    //    - sponsor (relação com colaboradores)
    // ==========================================================
    if (!projCol.fields.getByName('codigo')) {
      projCol.fields.add(new TextField({ name: 'codigo', required: true }))
    }
    if (!projCol.fields.getByName('sponsor')) {
      projCol.fields.add(
        new RelationField({
          name: 'sponsor',
          collectionId: colabCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }
    projCol.listRule = "@request.auth.id != ''"
    projCol.viewRule = "@request.auth.id != ''"
    projCol.createRule = "@request.auth.id != ''"
    projCol.updateRule = "@request.auth.id != ''"
    projCol.deleteRule = "@request.auth.id != ''"
    projCol.addIndex('idx_projetos_estrategicos_codigo', true, 'codigo', '')
    app.save(projCol)

    // ==========================================================
    // 2. metas
    //    - codigo (texto único, ex. MT1..MT80)
    //    - remover owner (substituir por responsaveis com colaboradores)
    //    - responsaveis (relação MÚLTIPLA com colaboradores)
    //    - projeto (mantido como projeto principal)
    //    - projeto_secundario (relação opcional com projetos_estrategicos)
    //    - remover timeframe, adicionar: periodicidade (texto), prazo (date), trimestre (texto)
    //    - processos_vinculados (relação múltipla com processos)
    //    - valor_alvo_a_definir (booleano)
    //    - status: adicionar opção "sem atualização" e usá-la como padrão
    //    - progresso: opcional
    // ==========================================================
    // Remover índices antigos de owner
    try {
      metasCol.removeIndex('idx_metas_owner')
    } catch (_) {}

    // Remover campos antigos owner e timeframe se existirem
    if (metasCol.fields.getByName('owner')) {
      metasCol.fields.removeByName('owner')
    }
    if (metasCol.fields.getByName('timeframe')) {
      metasCol.fields.removeByName('timeframe')
    }

    if (!metasCol.fields.getByName('codigo')) {
      metasCol.fields.add(new TextField({ name: 'codigo', required: true }))
    }
    if (!metasCol.fields.getByName('responsaveis')) {
      metasCol.fields.add(
        new RelationField({
          name: 'responsaveis',
          collectionId: colabCol.id,
          maxSelect: 10,
          cascadeDelete: false,
        }),
      )
    }
    if (!metasCol.fields.getByName('projeto_secundario')) {
      metasCol.fields.add(
        new RelationField({
          name: 'projeto_secundario',
          collectionId: projCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }
    if (!metasCol.fields.getByName('periodicidade')) {
      metasCol.fields.add(new TextField({ name: 'periodicidade' }))
    }
    if (!metasCol.fields.getByName('prazo')) {
      metasCol.fields.add(new DateField({ name: 'prazo' }))
    }
    if (!metasCol.fields.getByName('trimestre')) {
      metasCol.fields.add(new TextField({ name: 'trimestre' }))
    }
    if (!metasCol.fields.getByName('processos_vinculados')) {
      metasCol.fields.add(
        new RelationField({
          name: 'processos_vinculados',
          collectionId: procCol.id,
          maxSelect: 50,
          cascadeDelete: false,
        }),
      )
    }
    if (!metasCol.fields.getByName('valor_alvo_a_definir')) {
      metasCol.fields.add(new BoolField({ name: 'valor_alvo_a_definir' }))
    }

    // Atualizar status select: ['sem atualização', 'em andamento', 'concluida', 'atrasada']
    if (metasCol.fields.getByName('status')) {
      metasCol.fields.removeByName('status')
    }
    metasCol.fields.add(
      new SelectField({
        name: 'status',
        values: ['sem atualização', 'em andamento', 'concluida', 'atrasada'],
        maxSelect: 1,
      }),
    )

    // progresso: número opcional
    if (metasCol.fields.getByName('progresso')) {
      metasCol.fields.removeByName('progresso')
    }
    metasCol.fields.add(
      new NumberField({
        name: 'progresso',
        min: 0,
        max: 100,
      }),
    )

    metasCol.listRule = "@request.auth.id != ''"
    metasCol.viewRule = "@request.auth.id != ''"
    metasCol.createRule = "@request.auth.id != ''"
    metasCol.updateRule = "@request.auth.id != ''"
    metasCol.deleteRule = "@request.auth.id != ''"

    metasCol.addIndex('idx_metas_codigo', true, 'codigo', '')
    metasCol.addIndex('idx_metas_status', false, 'status', '')
    app.save(metasCol)

    // ==========================================================
    // 3. indicadores
    //    - ordem (número)
    //    - alvo (texto)
    //    - valor_atual, valor_meta, tendencia, historico opcionais
    // ==========================================================
    if (!indCol.fields.getByName('ordem')) {
      indCol.fields.add(new NumberField({ name: 'ordem', onlyInt: true }))
    }
    if (!indCol.fields.getByName('alvo')) {
      indCol.fields.add(new TextField({ name: 'alvo' }))
    }

    indCol.listRule = "@request.auth.id != ''"
    indCol.viewRule = "@request.auth.id != ''"
    indCol.createRule = "@request.auth.id != ''"
    indCol.updateRule = "@request.auth.id != ''"
    indCol.deleteRule = "@request.auth.id != ''"

    app.save(indCol)
  },
  (app) => {
    // Reversão não obrigatória em migrações de evolução
  },
)
