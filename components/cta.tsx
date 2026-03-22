import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Download, Monitor } from "lucide-react"

export function CTA() {
  const t = useTranslations('cta')

  return (
    <section className="border-y border-border/40 bg-card/30 px-6 py-24 md:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          {t('heading')}{" "}
          <span className="text-primary">{t('headingHighlight')}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
          {t('description')}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" className="gap-2 px-8 text-base" asChild>
            <a href="https://github.com/augmentedmike/miniclaw-os">
              <Download className="h-4 w-4" />
              {t('downloadFree')}
            </a>
          </Button>
          <Button variant="outline" size="lg" className="gap-2 px-8 text-base" asChild>
            <a href="#order">
              <Monitor className="h-4 w-4" />
              {t('orderMini')}
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
