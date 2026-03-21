"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const navLinks = [
  { label: "Features", href: "/#plugins" },
  { label: "Kanban", href: "/#kanban" },
  { label: "Customize", href: "/#customize" },
  { label: "Pilots", href: "https://github.com/augmentedmike/miniclaw-os/blob/main/PILOTS.md" },
  { label: "Blog", href: "https://blog.augmentedmike.com" },
  { label: "FAQ", href: "/#faq" },
  { label: "vs OpenClaw", href: "/compare" },
]

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <img
            src="/images/logo.png"
            alt="MiniClaw"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
          />
          <span className="text-lg font-bold tracking-tight text-foreground">
            MiniClaw
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <a href="https://github.com/augmentedmike/miniclaw-os">Download</a>
          </Button>
          <Button size="sm" asChild>
            <a href="https://helloam.bot/#waitlist">Order Your AGI Machine</a>
          </Button>
        </div>

        <button
          className="flex items-center justify-center text-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-4">
              <Button variant="outline" size="sm" asChild>
                <a href="https://github.com/augmentedmike/miniclaw-os" onClick={() => setMobileOpen(false)}>Download</a>
              </Button>
              <Button size="sm" asChild>
                <a href="https://helloam.bot/#waitlist" onClick={() => setMobileOpen(false)}>Order Your AGI Machine</a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
