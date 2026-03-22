"use client"

import { useTranslations } from "next-intl"
import { Brain, Code, Image as ImageIcon, Video } from "lucide-react"

const skillKeys = [
  { key: "skill1", icon: Brain, color: "text-purple-500" },
  { key: "skill2", icon: Code, color: "text-blue-500" },
  { key: "skill3", icon: ImageIcon, color: "text-pink-500" },
  { key: "skill4", icon: Video, color: "text-orange-500" },
]

export function SkillsSection() {
  const t = useTranslations('skills')

  return (
    <section id="skills" className="relative overflow-hidden px-6 py-24 md:py-32">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background to-primary/5" />

      <div className="relative mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-16 text-center">
          <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
            {t('heading')}
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
            {t('subtitle')}
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-4 py-1.5 text-sm text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            {t('noVendorLockIn')}
          </p>
        </div>

        {/* Skills Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {skillKeys.map(({ key, icon: Icon, color }) => {
            const hasNote = key === "skill2"
            return (
              <div
                key={key}
                className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
              >
                {/* Icon + Badge */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="inline-flex rounded-xl bg-primary/10 p-3">
                    <Icon className={`h-6 w-6 ${color}`} />
                  </div>
                  {hasNote && (
                    <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                      {t(`${key}.note`)}
                    </span>
                  )}
                </div>

                {/* Content */}
                <h3 className="mb-1 text-xl font-bold text-foreground">
                  {t(`${key}.name`)}
                </h3>
                <p className="mb-3 text-sm font-medium text-muted-foreground">
                  {t(`${key}.subtitle`)}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground/80">
                  {t(`${key}.description`)}
                </p>

                {/* Hover gradient */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            )
          })}
        </div>

        {/* Bottom Message */}
        <div className="mt-12 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            {t('bottomMessage')}{" "}
            <span className="text-foreground">{t('bottomHighlight')}</span>
            <br />
            <span className="text-sm">{t('bottomSuffix')}</span>
          </p>
        </div>
      </div>
    </section>
  )
}
