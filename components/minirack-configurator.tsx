"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Minus, Plus, Server, Zap, Users, Brain } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmailSignupModal } from "@/components/email-signup-modal"

const MAX_UNITS = 6
const FIRST_UNIT_PRICE = 2000
const ADDITIONAL_UNIT_PRICE = 1200

function getPrice(count: number) {
  if (count <= 0) return 0
  return FIRST_UNIT_PRICE + (count - 1) * ADDITIONAL_UNIT_PRICE
}

const tierKeys = ["tier1", "tier2", "tier3", "tier4", "tier5", "tier6"] as const

export function MiniRackConfigurator() {
  const t = useTranslations('miniRack')
  const [count, setCount] = useState(1)
  const [emailModalOpen, setEmailModalOpen] = useState(false)

  const price = getPrice(count)
  const tierKey = tierKeys[count - 1]

  const increment = () => setCount((c) => Math.min(c + 1, MAX_UNITS))
  const decrement = () => setCount((c) => Math.max(c - 1, 1))

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-card shadow-lg shadow-primary/5">
        {/* Header */}
        <div className="border-b border-border/40 bg-background/50 px-6 py-4 md:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-foreground">{t('title')}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t('subtitle', { max: MAX_UNITS })}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <Server className="h-3.5 w-3.5" />
              {t(`${tierKey}.label`)}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8 p-6 md:flex-row md:p-8">
          {/* Rack visualization */}
          <div className="flex flex-col items-center gap-4 md:w-64 md:shrink-0">
            <div className="relative flex w-full max-w-[200px] flex-col items-center">
              {/* Rack frame */}
              <div className="relative w-full rounded-lg border-2 border-border/60 bg-background/80 p-2">
                {/* Unit slots */}
                <div className="flex flex-col-reverse gap-1.5">
                  {Array.from({ length: MAX_UNITS }, (_, i) => {
                    const unitNum = i + 1
                    const isActive = unitNum <= count
                    return (
                      <button
                        key={unitNum}
                        onClick={() => setCount(unitNum)}
                        className={`group relative flex h-10 items-center justify-between rounded-md border px-3 transition-all duration-300 ${
                          isActive
                            ? "border-primary/60 bg-gradient-to-r from-primary/20 to-primary/10 shadow-sm shadow-primary/10"
                            : "border-border/30 bg-secondary/20 opacity-40 hover:opacity-60"
                        }`}
                      >
                        {/* LED indicator */}
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${
                              isActive ? "bg-green-400 shadow-sm shadow-green-400/50" : "bg-border"
                            }`}
                          />
                          <span
                            className={`text-[10px] font-mono font-medium transition-colors ${
                              isActive ? "text-foreground" : "text-muted-foreground/40"
                            }`}
                          >
                            {t('clawUnit')} {unitNum}
                          </span>
                        </div>
                        {/* Activity bars */}
                        {isActive && (
                          <div className="flex items-end gap-0.5">
                            {[3, 5, 4, 6, 3].map((h, j) => (
                              <div
                                key={j}
                                className="w-0.5 rounded-full bg-primary/50"
                                style={{
                                  height: h,
                                  animationDelay: `${j * 0.15}s`,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Rack label */}
              <p className="mt-3 text-center text-xs text-muted-foreground/60">
                {t('active', { count, max: MAX_UNITS })}
              </p>
            </div>
          </div>

          {/* Controls + pricing */}
          <div className="flex flex-1 flex-col justify-between">
            {/* Counter */}
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-primary">
                {t('configureLabel')}
              </p>
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={decrement}
                  disabled={count <= 1}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-background transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-30 disabled:hover:border-border/60 disabled:hover:bg-background"
                >
                  <Minus className="h-5 w-5" />
                </button>

                <div className="flex-1 text-center">
                  <span className="text-5xl font-bold tabular-nums text-foreground">
                    {count}
                  </span>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {count > 1 ? t('clawsLabel') : t('clawSingular')}
                  </p>
                </div>

                <button
                  onClick={increment}
                  disabled={count >= MAX_UNITS}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-background transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-30 disabled:hover:border-border/60 disabled:hover:bg-background"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              {/* Tier description */}
              <div className="mt-4 rounded-xl border border-border/40 bg-background/50 p-4">
                <p className="text-sm font-semibold text-foreground">{t(`${tierKey}.label`)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t(`${tierKey}.description`)}</p>
              </div>

              {/* Stats row */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center rounded-lg border border-border/30 bg-background/50 p-3">
                  <Brain className="mb-1 h-4 w-4 text-primary" />
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {count * 4}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{t('agents')}</span>
                </div>
                <div className="flex flex-col items-center rounded-lg border border-border/30 bg-background/50 p-3">
                  <Users className="mb-1 h-4 w-4 text-primary" />
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {count * 16}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{t('assistants')}</span>
                </div>
                <div className="flex flex-col items-center rounded-lg border border-border/30 bg-background/50 p-3">
                  <Zap className="mb-1 h-4 w-4 text-primary" />
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    ${(count * 0.1).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{t('dayPower')}</span>
                </div>
              </div>
            </div>

            {/* Price + CTA */}
            <div className="mt-6 flex items-end justify-between border-t border-border/40 pt-6">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold tabular-nums text-foreground">
                    ${price.toLocaleString()}
                  </span>
                  <span className="text-sm text-muted-foreground">{t('oneTime')}</span>
                </div>
                {count > 1 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('firstClaw')} ${FIRST_UNIT_PRICE.toLocaleString()} + {count - 1} {t('additional')} &times; ${ADDITIONAL_UNIT_PRICE.toLocaleString()}
                  </p>
                )}
              </div>
              <Button
                size="lg"
                onClick={() => setEmailModalOpen(true)}
              >
                {t('preOrderRack')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <EmailSignupModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        plan={`MiniRack — ${count} ${count > 1 ? t('clawsLabel') : t('clawSingular')} ($${price.toLocaleString()})`}
      />
    </>
  )
}
