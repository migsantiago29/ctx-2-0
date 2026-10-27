// pocketbase/hooks/admin_users.js
// Endpoint server-side privilegiado para criar/sincronizar usuários e colaboradores
// Permite que admins (ou superusers) criem ou atualizem as contas com verified=true, must_change_password=true, etc.

routerAdd('POST', '/backend/v1/ctx/sync-user', (e) => {
  // 1. Checar autenticação de admin ou superuser
  const authRecord = e.auth
  const isSuper = e.hasSuperuserAuth ? e.hasSuperuserAuth() : false
  const userRole = authRecord ? authRecord.get('role') || authRecord.getString('role') || '' : ''
  const userEmail = authRecord
    ? authRecord.email
      ? authRecord.email()
      : authRecord.getString('email')
    : ''
  const isProtectedAdmin = userEmail === 'miguel.santiago@ctxcenografia.com.br'
  const isAdmin = isSuper || isProtectedAdmin || userRole === 'admin'

  if (!isAdmin) {
    throw new ForbiddenError('Apenas administradores podem gerenciar contas de colaboradores.')
  }

  // 2. Extrair payload
  const info = e.requestInfo()
  const body = (info && info.body) || {}

  const email = (body.email || '').trim().toLowerCase()
  const nome = (body.nome || body.name || '').trim()
  const cargo = (body.cargo || '').trim()
  const area = (body.area || '').trim()
  const role = (body.role || 'colaborador').trim()
  const password = body.password || 'CTX@2027'
  const mustChange = body.must_change_password !== undefined ? !!body.must_change_password : true

  if (!email || !nome) {
    throw new BadRequestError('E-mail e nome são obrigatórios.')
  }

  const usersCol = e.app.findCollectionByNameOrId('_pb_users_auth_')

  let userRecord = null
  let isNew = false

  try {
    userRecord = e.app.findAuthRecordByEmail('_pb_users_auth_', email)
  } catch (_) {
    userRecord = null
  }

  if (userRecord) {
    // Usuário já existe — atualizar dados cadastrais e senha/must_change_password se aplicável
    userRecord.set('name', nome)
    if (cargo) userRecord.set('cargo', cargo)
    if (area) userRecord.set('area', area)

    // Miguel Santiago sempre mantém role admin e não reseta senha
    if (email === 'miguel.santiago@ctxcenografia.com.br') {
      userRecord.set('role', 'admin')
      userRecord.set('must_change_password', false)
    } else {
      userRecord.set('role', role)
      userRecord.set('must_change_password', mustChange)
      if (body.update_password) {
        userRecord.setPassword(password)
      }
    }
    userRecord.setVerified(true)
    e.app.save(userRecord)
  } else {
    // Novo usuário — criar com privilégio de admin
    isNew = true
    userRecord = new Record(usersCol)
    userRecord.setEmail(email)
    userRecord.setPassword(password)
    userRecord.setVerified(true)
    userRecord.set('name', nome)
    userRecord.set('cargo', cargo)
    userRecord.set('area', area)
    userRecord.set('role', email === 'miguel.santiago@ctxcenografia.com.br' ? 'admin' : role)
    userRecord.set(
      'must_change_password',
      email === 'miguel.santiago@ctxcenografia.com.br' ? false : mustChange,
    )

    e.app.save(userRecord)
  }

  return e.json(200, {
    success: true,
    isNew,
    user: {
      id: userRecord.id,
      email: userRecord.email(),
      name: userRecord.getString('name'),
      role: userRecord.getString('role'),
      cargo: userRecord.getString('cargo'),
      area: userRecord.getString('area'),
      verified: userRecord.verified(),
      must_change_password: userRecord.getBool('must_change_password'),
    },
  })
})

