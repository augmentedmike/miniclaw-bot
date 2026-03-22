import Image from "next/image"
import { useTranslations } from "next-intl"

const capKeys = [
  { key: "cap1", image: "/images/showcase-support.png" },
  { key: "cap2", image: "/images/showcase-inbox.png" },
  { key: "cap3", image: "/images/showcase-meetings.png" },
  { key: "cap4", image: "/images/showcase-social.png" },
  { key: "cap5", image: "/images/showcase-leads.png" },
  { key: "cap6", image: "/images/showcase-finance.png" },
  { key: "cap7", image: "/images/showcase-smarthome.png" },
  { key: "cap8", image: "/images/showcase-health.png" },
  { key: "cap9", image: "/images/showcase-vacation.png" },
  { key: "cap10", image: "/images/showcase-mentions.png" },
  { key: "cap11", image: "/images/showcase-briefing.png" },
  { key: "cap12", image: "/images/showcase-research.png" },
]

export function Showcase() {
  const t = useTranslations("showcase")

  return (
    <section aria-label="Showcase" className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {t("label")}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            {t("heading").split(".")[0]}.{" "}
            <span className="text-muted-foreground">{t("headingDone")}</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {capKeys.map((item, index) => (
            <div
              key={item.key}
              className={`flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-card ${
                index >= 6 ? "hidden md:flex" : ""
              }`}
            >
              <div className="relative aspect-video w-full overflow-hidden bg-secondary">
                <Image
                  src={item.image}
                  alt={t(`${item.key}.title`)}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-sm font-semibold leading-snug text-foreground">
                  {t(`${item.key}.title`)}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {t(`${item.key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center text-pretty text-muted-foreground">
          {t("bottomText").split(t("bottomHighlight"))[0]}
          <span className="text-foreground font-medium">{t("bottomHighlight")}</span>
          {t("bottomSuffix")}
        </p>
      </div>
    </section>
  )
}
