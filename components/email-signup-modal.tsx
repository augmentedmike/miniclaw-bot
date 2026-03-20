"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

interface EmailSignupModalProps {
  isOpen: boolean
  onClose: () => void
  plan: string
}

export function EmailSignupModal({ isOpen, onClose, plan }: EmailSignupModalProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [useCase, setUseCase] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && emailInputRef.current) {
      setTimeout(() => emailInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, useCase, plan }),
      })

      const data = await res.json()

      if (res.ok) {
        setStatus("success")
        setMessage("Thanks! We'll notify you when it's ready.")
        setName("")
        setEmail("")
        setUseCase("")
        setTimeout(() => {
          onClose()
          setStatus("idle")
          setMessage("")
        }, 2000)
      } else {
        setStatus("error")
        setMessage(data.error || "Something went wrong. Please try again.")
      }
    } catch (error) {
      setStatus("error")
      setMessage("Network error. Please try again.")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-2xl font-bold text-foreground">Get notified</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          We'll let you know when {plan} is available.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" toolname="join-waitlist" tooldescription="Join the MiniClaw waitlist to get notified when new plans are available" data-tool-name="join-waitlist" data-tool-description="Join the MiniClaw waitlist to get notified when new plans are available" action="/api/subscribe" method="POST" role="form" aria-label="Join the MiniClaw waitlist">
          <fieldset>
          <legend className="sr-only">Join the MiniClaw Waitlist</legend>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
              Name <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              disabled={status === "loading" || status === "success"}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              name="email"
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
              title="Enter a valid email address"
              autoComplete="email"
              disabled={status === "loading" || status === "success"}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label htmlFor="usecase" className="block text-sm font-medium text-foreground mb-1.5">
              What do you want to do with it? <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="usecase"
              name="useCase"
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
              placeholder="e.g., manage my small business, automate my inbox..."
              rows={3}
              disabled={status === "loading" || status === "success"}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {message && (
            <p
              className={`text-sm ${
                status === "success" ? "text-green-600" : "text-red-600"
              }`}
            >
              {message}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={status === "loading" || status === "success"}
          >
            {status === "loading" ? "Subscribing..." : status === "success" ? "Done!" : "Notify Me"}
          </Button>
          </fieldset>
        </form>
      </div>
    </div>
  )
}