// Endpoint para primeiro acesso — troca obrigatória de senha pelo próprio usuário autenticado
// Permite que qualquer usuário autenticado com a flag must_change_password troque sua senha com privilégio do servidor
routerAdd('POST', '/backend/v1/ctx/first-access-password', (e) => {
  // 1. Validar usuário autenticado via token na requisição
  const authRecord = e.auth
  if (!authRecord) {
    throw new ForbiddenError('Sessão inválida ou expirada. Faça login novamente.')
  }

  // 2. Extrair dados da nova senha
  const info = e.requestInfo()
  const body = (info && info.body) || {}
  const password = body.password || ''
  const passwordConfirm = body.passwordConfirm || ''

  // 3. Validações de segurança
  if (!password || typeof password !== 'string') {
    throw new BadRequestError('A nova senha é obrigatória.')
  }

  if (password.length < 8) {
    throw new BadRequestError('A nova senha deve ter no mínimo 8 caracteres.')
  }

  if (password === 'CTX@2027' || password === 'Skip@Pass') {
    throw new BadRequestError('A nova senha não pode ser uma senha provisória (CTX@2027 ou Skip@Pass).')
  }

  if (password !== passwordConfirm) {
    throw new BadRequestError('A confirmação da nova senha não confere.')
  }

  // 4. Buscar record atualizado do usuário no banco com privilégio do sistema
  const userId = authRecord.id
  let user = null
  try {
    user = e.app.findRecordById('_pb_users_auth_', userId)
  } catch (_) {
    throw new BadRequestError('Usuário não encontrado.')
  }

  // 5. Redefinir senha e remover a flag must_change_password
  user.setPassword(password)
  user.set('must_change_password', false)
  user.setVerified(true)

  e.app.save(user)

  return e.json(200, {
    success: true,
    message: 'Senha definida com sucesso!',
    user: {
      id: user.id,
      email: user.email(),
      name: user.getString('name'),
      role: user.getString('role'),
      cargo: user.getString('cargo'),
      area: user.getString('area'),
      must_change_password: false,
    },
  })
})

// Endpoint para redefinição manual de senha pelo administrador
// Permite que um admin defina uma nova senha para qualquer usuário/colaborador,
// forçando privilégio de admin, ativando must_change_password e validando requisitos de segurança
routerAdd('POST', '/backend/v1/ctx/admin-reset-password', (e) => {
  // 1. Checar autenticação de admin ou superuser
  const authRecord = e.auth
  const isSuper = e.hasSuperuserAuth ? e.hasSuperuserAuth() : false
  const userRole = authRecord ? authRecord.get('role') || authRecord.getString('role') || '' : ''
  const userEmail = authRecord
    ? authRecord.email
      ? authRecord.email()
      : authRecord.getString('email')
    : ''
  const isProtectedAdmin = userEmail === 'miguel.santiago@ctxcenografia.com.br'
  const isAdmin = isSuper || isProtectedAdmin || userRole === 'admin'

  if (!isAdmin) {
    throw new ForbiddenError('Apenas administradores podem redefinir senhas de colaboradores.')
  }

  // 2. Extrair dados da requisição
  const info = e.requestInfo()
  const body = (info && info.body) || {}
  const userId = (body.userId || body.user_id || '').trim()
  const password = body.password || ''

  if (!userId) {
    throw new BadRequestError('Colaborador não selecionado.')
  }

  if (!password || typeof password !== 'string') {
    throw new BadRequestError('A nova senha é obrigatória.')
  }

  if (password.length < 8) {
    throw new BadRequestError('A nova senha deve ter no mínimo 8 caracteres.')
  }

  if (password === 'CTX@2027') {
    throw new BadRequestError(
      'A senha provisória CTX@2027 não pode ser utilizada como nova senha. Defina uma senha individual ou temporária personalizada com no mínimo 8 caracteres.',
    )
  }

  // 3. Buscar usuário no PocketBase
  let targetUser = null
  try {
    targetUser = e.app.findRecordById('_pb_users_auth_', userId)
  } catch (_) {
    throw new BadRequestError('Colaborador/usuário não encontrado no sistema.')
  }

  // 4. Aplicar a nova senha e reativar a flag must_change_password
  targetUser.setPassword(password)
  const isTargetProtected = targetUser.email() === 'miguel.santiago@ctxcenografia.com.br'
  targetUser.set('must_change_password', isTargetProtected ? false : true)
  targetUser.setVerified(true)

  e.app.save(targetUser)

  return e.json(200, {
    success: true,
    message: 'Senha do colaborador redefinida com sucesso!',
    user: {
      id: targetUser.id,
      email: targetUser.email(),
      name: targetUser.getString('name'),
      role: targetUser.getString('role'),
      must_change_password: targetUser.getBool('must_change_password'),
    },
  })
})
