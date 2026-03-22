"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { TrendingUp, Shield, Users } from "lucide-react"

const featureKeys = [
  { key: "feature1", icon: TrendingUp },
  { key: "feature2", icon: Shield },
  { key: "feature3", icon: Users },
]

export function Investors() {
  const t = useTranslations('investors')
  const investorEmail = "amelia@helloam.bot"

  return (
    <section className="border-y border-border/40 bg-card/30 px-6 py-24 md:py-32">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {t('label')}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            {t('heading')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            {t('description')}
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {featureKeys.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex flex-col items-center text-center rounded-xl border border-border/40 bg-card p-6"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-4 font-semibold text-foreground">
                {t(`${key}.title`)}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`${key}.description`)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-border/40 bg-card p-8 md:p-10">
          <h3 className="text-xl font-semibold text-foreground">
            {t('interestedHeading')}
          </h3>
          <p className="mt-2 text-muted-foreground">
            {t('interestedDescription')}
          </p>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button size="lg" asChild>
              <a href={`mailto:${investorEmail}?subject=Investment Inquiry`}>
                {t('contactButton')}
              </a>
            </Button>
            <p className="text-sm text-muted-foreground">
              {t('orEmailText')}{" "}
              <a
                href={`mailto:${investorEmail}`}
                className="text-primary hover:underline"
              >
                {investorEmail}
              </a>
            </p>
          </div>

          <div className="mt-8 rounded-lg border border-border/40 bg-background/50 p-4">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{t('disclaimer').split(':')[0]}:</strong>{t('disclaimer').split(':').slice(1).join(':')}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
