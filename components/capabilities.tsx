import { useTranslations } from "next-intl"
import {
  Headset,
  TrendingUp,
  Search,
  Megaphone,
  UserPlus,
  FileText,
  CalendarCheck,
} from "lucide-react"

const capKeys = [
  { key: "cap1", icon: Headset },
  { key: "cap2", icon: TrendingUp },
  { key: "cap3", icon: Search },
  { key: "cap4", icon: Megaphone },
  { key: "cap5", icon: UserPlus },
  { key: "cap6", icon: FileText },
  { key: "cap7", icon: CalendarCheck },
]

export function Capabilities() {
  const t = useTranslations('capabilities')

  return (
    <section id="capabilities" className="px-6 py-24 md:py-32">
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

        <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {capKeys.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card p-8 transition-all hover:border-primary/20 hover:bg-card/80"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
                  {t(`${key}.stat`)}
                </span>
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

        {/* Bottom note spanning full width */}
        <div className="mt-12 rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
          <p className="text-lg font-medium text-foreground">
            {t('bottomLine')}{" "}
            <span className="text-primary">{t('bottomHighlight')}</span>
          </p>
          <p className="mt-2 text-muted-foreground">
            {t('bottomDescription')}
          </p>
        </div>
      </div>
    </section>
  )
}
