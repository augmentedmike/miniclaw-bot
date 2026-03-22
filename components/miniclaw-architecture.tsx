"use client"

import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

const featureKeys = ["feat1", "feat2", "feat3", "feat4", "feat5"]
const whoKeys = ["who1", "who2", "who3", "who4", "who5", "who6", "who7"]

export function MiniClawArchitecture() {
  const t = useTranslations("architecture")

  return (
    <section id="architecture" aria-label="Architecture" className="relative overflow-hidden px-6 py-24 md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />

      <div className="relative mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {t("label")}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            {t("heading")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
            {t("description").replace(t("descriptionHighlight"), "")}{" "}
            <span className="font-medium text-foreground">{t("descriptionHighlight")}</span>
          </p>
        </div>

        {/* Feature list */}
        <div className="mx-auto mt-16 max-w-3xl divide-y divide-border/40">
          {featureKeys.map((key) => (
            <div
              key={key}
              className="group flex flex-col gap-1 py-6 sm:flex-row sm:items-baseline sm:gap-8"
            >
              <h3 className="shrink-0 text-lg font-bold text-foreground transition-colors group-hover:text-primary sm:w-56">
                {t(`${key}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`${key}.description`)}
              </p>
            </div>
          ))}
        </div>

        {/* Who it's for */}
        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            {t("whoItsForLabel")}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {whoKeys.map((key) => (
              <span
                key={key}
                className="rounded-full border border-border/60 bg-card px-4 py-2 text-sm text-muted-foreground"
              >
                {t(key)}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="https://github.com/augmentedmike/miniclaw-os"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            {t("ctaGet")}
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="/#faq"
            className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            {t("ctaFaq")}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}
