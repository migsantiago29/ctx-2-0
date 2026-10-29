export interface ParsedCsvResult {
  headers: string[]
  rows: Record<string, string>[]
}

/**
 * Normaliza o nome de um cabeçalho:
 * - Converte para minúsculas
 * - Remove acentos (diacríticos)
 * - Remove espaços no início e no fim
 * - Substitui espaços internos por underscores
 * - Remove caracteres não alfanuméricos exceto underscore
 * - Mapeia sinônimos comuns com ou sem acento
 */
export function normalizeHeaderKey(header: string): string {
  let h = header.trim().toLowerCase()
  // Normalização NFD para decompor acentos e removê-los
  h = h.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // Substituir espaços e hífens por underscore
  h = h.replace(/[\s-]+/g, '_')
  // Remover caracteres não alfanuméricos exceto underscore
  h = h.replace(/[^\w]/g, '')

  // Mapeamento de sinônimos conhecidos do CTX
  const aliases: Record<string, string> = {
    codigo: 'codigo',
    cod: 'codigo',
    titulo: 'titulo',
    descricao: 'descricao',
    desc: 'descricao',
    responsaveis: 'responsaveis',
    responsavel: 'responsaveis',
    projeto_principal: 'projeto_principal',
    projeto_secundario: 'projeto_secundario',
    periodicidade: 'periodicidade',
    prazo: 'prazo',
    trimestre: 'trimestre',
    processos_vinculados: 'processos_vinculados',
    processo_vinculado: 'processos_vinculados',
    valor_alvo_a_definir: 'valor_alvo_a_definir',
    nome: 'nome',
    area: 'area',
    cargo: 'cargo',
    email: 'email',
    sem_metas: 'sem_metas',
    observacao: 'observacao',
    ordem_no_fluxo: 'ordem_no_fluxo',
    ordem: 'ordem',
    tipo: 'tipo',
    sponsor: 'sponsor',
    meta: 'meta',
    alvo: 'alvo',
    etapas_anteriores: 'etapas_anteriores',
    etapas_sucessoras: 'etapas_sucessoras',
  }

  return aliases[h] || h
}

/**
 * Remove ponto-e-vírgulas (e espaços) residuais no fim da linha
 * que causam colunas fantasmas (ex: `...,nao;;;;;;;;;` -> `...,nao`).
 */
function stripTrailingSemicolonsAndEmptyCols(line: string): string {
  return line.replace(/[;\s]+$/, '')
}

/**
 * Divide uma única linha CSV respeitando aspas padrão CSV (RFC 4180).
 * Retorna os campos ou null se aspas não fecharem.
 */
function parseCsvLineStandard(line: string, delimiter: string = ','): string[] | null {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Aspa dobrada "" dentro de campo entre aspas
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === delimiter) {
        fields.push(current.trim())
        current = ''
      } else {
        current += c
      }
    }
  }

  if (inQuotes) {
    // Aspas abertas e não fechadas ao fim da linha
    return null
  }

  fields.push(current.trim())
  return fields
}

/**
 * Desfaz a regravação do Excel com separador ";" (ex.: 05_metas exportado do Skip).
 * O Excel cortou cada linha original nos ";" das listas (`M01; M02`), pôs aspas nos pedaços
 * e completou com ";;;;". Lê a linha como CSV separado por ";" e junta os pedaços de volta
 * com ";", recuperando a linha original separada por vírgulas.
 * Retorna null se as aspas não fecharem.
 */
function unwrapSemicolonExport(line: string): string | null {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  let atCellStart = true

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += c
      }
    } else if (c === '"' && atCellStart) {
      inQuotes = true
      atCellStart = false
    } else if (c === ';') {
      cells.push(current)
      current = ''
      atCellStart = true
    } else {
      current += c
      atCellStart = false
    }
  }

  if (inQuotes) return null
  cells.push(current)

  // Remove as células vazias do preenchimento ";;;;" no fim
  while (cells.length > 0 && cells[cells.length - 1].trim() === '') {
    cells.pop()
  }
  return cells.join(';')
}

/**
 * Limpa aspas envolventes de um campo se existirem,
 * e desfaz aspas dobradas `""` -> `"`.
 */
