import { useState } from 'react'
import { Compass, Target, Clock, ArrowRight, Check, Sparkles, Workflow, X } from 'lucide-react'

interface TourPrimeiroAcessoProps {
  colaboradorNome: string
  onComplete: () => void
}

export function TourPrimeiroAcesso({ colaboradorNome, onComplete }: TourPrimeiroAcessoProps) {
  const [etapa, setEtapa] = useState<number>(1)

  const steps = [
    {
      num: 1,
      tag: 'Bem-vindo ao CTX 2.0',
      title: 'O que é o CTX 2.0',
      desc: 'O CTX 2.0 é a ferramenta oficial de acompanhamento do Planejamento Estratégico da CTX Cenografia. Aqui você visualiza o organograma da empresa, os fluxogramas operacionais de cada área e a evolução dos 5 Projetos Estratégicos que guiam o crescimento da empresa.',
      icon: Sparkles,
      destaque: 'Planejamento Estratégico vivo e transparente para toda a CTX.',
    },
    {
      num: 2,
      tag: 'Seu papel na estratégia',
      title: 'Seus projetos e metas',
      desc: 'No "Meu Painel", você tem acesso direto às metas sob sua responsabilidade e aos processos da sua área na cadeia produtiva (o que você recebe de outras áreas e o que você entrega para elas). Cada meta contribui para um Projeto Estratégico com sponsor dedicado.',
      icon: Target,
      destaque: 'Você vê com clareza como o seu trabalho diário move os ponteiros da empresa.',
    },
    {
      num: 3,
      tag: 'A rotina de acompanhamento',
      title: 'Como funciona o acompanhamento',
      desc: 'A rotina é leve e sem burocracia: (1) Pulso Semanal de 1 minuto toda semana para apontar se avançou ou travou; (2) Avaliação Mensal entre os dias 25 e 05 para atualizar o farol da meta, o que avançou e o próximo passo para a Reunião de Resultados.',
      icon: Clock,
      destaque: 'Sem rankings individuais: o foco é destravar problemas e cumprir prazos.',
    },
  ]

  const current = steps[etapa - 1]
  const Icon = current.icon

  const handleNext = () => {
    if (etapa < 3) {
      setEtapa(etapa + 1)
    } else {
      onComplete()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md" />

      <div className="relative w-full max-w-lg bg-ctx-111111 border border-ctx-2b2b2b rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
        {/* Barra superior de passos */}
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === etapa
                    ? 'w-8 bg-[#FFD400]'
                    : s < etapa
                      ? 'w-4 bg-[#22C55E]'
                      : 'w-4 bg-ctx-262626'
                }`}
              />
            ))}
          </div>
          <span className="text-[11px] font-mono text-ctx-888888">Passo {etapa} de 3</span>
        </div>

        {/* Ícone e Cabeçalho */}
        <div className="space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FFD400]/10 border border-[#FFD400]/30 flex items-center justify-center text-ctx-brand">
            <Icon className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-ctx-brand tracking-wider block">
              {current.tag}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-ctx-fg tracking-tight">
              {current.title}
            </h2>
          </div>
        </div>

        {/* Descrição e Caixa de Destaque */}
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-ctx-d1d5db leading-relaxed">{current.desc}</p>

          <div className="p-3.5 rounded-xl bg-ctx-161616 border border-ctx-2b2b2b text-xs text-ctx-brand font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
            <span>{current.destaque}</span>
          </div>
        </div>

        {/* Botão de Próximo / Concluir */}
        <div className="pt-2 flex items-center justify-between gap-3">
          {etapa > 1 ? (
            <button
              type="button"
              onClick={() => setEtapa(etapa - 1)}
              className="py-2.5 px-4 rounded-xl text-xs font-bold text-ctx-9ca3af hover:text-ctx-fg transition-colors"
            >
              Voltar
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNext}
            className="py-3 px-6 bg-[#FFD400] hover:bg-[#E5BE00] text-black font-extrabold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-[#FFD400]/20"
          >
            <span>{etapa === 3 ? 'Começar a usar o CTX 2.0' : 'Próximo'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
