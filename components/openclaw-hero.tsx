import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { ArrowDown, Download, Monitor } from "lucide-react"
import { HeroPersonaCard } from "@/components/hero-persona-card"

export function OpenClawHero() {
  const t = useTranslations('openclawHero')

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20">
      {/* Subtle glow */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">

        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/50 bg-secondary/60 px-4 py-1.5 text-sm font-medium text-muted-foreground">
          {t('badge')}
        </div>

        <h1 className="text-balance text-5xl font-bold leading-tight tracking-tight text-foreground md:text-7xl lg:text-8xl">
          {t('headline')}<br className="hidden md:block" />
          <span className="text-foreground/80">{t('headlineSub')}</span>
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-xl leading-relaxed text-muted-foreground">
          {t('description')}
        </p>

        {/* Proof points */}
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground/70">
          <span>⚡ {t('proof1')}</span>
          <span>·</span>
          <span>🚫 {t('proof2')}</span>
          <span>·</span>
          <span>🧠 {t('proof3')}</span>
          <span>·</span>
          <span>🔒 {t('proof4')}</span>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Button size="lg" className="gap-2 px-8 text-base" asChild>
            <a href="https://github.com/augmentedmike/miniclaw-os">
              <Download className="h-4 w-4" />
              {t('downloadFree')}
            </a>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="gap-2 px-8 text-base"
            asChild
          >
            <a href="#order">
              <Monitor className="h-4 w-4" />
              {t('orderMini')}
            </a>
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground/60">
          {t('sysReq')}&middot; {t('sysReqCard')}
        </p>
      </div>

      {/* Hero persona card */}
      <div className="relative mx-auto mt-16 w-full max-w-4xl md:mt-20">
        <h2 className="mb-2 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t('personaHeading')}
        </h2>
        <p className="mb-6 text-center text-base text-muted-foreground sm:text-lg">
          {t('personaDescription')}{" "}
          <span className="font-medium text-foreground">{t('personaHighlight')}</span>
        </p>
        <HeroPersonaCard />
      </div>

      {/* Scroll indicator */}
      <a
        href="#features"
        className="mt-12 mb-8 flex flex-col items-center gap-2 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
        aria-label={t('scroll')}
      >
        <span className="text-xs">{t('scroll')}</span>
        <ArrowDown className="h-4 w-4 animate-bounce" />
      </a>
    </section>
  )
}