function cleanField(val: string): string {
  let s = val.trim()
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1)
  }
  return s.replace(/""/g, '"').trim()
}

/**
 * Avalia se o resultado do parse de uma linha é aceitável:
 * - O primeiro campo (normalmente o código) não deve conter vírgula!
 *   (Se contiver vírgula, a linha toda foi colapsada no 1º campo)
 * - A contagem de colunas deve ser razoável em relação à quantidade de cabeçalhos
 */
function isValidParse(fields: string[], expectedColsCount: number): boolean {
  if (fields.length === 0) return false
  const firstCol = (fields[0] || '').trim()
  // Se o primeiro campo tem vírgula, falhou totalmente o parse de CSV separado por vírgula
  if (firstCol.includes(',')) {
    return false
  }
  // Se esperamos mais de 3 colunas e vieram menos da metade, falhou
  if (expectedColsCount > 3 && fields.length < Math.floor(expectedColsCount * 0.5)) {
    return false
  }
  return true
}

/**
 * Tenta reparar uma linha com defeito estrutural comum do Excel/exportação:
 * 1. Linhas inteiras envolvidas por um par extra de aspas:
 *    a linha começa com `"` antes do primeiro campo (ex: `"MT1,Colocar...`)
 *    e o fechamento dessa aspa aparece depois de um campo do meio (ex: `...,T2,M01"; M02; M03...`)
 *    ou no final da linha (ex: `...,nao";;;;;` ou `...,nao"`).
 * 2. Aspas dobradas internas misturadas com as aspas extras.
 * 3. Colunas fantasmas com ponto-e-vírgula no final.
 * 4. Linhas limpas misturadas (sem aspas extras).
 */
