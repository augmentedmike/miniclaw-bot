"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { X, Check } from "lucide-react"

interface PreOrderModalProps {
  isOpen: boolean
  onClose: () => void
}

export function PreOrderModal({ isOpen, onClose }: PreOrderModalProps) {
  const t = useTranslations('preOrder')

  if (!isOpen) return null

  const depositLink = process.env.NEXT_PUBLIC_STRIPE_DEPOSIT_LINK
  const fullPaymentLink = process.env.NEXT_PUBLIC_STRIPE_FULL_PAYMENT_LINK

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label={t('close')}
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-2xl font-bold text-foreground">{t('title')}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('subtitle')}
        </p>

        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm text-foreground">
            <strong>{t('whiteGloveNote')}</strong> {t('whiteGloveDescription')}
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* 50% Deposit Option */}
          <div className="flex flex-col rounded-xl border-2 border-primary bg-card p-6">
            <div className="mb-4 inline-flex items-center gap-2 self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {t('mostPopular')}
            </div>

            <h4 className="text-lg font-semibold text-foreground">{t('depositTitle')}</h4>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-foreground">{t('depositPrice')}</span>
              <span className="text-sm text-muted-foreground">{t('depositToday')}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('depositRemaining')}
            </p>

            <ul className="mt-6 space-y-3 flex-1">
              <li className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span className="text-muted-foreground">{t('depositFeature1')}</span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span className="text-muted-foreground">{t('depositFeature2')}</span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span className="text-muted-foreground">{t('depositFeature3')}</span>
              </li>
            </ul>

            <Button
              size="lg"
              className="mt-6 w-full"
              asChild
              disabled={!depositLink}
            >
              <a href={depositLink || "#"} target="_blank" rel="noopener noreferrer">
                {t('depositCta')}
              </a>
            </Button>
          </div>

          {/* Full Payment Option */}
          <div className="flex flex-col rounded-xl border border-border/40 bg-card p-6">
            <div className="mb-4 h-7" /> {/* Spacer to align with other card */}

            <h4 className="text-lg font-semibold text-foreground">{t('fullTitle')}</h4>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-foreground">{t('fullPrice')}</span>
              <span className="text-sm text-muted-foreground">{t('fullToday')}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('fullDescription')}
            </p>

            <ul className="mt-6 space-y-3 flex-1">
              <li className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span className="text-muted-foreground">{t('fullFeature1')}</span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span className="text-muted-foreground">{t('fullFeature2')}</span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span className="text-muted-foreground">{t('fullFeature3')}</span>
              </li>
            </ul>

            <Button
              size="lg"
              variant="outline"
              className="mt-6 w-full"
              asChild
              disabled={!fullPaymentLink}
            >
              <a href={fullPaymentLink || "#"} target="_blank" rel="noopener noreferrer">
                {t('fullCta')}
              </a>
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t('refundNote')}
        </p>
      </div>
    </div>
  )
}
