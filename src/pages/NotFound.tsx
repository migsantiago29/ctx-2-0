/* 404 Page - Displays when a user attempts to access a non-existent route - translate to the language of the user */
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex items-center justify-center bg-ctx-0a0a0a text-ctx-fg p-4">
      <div className="text-center max-w-md bg-ctx-111111 border border-ctx-262626 rounded-xl p-8 shadow-xl">
        <div className="w-12 h-12 rounded-xl bg-[#FFD400] text-black font-black flex items-center justify-center text-lg mx-auto mb-4">
          CTX
        </div>
        <h1 className="text-4xl font-extrabold mb-2 text-ctx-fg">404</h1>
        <p className="text-base text-ctx-9ca3af mb-6">Página não encontrada no CTX 2.0.</p>
        <a
          href="/"
          className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#FFD400] text-black font-bold hover:bg-[#E6BF00] transition-colors text-sm"
        >
          Voltar ao Meu Painel
        </a>
      </div>
    </div>
  )
}

export default NotFound
