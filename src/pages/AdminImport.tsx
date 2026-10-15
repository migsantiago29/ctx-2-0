import { useState, useEffect } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  ShieldAlert,
  ArrowRight,
  Database,
  Lock,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { parseCsv } from '@/lib/csvParser'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import type { UserProfile, Colaborador } from '@/types/ctx'
import { toast } from '@/hooks/use-toast'

interface RejectedItem {
  etapa:
    | 'Áreas'
    | 'Usuários/Login'
    | 'Colaboradores'
    | 'Processos (1ª passada)'
    | 'Processos (2ª passada)'
    | 'Projetos Estratégicos'
    | 'Metas'
    | 'Indicadores'
  linha?: number
  codigo?: string
  motivo: string
  payload?: Record<string, unknown>
}

interface ValidationReport {
  counts: {
    areas: number
    areasExpected: number
    colaboradores: number
    colaboradoresExpected: number
    users: number
    usersExpected: number
    processos: number
    processosExpected: number
    conexoes: number
    conexoesExpected: number
    projetos: number
    projetosExpected: number
    metas: number
    metasExpected: number
    indicadores: number
    indicadoresExpected: number
    vinculosMetaResponsavel: number
    vinculosMetaResponsavelExpected: number
    vinculosMetaProcesso: number
    vinculosMetaProcessoExpected: number
  }
  checks: {
    williamCheck: boolean | null
    o01Check: boolean | null
    rh05Check: boolean | null
    mt38ResponsaveisCheck: boolean | null
    miguelMetasCheck: boolean | null
    williamSemMetasCheck: boolean | null
    pauloEmilioSponsorCheck: boolean | null
    todasMetasComResponsavelEProjetoCheck: boolean | null
  }
  errors: RejectedItem[]
}

// Utilitário de pausa (throttling)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Executa uma operação assíncrona com tentativas e backoff exponencial em caso de erro 429 (Too Many Requests)
async function runWithRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; initialDelayMs?: number; maxDelayMs?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 6
  let delay = options?.initialDelayMs ?? 400
  const maxDelay = options?.maxDelayMs ?? 5000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const is429 =
        (err &&
          typeof err === 'object' &&
          'status' in err &&
          (err as { status: number }).status === 429) ||
        (err instanceof Error &&
          (err.message.includes('429') || err.message.toLowerCase().includes('too many requests')))

      if (is429 && attempt < maxAttempts) {
        console.warn(
          `[runWithRetry] 429 recebido. Aguardando ${delay}ms antes da tentativa ${attempt + 1}/${maxAttempts}...`,
        )
        await sleep(delay)
        delay = Math.min(delay * 2, maxDelay)
        continue
      }
      throw err
    }
  }
  throw new Error('Falha após múltiplas tentativas')
}

