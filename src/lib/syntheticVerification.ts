import { parseCsv, normalizeHeaderKey } from './csvParser'

export function runSyntheticCsvVerification() {
  // Teste 1: Normalização de headers
  const h1 = normalizeHeaderKey('Código')
  const h2 = normalizeHeaderKey('Título')
  const h3 = normalizeHeaderKey('Descrição')
  const h4 = normalizeHeaderKey('Processos Vinculados')
  const h5 = normalizeHeaderKey('Responsáveis')
  if (
    h1 !== 'codigo' ||
    h2 !== 'titulo' ||
    h3 !== 'descricao' ||
    h4 !== 'processos_vinculados' ||
    h5 !== 'responsaveis'
  ) {
    throw new Error(`Falha na normalização de headers: ${h1}, ${h2}, ${h3}, ${h4}, ${h5}`)
  }

  // Teste 2: Cabeçalho com trailing semicolons e colunas fantasmas
  const headerTest = 'codigo,titulo,descricao;;;;;;;;;;;;'
  const resHeader = parseCsv(headerTest)
  if (
    resHeader.headers.length !== 3 ||
    resHeader.headers[0] !== 'codigo' ||
    resHeader.headers[1] !== 'titulo' ||
    resHeader.headers[2] !== 'descricao'
  ) {
    throw new Error(`Falha no header com trailing semicolons: ${resHeader.headers.join(',')}`)
  }

  // Teste 3: Padrões exatos de corrupção do CSV (sem dados reais, apenas strings sintéticas)
  // Padrão A: Aspa extra no início e fechando no meio de lista ";
  // Padrão B: Linha limpa sem aspas extras
  // Padrão C: Aspa extra fechando no final com trailing semicolons
  // Padrão D: Lista de responsáveis com '; ' e com aspas
  const syntheticCorruptedCsv = `codigo,titulo,descricao,responsaveis,projeto_principal,projeto_secundario,periodicidade,prazo,trimestre,processos_vinculados,valor_alvo_a_definir;;;;;;;;;;;;;;;
"MT901,Titulo Sintetico 1,""Descricao sintetica com virgula, e aspas"",resp1,P1,,Mensal,30/06/2027,T2,M01"; M02; M03,nao;;;;;;;;;
MT902,Titulo Limpo,Descricao limpa sem aspas,resp2,P1,P2,Semanal,31/03/2027,T1,V01; V02,sim;;;;;;;;;;;;;;;
"MT903,Titulo 3,""Descricao 3"",resp1"; resp2,P2,,Mensal,30/09/2027,T3,,nao";;;;;;;;;;;;;;;
`
  const res = parseCsv(syntheticCorruptedCsv)
  if (res.rows.length !== 3) {
    throw new Error(`Esperado 3 linhas, obtido ${res.rows.length}`)
  }

  const r0 = res.rows[0]
  if (r0.codigo !== 'MT901') throw new Error(`R0 codigo incorreto: ${r0.codigo}`)
  if (r0.titulo !== 'Titulo Sintetico 1') throw new Error(`R0 titulo incorreto: ${r0.titulo}`)
  if (r0.descricao !== 'Descricao sintetica com virgula, e aspas')
    throw new Error(`R0 descricao incorreto: ${r0.descricao}`)
  if (r0.responsaveis !== 'resp1') throw new Error(`R0 responsaveis incorreto: ${r0.responsaveis}`)
  if (r0.processos_vinculados !== 'M01; M02; M03')
    throw new Error(`R0 processos incorreto: ${r0.processos_vinculados}`)
  if (r0.valor_alvo_a_definir !== 'nao')
    throw new Error(`R0 valor alvo incorreto: ${r0.valor_alvo_a_definir}`)

  const r1 = res.rows[1]
  if (r1.codigo !== 'MT902') throw new Error(`R1 codigo incorreto: ${r1.codigo}`)
  if (r1.titulo !== 'Titulo Limpo') throw new Error(`R1 titulo incorreto: ${r1.titulo}`)
  if (r1.descricao !== 'Descricao limpa sem aspas')
    throw new Error(`R1 descricao incorreto: ${r1.descricao}`)
  if (r1.responsaveis !== 'resp2') throw new Error(`R1 responsaveis incorreto: ${r1.responsaveis}`)
  if (r1.processos_vinculados !== 'V01; V02')
    throw new Error(`R1 processos incorreto: ${r1.processos_vinculados}`)
  if (r1.valor_alvo_a_definir !== 'sim')
    throw new Error(`R1 valor alvo incorreto: ${r1.valor_alvo_a_definir}`)

  const r2 = res.rows[2]
  if (r2.codigo !== 'MT903') throw new Error(`R2 codigo incorreto: ${r2.codigo}`)
  if (r2.titulo !== 'Titulo 3') throw new Error(`R2 titulo incorreto: ${r2.titulo}`)
  if (r2.descricao !== 'Descricao 3') throw new Error(`R2 descricao incorreto: ${r2.descricao}`)

  // Teste 4: BOM no início
  const bomCsv = '\uFEFFcodigo,titulo\nMT999,Teste'
  const resBom = parseCsv(bomCsv)
  if (resBom.headers[0] !== 'codigo' || resBom.rows[0].codigo !== 'MT999') {
    throw new Error('Falha no teste com BOM')
  }

  return true
}
