import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/use-theme'

// Botão sol/lua para alternar entre modo escuro e modo claro
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`p-2 rounded-lg text-ctx-9ca3af hover:text-ctx-brand hover:bg-ctx-1a1a1a transition-colors ${className}`}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}
