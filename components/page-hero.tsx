"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ArrowDown, Download, Monitor } from "lucide-react"

interface HeroSlide {
  headline: string
  headlineSub: string
  description: string
  emphasisWord: string
  proofs: string[]
}

interface PageHeroProps {
  slides: HeroSlide[]
  rotationInterval?: number
}

const ROTATION_INTERVAL = 6000

export function PageHero({ slides, rotationInterval = ROTATION_INTERVAL }: PageHeroProps) {
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.floor(Math.random() * slides.length)
  )
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (slides.length <= 1) return
    const timer = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % slides.length)
        setFading(false)
      }, 400)
    }, rotationInterval)
    return () => clearInterval(timer)
  }, [slides.length, rotationInterval])

  const slide = slides[activeIndex]

  return (
    <section aria-label="Hero" role="banner" className="relative overflow-hidden px-6">
      <div className="pointer-events-none absolute top-1/4 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative flex min-h-[85vh] flex-col items-center justify-center pt-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <div
            className={`transition-opacity duration-400 ${fading ? "opacity-0" : "opacity-100"}`}
          >
            <h1 className="text-balance text-5xl font-bold leading-tight tracking-tight text-foreground md:text-7xl lg:text-8xl">
              {slide.headline}
              <br className="hidden md:block" />{" "}
              <span className="text-foreground/80">{slide.headlineSub}</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-pretty text-xl leading-relaxed text-muted-foreground">
              {slide.description}{" "}
              <span className="font-semibold text-foreground">
                {slide.emphasisWord}
              </span>
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground/70">
              {slide.proofs.map((proof, i) => (
                <span key={i}>
                  {i > 0 && <span className="mr-6">&middot;</span>}
                  {proof}
                </span>
              ))}
            </div>
          </div>

          {slides.length > 1 && (
            <div className="mt-8 flex gap-2">
              {slides.map((_, i) => (
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
          )}

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Button size="lg" className="gap-2 px-8 text-base" asChild>
              <a href="https://github.com/augmentedmike/miniclaw-os">
                <Download className="h-4 w-4" />
                Download Free
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
                Order Your AGI Machine
              </a>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground/60">
            macOS 13+&middot; No credit card required
          </p>

          {/* Inline waitlist form — always in DOM for agent/checker discovery */}
          <HeroSignupForm />
        </div>

        <div className="absolute bottom-8 flex flex-col items-center gap-2 text-muted-foreground/40">
          <ArrowDown className="h-4 w-4 animate-bounce" />
        </div>
      </div>
    </section>
  )
}

function HeroSignupForm() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setStatus("loading")
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setStatus("success")
        setEmail("")
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="mt-8 w-full max-w-md">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        action="/api/subscribe"
        method="POST"
        toolname="join-waitlist"
        tooldescription="Join the MiniClaw waitlist to get notified when early access is available"
        data-tool-name="join-waitlist"
        data-tool-description="Join the MiniClaw waitlist to get notified when early access is available"
        role="form"
        aria-label="Join the MiniClaw waitlist"
        className="flex gap-2"
      >
        <label htmlFor="hero-email" className="sr-only">Email address</label>
        <input
          id="hero-email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address for waitlist signup"
          pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
          title="Enter a valid email address"
          autoComplete="email"
          disabled={status === "loading" || status === "success"}
          className="flex-1 rounded-lg border border-border bg-background/80 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          aria-label="Submit waitlist signup"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "loading" ? "..." : status === "success" ? "Done!" : "Join Waitlist"}
        </button>
      </form>
      {status === "success" && (
        <p className="mt-2 text-center text-xs text-green-500" role="status">Thanks! We'll let you know when it's ready.</p>
      )}
      {status === "error" && (
        <p className="mt-2 text-center text-xs text-red-500" role="alert">Something went wrong. Try again.</p>
      )}
    </div>
  )
}