function parseAndRepairLine(
  rawLine: string,
  expectedColsCount: number,
  delimiter: string = ',',
): string[] {
  const line = stripTrailingSemicolonsAndEmptyCols(rawLine)

  // Se a linha não começa com aspa extra, tentar parse padrão direto primeiro
  if (!line.startsWith('"')) {
    const resClean = parseCsvLineStandard(line, delimiter)
    if (resClean && isValidParse(resClean, expectedColsCount)) {
      return resClean.map(cleanField)
    }
  }

  // Se a linha começa com `"`, ela pode ser o padrão corrompido:
  // Tentativa A (reparo especializado):
  // Remover a aspa inicial `"`
  let repairedA = line.startsWith('"') ? line.substring(1) : line
  // Substituir `";` por `;` (onde a aspa extra fechou prematuramente no meio de uma lista com `;`)
  repairedA = repairedA.replace(/";/g, ';')
  // Se terminou com aspa extra no final, remover também
  if (repairedA.endsWith('"')) {
    repairedA = repairedA.slice(0, -1)
  }

  // Tentar parse nessa linha corrigida
  const resA = parseCsvLineStandard(repairedA, delimiter)
  if (resA && isValidParse(resA, expectedColsCount)) {
    return resA.map(cleanField)
  }

  // Tentativa B:
  // Se campos com aspas dobradas `""` ficaram com aspas quadruplicadas ou desbalanceadas,
  // ou se o parse padrão falhou por aspas internas:
  // Converter `""` -> `"` na linha corrigida para que os campos entre aspas normais abram e fechem
  let repairedB = repairedA.replace(/""/g, '"')
  const resB = parseCsvLineStandard(repairedB, delimiter)
  if (resB && isValidParse(resB, expectedColsCount)) {
    return resB.map(cleanField)
  }

  // Tentativa C:
  // Parse padrão direto da linha original (para casos em que a linha inteira era válida RFC 4180)
  const resStandard = parseCsvLineStandard(line, delimiter)
  if (resStandard && isValidParse(resStandard, expectedColsCount)) {
    return resStandard.map(cleanField)
  }

  // Tentativa D:
  // Se ainda falhar, tentar remover todas as aspas externas e aspas isoladas espúrias
  // mantendo apenas separação por delimitador se o resultado produzir contagem aceitável
  let repairedD = line
  if (repairedD.startsWith('"')) repairedD = repairedD.substring(1)
  if (repairedD.endsWith('"')) repairedD = repairedD.slice(0, -1)
  repairedD = repairedD.replace(/";/g, ';')

  // Se nada funcionou, avaliar qual das tentativas anteriores chegou mais perto
  const candidates = [resA, resB, resStandard]
  for (const cand of candidates) {
    if (cand && cand.length > 0 && !cand[0].includes(',')) {
      return cand.map(cleanField)
    }
  }

  // Último recurso: quebra por delimitador direto
  const fallback = line.split(delimiter)
  return fallback.map(cleanField)
}

/**
 * Parser de CSV tolerante a corrupções de formatação:
 * - BOM utf-8 (\uFEFF)
 * - Ponto-e-vírgulas no final gerando colunas fantasmas vazias
 * - Aspas envolventes extras na linha inteira (`"MT1,Titulo,...`)
 * - Fechamento espúrio de aspas no meio de campos de listas (`M01"; M02`)
 * - Aspas dobradas internas
 * - Cabeçalhos com/sem acento e normalização de chaves
 * - Linhas vazias ou whitespace descartadas
 */
export function parseCsv(text: string): ParsedCsvResult {
  // Strip BOM if present
  let raw = text.replace(/^\uFEFF/, '').trim()
  if (!raw) return { headers: [], rows: [] }

  // Normalizar quebras de linha
  const rawLines = raw.split(/\r?\n/)
  if (rawLines.length === 0) return { headers: [], rows: [] }

  // 1. Processar linha de cabeçalho
  const rawHeaderLine = rawLines[0]
  const cleanedHeaderLine = stripTrailingSemicolonsAndEmptyCols(rawHeaderLine)

  // Detectar delimitador no cabeçalho
  let delimiter = ','
  const commas = (cleanedHeaderLine.match(/,/g) || []).length
  const semicolons = (cleanedHeaderLine.match(/;/g) || []).length
  if (semicolons > commas) {
    delimiter = ';'
  }

  // Parse do cabeçalho
  let headerCols = parseCsvLineStandard(cleanedHeaderLine, delimiter)
  if (!headerCols) {
    // Tenta fallback simples se o header tiver aspas estranhas
    headerCols = cleanedHeaderLine.split(delimiter)
  }

  // Limpar campos de cabeçalho e descartar cabeçalhos vazios no final (colunas fantasmas)
  headerCols = headerCols.map((h) => cleanField(h))
  while (headerCols.length > 0 && headerCols[headerCols.length - 1] === '') {
    headerCols.pop()
  }

  if (headerCols.length === 0) {
    return { headers: [], rows: [] }
  }

  // Chaves normalizadas (ex: 'código' -> 'codigo', 'titulo' -> 'titulo')
  const normalizedHeaders = headerCols.map((h) => normalizeHeaderKey(h))
  const expectedColsCount = normalizedHeaders.length

  // Cabeçalho separado por vírgulas mas terminado em ";;;" = arquivo regravado pelo Excel com ";"
  const isSemicolonExport = delimiter === ',' && /;\s*$/.test(rawHeaderLine)

  const parsedRows: Record<string, string>[] = []

  // 2. Processar cada linha de dados
  for (let r = 1; r < rawLines.length; r++) {
    const rawLine = rawLines[r]
    if (!rawLine || !rawLine.trim()) {
      continue // Linha em branco
    }

    // Se a linha só tiver delimitadores ou ponto-e-vírgulas residuais, ignora
    const stripped = stripTrailingSemicolonsAndEmptyCols(rawLine)
    if (!stripped || !stripped.replace(/[,;]/g, '').trim()) {
      continue
    }

    const unwrapped = isSemicolonExport ? unwrapSemicolonExport(rawLine) : null
    const rowCols = parseAndRepairLine(unwrapped ?? rawLine, expectedColsCount, delimiter)

    // Descartar se todas as células forem vazias
    const hasAnyContent = rowCols.some((v) => (v ?? '').trim() !== '')
    if (!hasAnyContent) {
      continue
    }

    const rowObj: Record<string, string> = {}

    for (let c = 0; c < normalizedHeaders.length; c++) {
      const headerKey = normalizedHeaders[c]
      if (!headerKey) continue
      const cellVal = rowCols[c]
      rowObj[headerKey] = cellVal !== undefined && cellVal !== null ? cleanField(cellVal) : ''
    }

    parsedRows.push(rowObj)
  }

  return { headers: normalizedHeaders, rows: parsedRows }
}
