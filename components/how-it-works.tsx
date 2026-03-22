import { useTranslations } from "next-intl"
import { Download, MousePointerClick, Sparkles } from "lucide-react"

const stepKeys = [
  { key: "step1", number: "01", icon: Download },
  { key: "step2", number: "02", icon: MousePointerClick },
  { key: "step3", number: "03", icon: Sparkles },
]

export function HowItWorks() {
  const t = useTranslations('howItWorks')

  return (
    <section
      id="how-it-works"
      className="border-y border-border/40 bg-card/30 px-6 py-24 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {t('label')}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            {t('heading')}
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {stepKeys.map((step, index) => (
            <div key={step.number} className="relative flex flex-col items-start">
              {/* Connector line */}
              {index < stepKeys.length - 1 && (
                <div className="absolute top-10 right-0 hidden h-px w-[calc(100%-2.5rem)] translate-x-1/2 bg-border/60 md:block" />
              )}
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="mt-6 font-mono text-sm text-primary">
                {step.number}
              </span>
              <h3 className="mt-2 text-xl font-semibold text-foreground">
                {t(`${step.key}.title`)}
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {t(`${step.key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
