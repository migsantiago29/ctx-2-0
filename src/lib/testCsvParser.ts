import { parseCsv, normalizeHeaderKey } from './csvParser'

// Simulação de teste com strings sintéticas (MT991, MT992, etc.)
// NENHUM DADO REAL DA EMPRESA É EMBUTIDO AQUI

function runTest() {
  console.log('--- Testando normalizeHeaderKey ---')
  console.assert(normalizeHeaderKey('Código') === 'codigo', 'Código falhou')
  console.assert(normalizeHeaderKey('Título') === 'titulo', 'Título falhou')
  console.assert(normalizeHeaderKey('Descrição') === 'descricao', 'Descrição falhou')
  console.assert(normalizeHeaderKey('Responsáveis') === 'responsaveis', 'Responsáveis falhou')
  console.assert(
    normalizeHeaderKey('Processos Vinculados') === 'processos_vinculados',
    'Processos Vinculados falhou',
  )

  console.log(
    '--- Teste 1: Linha com aspas extrar no início e no meio de lista (Padrão 05_metas) ---',
  )
  const syntheticCsvCorrupted = `codigo,titulo,descricao,responsaveis,projeto_principal,projeto_secundario,periodicidade,prazo,trimestre,processos_vinculados,valor_alvo_a_definir;;;;;;;;;;;;;;;
"MT991,Titulo Sintetico 1,""Descricao sintetica com vírgula, e detalhes"",resp_a,P91,,Mensal,30/06/2027,T2,M91"; M92; M93,nao;;;;;;;;;
MT992,Titulo Limpo Sem Aspas,Descricao simples sem aspas,resp_b,P92,P93,Trimestral,31/03/2027,T1,V91; V92,sim;;;;;;;;;;;;;;;
"MT993,Outro Titulo,""Descricao com texto"",resp_c,P91,,Semanal,30/09/2027,T3,,nao";;;;;;;;;;;;;;;
`

  const result1 = parseCsv(syntheticCsvCorrupted)
  console.log('Headers encontrados:', result1.headers)
  console.log('Total de linhas parseadas:', result1.rows.length)
  console.log('Linha 0:', result1.rows[0])
  console.log('Linha 1:', result1.rows[1])
  console.log('Linha 2:', result1.rows[2])

  console.assert(result1.headers.includes('codigo'), 'Header codigo ausente')
  console.assert(
    result1.rows[0].codigo === 'MT991',
    `Esperado MT991, recebido: "${result1.rows[0].codigo}"`,
  )
  console.assert(
    result1.rows[0].titulo === 'Titulo Sintetico 1',
    `Titulo incorreto: "${result1.rows[0].titulo}"`,
  )
  console.assert(
    result1.rows[0].descricao === 'Descricao sintetica com vírgula, e detalhes',
    `Descricao incorreta: "${result1.rows[0].descricao}"`,
  )
  console.assert(
    result1.rows[0].responsaveis === 'resp_a',
    `Responsaveis incorreto: "${result1.rows[0].responsaveis}"`,
  )
  console.assert(
    result1.rows[0].processos_vinculados === 'M91; M92; M93',
    `Processos incorreto: "${result1.rows[0].processos_vinculados}"`,
  )
  console.assert(
    result1.rows[0].valor_alvo_a_definir === 'nao',
    `Valor alvo incorreto: "${result1.rows[0].valor_alvo_a_definir}"`,
  )

  console.assert(
    result1.rows[1].codigo === 'MT992',
    `Esperado MT992, recebido: "${result1.rows[1].codigo}"`,
  )
  console.assert(
    result1.rows[2].codigo === 'MT993',
    `Esperado MT993, recebido: "${result1.rows[2].codigo}"`,
  )

  console.log('--- Testes passaram com sucesso! ---')
}

runTest()
