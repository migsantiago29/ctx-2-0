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
import type { UserProfile, Colaborador } from '@/types/ctx'
import { toast } from '@/hooks/use-toast'

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
  }
  checks: {
    williamCheck: boolean | null
    o01Check: boolean | null
    rh05Check: boolean | null
  }
  errors: Array<{ etapa: string; linha?: number; codigo?: string; motivo: string }>
}

export default function AdminImport() {
  const { user } = useAuth()

  // Arquivos selecionados
  const [fileAreas, setFileAreas] = useState<File | null>(null)
  const [fileColabs, setFileColabs] = useState<File | null>(null)
  const [fileProcs, setFileProcs] = useState<File | null>(null)

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

  // Função principal de importação
  const handleStartImport = async () => {
    if (!fileAreas || !fileColabs || !fileProcs) {
      toast({
        title: 'Arquivos pendentes',
        description: 'Selecione os 3 arquivos CSV antes de iniciar a importação.',
        variant: 'destructive',
      })
      return
    }

    setImporting(true)
    setProgressMsg('Lendo arquivos CSV...')
    setReport(null)

    const rep: ValidationReport = {
      counts: {
        areas: 0,
        areasExpected: 14,
        colaboradores: 0,
        colaboradoresExpected: 21,
        users: 0,
        usersExpected: 21,
        processos: 0,
        processosExpected: 181,
        conexoes: 0,
        conexoesExpected: 217,
      },
      checks: {
        williamCheck: null,
        o01Check: null,
        rh05Check: null,
      },
      errors: [],
    }

    try {
      // 1. Ler os três arquivos texto
      const areasText = await fileAreas.text()
      const colabsText = await fileColabs.text()
      const procsText = await fileProcs.text()

      const parsedAreas = parseCsv(areasText)
      const parsedColabs = parseCsv(colabsText)
      const parsedProcs = parseCsv(procsText)

      // ==========================================================
      // PASSO 1: IMPORTAR ÁREAS
      // ==========================================================
      setCurrentStep('Importando Áreas...')
      setProgressMsg('Processando registros de áreas...')

      // Carregar áreas já existentes para idempotência
      const existingAreas = await pb.collection('areas').getFullList()
      const areaMapByName = new Map<string, string>() // nome -> id
      for (const a of existingAreas) {
        areaMapByName.set(a.nome.trim().toLowerCase(), a.id)
      }

      for (let i = 0; i < parsedAreas.rows.length; i++) {
        const row = parsedAreas.rows[i]
        const nome = (row.nome || '').trim()
        if (!nome) {
          rep.errors.push({
            etapa: 'Áreas',
            linha: i + 2,
            motivo: 'Nome da área vazio',
          })
          continue
        }

        const ordem = parseInt(row.ordem_no_fluxo || '0', 10) || 0
        const tipoRaw = (row.tipo || '').trim().toLowerCase()
        // tipo pode ser "área" ou "grupo de processos (marcos de produção)"
        const tipo =
          tipoRaw.includes('grupo') || tipoRaw.includes('marco') ? 'grupo de processos' : 'área'

        const areaPayload = {
          nome,
          ordem_no_fluxo: ordem,
          tipo,
        }

        try {
          const key = nome.toLowerCase()
          if (areaMapByName.has(key)) {
            const id = areaMapByName.get(key)!
            await pb.collection('areas').update(id, areaPayload)
          } else {
            const created = await pb.collection('areas').create(areaPayload)
            areaMapByName.set(key, created.id)
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro ao salvar área'
          rep.errors.push({
            etapa: 'Áreas',
            linha: i + 2,
            codigo: nome,
            motivo: msg,
          })
        }
      }

      // Re-consultar áreas para obter IDs atualizados
      const freshAreas = await pb.collection('areas').getFullList()
      rep.counts.areas = freshAreas.length
      const areaIdMap = new Map<string, string>()
      freshAreas.forEach((a) => areaIdMap.set(a.nome.trim().toLowerCase(), a.id))

      // ==========================================================
      // PASSO 2: IMPORTAR COLABORADORES E USUÁRIOS
      // ==========================================================
      setCurrentStep('Importando Colaboradores & Logins...')
      setProgressMsg('Criando contas de usuário e registros de colaboradores...')

      const existingUsers = await pb.collection('users').getFullList<UserProfile>()
      const userMapByEmail = new Map<string, UserProfile>()
      existingUsers.forEach((u) => userMapByEmail.set(u.email.trim().toLowerCase(), u))

      const existingColabs = await pb.collection('colaboradores').getFullList<Colaborador>()
      const colabMapByCodigo = new Map<string, string>()
      existingColabs.forEach((c) => colabMapByCodigo.set(c.codigo.trim().toLowerCase(), c.id))

      for (let i = 0; i < parsedColabs.rows.length; i++) {
        const row = parsedColabs.rows[i]
        const codigo = (row.codigo || '').trim()
        const nome = (row.nome || '').trim()
        const cargo = (row.cargo || '').trim()
        const areaNome = (row.area || '').trim()
        const email = (row.email || '').trim().toLowerCase()
        const semMetasRaw = (row.sem_metas || '').trim().toLowerCase()
        const sem_metas = semMetasRaw === 'sim' || semMetasRaw === 'true'

        if (!codigo || !nome || !email) {
          rep.errors.push({
            etapa: 'Colaboradores',
            linha: i + 2,
            codigo,
            motivo: 'Campos obrigatórios ausentes (código, nome ou e-mail)',
          })
          continue
        }

        // 1. Criar ou atualizar conta em users
        let userId = ''
        const existingUser = userMapByEmail.get(email)

        try {
          if (existingUser) {
            userId = existingUser.id
            // Se já for o Miguel Santiago (ou já tiver admin), preserva role
            const updatePayload: Record<string, unknown> = {
              name: nome,
              cargo,
              area: areaNome,
            }
            if (email !== 'miguel.santiago@ctxcenografia.com.br') {
              updatePayload.must_change_password = true
              updatePayload.password = 'CTX@2027'
              updatePayload.passwordConfirm = 'CTX@2027'
            }
            const updated = await pb.collection('users').update(userId, updatePayload)
            userMapByEmail.set(email, updated as unknown as UserProfile)
          } else {
            const newUser = await pb.collection('users').create({
              email,
              name: nome,
              cargo,
              area: areaNome,
              role: 'colaborador',
              must_change_password: true,
              password: 'CTX@2027',
              passwordConfirm: 'CTX@2027',
              verified: true,
            })
            userId = newUser.id
            userMapByEmail.set(email, newUser as unknown as UserProfile)
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro ao processar conta do usuário'
          rep.errors.push({
            etapa: 'Usuários/Login',
            linha: i + 2,
            codigo,
            motivo: `${email}: ${msg}`,
          })
        }

        // 2. Criar ou atualizar registro em colaboradores
        // Achar relação com area se existir
        const areaId = areaIdMap.get(areaNome.toLowerCase()) || null

        const colabPayload = {
          codigo,
          nome,
          cargo,
          area: areaId,
          email,
          sem_metas,
          usuario: userId || null,
        }

        try {
          const colabKey = codigo.toLowerCase()
          if (colabMapByCodigo.has(colabKey)) {
            const colabId = colabMapByCodigo.get(colabKey)!
            await pb.collection('colaboradores').update(colabId, colabPayload)
          } else {
            const created = await pb.collection('colaboradores').create(colabPayload)
            colabMapByCodigo.set(colabKey, created.id)
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro ao salvar colaborador'
          rep.errors.push({
            etapa: 'Colaboradores',
            linha: i + 2,
            codigo,
            motivo: msg,
          })
        }
      }

      const freshColabs = await pb.collection('colaboradores').getFullList<Colaborador>()
      const freshUsers = await pb.collection('users').getFullList<UserProfile>()
      rep.counts.colaboradores = freshColabs.length
      rep.counts.users = freshUsers.length

      // Checagem do William Machado com sem_metas = sim
      const william = freshColabs.find(
        (c) =>
          c.codigo.toLowerCase().includes('william') ||
          c.nome.toLowerCase().includes('william machado'),
      )
      if (william) {
        rep.checks.williamCheck = !!william.sem_metas
      }

      // ==========================================================
      // PASSO 3: IMPORTAR PROCESSOS (DUAS PASSADAS)
      // ==========================================================
      setCurrentStep('Importando Processos — 1ª Passada...')
      setProgressMsg('Criando todos os registros de processos...')

      const existingProcs = await pb.collection('processos').getFullList()
      const procMapByCodigo = new Map<string, string>() // codigo -> id
      existingProcs.forEach((p) => procMapByCodigo.set(p.codigo.trim().toUpperCase(), p.id))

      // 1ª passada: criar/atualizar campos base (codigo, nome, area, observacao)
      for (let i = 0; i < parsedProcs.rows.length; i++) {
        const row = parsedProcs.rows[i]
        const codigo = (row.codigo || '').trim().toUpperCase()
        const nome = (row.nome || '').trim()
        const area = (row.area || '').trim()
        const observacao = (row.observacao || '').trim()

        if (!codigo || !nome || !area) {
          rep.errors.push({
            etapa: 'Processos (1ª passada)',
            linha: i + 2,
            codigo,
            motivo: 'Campos obrigatórios ausentes (código, nome ou área)',
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
            await pb.collection('processos').update(id, payload)
          } else {
            const created = await pb.collection('processos').create(payload)
            procMapByCodigo.set(codigo, created.id)
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro ao criar processo'
          rep.errors.push({
            etapa: 'Processos (1ª passada)',
            linha: i + 2,
            codigo,
            motivo: msg,
          })
        }
      }

      // 2ª passada: resolver relações etapas_anteriores e etapas_sucessoras
      setCurrentStep('Importando Processos — 2ª Passada (Conexões)...')
      setProgressMsg('Resolvendo vínculos entre etapas anteriores e sucessoras...')

      let totalConexoes = 0

      for (let i = 0; i < parsedProcs.rows.length; i++) {
        const row = parsedProcs.rows[i]
        const codigo = (row.codigo || '').trim().toUpperCase()
        const procId = procMapByCodigo.get(codigo)
        if (!procId) continue

        const parseCodes = (str?: string): string[] => {
          if (!str) return []
          return str
            .split(';')
            .map((s) => s.trim().toUpperCase())
            .filter((s) => s.length > 0)
        }

        const anterioresCodes = parseCodes(row.etapas_anteriores)
        const sucessorasCodes = parseCodes(row.etapas_sucessoras)

        const anterioresIds: string[] = []
        for (const cod of anterioresCodes) {
          const id = procMapByCodigo.get(cod)
          if (id) {
            anterioresIds.push(id)
          } else {
            rep.errors.push({
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
            rep.errors.push({
              etapa: 'Processos (2ª passada)',
              linha: i + 2,
              codigo,
              motivo: `Referência a etapa sucessora inexistente: "${cod}"`,
            })
          }
        }

        totalConexoes += sucessorasIds.length

        try {
          await pb.collection('processos').update(procId, {
            etapas_anteriores: anterioresIds,
            etapas_sucessoras: sucessorasIds,
          })
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro ao vincular etapas'
          rep.errors.push({
            etapa: 'Processos (2ª passada)',
            linha: i + 2,
            codigo,
            motivo: msg,
          })
        }
      }

      // Re-carregar processos e checar conexões
      const allProcs = await pb.collection('processos').getFullList()
      rep.counts.processos = allProcs.length
      rep.counts.conexoes = totalConexoes

      // Checagem: O01 com sucessoras O02 e O03
      const o01 = allProcs.find((p) => p.codigo === 'O01')
      if (o01) {
        const o02Id = procMapByCodigo.get('O02')
        const o03Id = procMapByCodigo.get('O03')
        const suc = o01.etapas_sucessoras || []
        const hasO02 = !!o02Id && suc.includes(o02Id)
        const hasO03 = !!o03Id && suc.includes(o03Id)
        rep.checks.o01Check = hasO02 && hasO03
      }

      // Checagem: RH05 sem conexões
      const rh05 = allProcs.find((p) => p.codigo === 'RH05')
      if (rh05) {
        const ant = rh05.etapas_anteriores || []
        const suc = rh05.etapas_sucessoras || []
        rep.checks.rh05Check = ant.length === 0 && suc.length === 0
      }

      setReport(rep)
      await loadUsersAndColabs()

      toast({
        title: 'Importação Concluída!',
        description: 'Os dados foram importados com sucesso para o banco da CTX.',
      })
    } catch (err: unknown) {
      console.error('Falha geral na importação:', err)
      const msg = err instanceof Error ? err.message : 'Erro durante o processo de importação.'
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

  // Redefinição manual de senha por admin
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

    if (newPassword.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve conter pelo menos 8 dígitos.',
        variant: 'destructive',
      })
      return
    }

    setResettingPassword(true)
    try {
      await pb.collection('users').update(selectedUserId, {
        password: newPassword,
        passwordConfirm: newPassword,
        must_change_password: true,
      })

      toast({
        title: 'Senha redefinida com sucesso!',
        description:
          'O colaborador precisará trocar essa senha no primeiro acesso conforme as diretrizes.',
      })
      setNewPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao redefinir senha do colaborador'
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
          Área restrita à diretoria e administração CTX. Faça o upload das planilhas de Áreas,
          Colaboradores e Processos para popular o ambiente em tempo real.
        </p>
      </div>

      {/* SEÇÃO 1: UPLOAD DAS 3 PLANILHAS */}
      <div className="bg-[#111111] border border-[#262626] rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#262626] pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-[#FFD400]" />
              Importação em Cascata (Ordem Obrigatória)
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              1. Áreas &rarr; 2. Colaboradores &rarr; 3. Processos (duas passadas para vínculos)
            </p>
          </div>
          <span className="text-[11px] font-mono uppercase bg-[#1C1C1C] border border-[#262626] text-[#FFD400] px-3 py-1 rounded-full">
            Suporta CSV
          </span>
        </div>

        {/* 3 Dropzones / File Pickers */}
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
                {fileAreas ? fileAreas.name : 'Selecionar arquivo CSV'}
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
                  codigo, nome, cargo, area, email, sem_metas, tem_login
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
                {fileColabs ? fileColabs.name : 'Selecionar arquivo CSV'}
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
                  codigo, nome, area, etapas_anteriores, etapas_sucessoras, observacao
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
                {fileProcs ? fileProcs.name : 'Selecionar arquivo CSV'}
              </label>
            </div>
          </div>
        </div>

        {/* Informações e Botão de Ação */}
        <div className="bg-[#161616] border border-[#262626] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-[#9CA3AF] space-y-1">
            <p className="flex items-center gap-1.5 text-white font-medium">
              <ShieldAlert className="w-4 h-4 text-[#FFD400]" />
              Garantia de Idempotência
            </p>
            <p>
              Executar esta importação mais de uma vez não duplicará registros nem quebrará
              conexões.
            </p>
          </div>

          <button
            onClick={handleStartImport}
            disabled={importing || !fileAreas || !fileColabs || !fileProcs}
            className="w-full sm:w-auto px-6 py-3 bg-[#FFD400] hover:bg-[#E5BE00] text-black font-extrabold rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-[#FFD400]/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {importing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{currentStep || 'Importando...'}</span>
              </>
            ) : (
              <>
                <span>Executar Importação Completa</span>
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

          {/* Cards de Contagem */}
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
                {report.counts.conexoes === report.counts.conexoesExpected ? '100% OK' : 'Ajustado'}
              </span>
            </div>
          </div>

          {/* Checagens Específicas do Usuário */}
          <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-3">
            <h4 className="text-xs uppercase tracking-wider font-bold text-[#FFD400]">
              Checagens Pontuais
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
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
            </div>
          </div>

          {/* Linhas não importadas ou advertências */}
          {report.errors.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-wider font-bold text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Avisos e Linhas Rejeitadas ({report.errors.length})
              </h4>
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
                placeholder="Ex.: CTX@2027 ou nova senha"
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
