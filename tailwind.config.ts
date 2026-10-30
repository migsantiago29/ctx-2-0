/* Tailwind config for the frontend react app. This is where the app theme should be defined: https://v2.tailwindcss.com/docs/configuration. */
import type { Config } from 'tailwindcss'
import animatePlugin from 'tailwindcss-animate'
import typographyPlugin from '@tailwindcss/typography'
import aspectRatioPlugin from '@tailwindcss/aspect-ratio'

export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter var', 'SF Pro Display', 'system-ui', 'sans-serif'],
        display: ['SF Pro Display', 'Inter var', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        // Cores do app que mudam com o modo claro/escuro (definidas em src/main.css)
        ctx: {
          '090909': 'rgb(var(--ctx-090909) / <alpha-value>)',
          '0a0a0a': 'rgb(var(--ctx-0a0a0a) / <alpha-value>)',
          '0d0d0d': 'rgb(var(--ctx-0d0d0d) / <alpha-value>)',
          '0e0e0e': 'rgb(var(--ctx-0e0e0e) / <alpha-value>)',
          '111111': 'rgb(var(--ctx-111111) / <alpha-value>)',
          '121212': 'rgb(var(--ctx-121212) / <alpha-value>)',
          '131313': 'rgb(var(--ctx-131313) / <alpha-value>)',
          '141414': 'rgb(var(--ctx-141414) / <alpha-value>)',
          '15140e': 'rgb(var(--ctx-15140e) / <alpha-value>)',
          '161616': 'rgb(var(--ctx-161616) / <alpha-value>)',
          '171717': 'rgb(var(--ctx-171717) / <alpha-value>)',
          '181404': 'rgb(var(--ctx-181404) / <alpha-value>)',
          '181611': 'rgb(var(--ctx-181611) / <alpha-value>)',
          '181818': 'rgb(var(--ctx-181818) / <alpha-value>)',
          '191919': 'rgb(var(--ctx-191919) / <alpha-value>)',
          '1a1a1a': 'rgb(var(--ctx-1a1a1a) / <alpha-value>)',
          '1c1806': 'rgb(var(--ctx-1c1806) / <alpha-value>)',
          '1c1c1c': 'rgb(var(--ctx-1c1c1c) / <alpha-value>)',
          '1e1e1e': 'rgb(var(--ctx-1e1e1e) / <alpha-value>)',
          '1f1f1f': 'rgb(var(--ctx-1f1f1f) / <alpha-value>)',
          '202020': 'rgb(var(--ctx-202020) / <alpha-value>)',
          '221c05': 'rgb(var(--ctx-221c05) / <alpha-value>)',
          '222222': 'rgb(var(--ctx-222222) / <alpha-value>)',
          '242424': 'rgb(var(--ctx-242424) / <alpha-value>)',
          '252525': 'rgb(var(--ctx-252525) / <alpha-value>)',
          '262626': 'rgb(var(--ctx-262626) / <alpha-value>)',
          '282828': 'rgb(var(--ctx-282828) / <alpha-value>)',
          '2a2a2a': 'rgb(var(--ctx-2a2a2a) / <alpha-value>)',
          '2b2b2b': 'rgb(var(--ctx-2b2b2b) / <alpha-value>)',
          '2e2e2e': 'rgb(var(--ctx-2e2e2e) / <alpha-value>)',
          '2f2f2f': 'rgb(var(--ctx-2f2f2f) / <alpha-value>)',
          '333333': 'rgb(var(--ctx-333333) / <alpha-value>)',
          '525252': 'rgb(var(--ctx-525252) / <alpha-value>)',
          '555555': 'rgb(var(--ctx-555555) / <alpha-value>)',
          '666666': 'rgb(var(--ctx-666666) / <alpha-value>)',
          '737373': 'rgb(var(--ctx-737373) / <alpha-value>)',
          '777777': 'rgb(var(--ctx-777777) / <alpha-value>)',
          '888888': 'rgb(var(--ctx-888888) / <alpha-value>)',
          '9ca3af': 'rgb(var(--ctx-9ca3af) / <alpha-value>)',
          'a3a3a3': 'rgb(var(--ctx-a3a3a3) / <alpha-value>)',
          'd1d5db': 'rgb(var(--ctx-d1d5db) / <alpha-value>)',
          'e5e5e5': 'rgb(var(--ctx-e5e5e5) / <alpha-value>)',
          'e5e7eb': 'rgb(var(--ctx-e5e7eb) / <alpha-value>)',
          'fg': 'rgb(var(--ctx-fg) / <alpha-value>)',
          'brand': 'rgb(var(--ctx-brand) / <alpha-value>)',
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      transitionProperty: {
        width: 'width',
        height: 'height',
      },
      boxShadow: {
        subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        elevation: '0 4px 20px rgba(0, 0, 0, 0.05)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.42, 0, 0.58, 1)',
      },
    },
  },
  plugins: [animatePlugin, typographyPlugin, aspectRatioPlugin],
} satisfies Config