export default function AdminImport() {
  const { user } = useAuth()

  // Arquivos selecionados (Etapa 1 e Etapa 2)
  const [fileAreas, setFileAreas] = useState<File | null>(null)
  const [fileColabs, setFileColabs] = useState<File | null>(null)
  const [fileProcs, setFileProcs] = useState<File | null>(null)
  const [fileProjetos, setFileProjetos] = useState<File | null>(null)
  const [fileMetas, setFileMetas] = useState<File | null>(null)
  const [fileIndicadores, setFileIndicadores] = useState<File | null>(null)

  // Estados de processamento
  const [importing, setImporting] = useState(false)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [progressMsg, setProgressMsg] = useState<string>('')
  const [report, setReport] = useState<ValidationReport | null>(null)

  // Gerenciamento de redefinição manual de senha pelo Admin
  const [usersList, setUsersList] = useState<UserProfile[]>([])
  const [colaboradoresList, setColaboradoresList] = useState<Colaborador[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [newPassword, setNewPassword] = useState<string>('')
  const [resettingPassword, setResettingPassword] = useState(false)

  // Carregar usuários para admin poder trocar senha
  const loadUsersAndColabs = async () => {
    try {
      const u = await pb.collection('users').getFullList<UserProfile>({ sort: 'name' })
      setUsersList(u)
      const c = await pb.collection('colaboradores').getFullList<Colaborador>({ sort: 'nome' })
      setColaboradoresList(c)
    } catch (e) {
      console.error('Erro ao listar usuários:', e)
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') {
      loadUsersAndColabs()
    }
  }, [user])

  // Converte data dd/mm/aaaa para string ISO ou compatível com PocketBase
  const parseBrazilianDate = (dateStr?: string): string | null => {
    if (!dateStr) return null
    const clean = dateStr.trim()
    if (!clean) return null
    // dd/mm/aaaa
    const parts = clean.split('/')
    if (parts.length === 3) {
      const dia = parseInt(parts[0], 10)
      const mes = parseInt(parts[1], 10)
      const ano = parseInt(parts[2], 10)
      if (dia > 0 && mes > 0 && ano > 1900) {
        const d = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0))
        return d.toISOString()
      }
    }
    // Caso venha em outro formato ISO
    const fallback = new Date(clean)
    if (!isNaN(fallback.getTime())) {
      return fallback.toISOString()
    }
    return null
  }

  // Divide múltiplos códigos separados por ponto-e-vírgula, ponto-e-vírgula com espaço ou vírgula
  const splitCodes = (val?: unknown): string[] => {
    if (val === undefined || val === null) return []
    let str = String(val).trim()
    if (!str) return []
    // Remove aspas residuais que possam ter sobrado
    str = str.replace(/["']/g, '')
    return str
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }

  // Função auxiliar para re-calcular checagens e contagens finais do banco
  const refreshValidationReportCounts = async (
    currentErrors: RejectedItem[],
  ): Promise<ValidationReport> => {
    const [
      freshAreas,
      freshColabs,
      freshUsers,
      allProcs,
      freshProjetos,
      freshMetas,
      freshIndicadores,
    ] = await Promise.all([
      runWithRetry(() => pb.collection('areas').getFullList()),
      runWithRetry(() => pb.collection('colaboradores').getFullList<Colaborador>()),
      runWithRetry(() => pb.collection('users').getFullList<UserProfile>()),
      runWithRetry(() => pb.collection('processos').getFullList()),
      runWithRetry(() => pb.collection('projetos_estrategicos').getFullList()),
      runWithRetry(() =>
        pb
          .collection('metas')
          .getFullList({ expand: 'responsaveis,projeto,projeto_secundario,processos_vinculados' }),
      ),
      runWithRetry(() => pb.collection('indicadores').getFullList({ expand: 'meta' })),
    ])

    const procMapByCodigo = new Map<string, string>()
    allProcs.forEach((p) => {
      const cod = (p?.codigo ?? '').trim().toUpperCase()
      if (cod) procMapByCodigo.set(cod, p.id)
    })

    let totalConexoes = 0
    for (const p of allProcs) {
      const suc = p.etapas_sucessoras || []
      totalConexoes += suc.length
    }

    const william = freshColabs.find(
      (c) =>
        c.codigo?.toLowerCase().includes('william') ||
        c.nome?.toLowerCase().includes('william machado'),
    )

    let o01Check: boolean | null = null
    const o01 = allProcs.find((p) => p.codigo === 'O01')
    if (o01) {
      const o02Id = procMapByCodigo.get('O02')
      const o03Id = procMapByCodigo.get('O03')
      const suc = o01.etapas_sucessoras || []
      const hasO02 = !!o02Id && suc.includes(o02Id)
      const hasO03 = !!o03Id && suc.includes(o03Id)
      o01Check = hasO02 && hasO03
    }

    let rh05Check: boolean | null = null
    const rh05 = allProcs.find((p) => p.codigo === 'RH05')
    if (rh05) {
      const ant = rh05.etapas_anteriores || []
      const suc = rh05.etapas_sucessoras || []
      rh05Check = ant.length === 0 && suc.length === 0
    }

    // Contagem de vínculos da Etapa 2
    let vinculosMetaResponsavel = 0
    let vinculosMetaProcesso = 0
    for (const m of freshMetas) {
      const resp = (m.responsaveis as string[]) || []
      vinculosMetaResponsavel += resp.length
      const procs = (m.processos_vinculados as string[]) || []
      vinculosMetaProcesso += procs.length
    }

    // Conferências específicas da Etapa 2:
    // 1. MT38 tem Rafael e Mahara como responsáveis
    let mt38ResponsaveisCheck: boolean | null = null
    const mt38 = freshMetas.find((m) => (m.codigo || '').toUpperCase() === 'MT38')
    if (mt38) {
      const respIds = (mt38.responsaveis as string[]) || []
      const rafael = freshColabs.find((c) => c.codigo?.toLowerCase() === 'rafael')
      const mahara = freshColabs.find((c) => c.codigo?.toLowerCase() === 'mahara')
      mt38ResponsaveisCheck =
        !!rafael && !!mahara && respIds.includes(rafael.id) && respIds.includes(mahara.id)
    }

    // 2. Miguel é responsável por MT52 a MT55
    let miguelMetasCheck: boolean | null = null
    const miguel = freshColabs.find((c) => c.codigo?.toLowerCase() === 'miguel')
    if (miguel) {
      const expectedMiguelCodes = ['MT52', 'MT53', 'MT54', 'MT55']
      const metasMiguel = freshMetas.filter((m) =>
        expectedMiguelCodes.includes((m.codigo || '').toUpperCase()),
      )
      miguelMetasCheck =
        metasMiguel.length === 4 &&
        metasMiguel.every((m) => ((m.responsaveis as string[]) || []).includes(miguel.id))
    }

    // 3. William (sem_metas) não tem metas
    let williamSemMetasCheck: boolean | null = null
    if (william) {
      const metasDoWilliam = freshMetas.filter((m) =>
        ((m.responsaveis as string[]) || []).includes(william.id),
      )
      williamSemMetasCheck = metasDoWilliam.length === 0
    }

    // 4. Paulo Emílio é sponsor de P2 e P5
    let pauloEmilioSponsorCheck: boolean | null = null
    const pauloEmilio = freshColabs.find((c) => c.codigo?.toLowerCase() === 'paulo-emilio')
    if (pauloEmilio) {
      const p2 = freshProjetos.find((p) => (p.codigo || '').toUpperCase() === 'P2')
      const p5 = freshProjetos.find((p) => (p.codigo || '').toUpperCase() === 'P5')
      pauloEmilioSponsorCheck =
        !!p2 && !!p5 && p2.sponsor === pauloEmilio.id && p5.sponsor === pauloEmilio.id
    }

    // 5. Nenhuma meta sem responsável ou sem projeto principal
    let todasMetasComResponsavelEProjetoCheck: boolean | null = null
    if (freshMetas.length > 0) {
      todasMetasComResponsavelEProjetoCheck = freshMetas.every((m) => {
        const hasProjeto = !!m.projeto
        const hasResponsaveis =
          Array.isArray(m.responsaveis) && (m.responsaveis as string[]).length > 0
        return hasProjeto && hasResponsaveis
      })
    }

    return {
      counts: {
        areas: freshAreas.length,
        areasExpected: 14,
        colaboradores: freshColabs.length,
        colaboradoresExpected: 21,
        users: freshUsers.length,
        usersExpected: 21,
        processos: allProcs.length,
        processosExpected: 181,
        conexoes: totalConexoes,
        conexoesExpected: 217,
        projetos: freshProjetos.length,
        projetosExpected: 5,
        metas: freshMetas.length,
        metasExpected: 80,
        indicadores: freshIndicadores.length,
        indicadoresExpected: 225,
        vinculosMetaResponsavel,
        vinculosMetaResponsavelExpected: 84,
        vinculosMetaProcesso,
        vinculosMetaProcessoExpected: 86,
      },
      checks: {
        williamCheck: william ? !!william.sem_metas : null,
        o01Check,
        rh05Check,
        mt38ResponsaveisCheck,
        miguelMetasCheck,
        williamSemMetasCheck,
        pauloEmilioSponsorCheck,
        todasMetasComResponsavelEProjetoCheck,
      },
      errors: currentErrors,
    }
  }

  // Função principal de importação
  const handleStartImport = async () => {
    const hasEtapa1 = !!(fileAreas || fileColabs || fileProcs)
    const hasEtapa2 = !!(fileProjetos || fileMetas || fileIndicadores)

    if (!hasEtapa1 && !hasEtapa2) {
      toast({
        title: 'Nenhum arquivo selecionado',
        description:
          'Selecione pelo menos um arquivo da Etapa 1 ou da Etapa 2 para iniciar a importação.',
        variant: 'destructive',
      })
      return
    }

    setImporting(true)
    setProgressMsg('Lendo arquivos CSV...')
    setReport(null)

    const errors: RejectedItem[] = []

    try {
      // Mapas globais compartilhados para resolução de códigos
      const [initAreas, initColabs, initUsers, initProcs, initProjs] = await Promise.all([
        runWithRetry(() => pb.collection('areas').getFullList()),
        runWithRetry(() => pb.collection('colaboradores').getFullList<Colaborador>()),
        runWithRetry(() => pb.collection('users').getFullList<UserProfile>()),
        runWithRetry(() => pb.collection('processos').getFullList()),
        runWithRetry(() => pb.collection('projetos_estrategicos').getFullList()),
      ])

      const areaIdMap = new Map<string, string>() // nome.toLowerCase() -> id
      initAreas.forEach((a) => {
        const aNome = (a?.nome ?? '').trim().toLowerCase()
        if (aNome) areaIdMap.set(aNome, a.id)
      })

      const userMapByEmail = new Map<string, UserProfile>()
      initUsers.forEach((u) => {
        const uEmail = (u?.email ?? '').trim().toLowerCase()
        if (uEmail) userMapByEmail.set(uEmail, u)
      })

      const colabMapByCodigo = new Map<string, string>() // codigo.toLowerCase() -> id
      initColabs.forEach((c) => {
        const cCod = (c?.codigo ?? '').trim().toLowerCase()
        if (cCod) colabMapByCodigo.set(cCod, c.id)
      })

      const procMapByCodigo = new Map<string, string>() // codigo.toUpperCase() -> id
      initProcs.forEach((p) => {
        const cod = (p?.codigo ?? '').trim().toUpperCase()
        if (cod) procMapByCodigo.set(cod, p.id)
      })

      const projMapByCodigo = new Map<string, string>() // codigo.toUpperCase() -> id
      initProjs.forEach((pr) => {
        const cod = (pr?.codigo ?? '').trim().toUpperCase()
        if (cod) projMapByCodigo.set(cod, pr.id)
      })

      // ==========================================================
      // PASSO 1: IMPORTAR ÁREAS (se arquivo fornecido)
      // ==========================================================
      if (fileAreas) {
        setCurrentStep('Importando Áreas...')
        setProgressMsg('Processando registros de áreas...')

        const areasText = await fileAreas.text()
        const parsedAreas = parseCsv(areasText)

        for (let i = 0; i < parsedAreas.rows.length; i++) {
          const row = parsedAreas.rows[i]
          const nome = (row?.nome ?? '').trim()
          if (!nome) {
            const hasAnyData = Object.values(row || {}).some((v) => (v ?? '').trim() !== '')
            if (!hasAnyData) continue
            errors.push({
              etapa: 'Áreas',
              linha: i + 2,
              motivo: 'Nome da área vazio ou ausente na planilha',
            })
            continue
          }

          const ordem = parseInt((row.ordem_no_fluxo ?? '0').trim() || '0', 10) || 0
          const tipoRaw = (row.tipo ?? '').trim().toLowerCase()
          const tipo =
            tipoRaw.includes('grupo') || tipoRaw.includes('marco') ? 'grupo de processos' : 'área'

          const areaPayload = {
            nome,
            ordem_no_fluxo: ordem,
            tipo,
          }

          try {
            const key = nome.toLowerCase()
            if (areaIdMap.has(key)) {
              const id = areaIdMap.get(key)!
              await runWithRetry(() => pb.collection('areas').update(id, areaPayload))
            } else {
              const created = await runWithRetry(() => pb.collection('areas').create(areaPayload))
              areaIdMap.set(key, created.id)
            }
          } catch (err: unknown) {
            const msg = getErrorMessage(err)
            errors.push({
              etapa: 'Áreas',
              linha: i + 2,
              codigo: nome,
              motivo: msg,
              payload: areaPayload,
            })
          }
          await sleep(30)
        }

        // Re-sincronizar mapa de áreas
        const freshAreas = await runWithRetry(() => pb.collection('areas').getFullList())
        freshAreas.forEach((a) => {
          const aNome = (a?.nome ?? '').trim().toLowerCase()
          if (aNome) areaIdMap.set(aNome, a.id)
        })
      }

      // ==========================================================
      // PASSO 2: IMPORTAR COLABORADORES E USUÁRIOS (se arquivo fornecido)
      // ==========================================================
      if (fileColabs) {
        setCurrentStep('Importando Colaboradores & Logins...')
        setProgressMsg('Criando contas de usuário e registros de colaboradores...')

        const colabsText = await fileColabs.text()
        const parsedColabs = parseCsv(colabsText)

        if (parsedColabs.headers.length > 0 && !parsedColabs.headers.includes('codigo')) {
          throw new Error(
            `Nenhuma coluna 'codigo' encontrada no arquivo de Colaboradores. Colunas lidas: ${parsedColabs.headers.join(', ')}.`,
          )
        }

        for (let i = 0; i < parsedColabs.rows.length; i++) {
          const row = parsedColabs.rows[i]
          const codigo = (row?.codigo ?? '').trim()
          const nome = (row?.nome ?? '').trim()
          const cargo = (row?.cargo ?? '').trim()
          const areaNome = (row?.area ?? '').trim()
          const email = (row?.email ?? '').trim().toLowerCase()
          const semMetasRaw = (row?.sem_metas ?? '').trim().toLowerCase()
          const sem_metas = semMetasRaw === 'sim' || semMetasRaw === 'true'

          if (!codigo || !nome || !email) {
            const hasAnyData = Object.values(row || {}).some((v) => (v ?? '').trim() !== '')
            if (!hasAnyData) continue
            errors.push({
              etapa: 'Colaboradores',
              linha: i + 2,
              codigo: codigo || nome || '(sem código)',
              motivo: 'Campos obrigatórios ausentes (código, nome ou e-mail)',
              payload: { codigo, nome, email, cargo, areaNome },
            })
            continue
          }

          let userId = ''
          const existingUser = userMapByEmail.get(email)

          try {
            const userSyncPayload = {
              email,
              nome,
              cargo,
              area: areaNome,
              role: email === 'miguel.santiago@ctxcenografia.com.br' ? 'admin' : 'colaborador',
              password: 'CTX@2027',
              must_change_password: email === 'miguel.santiago@ctxcenografia.com.br' ? false : true,
              update_password: !existingUser,
            }

            const syncRes = await runWithRetry(() =>
              pb.send<{ success: boolean; user: UserProfile }>('/backend/v1/ctx/sync-user', {
                method: 'POST',
                body: userSyncPayload,
              }),
            )

            if (syncRes && syncRes.user) {
              userId = syncRes.user.id
              userMapByEmail.set(email, syncRes.user)
            }
          } catch (err: unknown) {
            const msg = getErrorMessage(err)
            errors.push({
              etapa: 'Usuários/Login',
              linha: i + 2,
              codigo,
              motivo: `${email}: ${msg}`,
              payload: { email, nome, cargo, area: areaNome },
            })
          }

          const areaId = areaIdMap.get(areaNome.toLowerCase()) || null

          const colabPayload = {
            codigo,
            nome,
            cargo,
            area: areaId,
            email,
            sem_metas,
            usuario: userId || existingUser?.id || null,
          }

          try {
            const colabKey = codigo.toLowerCase()
            if (colabMapByCodigo.has(colabKey)) {
              const colabId = colabMapByCodigo.get(colabKey)!
              await runWithRetry(() => pb.collection('colaboradores').update(colabId, colabPayload))
            } else {
              const created = await runWithRetry(() =>
                pb.collection('colaboradores').create(colabPayload),
              )
              colabMapByCodigo.set(colabKey, created.id)
            }
          } catch (err: unknown) {
            const msg = getErrorMessage(err)
            errors.push({
              etapa: 'Colaboradores',
              linha: i + 2,
              codigo,
              motivo: msg,
              payload: colabPayload,
            })
          }

          await sleep(40)
        }

        // Re-sincronizar colaboradores
        const freshColabs = await runWithRetry(() =>
          pb.collection('colaboradores').getFullList<Colaborador>(),
        )
        freshColabs.forEach((c) => {
          const cCod = (c?.codigo ?? '').trim().toLowerCase()
          if (cCod) colabMapByCodigo.set(cCod, c.id)
        })
      }

      // ==========================================================
      // PASSO 3: IMPORTAR PROCESSOS (DUAS PASSADAS) (se arquivo fornecido)
      // ==========================================================
      if (fileProcs) {
        setCurrentStep('Importando Processos — 1ª Passada...')
        setProgressMsg('Criando todos os registros de processos (com espaçamento e retry)...')

        const procsText = await fileProcs.text()
        const parsedProcs = parseCsv(procsText)

        if (parsedProcs.headers.length > 0 && !parsedProcs.headers.includes('codigo')) {
          throw new Error(
            `Nenhuma coluna 'codigo' encontrada no arquivo de Processos. Colunas lidas: ${parsedProcs.headers.join(', ')}.`,
          )
        }

        for (let i = 0; i < parsedProcs.rows.length; i++) {
          const row = parsedProcs.rows[i]
          const codigo = (row?.codigo ?? '').trim().toUpperCase()
          const nome = (row?.nome ?? '').trim()
          const area = (row?.area ?? '').trim()
          const observacao = (row?.observacao ?? '').trim()

          if (!codigo || !nome || !area) {
            const hasAnyData = Object.values(row || {}).some((v) => (v ?? '').trim() !== '')
            if (!hasAnyData) continue

            errors.push({
              etapa: 'Processos (1ª passada)',
              linha: i + 2,
              codigo: codigo || '(sem código)',
              motivo: 'Campos obrigatórios ausentes (código, nome ou área)',
              payload: { codigo, nome, area, observacao },
            })
            continue
          }

          const payload = {
            codigo,
            nome,
            area,
            observacao,
          }

          try {
            if (procMapByCodigo.has(codigo)) {
              const id = procMapByCodigo.get(codigo)!
              // Preserva etapas_anteriores/etapas_sucessoras existentes na atualização
              await runWithRetry(() => pb.collection('processos').update(id, payload), {
                maxAttempts: 6,
                initialDelayMs: 500,
              })
            } else {
              const created = await runWithRetry(() => pb.collection('processos').create(payload), {
                maxAttempts: 6,
                initialDelayMs: 500,
              })
              procMapByCodigo.set(codigo, created.id)
            }
          } catch (err: unknown) {
            const msg = getErrorMessage(err)
            errors.push({
              etapa: 'Processos (1ª passada)',
              linha: i + 2,
              codigo,
              motivo: msg,
              payload,
            })
          }

          await sleep(60)
          if (i % 20 === 0) {
            setProgressMsg(`Processos 1ª passada: ${i + 1}/${parsedProcs.rows.length} gravados...`)
          }
        }

        // Atualizar lista completa de IDs de processos antes da 2ª passada
        const updatedProcs = await runWithRetry(() => pb.collection('processos').getFullList())
        updatedProcs.forEach((p) => {
          const cod = (p?.codigo ?? '').trim().toUpperCase()
          if (cod) procMapByCodigo.set(cod, p.id)
        })

        // 2ª passada: resolver relações etapas_anteriores e etapas_sucessoras
        setCurrentStep('Importando Processos — 2ª Passada (Conexões)...')
        setProgressMsg('Resolvendo vínculos entre etapas com espaçamento e retry anti-429...')

        for (let i = 0; i < parsedProcs.rows.length; i++) {
          const row = parsedProcs.rows[i]
          const codigo = (row?.codigo ?? '').trim().toUpperCase()
          if (!codigo) continue

          const procId = procMapByCodigo.get(codigo)
          if (!procId) continue

          const anterioresCodes = splitCodes(row.etapas_anteriores).map((s) => s.toUpperCase())
          const sucessorasCodes = splitCodes(row.etapas_sucessoras).map((s) => s.toUpperCase())

          const anterioresIds: string[] = []
          for (const cod of anterioresCodes) {
            const id = procMapByCodigo.get(cod)
            if (id) {
              anterioresIds.push(id)
            } else {
              errors.push({
                etapa: 'Processos (2ª passada)',
                linha: i + 2,
                codigo,
                motivo: `Referência a etapa anterior inexistente: "${cod}"`,
              })
            }
          }

          const sucessorasIds: string[] = []
          for (const cod of sucessorasCodes) {
            const id = procMapByCodigo.get(cod)
            if (id) {
              sucessorasIds.push(id)
            } else {
              errors.push({
                etapa: 'Processos (2ª passada)',
                linha: i + 2,
                codigo,
                motivo: `Referência a etapa sucessora inexistente: "${cod}"`,
              })
            }
          }

          try {
            await runWithRetry(
              () =>
                pb.collection('processos').update(procId, {
                  etapas_anteriores: anterioresIds,
                  etapas_sucessoras: sucessorasIds,
                }),
              { maxAttempts: 6, initialDelayMs: 500 },
            )
          } catch (err: unknown) {
            const msg = getErrorMessage(err)
            errors.push({
              etapa: 'Processos (2ª passada)',
              linha: i + 2,
              codigo,
              motivo: msg,
              payload: {
                procId,
                anterioresIds,
                sucessorasIds,
              },
            })
          }

          await sleep(65)
          if (i % 20 === 0) {
            setProgressMsg(
              `Processos 2ª passada: ${i + 1}/${parsedProcs.rows.length} conexões sincronizadas...`,
            )
          }
        }
      }

      // ==========================================================
      // PASSO 4: IMPORTAR PROJETOS ESTRATÉGICOS (Etapa 2)
      // ==========================================================
      if (fileProjetos) {
        setCurrentStep('Importando Projetos Estratégicos...')
        setProgressMsg('Processando projetos estratégicos e vínculos com sponsors...')

        const projsText = await fileProjetos.text()
        const parsedProjs = parseCsv(projsText)

        if (parsedProjs.headers.length > 0 && !parsedProjs.headers.includes('codigo')) {
          throw new Error(
            `Nenhuma coluna 'codigo' encontrada no arquivo de Projetos. Colunas lidas: ${parsedProjs.headers.join(', ')}.`,
          )
        }

        for (let i = 0; i < parsedProjs.rows.length; i++) {
          const row = parsedProjs.rows[i]
          const codigo = (row?.codigo ?? '').trim().toUpperCase()
          const nome = (row?.nome ?? '').trim()
          const descricao = (row?.descricao ?? '').trim()
          const sponsorCode = (row?.sponsor ?? '').trim().toLowerCase()

          if (!codigo || !nome) {
            const hasAnyData = Object.values(row || {}).some((v) => (v ?? '').trim() !== '')
            if (!hasAnyData) continue
            errors.push({
              etapa: 'Projetos Estratégicos',
              linha: i + 2,
              codigo: codigo || '(sem código)',
              motivo: 'Campos obrigatórios ausentes (código ou nome)',
              payload: { codigo, nome, descricao, sponsorCode },
            })
            continue
          }

          let sponsorId: string | null = null
          if (sponsorCode) {
            sponsorId = colabMapByCodigo.get(sponsorCode) || null
            if (!sponsorId) {
              errors.push({
                etapa: 'Projetos Estratégicos',
                linha: i + 2,
                codigo,
                motivo: `Sponsor não encontrado no cadastro de colaboradores: "${sponsorCode}"`,
              })
            }
          }

          const payload = {
            codigo,
            nome,
            descricao,
            sponsor: sponsorId,
          }

          try {
            if (projMapByCodigo.has(codigo)) {
              const id = projMapByCodigo.get(codigo)!
              await runWithRetry(() => pb.collection('projetos_estrategicos').update(id, payload), {
                maxAttempts: 6,
                initialDelayMs: 400,
              })
            } else {
              const created = await runWithRetry(
                () => pb.collection('projetos_estrategicos').create(payload),
                { maxAttempts: 6, initialDelayMs: 400 },
              )
              projMapByCodigo.set(codigo, created.id)
            }
          } catch (err: unknown) {
            const msg = getErrorMessage(err)
            errors.push({
              etapa: 'Projetos Estratégicos',
              linha: i + 2,
              codigo,
              motivo: msg,
              payload,
            })
          }
          await sleep(50)
        }

        // Re-sincronizar projetos
        const freshProjs = await runWithRetry(() =>
          pb.collection('projetos_estrategicos').getFullList(),
        )
        freshProjs.forEach((pr) => {
          const cod = (pr?.codigo ?? '').trim().toUpperCase()
          if (cod) projMapByCodigo.set(cod, pr.id)
        })
      }

      // ==========================================================
      // PASSO 5: IMPORTAR METAS (Etapa 2)
      // ==========================================================
      const metaMapByCodigo = new Map<string, string>() // codigo.toUpperCase() -> id
      const existingMetas = await runWithRetry(() => pb.collection('metas').getFullList())
      existingMetas.forEach((m) => {
        const cod = (m?.codigo ?? '').trim().toUpperCase()
        if (cod) metaMapByCodigo.set(cod, m.id)
      })

      if (fileMetas) {
        setCurrentStep('Importando Metas...')
        setProgressMsg('Processando 80 metas, responsáveis, projetos e processos vinculados...')

        const metasText = await fileMetas.text()
        const parsedMetas = parseCsv(metasText)

        if (parsedMetas.headers.length > 0 && !parsedMetas.headers.includes('codigo')) {
          throw new Error(
            `Nenhuma coluna 'codigo' encontrada no arquivo de Metas. Colunas lidas: ${parsedMetas.headers.join(', ')}.`,
          )
        }

        for (let i = 0; i < parsedMetas.rows.length; i++) {
          const row = parsedMetas.rows[i]
          const codigo = (row?.codigo ?? '').trim().toUpperCase()
          const titulo = (row?.titulo ?? '').trim()
          const descricao = (row?.descricao ?? '').trim()
          const respRaw = row?.responsaveis ?? ''
          const projPrincCode = (row?.projeto_principal ?? '').trim().toUpperCase()
          const projSecCode = (row?.projeto_secundario ?? '').trim().toUpperCase()
          const periodicidade = (row?.periodicidade ?? '').trim()
          const prazoRaw = row?.prazo ?? ''
          const trimestre = (row?.trimestre ?? '').trim()
          const procsVincRaw = row?.processos_vinculados ?? ''
          const valorAlvoRaw = (row?.valor_alvo_a_definir ?? '').trim().toLowerCase()
          const valor_alvo_a_definir = valorAlvoRaw === 'sim' || valorAlvoRaw === 'true'

          if (!codigo || !titulo) {
            const hasAnyData = Object.values(row || {}).some((v) => (v ?? '').trim() !== '')
            if (!hasAnyData) continue
            errors.push({
              etapa: 'Metas',
              linha: i + 2,
              codigo: codigo || '(sem código)',
              motivo: 'Campos obrigatórios ausentes (código ou título)',
              payload: { codigo, titulo },
            })
            continue
          }

          // Resolver projeto principal
          const projetoId = projMapByCodigo.get(projPrincCode) || null
          if (!projetoId) {
            errors.push({
              etapa: 'Metas',
              linha: i + 2,
              codigo,
              motivo: `Projeto principal não encontrado: "${projPrincCode}"`,
            })
          }

          // Resolver projeto secundário (opcional)
          let projetoSecundarioId: string | null = null
          if (projSecCode) {
            projetoSecundarioId = projMapByCodigo.get(projSecCode) || null
            if (!projetoSecundarioId) {
              errors.push({
                etapa: 'Metas',
                linha: i + 2,
                codigo,
                motivo: `Projeto secundário inexistente: "${projSecCode}"`,
              })
            }
          }

          // Resolver responsáveis (múltiplos via colaboradores.codigo)
          const respCodes = splitCodes(respRaw).map((s) => s.toLowerCase())
          const responsaveisIds: string[] = []
          for (const rc of respCodes) {
            const cid = colabMapByCodigo.get(rc)
            if (cid) {
              responsaveisIds.push(cid)
            } else {
              errors.push({
                etapa: 'Metas',
                linha: i + 2,
                codigo,
                motivo: `Responsável (colaborador) inexistente: "${rc}"`,
              })
            }
          }
          if (respCodes.length > 0 && responsaveisIds.length === 0) {
            errors.push({
              etapa: 'Metas',
              linha: i + 2,
              codigo,
              motivo: 'Meta sem nenhum responsável válido resolvido',
            })
          }

          // Resolver processos vinculados (múltiplos via processos.codigo)
          const procCodes = splitCodes(procsVincRaw).map((s) => s.toUpperCase())
          const processosVinculadosIds: string[] = []
          for (const pc of procCodes) {
            const pid = procMapByCodigo.get(pc)
            if (pid) {
              processosVinculadosIds.push(pid)
            } else {
              errors.push({
                etapa: 'Metas',
                linha: i + 2,
                codigo,
                motivo: `Processo vinculado inexistente: "${pc}"`,
              })
            }
          }

          // Converter prazo
          const prazoIso = parseBrazilianDate(prazoRaw)

          const payload: Record<string, unknown> = {
            codigo,
            titulo,
            descricao,
            projeto: projetoId,
            projeto_secundario: projetoSecundarioId,
            responsaveis: responsaveisIds,
            periodicidade,
            prazo: prazoIso,
            trimestre,
            processos_vinculados: processosVinculadosIds,
            valor_alvo_a_definir,
            status: 'sem atualização',
            // progresso fica vazio/opcional conforme regra da Etapa 2
          }

          try {
            if (metaMapByCodigo.has(codigo)) {
              const id = metaMapByCodigo.get(codigo)!
              await runWithRetry(() => pb.collection('metas').update(id, payload), {
                maxAttempts: 6,
                initialDelayMs: 400,
              })
            } else {
              const created = await runWithRetry(() => pb.collection('metas').create(payload), {
                maxAttempts: 6,
                initialDelayMs: 400,
              })
              metaMapByCodigo.set(codigo, created.id)
            }
          } catch (err: unknown) {
            const msg = getErrorMessage(err)
            errors.push({
              etapa: 'Metas',
              linha: i + 2,
              codigo,
              motivo: msg,
              payload,
            })
          }

          await sleep(50)
          if (i % 20 === 0) {
            setProgressMsg(`Metas: ${i + 1}/${parsedMetas.rows.length} processadas...`)
          }
        }

        // Re-sincronizar metas
        const freshMetas = await runWithRetry(() => pb.collection('metas').getFullList())
        freshMetas.forEach((m) => {
          const cod = (m?.codigo ?? '').trim().toUpperCase()
          if (cod) metaMapByCodigo.set(cod, m.id)
        })
      }

      // ==========================================================
      // PASSO 6: IMPORTAR INDICADORES (Etapa 2)
      // "Indicadores de uma meta são SUBSTITUÍDOS pelos do arquivo na reimportação"
      // ==========================================================
      if (fileIndicadores) {
        setCurrentStep('Importando Indicadores...')
        setProgressMsg('Processando indicadores e associando às metas correspondentes...')

        const indText = await fileIndicadores.text()
        const parsedInd = parseCsv(indText)

        // Agrupar linhas de indicadores por meta (ex.: MT1 -> [ind1, ind2, ...])
        const indByMetaCode = new Map<string, typeof parsedInd.rows>()
        for (let i = 0; i < parsedInd.rows.length; i++) {
          const row = parsedInd.rows[i]
          const metaCode = (row?.meta ?? '').trim().toUpperCase()
          if (!metaCode) {
            const hasAnyData = Object.values(row || {}).some((v) => (v ?? '').trim() !== '')
            if (!hasAnyData) continue
            errors.push({
              etapa: 'Indicadores',
              linha: i + 2,
              codigo: '(sem meta)',
              motivo: 'Coluna meta ausente ou em branco',
            })
            continue
          }
          if (!indByMetaCode.has(metaCode)) indByMetaCode.set(metaCode, [])
          indByMetaCode.get(metaCode)!.push(row)
        }

        // Para garantir substituição limpa dos indicadores da meta,
        // carregamos os indicadores atuais do banco
        const freshInds = await runWithRetry(() => pb.collection('indicadores').getFullList())
        const existingIndsByMetaId = new Map<string, string[]>() // metaId -> [indId, ...]
        freshInds.forEach((ind) => {
          const mId = ind.meta
          if (mId) {
            if (!existingIndsByMetaId.has(mId)) existingIndsByMetaId.set(mId, [])
            existingIndsByMetaId.get(mId)!.push(ind.id)
          }
        })

        let indCounter = 0
        const totalRows = parsedInd.rows.length

        for (const [metaCode, rows] of indByMetaCode.entries()) {
          const metaId = metaMapByCodigo.get(metaCode)
          if (!metaId) {
            rows.forEach((r, idx) => {
              errors.push({
                etapa: 'Indicadores',
                codigo: `${metaCode} - ${(r.nome || '').substring(0, 20)}`,
                motivo: `Meta não encontrada para o código: "${metaCode}"`,
                payload: r,
              })
            })
            continue
          }

          // Se a meta já possuía indicadores gravados anteriormente, apagamos para substituir pelos do arquivo
          const oldIds = existingIndsByMetaId.get(metaId) || []
          for (const oldId of oldIds) {
            try {
              await runWithRetry(() => pb.collection('indicadores').delete(oldId), {
                maxAttempts: 5,
              })
            } catch {
              /* intentionally ignored */
            }
            await sleep(15)
          }
          // Limpa do mapa para não re-deletar
          existingIndsByMetaId.delete(metaId)

          // Criar os novos indicadores
          for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const row = rows[rIdx]
            const nome = (row?.nome ?? '').trim()
            const ordem =
              parseInt((row?.ordem ?? `${rIdx + 1}`).trim() || `${rIdx + 1}`, 10) || rIdx + 1
            const alvo = (row?.alvo ?? '').trim()

            if (!nome) {
              errors.push({
                etapa: 'Indicadores',
                codigo: `${metaCode} (ordem ${ordem})`,
                motivo: 'Nome do indicador vazio',
              })
              continue
            }

            const payload = {
              meta: metaId,
              nome,
              ordem,
              alvo,
              // valor_atual, valor_meta, tendencia, historico ficam opcionais e vazios
            }

            try {
              await runWithRetry(() => pb.collection('indicadores').create(payload), {
                maxAttempts: 6,
                initialDelayMs: 400,
              })
            } catch (err: unknown) {
              const msg = getErrorMessage(err)
              errors.push({
                etapa: 'Indicadores',
                codigo: `${metaCode} - ${nome.substring(0, 25)}`,
                motivo: msg,
                payload,
              })
            }

            indCounter++
            await sleep(40)
            if (indCounter % 25 === 0) {
              setProgressMsg(`Indicadores: ${indCounter}/${totalRows} salvos...`)
            }
          }
        }
      }

      // Re-carregar banco e gerar relatório final
      const finalReport = await refreshValidationReportCounts(errors)
      setReport(finalReport)
      await loadUsersAndColabs()

      if (errors.length === 0) {
        toast({
          title: 'Importação 100% Concluída!',
          description: 'Todos os dados e conexões foram gravados com sucesso sem rejeições.',
        })
      } else {
        toast({
          title: 'Importação finalizada com avisos',
          description: `${errors.length} itens tiveram avisos/rejeições. Você pode tentar reprocessá-los abaixo.`,
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      console.error('Falha geral na importação:', err)
      const msg = getErrorMessage(err)
      toast({
        title: 'Erro na importação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
      setCurrentStep('')
      setProgressMsg('')
    }
  }

  // Reprocessamento exclusivo dos itens rejeitados
  const handleRetryRejected = async () => {
    if (!report || report.errors.length === 0) return

    setImporting(true)
    setCurrentStep('Reprocessando linhas rejeitadas...')
    setProgressMsg('Tentando novamente apenas os itens que falharam anteriormente...')

    const itemsToRetry = [...report.errors]
    const remainingErrors: RejectedItem[] = []

    try {
      // Carregar mapas em tempo real
      const [areas, colabs, users, procs, projs, metas] = await Promise.all([
        runWithRetry(() => pb.collection('areas').getFullList()),
        runWithRetry(() => pb.collection('colaboradores').getFullList<Colaborador>()),
        runWithRetry(() => pb.collection('users').getFullList<UserProfile>()),
        runWithRetry(() => pb.collection('processos').getFullList()),
        runWithRetry(() => pb.collection('projetos_estrategicos').getFullList()),
        runWithRetry(() => pb.collection('metas').getFullList()),
      ])

      const areaIdMap = new Map<string, string>()
      areas.forEach((a) => {
        const aNome = (a?.nome ?? '').trim().toLowerCase()
        if (aNome) areaIdMap.set(aNome, a.id)
      })

      const userMapByEmail = new Map<string, UserProfile>()
      users.forEach((u) => {
        const uEmail = (u?.email ?? '').trim().toLowerCase()
        if (uEmail) userMapByEmail.set(uEmail, u)
      })

      const colabMapByCodigo = new Map<string, string>()
      colabs.forEach((c) => {
        const cCod = (c?.codigo ?? '').trim().toLowerCase()
        if (cCod) colabMapByCodigo.set(cCod, c.id)
      })

      const procMapByCodigo = new Map<string, string>()
      procs.forEach((p) => {
        const pCod = (p?.codigo ?? '').trim().toUpperCase()
        if (pCod) procMapByCodigo.set(pCod, p.id)
      })

      const projMapByCodigo = new Map<string, string>()
      projs.forEach((pr) => {
        const prCod = (pr?.codigo ?? '').trim().toUpperCase()
        if (prCod) projMapByCodigo.set(prCod, pr.id)
      })

      const metaMapByCodigo = new Map<string, string>()
      metas.forEach((m) => {
        const mCod = (m?.codigo ?? '').trim().toUpperCase()
        if (mCod) metaMapByCodigo.set(mCod, m.id)
      })

      for (let i = 0; i < itemsToRetry.length; i++) {
        const item = itemsToRetry[i]
        const itemCodDisplay = (item.codigo ?? '').trim()
        setProgressMsg(
          `Reprocessando item ${i + 1}/${itemsToRetry.length} (${item.etapa} - ${itemCodDisplay})...`,
        )

        try {
          if (item.etapa === 'Áreas') {
            const payload = item.payload as
              | { nome: string; ordem_no_fluxo: number; tipo: string }
              | undefined
            const nome = (payload?.nome ?? item.codigo ?? '').trim()
            if (!nome) throw new Error('Nome da área ausente')

            const key = nome.toLowerCase()
            const existingId = areaIdMap.get(key)
            const areaSavePayload = payload
              ? { ...payload, nome }
              : { nome, ordem_no_fluxo: 0, tipo: 'área' }
            if (existingId) {
              await runWithRetry(() => pb.collection('areas').update(existingId, areaSavePayload))
            } else {
              const created = await runWithRetry(() =>
                pb.collection('areas').create(areaSavePayload),
              )
              areaIdMap.set(key, created.id)
            }
          } else if (item.etapa === 'Usuários/Login') {
            const p = item.payload as
              | { email: string; nome: string; cargo?: string; area?: string }
              | undefined
            const email = (p?.email ?? item.codigo ?? '').trim().toLowerCase()
            const nome = (p?.nome ?? item.codigo ?? email).trim()
            if (!email) throw new Error('E-mail do usuário ausente')

            const syncRes = await runWithRetry(() =>
              pb.send<{ success: boolean; user: UserProfile }>('/backend/v1/ctx/sync-user', {
                method: 'POST',
                body: {
                  email,
                  nome,
                  cargo: (p?.cargo ?? '').trim(),
                  area: (p?.area ?? '').trim(),
                  role: email === 'miguel.santiago@ctxcenografia.com.br' ? 'admin' : 'colaborador',
                  password: 'CTX@2027',
                  must_change_password:
                    email === 'miguel.santiago@ctxcenografia.com.br' ? false : true,
                  update_password: false,
                },
              }),
            )
            if (syncRes && syncRes.user) {
              userMapByEmail.set(email, syncRes.user)
            }
          } else if (item.etapa === 'Colaboradores') {
            const p = item.payload as Record<string, unknown> | undefined
            const codigo = (item.codigo ?? (p?.codigo as string) ?? '').trim().toLowerCase()
            if (!codigo) throw new Error('Código do colaborador ausente')

            const existingId = colabMapByCodigo.get(codigo)
            if (existingId && p) {
              await runWithRetry(() => pb.collection('colaboradores').update(existingId, p))
            } else if (p) {
              const created = await runWithRetry(() => pb.collection('colaboradores').create(p))
              colabMapByCodigo.set(codigo, created.id)
            }
          } else if (item.etapa === 'Processos (1ª passada)') {
            const p = item.payload as
              | { codigo: string; nome: string; area: string; observacao?: string }
              | undefined
            const codigo = (item.codigo ?? p?.codigo ?? '').trim().toUpperCase()
            if (!codigo) throw new Error('Código do processo ausente')

            const existingId = procMapByCodigo.get(codigo)
            if (existingId && p) {
              await runWithRetry(() => pb.collection('processos').update(existingId, p), {
                maxAttempts: 6,
              })
            } else if (p) {
              const created = await runWithRetry(() => pb.collection('processos').create(p), {
                maxAttempts: 6,
              })
              procMapByCodigo.set(codigo, created.id)
            }
          } else if (item.etapa === 'Processos (2ª passada)') {
            const p = item.payload as
              | { procId: string; anterioresIds: string[]; sucessorasIds: string[] }
              | undefined
            const codigo = (item.codigo ?? '').trim().toUpperCase()
            const procId = p?.procId || procMapByCodigo.get(codigo)
            if (!procId)
              throw new Error(`Processo ${codigo || 'desconhecido'} não encontrado para vinculação`)

            await runWithRetry(
              () =>
                pb.collection('processos').update(procId, {
                  etapas_anteriores: p?.anterioresIds || [],
                  etapas_sucessoras: p?.sucessorasIds || [],
                }),
              { maxAttempts: 6 },
            )
          } else if (item.etapa === 'Projetos Estratégicos') {
            const p = item.payload as Record<string, unknown> | undefined
            const codigo = (item.codigo ?? (p?.codigo as string) ?? '').trim().toUpperCase()
            if (!codigo) throw new Error('Código do projeto ausente')

            const existingId = projMapByCodigo.get(codigo)
            if (existingId && p) {
              await runWithRetry(() => pb.collection('projetos_estrategicos').update(existingId, p))
            } else if (p) {
              const created = await runWithRetry(() =>
                pb.collection('projetos_estrategicos').create(p),
              )
              projMapByCodigo.set(codigo, created.id)
            }
          } else if (item.etapa === 'Metas') {
            const p = item.payload as Record<string, unknown> | undefined
            const codigo = (item.codigo ?? (p?.codigo as string) ?? '').trim().toUpperCase()
            if (!codigo) throw new Error('Código da meta ausente')

            const existingId = metaMapByCodigo.get(codigo)
            if (existingId && p) {
              await runWithRetry(() => pb.collection('metas').update(existingId, p))
            } else if (p) {
              const created = await runWithRetry(() => pb.collection('metas').create(p))
              metaMapByCodigo.set(codigo, created.id)
            }
          } else if (item.etapa === 'Indicadores') {
            const p = item.payload as Record<string, unknown> | undefined
            if (p) {
              await runWithRetry(() => pb.collection('indicadores').create(p))
            }
          }

          await sleep(60)
        } catch (err: unknown) {
          remainingErrors.push({
            ...item,
            motivo: getErrorMessage(err),
          })
        }
      }

      const refreshed = await refreshValidationReportCounts(remainingErrors)
      setReport(refreshed)
      await loadUsersAndColabs()

      if (remainingErrors.length === 0) {
        toast({
          title: 'Reprocessamento concluído com sucesso!',
          description: 'Todas as linhas rejeitadas foram integradas perfeitamente.',
        })
      } else {
        toast({
          title: 'Reprocessamento parcial',
          description: `${remainingErrors.length} de ${itemsToRetry.length} itens ainda não puderam ser salvos.`,
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      console.error('Falha ao reprocessar rejeitados:', err)
      toast({
        title: 'Erro ao reprocessar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
      setCurrentStep('')
      setProgressMsg('')
    }
  }

  // Redefinição manual de senha por admin via endpoint seguro do servidor
  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId || !newPassword) {
      toast({
        title: 'Campos incompletos',
        description: 'Selecione um colaborador e informe a nova senha.',
        variant: 'destructive',
      })
      return
    }

    const trimmedPassword = newPassword.trim()

    if (trimmedPassword.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve conter pelo menos 8 dígitos.',
        variant: 'destructive',
      })
      return
    }

    if (trimmedPassword === 'CTX@2027') {
      toast({
        title: 'Senha não permitida',
        description:
          'A senha provisória CTX@2027 não pode ser utilizada na redefinição. Escolha uma senha segura individual.',
        variant: 'destructive',
      })
      return
    }

    setResettingPassword(true)
    try {
      const res = await pb.send<{
        success: boolean
        message?: string
        user?: { id: string; name: string; email: string }
      }>('/backend/v1/ctx/admin-reset-password', {
        method: 'POST',
        body: {
          userId: selectedUserId,
          password: trimmedPassword,
        },
      })

      if (!res || !res.success) {
        throw new Error(res?.message || 'Falha ao redefinir a senha do colaborador.')
      }

      toast({
        title: 'Senha redefinida com sucesso!',
        description:
          res.message ||
          'A senha foi atualizada. O colaborador precisará alterá-la no próximo login.',
      })
      setNewPassword('')
      // Recarrega a lista de usuários para manter o estado atualizado
      loadUsersAndColabs()
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        title: 'Falha na redefinição',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setResettingPassword(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-[#262626] pb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold mb-2">
          <Database className="w-3.5 h-3.5" />
          Administração do Sistema
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
          Importação de Dados & Gestão de Acessos
        </h1>
        <p className="text-sm text-[#9CA3AF] mt-1">
          Área restrita à diretoria e administração CTX. Faça o upload das planilhas da Etapa 1
          (Áreas, Colaboradores, Processos) e Etapa 2 (Projetos, Metas, Indicadores) para popular o
          ambiente em tempo real.
        </p>
      </div>

      {/* SEÇÃO 1: UPLOADS EM CASCATA */}
      <div className="bg-[#111111] border border-[#262626] rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#262626] pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-[#FFD400]" />
              Importação em Cascata (Etapa 1 &amp; Etapa 2)
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              1. Áreas &rarr; 2. Colaboradores &rarr; 3. Processos &rarr; 4. Projetos &rarr; 5.
              Metas &rarr; 6. Indicadores
            </p>
          </div>
          <span className="text-[11px] font-mono uppercase bg-[#1C1C1C] border border-[#262626] text-[#FFD400] px-3 py-1 rounded-full">
            Suporta CSV
          </span>
        </div>

        {/* Uploads em Cascata: Etapa 1 e Etapa 2 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#9CA3AF] uppercase tracking-wider">
              Etapa 1: Estrutura Base
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Áreas */}
            <div
              className={`p-5 rounded-xl border-2 border-dashed transition-all flex flex-col justify-between ${
                fileAreas
                  ? 'border-[#22C55E]/60 bg-[#22C55E]/5'
                  : 'border-[#262626] bg-[#141414] hover:border-[#FFD400]/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#FFD400] text-black font-black text-xs flex items-center justify-center">
                    1
                  </span>
                  {fileAreas ? (
                    <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-[#9CA3AF]" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-white">01_areas</h3>
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Colunas: <span className="font-mono text-white">nome, ordem_no_fluxo, tipo</span>
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#262626]/80">
                <input
                  type="file"
                  id="file-areas"
                  accept=".csv"
                  onChange={(e) => setFileAreas(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="file-areas"
                  className="w-full py-2 px-3 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors flex items-center justify-center gap-1.5 cursor-pointer truncate"
                >
                  {fileAreas ? fileAreas.name : 'Selecionar 01_areas.csv'}
                </label>
              </div>
            </div>

            {/* 2. Colaboradores */}
            <div
              className={`p-5 rounded-xl border-2 border-dashed transition-all flex flex-col justify-between ${
                fileColabs
                  ? 'border-[#22C55E]/60 bg-[#22C55E]/5'
                  : 'border-[#262626] bg-[#141414] hover:border-[#FFD400]/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#FFD400] text-black font-black text-xs flex items-center justify-center">
                    2
                  </span>
                  {fileColabs ? (
                    <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-[#9CA3AF]" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-white">02_colaboradores</h3>
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Colunas:{' '}
                  <span className="font-mono text-white">
                    codigo, nome, cargo, area, email, sem_metas
                  </span>
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#262626]/80">
                <input
                  type="file"
                  id="file-colabs"
                  accept=".csv"
                  onChange={(e) => setFileColabs(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="file-colabs"
                  className="w-full py-2 px-3 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors flex items-center justify-center gap-1.5 cursor-pointer truncate"
                >
                  {fileColabs ? fileColabs.name : 'Selecionar 02_colaboradores.csv'}
                </label>
              </div>
            </div>

            {/* 3. Processos */}
            <div
              className={`p-5 rounded-xl border-2 border-dashed transition-all flex flex-col justify-between ${
                fileProcs
                  ? 'border-[#22C55E]/60 bg-[#22C55E]/5'
                  : 'border-[#262626] bg-[#141414] hover:border-[#FFD400]/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#FFD400] text-black font-black text-xs flex items-center justify-center">
                    3
                  </span>
                  {fileProcs ? (
                    <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-[#9CA3AF]" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-white">04_processos</h3>
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Colunas:{' '}
                  <span className="font-mono text-white">
                    codigo, nome, area, etapas_anteriores, etapas_sucessoras
                  </span>
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#262626]/80">
                <input
                  type="file"
                  id="file-procs"
                  accept=".csv"
                  onChange={(e) => setFileProcs(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="file-procs"
                  className="w-full py-2 px-3 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors flex items-center justify-center gap-1.5 cursor-pointer truncate"
                >
                  {fileProcs ? fileProcs.name : 'Selecionar 04_processos.csv'}
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs font-mono font-bold text-[#FFD400] uppercase tracking-wider">
              Etapa 2: Metas, Projetos & Indicadores
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 4. Projetos Estratégicos */}
            <div
              className={`p-5 rounded-xl border-2 border-dashed transition-all flex flex-col justify-between ${
                fileProjetos
                  ? 'border-[#22C55E]/60 bg-[#22C55E]/5'
                  : 'border-[#262626] bg-[#141414] hover:border-[#FFD400]/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#FFD400] text-black font-black text-xs flex items-center justify-center">
                    4
                  </span>
                  {fileProjetos ? (
                    <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-[#9CA3AF]" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-white">03_projetos_estrategicos</h3>
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Colunas:{' '}
                  <span className="font-mono text-white">codigo, nome, descricao, sponsor</span>
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#262626]/80">
                <input
                  type="file"
                  id="file-projetos"
                  accept=".csv"
                  onChange={(e) => setFileProjetos(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="file-projetos"
                  className="w-full py-2 px-3 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors flex items-center justify-center gap-1.5 cursor-pointer truncate"
                >
                  {fileProjetos ? fileProjetos.name : 'Selecionar 03_projetos_estrategicos.csv'}
                </label>
              </div>
            </div>

            {/* 5. Metas */}
            <div
              className={`p-5 rounded-xl border-2 border-dashed transition-all flex flex-col justify-between ${
                fileMetas
                  ? 'border-[#22C55E]/60 bg-[#22C55E]/5'
                  : 'border-[#262626] bg-[#141414] hover:border-[#FFD400]/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#FFD400] text-black font-black text-xs flex items-center justify-center">
                    5
                  </span>
                  {fileMetas ? (
                    <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-[#9CA3AF]" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-white">05_metas</h3>
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Colunas:{' '}
                  <span className="font-mono text-white">
                    codigo, titulo, responsaveis, projeto_principal, prazo...
                  </span>
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#262626]/80">
                <input
                  type="file"
                  id="file-metas"
                  accept=".csv"
                  onChange={(e) => setFileMetas(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="file-metas"
                  className="w-full py-2 px-3 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors flex items-center justify-center gap-1.5 cursor-pointer truncate"
                >
                  {fileMetas ? fileMetas.name : 'Selecionar 05_metas.csv'}
                </label>
              </div>
            </div>

            {/* 6. Indicadores */}
            <div
              className={`p-5 rounded-xl border-2 border-dashed transition-all flex flex-col justify-between ${
                fileIndicadores
                  ? 'border-[#22C55E]/60 bg-[#22C55E]/5'
                  : 'border-[#262626] bg-[#141414] hover:border-[#FFD400]/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#FFD400] text-black font-black text-xs flex items-center justify-center">
                    6
                  </span>
                  {fileIndicadores ? (
                    <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-[#9CA3AF]" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-white">06_indicadores</h3>
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Colunas: <span className="font-mono text-white">meta, ordem, nome, alvo</span>
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#262626]/80">
                <input
                  type="file"
                  id="file-indicadores"
                  accept=".csv"
                  onChange={(e) => setFileIndicadores(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="file-indicadores"
                  className="w-full py-2 px-3 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-white text-xs font-semibold rounded-lg border border-[#333] transition-colors flex items-center justify-center gap-1.5 cursor-pointer truncate"
                >
                  {fileIndicadores ? fileIndicadores.name : 'Selecionar 06_indicadores.csv'}
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Informações e Botão de Ação */}
        <div className="bg-[#161616] border border-[#262626] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-[#9CA3AF] space-y-1">
            <p className="flex items-center gap-1.5 text-white font-medium">
              <ShieldAlert className="w-4 h-4 text-[#FFD400]" />
              Garantia de Idempotência e Reimportação Segura
            </p>
            <p>
              Atualiza registros pelo código sem duplicar. Reimportar colaboradores ou processos não
              desfaz vínculos de metas existentes. Indicadores de uma meta são substituídos com
              precisão.
            </p>
          </div>

          <button
            onClick={handleStartImport}
            disabled={
              importing ||
              (!fileAreas &&
                !fileColabs &&
                !fileProcs &&
                !fileProjetos &&
                !fileMetas &&
                !fileIndicadores)
            }
            className="w-full sm:w-auto px-6 py-3 bg-[#FFD400] hover:bg-[#E5BE00] text-black font-extrabold rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-[#FFD400]/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {importing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{currentStep || 'Importando...'}</span>
              </>
            ) : (
              <>
                <span>Executar Importação dos Arquivos</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Feedback em tempo de execução */}
        {importing && (
          <div className="p-4 bg-[#141414] border border-[#FFD400]/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">{currentStep}</span>
              <span className="text-[#FFD400] animate-pulse font-mono">Processando</span>
            </div>
            <p className="text-xs text-[#9CA3AF]">{progressMsg}</p>
          </div>
        )}
      </div>

      {/* SEÇÃO 2: RELATÓRIO DE VALIDAÇÃO (SE EXECUTADO OU DADOS CARREGADOS) */}
      {report && (
        <div className="bg-[#111111] border border-[#262626] rounded-2xl p-6 md:p-8 space-y-6 shadow-xl animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-[#262626] pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                Relatório de Validação da Importação
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Contagens comparadas com os números esperados e checagens pontuais.
              </p>
            </div>
          </div>

          {/* Cards de Contagem — Etapa 1 e Etapa 2 */}
          <div className="space-y-3">
            <span className="text-xs font-mono font-bold text-[#9CA3AF] uppercase">
              Contagens da Estrutura Geral
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Áreas */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Áreas
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{report.counts.areas}</span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.areasExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.areas === report.counts.areasExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.areas === report.counts.areasExpected ? '100% OK' : 'Ajustado'}
                </span>
              </div>

              {/* Colaboradores */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Colaboradores
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">
                    {report.counts.colaboradores}
                  </span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.colaboradoresExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.colaboradores === report.counts.colaboradoresExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.colaboradores === report.counts.colaboradoresExpected
                    ? '100% OK'
                    : 'Ajustado'}
                </span>
              </div>

              {/* Contas de Login */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Contas Login
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{report.counts.users}</span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.usersExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.users === report.counts.usersExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.users === report.counts.usersExpected ? '100% OK' : 'Ajustado'}
                </span>
              </div>

              {/* Processos */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Processos
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{report.counts.processos}</span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.processosExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.processos === report.counts.processosExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.processos === report.counts.processosExpected
                    ? '100% OK'
                    : 'Ajustado'}
                </span>
              </div>

              {/* Conexões */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Conexões
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{report.counts.conexoes}</span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.conexoesExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.conexoes === report.counts.conexoesExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.conexoes === report.counts.conexoesExpected
                    ? '100% OK'
                    : 'Ajustado'}
                </span>
              </div>
            </div>

            {/* Cards da Etapa 2 */}
            <span className="text-xs font-mono font-bold text-[#FFD400] uppercase block pt-2">
              Contagens da Etapa 2 (Projetos, Metas, Indicadores e Vínculos)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Projetos */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Projetos
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{report.counts.projetos}</span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.projetosExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.projetos === report.counts.projetosExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.projetos === report.counts.projetosExpected
                    ? '100% OK'
                    : 'Ajustado'}
                </span>
              </div>

              {/* Metas */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Metas
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{report.counts.metas}</span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.metasExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.metas === report.counts.metasExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.metas === report.counts.metasExpected ? '100% OK' : 'Ajustado'}
                </span>
              </div>

              {/* Indicadores */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Indicadores
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">
                    {report.counts.indicadores}
                  </span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.indicadoresExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.indicadores === report.counts.indicadoresExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.indicadores === report.counts.indicadoresExpected
                    ? '100% OK'
                    : 'Ajustado'}
                </span>
              </div>

              {/* Vínculos Meta-Responsável */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Vínculos Resp.
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">
                    {report.counts.vinculosMetaResponsavel}
                  </span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.vinculosMetaResponsavelExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.vinculosMetaResponsavel ===
                    report.counts.vinculosMetaResponsavelExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.vinculosMetaResponsavel ===
                  report.counts.vinculosMetaResponsavelExpected
                    ? '100% OK'
                    : 'Ajustado'}
                </span>
              </div>

              {/* Vínculos Meta-Processo */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  Vínculos Proc.
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">
                    {report.counts.vinculosMetaProcesso}
                  </span>
                  <span className="text-xs font-mono text-[#9CA3AF]">
                    / {report.counts.vinculosMetaProcessoExpected} esp.
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.counts.vinculosMetaProcesso ===
                    report.counts.vinculosMetaProcessoExpected
                      ? 'bg-[#22C55E]/15 text-[#22C55E]'
                      : 'bg-[#FFD400]/15 text-[#FFD400]'
                  }`}
                >
                  {report.counts.vinculosMetaProcesso === report.counts.vinculosMetaProcessoExpected
                    ? '100% OK'
                    : 'Ajustado'}
                </span>
              </div>
            </div>
          </div>

          {/* Checagens Específicas do Usuário (Etapa 1 e Etapa 2) */}
          <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-3">
            <h4 className="text-xs uppercase tracking-wider font-bold text-[#FFD400]">
              Checagens Pontuais de Consistência
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {/* Check 1 */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#1F1F1F] border border-[#2B2B2B]">
                {report.checks.williamCheck === true ? (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#FFD400] shrink-0" />
                )}
                <span>
                  William Machado:{' '}
                  <strong className="text-white">
                    sem_metas = {report.checks.williamCheck ? 'sim' : 'não'}
                  </strong>
                </span>
              </div>

              {/* Check 2 */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#1F1F1F] border border-[#2B2B2B]">
                {report.checks.o01Check === true ? (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#FFD400] shrink-0" />
                )}
                <span>
                  Processo O01:{' '}
                  <strong className="text-white">
                    {report.checks.o01Check ? 'conectado a O02 e O03' : 'conexões parciais'}
                  </strong>
                </span>
              </div>

              {/* Check 3 */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#1F1F1F] border border-[#2B2B2B]">
                {report.checks.rh05Check === true ? (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#FFD400] shrink-0" />
                )}
                <span>
                  Processo RH05:{' '}
                  <strong className="text-white">
                    {report.checks.rh05Check ? 'sem conexões (conforme planilha)' : 'com conexões'}
                  </strong>
                </span>
              </div>

              {/* Check 4 (Etapa 2: MT38 Rafael e Mahara) */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#1F1F1F] border border-[#2B2B2B]">
                {report.checks.mt38ResponsaveisCheck === true ? (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                ) : report.checks.mt38ResponsaveisCheck === false ? (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#666] shrink-0" />
                )}
                <span>
                  MT38 Responsáveis:{' '}
                  <strong className="text-white">
                    {report.checks.mt38ResponsaveisCheck
                      ? 'Rafael e Mahara vinculados'
                      : 'Pendente upload'}
                  </strong>
                </span>
              </div>

              {/* Check 5 (Etapa 2: Miguel responsável por MT52 a MT55) */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#1F1F1F] border border-[#2B2B2B]">
                {report.checks.miguelMetasCheck === true ? (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                ) : report.checks.miguelMetasCheck === false ? (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#666] shrink-0" />
                )}
                <span>
                  Miguel (MT52 a MT55):{' '}
                  <strong className="text-white">
                    {report.checks.miguelMetasCheck
                      ? 'Responsável pelas 4 metas'
                      : 'Pendente upload'}
                  </strong>
                </span>
              </div>

              {/* Check 6 (Etapa 2: William sem metas) */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#1F1F1F] border border-[#2B2B2B]">
                {report.checks.williamSemMetasCheck === true ? (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                ) : report.checks.williamSemMetasCheck === false ? (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#666] shrink-0" />
                )}
                <span>
                  William (sem_metas):{' '}
                  <strong className="text-white">
                    {report.checks.williamSemMetasCheck
                      ? '0 metas atribuídas (OK)'
                      : 'Pendente upload'}
                  </strong>
                </span>
              </div>

              {/* Check 7 (Etapa 2: Paulo Emílio sponsor de P2 e P5) */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#1F1F1F] border border-[#2B2B2B]">
                {report.checks.pauloEmilioSponsorCheck === true ? (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                ) : report.checks.pauloEmilioSponsorCheck === false ? (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#666] shrink-0" />
                )}
                <span>
                  Paulo Emílio:{' '}
                  <strong className="text-white">
                    {report.checks.pauloEmilioSponsorCheck
                      ? 'Sponsor oficial de P2 e P5'
                      : 'Pendente upload'}
                  </strong>
                </span>
              </div>

              {/* Check 8 (Etapa 2: Nenhuma meta sem responsável ou projeto principal) */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#1F1F1F] border border-[#2B2B2B] md:col-span-2">
                {report.checks.todasMetasComResponsavelEProjetoCheck === true ? (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                ) : report.checks.todasMetasComResponsavelEProjetoCheck === false ? (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#666] shrink-0" />
                )}
                <span>
                  Integridade de Metas:{' '}
                  <strong className="text-white">
                    {report.checks.todasMetasComResponsavelEProjetoCheck
                      ? '100% das metas têm responsável e projeto principal'
                      : 'Pendente upload de metas'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Linhas não importadas ou advertências */}
          {report.errors.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase tracking-wider font-bold text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Avisos e Linhas Rejeitadas ({report.errors.length})
                </h4>
                <button
                  type="button"
                  onClick={handleRetryRejected}
                  disabled={importing}
                  className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 hover:border-red-500 text-red-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${importing ? 'animate-spin' : ''}`} />
                  Tentar novamente nas linhas rejeitadas
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 bg-[#141414] p-3 rounded-xl border border-red-950/40 font-mono text-[11px] text-[#D1D5DB]">
                {report.errors.map((err, idx) => (
                  <div key={idx} className="flex items-start gap-2 border-b border-[#222] pb-1">
                    <span className="text-[#FFD400]">[{err.etapa}]</span>
                    {err.linha && <span className="text-[#9CA3AF]">Linha {err.linha}:</span>}
                    {err.codigo && <span className="text-white font-bold">{err.codigo}</span>}
                    <span className="text-red-300">- {err.motivo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ATALHO RÁPIDO PARA ACOMPANHAMENTO DE CICLOS */}
      <div className="bg-[#111111] border border-[#262626] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFD400]/10 border border-[#FFD400]/30 text-[#FFD400] text-xs font-semibold">
            <Database className="w-3.5 h-3.5" />
            <span>Rotina Operacional CTX 2.0</span>
          </div>
          <h2 className="text-base font-bold text-white">
            Acompanhamento por Ciclo & Gestão de Rotina
          </h2>
          <p className="text-xs text-[#9CA3AF]">
            Gerencie ciclos (fechar/reabrir, ajustar datas, criar manuais), pause ou reative a
            rotina geral, ligue/desligue o pulso semanal e envie lembretes aos pendentes.
          </p>
        </div>
        <a
          href="/admin/ciclos"
          className="px-4 py-2.5 bg-[#FFD400] hover:bg-[#E5BE00] text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-[#FFD400]/20 shrink-0"
        >
          <span>Acessar Painel de Ciclos & Adesão</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>

      {/* SEÇÃO 3: REDEFINIÇÃO MANUAL DE SENHAS PELO ADMIN */}
      <div className="bg-[#111111] border border-[#262626] rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
        <div className="border-b border-[#262626] pb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#FFD400]" />
            Redefinição Manual de Senha de Colaborador
          </h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Como os e-mails corporativos ainda não recebem mensagens externas, o Admin pode definir
            uma senha provisória ou nova senha diretamente por aqui.
          </p>
        </div>

        <form onSubmit={handleAdminResetPassword} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-xs font-semibold text-[#D1D5DB] mb-1.5">
              Selecione o Colaborador
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              required
              className="w-full bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD400] transition-colors"
            >
              <option value="">Selecione um usuário...</option>
              {usersList.map((u) => {
                const colab = colaboradoresList.find((c) => c.email === u.email)
                const cargoText = colab?.cargo ? ` (${colab.cargo})` : ''
                return (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email} — {u.email}
                    {cargoText}
                  </option>
                )
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#D1D5DB] mb-1.5">
              Nova Senha (mínimo 8 dígitos)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-3" />
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Ex.: Nova senha (mínimo 8 dígitos, diferente de CTX@2027)"
                required
                className="w-full bg-[#171717] border border-[#262626] rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD400] transition-colors"
              />
            </div>
            <p className="text-[11px] text-[#9CA3AF] mt-1">
              A flag <span className="font-mono text-[#FFD400]">must_change_password</span> será
              ativada para que o colaborador confirme ou altere no próximo login.
            </p>
          </div>

          <button
            type="submit"
            disabled={resettingPassword || !selectedUserId || !newPassword}
            className="px-5 py-2.5 bg-[#FFD400] hover:bg-[#E5BE00] text-black font-bold rounded-lg text-sm flex items-center gap-2 transition-all shadow-md shadow-[#FFD400]/20 disabled:opacity-40"
          >
            {resettingPassword ? (
              <span>Salvando...</span>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Definir Senha do Colaborador</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
