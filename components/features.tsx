import { useTranslations } from "next-intl"
import {
  MousePointerClick,
  ShieldCheck,
  Zap,
  MessageSquare,
  RefreshCw,
  Wifi,
} from "lucide-react"

const featureKeys = [
  { key: "feature1", icon: MousePointerClick },
  { key: "feature2", icon: Zap },
  { key: "feature3", icon: MessageSquare },
  { key: "feature4", icon: ShieldCheck },
  { key: "feature5", icon: RefreshCw },
  { key: "feature6", icon: Wifi },
]

export function Features() {
  const t = useTranslations('features')

  return (
    <section id="features" className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {t('label')}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            {t('heading')}{" "}
            <span className="text-muted-foreground">{t('headingHighlight')}</span>
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {featureKeys.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="group rounded-2xl border border-border/40 bg-card p-8 transition-all hover:border-primary/20 hover:bg-card/80"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-foreground">
                {t(`${key}.title`)}
              </h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                {t(`${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
