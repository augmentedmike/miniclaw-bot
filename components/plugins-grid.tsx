"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
  Kanban,
  Paintbrush,
  Mail,
  Brain,
  BookOpen,
  FileText,
  Users,
  Mic,
  Newspaper,
  Shield,
  StickyNote,
  ListTodo,
  Layers,
  Cpu,
  Moon,
  MonitorSmartphone,
  MessageCircle,
  PenTool,
  Play,
  Search,
  CreditCard,
  Wallet,
  Calendar,
  HardDrive,
  Key,
  GitPullRequest,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Category = "memory" | "comms" | "content" | "commerce" | "ops" | "all"

const TAB_IDS: { id: Category; key: string }[] = [
  { id: "all",      key: "filterAll"      },
  { id: "memory",   key: "filterMemory"   },
  { id: "comms",    key: "filterComms"    },
  { id: "content",  key: "filterContent"  },
  { id: "commerce", key: "filterCommerce" },
  { id: "ops",      key: "filterOps"      },
]

interface PluginDef {
  icon: LucideIcon
  name: string
  tKey: string
  categories: Category[]
}

const plugins: PluginDef[] = [
  // Memory
  { icon: Kanban, name: "mc-board", tKey: "mcBoard", categories: ["memory"] },
  { icon: Brain, name: "mc-kb", tKey: "mcKb", categories: ["memory"] },
  { icon: Layers, name: "mc-context", tKey: "mcContext", categories: ["memory"] },
  { icon: StickyNote, name: "mc-memo", tKey: "mcMemo", categories: ["memory"] },
  { icon: Moon, name: "mc-reflection", tKey: "mcReflection", categories: ["memory"] },
  { icon: Cpu, name: "mc-soul", tKey: "mcSoul", categories: ["memory"] },
  // Comms
  { icon: Mail, name: "mc-email", tKey: "mcEmail", categories: ["comms"] },
  { icon: Mic, name: "mc-voice", tKey: "mcVoice", categories: ["comms"] },
  { icon: Users, name: "mc-rolodex", tKey: "mcRolodex", categories: ["comms"] },
  { icon: MonitorSmartphone, name: "mc-human", tKey: "mcHuman", categories: ["comms"] },
  { icon: ListTodo, name: "mc-queue", tKey: "mcQueue", categories: ["comms"] },
  { icon: MessageCircle, name: "mc-reddit", tKey: "mcReddit", categories: ["comms"] },
  // Content
  { icon: Paintbrush, name: "mc-designer", tKey: "mcDesigner", categories: ["content"] },
  { icon: PenTool, name: "mc-blog", tKey: "mcBlog", categories: ["content"] },
  { icon: Newspaper, name: "mc-substack", tKey: "mcSubstack", categories: ["content"] },
  { icon: Play, name: "mc-youtube", tKey: "mcYoutube", categories: ["content"] },
  { icon: Search, name: "mc-seo", tKey: "mcSeo", categories: ["content"] },
  { icon: FileText, name: "mc-docs", tKey: "mcDocs", categories: ["content"] },
  // Commerce
  { icon: CreditCard, name: "mc-stripe", tKey: "mcStripe", categories: ["commerce"] },
  { icon: Wallet, name: "mc-square", tKey: "mcSquare", categories: ["commerce"] },
  { icon: Calendar, name: "mc-booking", tKey: "mcBooking", categories: ["commerce"] },
  // Ops
  { icon: HardDrive, name: "mc-backup", tKey: "mcBackup", categories: ["ops"] },
  { icon: BookOpen, name: "mc-jobs", tKey: "mcJobs", categories: ["ops"] },
  { icon: Key, name: "mc-authenticator", tKey: "mcAuthenticator", categories: ["ops"] },
  { icon: Shield, name: "mc-trust", tKey: "mcTrust", categories: ["ops"] },
  { icon: GitPullRequest, name: "mc-contribute", tKey: "mcContribute", categories: ["ops"] },
]

export function PluginsGrid() {
  const [active, setActive] = useState<Category>("all")
  const t = useTranslations("pluginsGrid")

  const visible = plugins.filter(
    (p) => active === "all" || p.categories.includes(active),
  )

  return (
    <section id="plugins" aria-label="Available Plugins" className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {t("label")}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            {t("heading")}
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            {t("subtitle", { count: plugins.length })}
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {TAB_IDS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                active === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((plugin) => (
            <div
              key={plugin.name}
              className="group rounded-2xl border border-border/40 bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <plugin.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground/60">
                    {plugin.name}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {t(`${plugin.tKey}.tagline`)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t(`${plugin.tKey}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
