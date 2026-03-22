"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Check, Download, Monitor } from "lucide-react"
import { EmailSignupModal } from "@/components/email-signup-modal"
import { MiniRackConfigurator } from "@/components/minirack-configurator"

const planConfigs = [
  {
    key: "plan1",
    slug: "download",
    icon: Download,
    href: "https://github.com/augmentedmike/miniclaw-os",
    highlighted: false,
    hasPeriod: false,
  },
  {
    key: "plan2",
    slug: "order",
    icon: Monitor,
    href: "https://helloam.bot",
    highlighted: true,
    hasPeriod: true,
  },
]

export function Pricing() {
  const t = useTranslations('pricing')
  const [activeSlug, setActiveSlug] = useState("download")
  const [animatingSlug, setAnimatingSlug] = useState<string | null>(null)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState("")

  useEffect(() => {
    function handleHash() {
      const hash = window.location.hash.slice(1)
      if (hash === "download" || hash === "order") {
        setTimeout(() => {
          setActiveSlug(hash)
          setAnimatingSlug(hash)
        }, 300)
      }
    }

    handleHash()
    window.addEventListener("hashchange", handleHash)
    return () => window.removeEventListener("hashchange", handleHash)
  }, [])

  useEffect(() => {
    if (animatingSlug) {
      const timer = setTimeout(() => setAnimatingSlug(null), 2800)
      return () => clearTimeout(timer)
    }
  }, [animatingSlug])

  return (
    <section id="pricing" className="px-6 py-24 md:py-32">
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
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {t('inDevelopment')}
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl gap-6 md:grid-cols-2">
          {planConfigs.map((plan) => (
            <div
              key={plan.key}
              id={plan.slug}
              className={`relative flex flex-col rounded-2xl border p-8 scroll-mt-24 md:p-10 ${activeSlug === plan.slug
                ? "border-primary/40 bg-card shadow-lg shadow-primary/5"
                : "border-border/40 bg-card"
                } ${animatingSlug === plan.slug ? "animate-highlight-card" : ""}`}
            >
              {activeSlug === plan.slug && (
                <div className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  {t('mostPopular')}
                </div>
              )}

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <plan.icon className="h-5 w-5 text-primary" />
              </div>

              <h3 className="mt-5 text-xl font-semibold text-foreground">
                {t(`${plan.key}.name`)}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`${plan.key}.description`)}
              </p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">
                  {t(`${plan.key}.price`)}
                </span>
                {plan.hasPeriod && (
                  <span className="text-sm text-muted-foreground">
                    / {t(`${plan.key}.period`)}
                  </span>
                )}
              </div>

              <ul className="mt-8 flex flex-col gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {t(`${plan.key}.feature${i}`)}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-center text-xs font-medium uppercase tracking-widest text-primary">
                {t(`${plan.key}.timeline`)}
              </p>
              {plan.href ? (
                <Button
                  className="mt-3"
                  size="lg"
                  variant={activeSlug === plan.slug ? "default" : "outline"}
                  asChild
                >
                  <a href={plan.href}>{t(`${plan.key}.cta`)}</a>
                </Button>
              ) : (
                <Button
                  className="mt-3"
                  size="lg"
                  variant={activeSlug === plan.slug ? "default" : "outline"}
                  onClick={() => {
                    setSelectedPlan(t(`${plan.key}.name`))
                    setEmailModalOpen(true)
                  }}
                >
                  {t(`${plan.key}.cta`)}
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Pre-order CTA */}
        <div className="mx-auto mt-12 max-w-md text-center">
          <Button size="lg" className="w-full gap-2 text-base" asChild>
            <a href="https://helloam.bot">
              <Monitor className="h-4 w-4" />
              {t('orderCta')}
            </a>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground/60">
            {t('depositNote')}
          </p>
        </div>

        {/* MiniRack Configurator */}
        <div id="pricing-rack" className="mx-auto mt-16 max-w-4xl scroll-mt-24">
          <div className="mb-8 text-center">
            <h3 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {t('rackHeading')}
            </h3>
            <p className="mt-2 text-muted-foreground">
              {t('rackSubtitle')}
            </p>
          </div>
          <MiniRackConfigurator />
        </div>
      </div>

      <EmailSignupModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        plan={selectedPlan}
      />
    </section>
  )
}
