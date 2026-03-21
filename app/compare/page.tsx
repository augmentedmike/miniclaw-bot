import type { Metadata } from "next"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import {
  ShieldAlert,
  Hand,
  ImageOff,
  Monitor,
  KanbanSquare,
  Brain,
  MessageSquare,
  ArrowRight,
  X,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "MiniClaw vs OpenClaw — Why MiniClaw Wins",
  description:
    "See how MiniClaw solves OpenClaw's biggest problems: unsandboxed plugins, no agent interrupt, context explosion, no web UI, and no long-term planning.",
  openGraph: {
    title: "MiniClaw vs OpenClaw — Why MiniClaw Wins",
    description:
      "See how MiniClaw solves OpenClaw's biggest problems: unsandboxed plugins, no agent interrupt, context explosion, no web UI, and no long-term planning.",
    url: "https://miniclaw.bot/compare",
    siteName: "MiniClaw",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MiniClaw vs OpenClaw comparison",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MiniClaw vs OpenClaw — Why MiniClaw Wins",
    description:
      "See how MiniClaw solves OpenClaw's biggest problems: unsandboxed plugins, no agent interrupt, context explosion, no web UI, and no long-term planning.",
    images: ["/og-image.png"],
  },
}

const comparisons = [
  {
    icon: ShieldAlert,
    category: "Security & Attack Surface",
    openclaw: {
      title: "Unsandboxed plugins & skills",
      description:
        "Skills and plugins run with full process access. Any third-party skill can read your filesystem, exfiltrate data, or execute arbitrary code. There is no permission boundary between skills and the host system.",
    },
    miniclaw: {
      title: "Process-isolated plugin sandbox",
      description:
        "Every MiniClaw plugin runs in its own isolated process with explicit permission grants. Plugins declare what they need — filesystem paths, network access, shell commands — and the runtime enforces it. A rogue plugin cannot escape its sandbox.",
    },
  },
  {
    icon: Hand,
    category: "Agent Interrupt",
    openclaw: {
      title: "No way to stop a running agent",
      description:
        "Once an OpenClaw agent starts a task, there is no interrupt mechanism. If it goes off the rails — running destructive commands, burning tokens, or looping — your only option is to kill the process and lose all context.",
    },
    miniclaw: {
      title: "mc-human interrupt at any time",
      description:
        "MiniClaw's mc-human plugin provides a real-time interrupt channel. You can pause, redirect, or cancel any running agent mid-task without losing session state. The agent acknowledges the interrupt and gracefully adjusts.",
    },
  },
  {
    icon: ImageOff,
    category: "Context Management",
    openclaw: {
      title: "Image context explosion",
      description:
        "OpenClaw dumps screenshots and images directly into the conversation context. Each image consumes thousands of tokens, quickly blowing past context limits and degrading response quality. There is no built-in way to manage this.",
    },
    miniclaw: {
      title: "mc-context with smart windowing",
      description:
        "MiniClaw's mc-context plugin manages a sliding context window with a configurable maxImages cap. Images are summarized, deduplicated, and evicted intelligently. You get visual awareness without the token bloat.",
    },
  },
  {
    icon: Monitor,
    category: "Visual Interface",
    openclaw: {
      title: "Terminal only — no UI",
      description:
        "OpenClaw is a command-line tool. There is no web dashboard, no visual feedback, no way for non-technical users to interact with their agent. You live in the terminal or you don't use it at all.",
    },
    miniclaw: {
      title: "Full Next.js web dashboard",
      description:
        "MiniClaw ships with a complete web UI — board management, memory browser, plugin settings, real-time agent activity, and conversation history. Non-technical users can manage everything through a browser.",
    },
  },
  {
    icon: KanbanSquare,
    category: "Long-Term Planning",
    openclaw: {
      title: "No planning or task management",
      description:
        "OpenClaw has no concept of multi-step planning, task queues, or project management. Every session is a one-shot interaction. There is no way to break a large goal into tracked, sequential work.",
    },
    miniclaw: {
      title: "mc-board with kanban & Brain board",
      description:
        "MiniClaw's mc-board plugin provides a full kanban system with columns, priorities, tags, and acceptance criteria. The Brain board enables autonomous multi-session planning — your agent picks up cards, works them, and moves them through review.",
    },
  },
  {
    icon: Brain,
    category: "Persistent Memory",
    openclaw: {
      title: "Stateless — every session starts fresh",
      description:
        "OpenClaw has no built-in memory layer. Every conversation starts from zero. Your agent doesn't remember your preferences, your projects, or what happened five minutes ago in a different session.",
    },
    miniclaw: {
      title: "mc-memory vector memory + reflection",
      description:
        "MiniClaw's mc-memory plugin provides persistent vector-indexed memory. Your agent remembers facts, preferences, past decisions, and conversation history across sessions. It reflects on past interactions to improve future ones.",
    },
  },
  {
    icon: MessageSquare,
    category: "Conversation Continuity",
    openclaw: {
      title: "Fresh session every time",
      description:
        "Each OpenClaw session is independent. There is no mechanism to carry context, decisions, or progress from one conversation to the next. Long-running projects require manual re-briefing every single time.",
    },
    miniclaw: {
      title: "Episodic memory + session handoff",
      description:
        "MiniClaw agents maintain episodic memory — structured logs of what was attempted, what worked, and what failed. When a new session starts, the agent reads its memos and picks up exactly where it left off. No re-briefing needed.",
    },
  },
]

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="px-6 pt-32 pb-24 md:pt-40 md:pb-32">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary mb-6">
            Technical Comparison
          </p>
          <h1 className="text-balance text-5xl font-bold leading-tight tracking-tight text-foreground md:text-7xl">
            MiniClaw vs OpenClaw
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
            We built on top of OpenClaw's agentic runtime — then fixed the security holes,
            added the missing UI, and built the planning and memory layers it never had.
          </p>
        </div>
      </section>

      {/* Comparison Cards */}
      <section className="px-6 pb-24 md:pb-32">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Header row — desktop only */}
          <div className="hidden md:grid md:grid-cols-[280px_1fr_1fr] gap-6 px-2">
            <div />
            <div className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              OpenClaw
            </div>
            <div className="text-center text-sm font-semibold text-primary uppercase tracking-wider">
              MiniClaw
            </div>
          </div>

          {comparisons.map((item) => (
            <div
              key={item.category}
              className="rounded-2xl border border-border/40 bg-card p-6 md:p-0 md:grid md:grid-cols-[280px_1fr_1fr] md:gap-0 md:overflow-hidden"
            >
              {/* Category label */}
              <div className="flex items-center gap-3 md:p-6 md:border-r md:border-border/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="font-semibold text-foreground">
                  {item.category}
                </span>
              </div>

              {/* OpenClaw column */}
              <div className="mt-4 md:mt-0 rounded-xl md:rounded-none bg-muted/30 p-4 md:p-6 md:border-r md:border-border/40">
                <div className="flex items-center gap-2 mb-2 md:hidden">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OpenClaw</span>
                </div>
                <div className="flex items-start gap-2">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive/70" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {item.openclaw.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground/70">
                      {item.openclaw.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* MiniClaw column */}
              <div className="mt-3 md:mt-0 rounded-xl md:rounded-none border border-primary/20 md:border-0 bg-primary/5 p-4 md:p-6">
                <div className="flex items-center gap-2 mb-2 md:hidden">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">MiniClaw</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.miniclaw.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {item.miniclaw.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-y border-border/40 bg-card/30 px-6 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Same engine. Everything else rebuilt.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
            MiniClaw takes the agentic power of OpenClaw and wraps it in security,
            usability, memory, and planning — everything a real AI assistant needs.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="gap-2 px-8 text-base" asChild>
              <a href="/install">
                Install MiniClaw
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="outline" size="lg" className="px-8 text-base" asChild>
              <a href="/">
                Learn More
              </a>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
