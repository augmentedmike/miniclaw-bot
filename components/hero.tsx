"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { ArrowDown, Download, Monitor } from "lucide-react"
import { HeroPersonaCard } from "@/components/hero-persona-card"

const slideKeys = ["slide1", "slide2", "slide3", "slide4", "slide5", "slide6", "slide7", "slide8", "slide9"] as const

const ROTATION_INTERVAL = 6000

export function Hero() {
  const t = useTranslations('hero')
  const [activeIndex, setActiveIndex] = useState(() => Math.floor(Math.random() * slideKeys.length))
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % slideKeys.length)
        setFading(false)
      }, 400)
    }, ROTATION_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  const slideKey = slideKeys[activeIndex]

  return (
    <section className="relative overflow-hidden px-6">
      {/* Subtle glow */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />

      {/* Above the fold */}
      <div className="relative flex min-h-screen flex-col items-center justify-center pt-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          {/* Rotating content */}
          <div
            className={`transition-opacity duration-400 ${fading ? "opacity-0" : "opacity-100"}`}
          >
            <h1 className="text-balance text-5xl font-bold leading-tight tracking-tight text-foreground md:text-7xl lg:text-8xl">
              {t(`${slideKey}.headline`)}
              <br className="hidden md:block" />{" "}
              <span className="text-foreground/80">{t(`${slideKey}.headlineSub`)}</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-pretty text-xl leading-relaxed text-muted-foreground">
              {t(`${slideKey}.description`)}{" "}
              <span className="font-semibold text-foreground">
                {t(`${slideKey}.emphasisWord`)}
              </span>
            </p>

            {/* Proof points */}
            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground/70">
              {[1, 2, 3, 4].map((i) => (
                <span key={i}>
                  {i > 1 && <span className="mr-6">·</span>}
                  {t(`${slideKey}.proof${i}`)}
                </span>
              ))}
            </div>
          </div>

          {/* Dots */}
          <div className="mt-8 flex gap-2">
            {slideKeys.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setFading(true)
                  setTimeout(() => {
                    setActiveIndex(i)
                    setFading(false)
                  }, 400)
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeIndex
                    ? "w-6 bg-primary"
                    : "w-1.5 bg-border hover:bg-primary/40"
                }`}
              />
            ))}
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
              <a href="https://helloam.bot">
                <Monitor className="h-4 w-4" />
                {t('orderMachine')}
              </a>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground/60">
            {t('sysReqMac')}&middot; {t('sysReqCard')}
          </p>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 flex flex-col items-center gap-2 text-muted-foreground/40">
          <ArrowDown className="h-4 w-4 animate-bounce" />
        </div>
      </div>

      {/* Below the fold — persona card */}
      <div className="relative mx-auto w-full max-w-4xl pb-24 pt-8">
        <h2 className="mb-2 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t('personaHeading')}
        </h2>
        <p className="mb-6 text-center text-base text-muted-foreground sm:text-lg">
          {t('personaDescription')}{" "}
          <span className="font-medium text-foreground">
            {t('personaHighlight')}
          </span>
        </p>
        <HeroPersonaCard />
      </div>
    </section>
  )
}
