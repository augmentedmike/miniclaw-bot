import { useTranslations } from "next-intl"
import Image from "next/image"

const testimonialKeys = [
  { key: "t1", image: "/images/avatars/luna.png" },
  { key: "t2", image: "/images/avatars/marco.png" },
  { key: "t3", image: "/images/avatars/mei.png" },
]

export function Testimonials() {
  const t = useTranslations('testimonials')

  return (
    <section className="border-y border-border/40 bg-card/30 px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {t('label')}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            {t('heading')}
          </h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {testimonialKeys.map(({ key, image }) => (
            <div
              key={key}
              className="flex flex-col rounded-2xl border border-border/40 bg-card p-8"
            >
              {/* Stat callout */}
              <div className="mb-6 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-primary">{t(`${key}.stat`)}</span>
                <span className="text-sm text-muted-foreground">{t(`${key}.statLabel`)}</span>
              </div>
              <blockquote className="flex-1 text-pretty leading-relaxed text-muted-foreground">
                &ldquo;{t(`${key}.quote`)}&rdquo;
              </blockquote>
              <div className="mt-6 flex items-center gap-3 border-t border-border/40 pt-6">
                <Image
                  src={image}
                  alt={t(`${key}.name`)}
                  width={44}
                  height={44}
                  className="rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t(`${key}.name`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`${key}.role`)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
