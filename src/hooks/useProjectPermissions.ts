import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Colaborador, ProjetoEstrategico } from '@/types/ctx'

export function useProjectPermissions() {
  const { user } = useAuth()
  const [isSponsor, setIsSponsor] = useState(false)
  const [colaborador, setColaborador] = useState<Colaborador | null>(null)
  const [loading, setLoading] = useState(true)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    let isMounted = true

    async function checkPermissions() {
      if (!user) {
        if (isMounted) {
          setIsSponsor(false)
          setColaborador(null)
          setLoading(false)
        }
        return
      }

      try {
        // Obter o colaborador do usuário logado
        let colab: Colaborador | null = null
        try {
          colab = await pb
            .collection('colaboradores')
            .getFirstListItem<Colaborador>(`usuario="${user.id}"`)
        } catch {
          colab = null
        }

        if (isMounted) {
          setColaborador(colab)
        }

        if (isAdmin) {
          if (isMounted) {
            setIsSponsor(false)
            setLoading(false)
          }
          return
        }

        if (colab) {
          // Checar se o colaborador é sponsor de pelo menos um projeto estratégico
          const projetosSponsor = await pb
            .collection('projetos_estrategicos')
            .getList<ProjetoEstrategico>(1, 1, {
              filter: `sponsor = "${colab.id}"`,
            })
          if (isMounted) {
            setIsSponsor(projetosSponsor.totalItems > 0)
          }
        } else {
          if (isMounted) {
            setIsSponsor(false)
          }
        }
      } catch (err) {
        console.error('Erro ao verificar permissões de projetos:', err)
        if (isMounted) {
          setIsSponsor(false)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    checkPermissions()

    return () => {
      isMounted = false
    }
  }, [user, isAdmin])

  const canAccessProjects = isAdmin || isSponsor

  return {
    isAdmin,
    isSponsor,
    canAccessProjects,
    colaborador,
    loading,
  }
}
