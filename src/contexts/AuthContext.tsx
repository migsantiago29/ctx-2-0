import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import type { UserProfile } from '@/types/ctx'
import { toast } from '@/hooks/use-toast'

interface AuthContextType {
  user: UserProfile | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    return (pb.authStore.record as unknown as UserProfile) || null
  })
  const [token, setToken] = useState<string | null>(pb.authStore.token)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Listen to pb.authStore changes
    const removeListener = pb.authStore.onChange((newToken, record) => {
      setToken(newToken)
      setUser((record as unknown as UserProfile) || null)
    })

    // Verify token validity on boot
    const verifySession = async () => {
      if (pb.authStore.isValid) {
        try {
          const authData = await pb.collection('users').authRefresh()
          setUser(authData.record as unknown as UserProfile)
        } catch (_) {
          pb.authStore.clear()
          setUser(null)
          setToken(null)
        }
      }
      setIsLoading(false)
    }

    verifySession()

    return () => {
      removeListener()
    }
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const authData = await pb.collection('users').authWithPassword(email, password)
      setUser(authData.record as unknown as UserProfile)
      setToken(authData.token)
      toast({
        title: 'Bem-vindo ao CTX 2.0',
        description: `Olá, ${authData.record.name || 'Colaborador'}! Login realizado com sucesso.`,
      })
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Credenciais inválidas'
      toast({
        title: 'Erro de autenticação',
        description: msg.includes('Failed to authenticate')
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Verifique os dados.',
        variant: 'destructive',
      })
      throw err
    }
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setToken(null)
    toast({
      title: 'Sessão encerrada',
      description: 'Você saiu do sistema CTX 2.0 com segurança.',
    })
  }

  const refreshUser = async () => {
    if (pb.authStore.isValid) {
      try {
        const authData = await pb.collection('users').authRefresh()
        setUser(authData.record as unknown as UserProfile)
      } catch {
        /* intentionally ignored */
      }
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
