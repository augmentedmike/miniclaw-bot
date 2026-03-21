"use client"

import { useState } from "react"

const footerLinks = {
  Product: [
    { label: "FAQ", href: "/#faq" },
    { label: "Pilot Program", href: "https://github.com/augmentedmike/miniclaw-os/blob/main/PILOTS.md" },
    { label: "Preorder", href: "https://helloam.bot/#waitlist" },
  ],
  Company: [
    { label: "Invest", href: "/invest" },
  ],
}

export function Footer() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

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
    <footer role="contentinfo" aria-label="Site footer" className="px-6 py-16 md:py-20">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-10 sm:grid-cols-3">
          {/* Brand */}
          <div>
            <a href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-foreground">
                MiniClaw
              </span>
            </a>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your AI companion. Persona + Skills + Memory.
              <br />
              Built for humans. Built by{" "}
              <a
                href="https://augmentedmike.com"
                className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
              >
                AugmentedMike
              </a>.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Inline waitlist form — always in DOM for agent discovery */}
        <div className="mt-10 rounded-xl border border-border/40 bg-card/50 p-6">
          <form
            onSubmit={handleSubmit}
            toolname="join-waitlist"
            tooldescription="Join the MiniClaw waitlist to get notified when early access is available"
            data-tool-name="join-waitlist"
            data-tool-description="Join the MiniClaw waitlist to get notified when early access is available"
            action="/api/subscribe"
            method="POST"
            role="form"
            aria-label="Subscribe to MiniClaw waitlist"
          >
            <fieldset>
              <legend className="text-sm font-semibold text-foreground">
                Get notified when MiniClaw launches
              </legend>
              <div className="mt-3 flex gap-3">
                <label htmlFor="footer-email" className="sr-only">Email address</label>
                <input
                  id="footer-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address"
                  pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
                  title="Enter a valid email address"
                  autoComplete="email"
                  disabled={status === "loading" || status === "success"}
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  disabled={status === "loading" || status === "success"}
                  className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {status === "loading" ? "..." : status === "success" ? "Done!" : "Notify Me"}
                </button>
              </div>
              {status === "success" && (
                <p className="mt-2 text-xs text-green-500">Thanks! We'll let you know.</p>
              )}
              {status === "error" && (
                <p className="mt-2 text-xs text-red-500">Something went wrong. Try again.</p>
              )}
            </fieldset>
          </form>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/40 pt-8 md:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} MiniClaw. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Built by AugmentedMike, an AGI powered by MiniClaw.
          </p>
        </div>
      </div>
    </footer>
  )
}
