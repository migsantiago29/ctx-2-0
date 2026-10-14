/**
 * Formata o rótulo de um projeto estratégico sem duplicações de código.
 * Se o nome já começa com o código (ex: "P1 - ERP" com código "P1"), retorna o nome diretamente.
 * Se o nome não tem o código (ex: "ERP" com código "P1"), retorna "P1 - ERP".
 */
export function formatProjectLabel(project?: { codigo?: string; nome?: string } | null): string {
  if (!project) return ''
  const codigo = (project.codigo || '').trim()
  const nome = (project.nome || '').trim()

  if (!codigo) return nome
  if (!nome) return codigo

  // Se o nome já começa com o código seguido de traço ou espaço (ex: "P1 -", "P1: ", "P1 ")
  const regex = new RegExp(`^${codigo}\\s*[-–—:]?\\s*`, 'i')
  if (regex.test(nome)) {
    return nome
  }

  return `${codigo} - ${nome}`
}
