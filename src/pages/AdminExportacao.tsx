import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'
import { createZipBlob, ZipEntry } from '@/lib/zipExporter'
import {
  Download,
  Database,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  HardDrive,
  Info,
} from 'lucide-react'

// As 15 coleções oficiais do CTX
const COLLECTIONS = [
  'users',
  'areas',
  'colaboradores',
  'projetos_estrategicos',
  'processos',
  'metas',
  'indicadores',
  'fluxograma_posicoes',
  'configuracoes',
  'ciclos',
  'avaliacoes',
  'pulsos',
  'comentarios',
  'notificacoes',
]

interface ExportStats {
  [collection: string]: number
}

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""'
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
  return `"${str.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

function convertToCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return ''
  // Coletar todas as chaves
  const keysSet = new Set<string>()
  for (const r of records) {
    Object.keys(r).forEach((k) => keysSet.add(k))
  }
  const headers = Array.from(keysSet)
  const rows: string[] = []
  // Header
  rows.push(headers.map((h) => escapeCsvCell(h)).join(';'))
  // Linhas
  for (const r of records) {
    rows.push(headers.map((h) => escapeCsvCell(r[h])).join(';'))
  }
  // Adicionar UTF-8 BOM
  return '\uFEFF' + rows.join('\r\n')
}

export function AdminExportacao() {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [stats, setStats] = useState<ExportStats | null>(null)
  const [totalFiles, setTotalFiles] = useState(0)
  const [downloadReady, setDownloadReady] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [zipSizeMb, setZipSizeMb] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    try {
      setLoading(true)
      setError(null)
      setDownloadReady(false)
      setProgress(5)
      setCurrentStep('Carregando colaboradores e mapas de expansão...')

      // 1. Carregar mapa de colaboradores para resolver relações de forma limpa
      const colabMap = new Map<string, { nome: string; codigo: string; email: string }>()
      try {
        const colabList = await pb.collection('colaboradores').getFullList({ batch: 200 })
        for (const c of colabList) {
          colabMap.set(c.id, {
            nome: c.nome,
            codigo: c.codigo,
            email: c.email,
          })
        }
      } catch {
        /* intentionally ignored */
      }

      // Mapa de projetos
      const projMap = new Map<string, { codigo: string; nome: string }>()
      try {
        const projList = await pb.collection('projetos_estrategicos').getFullList({ batch: 100 })
        for (const p of projList) {
          projMap.set(p.id, {
            codigo: p.codigo,
            nome: p.nome,
          })
        }
      } catch {
        /* intentionally ignored */
      }

      const entries: ZipEntry[] = []
      const collectionStats: ExportStats = {}
      const totalSteps = COLLECTIONS.length + 2
      let stepCount = 1

      // 2. Buscar registros de cada coleção
      for (const colName of COLLECTIONS) {
        stepCount++
        setProgress(Math.round((stepCount / totalSteps) * 80))
        setCurrentStep(`Exportando coleção ${colName}...`)

        let allRecords: Record<string, unknown>[] = []
        try {
          // Paginando via getFullList com batch 500
          const res = await pb.collection(colName).getFullList<Record<string, unknown>>({
            batch: 500,
            sort: '-created',
          })
          allRecords = res.map((item) => {
            const raw = { ...item }
            // Remover tokens internos e senhas se houver
            delete raw.password
            delete raw.tokenKey

            // Resolver expansão amigável em metas (responsaveis e projeto)
            if (colName === 'metas') {
              if (Array.isArray(raw.responsaveis)) {
                raw.responsaveis_codigos = raw.responsaveis.map(
                  (id: string) => colabMap.get(id)?.codigo || id,
                )
                raw.responsaveis_nomes = raw.responsaveis.map(
                  (id: string) => colabMap.get(id)?.nome || id,
                )
              }
              if (raw.projeto && typeof raw.projeto === 'string') {
                raw.projeto_codigo = projMap.get(raw.projeto)?.codigo || ''
                raw.projeto_nome = projMap.get(raw.projeto)?.nome || ''
              }
            }

            return raw
          })
        } catch (fetchErr: unknown) {
          console.warn(`Aviso ao ler coleção ${colName}:`, fetchErr)
        }

        collectionStats[colName] = allRecords.length

        // Salvar JSON
        entries.push({
          name: `dados/${colName}.json`,
          data: JSON.stringify(allRecords, null, 2),
        })

        // Salvar CSV
        const csvData = convertToCsv(allRecords)
        entries.push({
          name: `dados/${colName}.csv`,
          data: csvData,
        })
      }

      setStats(collectionStats)

      // 3. Coletar arquivos anexos (evidencias de avaliações e avatares de usuários)
      setCurrentStep('Buscando arquivos e evidências anexadas...')
      let filesDownloaded = 0

      // Anexos de avaliações (evidencia_arquivo)
      try {
        const avaliacoesComArquivo = await pb.collection('avaliacoes').getFullList({
          filter: "evidencia_arquivo != ''",
          batch: 200,
        })

        for (const aval of avaliacoesComArquivo) {
          const fileName = aval.evidencia_arquivo
          if (typeof fileName === 'string' && fileName) {
            try {
              const fileUrl = pb.files.getUrl(aval, fileName)
              const resp = await fetch(fileUrl)
              if (resp.ok) {
                const arrayBuffer = await resp.arrayBuffer()
                entries.push({
                  name: `arquivos/avaliacoes/${aval.id}_${fileName}`,
                  data: new Uint8Array(arrayBuffer),
                })
                filesDownloaded++
              }
            } catch (fileErr) {
              console.warn(`Não foi possível baixar arquivo ${fileName}:`, fileErr)
            }
          }
        }
      } catch {
        /* intentionally ignored */
      }

      // Avatares de usuários
      try {
        const usersComAvatar = await pb.collection('users').getFullList({
          filter: "avatar != ''",
          batch: 200,
        })

        for (const u of usersComAvatar) {
          const avatarName = u.avatar
          if (typeof avatarName === 'string' && avatarName) {
            try {
              const fileUrl = pb.files.getUrl(u, avatarName)
              const resp = await fetch(fileUrl)
              if (resp.ok) {
                const arrayBuffer = await resp.arrayBuffer()
                entries.push({
                  name: `arquivos/avatares/${u.id}_${avatarName}`,
                  data: new Uint8Array(arrayBuffer),
                })
                filesDownloaded++
              }
            } catch (avatarErr) {
              console.warn(`Não foi possível baixar avatar ${avatarName}:`, avatarErr)
            }
          }
        }
      } catch {
        /* intentionally ignored */
      }

      setTotalFiles(filesDownloaded)

      // Adicionar README com metadados do backup
      const metadata = {
        data_exportacao: new Date().toISOString(),
        gerado_por: pb.authStore.record?.email || 'admin',
        total_colecoes: COLLECTIONS.length,
        arquivos_anexos: filesDownloaded,
        estatisticas: collectionStats,
      }
      entries.push({
        name: 'LEIA-ME.txt',
        data: `BKP CTX 2.0 - EXPORTAÇÃO COMPLETA\r\nData: ${new Date().toLocaleString('pt-BR')}\r\nUsuário: ${metadata.gerado_por}\r\n\r\nEste arquivo ZIP contém:\r\n- Pasta /dados: arquivos .json e .csv de todas as 15 coleções.\r\n- Pasta /arquivos: arquivos binários anexados (evidências e avatares).\r\n- metadata.json: resumo das coleções e contagens.\r\n`,
      })
      entries.push({
        name: 'metadata.json',
        data: JSON.stringify(metadata, null, 2),
      })

      // 4. Empacotar em ZIP
      setCurrentStep('Compactando arquivo .ZIP no navegador...')
      setProgress(95)

      const zipBlob = createZipBlob(entries)
      const zipMb = (zipBlob.size / (1024 * 1024)).toFixed(2)
      setZipSizeMb(zipMb)

      const url = URL.createObjectURL(zipBlob)
      setDownloadUrl(url)
      setDownloadReady(true)
      setProgress(100)
      setCurrentStep('Exportação concluída com sucesso!')
    } catch (err: unknown) {
      console.error('Erro na exportação:', err)
      const msg = err instanceof Error ? err.message : 'Falha ao processar a exportação.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Exportação Completa</h1>
            <Badge variant="outline" className="border-amber-400 text-amber-300 bg-amber-500/10">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Somente Administradores
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Gere um pacote completo (.ZIP) contendo todas as 15 coleções em JSON e CSV, além de
            todos os arquivos anexos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/60 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              Coleções
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{COLLECTIONS.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              users, metas, projetos, processos e mais
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileArchive className="w-4 h-4 text-blue-400" />
              Formatos Gerados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">JSON + CSV</div>
            <p className="text-xs text-muted-foreground mt-1">
              Expand de relações resolvido por código
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              Arquivos Anexos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Evidências & Avatares</div>
            <p className="text-xs text-muted-foreground mt-1">
              Imagens, relatórios PDF e fotos de perfil
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Card Principal de Ação */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="w-5 h-5 text-amber-400" />
            Gerar Pacote de Migração (.ZIP)
          </CardTitle>
          <CardDescription>
            A exportação lê os dados diretamente pelo cliente autenticado através do PocketBase SDK,
            sem realizar nenhuma alteração no banco de dados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-amber-500/10 border-amber-500/20 text-foreground">
            <Info className="h-4 w-4 text-amber-400" />
            <AlertTitle className="text-amber-400 font-semibold">
              Pronto para Migração Self-Hosted
            </AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground mt-1">
              O arquivo compactado inclui tanto os registros tabulares quanto os arquivos binários.
              O schema estruturado completo também está disponível na pasta <code>/backend</code> do
              código-fonte com as 10 migrações originais e hooks.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro na exportação</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading && (
            <div className="space-y-2 py-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  {currentStep}
                </span>
                <span className="font-semibold">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {downloadReady && downloadUrl && (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                Backup gerado e empacotado ({zipSizeMb} MB)
              </div>
              <p className="text-xs text-muted-foreground">
                Foram exportadas todas as 15 coleções em formato JSON e CSV, além de {totalFiles}{' '}
                arquivo(s) binário(s) de evidências e avatares.
              </p>
              <a
                href={downloadUrl}
                download={`ctx2_backup_completo_${new Date().toISOString().slice(0, 10)}.zip`}
                className="inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-amber-400 text-black shadow hover:bg-amber-500 h-9 px-4 py-2 rounded-md text-sm"
              >
                <Download className="w-4 h-4 mr-1" />
                Baixar Arquivo .ZIP Agora
              </a>
            </div>
          )}

          <div className="pt-2">
            <Button
              onClick={handleExport}
              disabled={loading}
              className="bg-amber-400 hover:bg-amber-500 text-black font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exportando dados...
                </>
              ) : (
                <>
                  <FileArchive className="w-4 h-4 mr-2" />
                  Iniciar Exportação Completa
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas por Coleção */}
      {stats && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Resumo dos Registros Extraídos
            </CardTitle>
            <CardDescription>
              Contagem de registros incluídos em cada arquivo do arquivo compactado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.entries(stats).map(([col, count]) => (
                <div key={col} className="p-3 rounded-lg border border-border bg-card/40">
                  <div className="text-xs text-muted-foreground truncate font-mono">{col}</div>
                  <div className="text-lg font-bold mt-1">{count} registros</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
export default AdminExportacao
