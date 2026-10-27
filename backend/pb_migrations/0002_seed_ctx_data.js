migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const projetosCol = app.findCollectionByNameOrId('projetos_estrategicos')
    const areasCol = app.findCollectionByNameOrId('areas')
    const metasCol = app.findCollectionByNameOrId('metas')
    const indicadoresCol = app.findCollectionByNameOrId('indicadores')
    const processosCol = app.findCollectionByNameOrId('processos')
    const fluxogramaCol = app.findCollectionByNameOrId('fluxograma')

    // 1. Seed 5 Projetos Estratégicos
    const strategicProjects = [
      {
        nome: 'Expansão de Mercado',
        descricao:
          'Ampliar a atuação geográfica da CTX e conquistar novos nichos de grandes feiras e eventos corporativos.',
      },
      {
        nome: 'Inovação e Tecnologia',
        descricao:
          'Modernizar metodologias construtivas com sustentabilidade, modelagem digital 3D e controle inteligente de montagem.',
      },
      {
        nome: 'Excelência Operacional',
        descricao:
          'Otimizar tempo de entrega, precisão na logística de materiais e índice zero de retrabalho em campo.',
      },
      {
        nome: 'Atração e Retenção de Talentos',
        descricao:
          'Capacitar equipes de montagem, cenografia e lideranças com programas contínuos de desenvolvimento.',
      },
      {
        nome: 'Sustentabilidade',
        descricao:
          'Reduzir desperdício de insumos na cenografia e implementar reaproveitamento consciente de matérias-primas.',
      },
    ]

    const projectRecordMap = {}
    for (const p of strategicProjects) {
      let rec
      try {
        rec = app.findFirstRecordByData('projetos_estrategicos', 'nome', p.nome)
      } catch (_) {
        rec = new Record(projetosCol)
        rec.set('nome', p.nome)
        rec.set('descricao', p.descricao)
        app.save(rec)
      }
      projectRecordMap[p.nome] = rec.id
    }

    // 2. Seed 11 Áreas
    const areasData = [
      { nome: 'Marketing', descricao: 'Responsável pela prospecção e divulgação' },
      { nome: 'Vendas/Atendimento', descricao: 'Atendimento ao cliente e fechamento de propostas' },
      { nome: 'Orçamento', descricao: 'Levantamento de custos e precificação' },
      { nome: 'Compras', descricao: 'Aquisição de materiais e fornecedores' },
      { nome: 'Almoxarifado', descricao: 'Controle de estoque e expedição' },
      { nome: 'PCP', descricao: 'Planejamento e controle da produção' },
      { nome: 'Gestão de Projetos', descricao: 'Acompanhamento de prazos e entregas' },
      { nome: 'Produção de Campo', descricao: 'Montagem e execução de stands' },
      { nome: 'Financeiro', descricao: 'Contas a pagar/receber e fluxo de caixa' },
      { nome: 'RH', descricao: 'Gestão de pessoas e treinamentos' },
      { nome: 'Arquitetura', descricao: 'Projeto e design de stands' },
    ]

    for (const a of areasData) {
      try {
        app.findFirstRecordByData('areas', 'nome', a.nome)
      } catch (_) {
        const rec = new Record(areasCol)
        rec.set('nome', a.nome)
        rec.set('descricao', a.descricao)
        app.save(rec)
      }
    }

    // 3. Seed Seed User (Miguel Santiago)
    let seedUser
    try {
      seedUser = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'miguel.santiago@ctxcenografia.com.br',
      )
    } catch (_) {
      seedUser = new Record(usersCol)
      seedUser.setEmail('miguel.santiago@ctxcenografia.com.br')
      seedUser.setPassword('Skip@Pass')
      seedUser.setVerified(true)
      seedUser.set('name', 'Miguel Santiago')
      try {
        seedUser.set('area', 'Gestão de Projetos')
      } catch (_) {}
      app.save(seedUser)
    }

    // Also seed a few other collaborators in other areas so the Organograma has realistic counts
    const otherUsers = [
      { email: 'carla.mendes@ctxcenografia.com.br', name: 'Carla Mendes', area: 'Arquitetura' },
      {
        email: 'rodrigo.alves@ctxcenografia.com.br',
        name: 'Rodrigo Alves',
        area: 'Produção de Campo',
      },
      {
        email: 'fernanda.lima@ctxcenografia.com.br',
        name: 'Fernanda Lima',
        area: 'Vendas/Atendimento',
      },
      { email: 'julio.cesar@ctxcenografia.com.br', name: 'Júlio César', area: 'Orçamento' },
      { email: 'beatriz.souza@ctxcenografia.com.br', name: 'Beatriz Souza', area: 'Marketing' },
      { email: 'lucas.prado@ctxcenografia.com.br', name: 'Lucas Prado', area: 'PCP' },
      { email: 'camila.rocha@ctxcenografia.com.br', name: 'Camila Rocha', area: 'Compras' },
      { email: 'marcelo.dias@ctxcenografia.com.br', name: 'Marcelo Dias', area: 'Almoxarifado' },
      { email: 'aline.castro@ctxcenografia.com.br', name: 'Aline Castro', area: 'Financeiro' },
      { email: 'patricia.vieira@ctxcenografia.com.br', name: 'Patrícia Vieira', area: 'RH' },
    ]

    for (const u of otherUsers) {
      try {
        app.findAuthRecordByEmail('_pb_users_auth_', u.email)
      } catch (_) {
        const rec = new Record(usersCol)
        rec.setEmail(u.email)
        rec.setPassword('Skip@Pass')
        rec.setVerified(true)
        rec.set('name', u.name)
        try {
          rec.set('area', u.area)
        } catch (_) {}
        app.save(rec)
      }
    }

    // 4. Seed Goals for Miguel Santiago
    const goalsData = [
      {
        titulo: 'Expandir base de clientes no setor de eventos corporativos',
        descricao:
          'Atuar em conjunto com o time comercial para qualificar grandes contas e fechar 12 novos contratos de montagem até o final de Q1.',
        projetoNome: 'Expansão de Mercado',
        status: 'em andamento',
        timeframe: 'Q1 2026',
        progresso: 67,
        indicadores: [
          {
            nome: 'Novos clientes convertidos',
            valor_atual: 8,
            valor_meta: 12,
            tendencia: 'subindo',
            historico: [2, 3, 5, 6, 7, 8],
          },
          {
            nome: 'Taxa de conversão de propostas (%)',
            valor_atual: 34,
            valor_meta: 40,
            tendencia: 'subindo',
            historico: [22, 25, 27, 30, 31, 34],
          },
        ],
        processos: [
          { nome: 'Levantar lista de leads qualificados', status: 'concluido' },
          { nome: 'Alinhamento técnico de proposta com Arquitetura', status: 'concluido' },
          { nome: 'Follow-up de negociação de contratos', status: 'pendente' },
        ],
      },
      {
        titulo: 'Adotar novas tecnologias de montagem e modelagem 3D',
        descricao:
          'Integrar ferramentas digitais de detalhamento de stands com o chão de fábrica para reduzir inconsistências técnicas em montagem.',
        projetoNome: 'Inovação e Tecnologia',
        status: 'em andamento',
        timeframe: 'Q1 2026',
        progresso: 50,
        indicadores: [
          {
            nome: 'Projetos modelados em sistema BIM',
            valor_atual: 10,
            valor_meta: 20,
            tendencia: 'subindo',
            historico: [2, 4, 6, 7, 9, 10],
          },
        ],
        processos: [
          { nome: 'Treinar equipe técnica no novo software', status: 'concluido' },
          { nome: 'Mapear pontos críticos de montagem em campo', status: 'pendente' },
        ],
      },
      {
        titulo: 'Reduzir desperdício de materiais na montagem de stands',
        descricao:
          'Padronizar o reaproveitamento de painéis modulares, estruturas metálicas e tecidos cenográficos após cada evento.',
        projetoNome: 'Sustentabilidade',
        status: 'em andamento',
        timeframe: 'Q1 2026',
        progresso: 75,
        indicadores: [
          {
            nome: 'Índice de reaproveitamento de painéis (%)',
            valor_atual: 75,
            valor_meta: 85,
            tendencia: 'estavel',
            historico: [60, 65, 70, 72, 74, 75],
          },
          {
            nome: 'Volume de descarte evitado (toneladas)',
            valor_atual: 4.5,
            valor_meta: 6.0,
            tendencia: 'subindo',
            historico: [1.2, 2.0, 2.8, 3.4, 4.0, 4.5],
          },
        ],
        processos: [
          { nome: 'Auditoria pós-evento de desmontagem', status: 'concluido' },
          { nome: 'Catalogar insumos reaproveitáveis no almoxarifado', status: 'concluido' },
          { nome: 'Emitir relatório mensal de impacto ambiental', status: 'pendente' },
        ],
      },
    ]

    for (const g of goalsData) {
      const projId = projectRecordMap[g.projetoNome]
      if (!projId) continue

      let metaRec
      try {
        metaRec = app.findFirstRecordByData('metas', 'titulo', g.titulo)
      } catch (_) {
        metaRec = new Record(metasCol)
        metaRec.set('titulo', g.titulo)
        metaRec.set('descricao', g.descricao)
        metaRec.set('projeto', projId)
        metaRec.set('owner', seedUser.id)
        metaRec.set('status', g.status)
        metaRec.set('timeframe', g.timeframe)
        metaRec.set('progresso', g.progresso)
        app.save(metaRec)
      }

      // Indicators
      for (const ind of g.indicadores) {
        try {
          app.findFirstRecordByData('indicadores', 'nome', ind.nome)
        } catch (_) {
          const indRec = new Record(indicadoresCol)
          indRec.set('meta', metaRec.id)
          indRec.set('nome', ind.nome)
          indRec.set('valor_atual', ind.valor_atual)
          indRec.set('valor_meta', ind.valor_meta)
          indRec.set('tendencia', ind.tendencia)
          indRec.set('historico', ind.historico)
          app.save(indRec)
        }
      }

      // Processos
      for (const proc of g.processos) {
        try {
          app.findFirstRecordByData('processos', 'nome', proc.nome)
        } catch (_) {
          const procRec = new Record(processosCol)
          procRec.set('meta', metaRec.id)
          procRec.set('nome', proc.nome)
          procRec.set('status', proc.status)
          app.save(procRec)
        }
      }
    }

    // 5. Seed Fluxograma (5 etapas em ordem)
    const fluxogramaStages = [
      {
        ordem: 1,
        etapa: 'Recebimento de Briefing',
        area: 'Vendas/Atendimento',
        evidencia: 'Briefing assinado',
        subpassos: [
          'Reunir requisitos do cliente',
          'Confirmar escopo',
          'Registrar especificações de metragem e data do evento',
          'Validar orçamento prévio com contratante',
        ],
      },
      {
        ordem: 2,
        etapa: 'Elaboração de Proposta',
        area: 'Arquitetura',
        evidencia: 'Layout aprovado',
        subpassos: [
          'Desenhar layout 3D',
          'Definir paleta cenográfica e iluminação',
          'Apresentar ao cliente',
          'Ajustar detalhes técnicos conforme feedback',
        ],
      },
      {
        ordem: 3,
        etapa: 'Orçamento e Fechamento',
        area: 'Orçamento',
        evidencia: 'Proposta financeira enviada',
        subpassos: [
          'Consolidar custos',
          'Levantar insumos especiais e terceirizações',
          'Aprovar margem operacional',
          'Enviar proposta final e formalizar contrato',
        ],
      },
      {
        ordem: 4,
        etapa: 'Planejamento e Compras',
        area: 'PCP',
        evidencia: 'Cronograma aprovado',
        subpassos: [
          'Definir cronograma',
          'Acionar compras',
          'Programar liberação de estoque com Almoxarifado',
          'Escalar equipe de montagem',
        ],
      },
      {
        ordem: 5,
        etapa: 'Produção e Entrega',
        area: 'Produção de Campo',
        evidencia: 'Stand montado',
        subpassos: [
          'Montar estrutura',
          'Instalar marcenaria, elétrica e comunicação visual',
          'Checklist de qualidade',
          'Entrega técnica e assinatura do termo de aceite',
        ],
      },
    ]

    for (const st of fluxogramaStages) {
      try {
        app.findFirstRecordByData('fluxograma', 'etapa', st.etapa)
      } catch (_) {
        const rec = new Record(fluxogramaCol)
        rec.set('ordem', st.ordem)
        rec.set('etapa', st.etapa)
        rec.set('area', st.area)
        rec.set('evidencia', st.evidencia)
        rec.set('subpassos', st.subpassos)
        app.save(rec)
      }
    }
  },
  (app) => {
    // down logic (optional cleanup)
  },
)
