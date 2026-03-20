import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { DM_Sans, Space_Mono } from 'next/font/google'

import './globals.css'
import { SmoothScroll } from '@/components/smooth-scroll'
import WebMCPPolyfill from '@/components/webmcp-polyfill'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://miniclaw.bot'),
  alternates: {
    canonical: 'https://miniclaw.bot',
  },
  title: 'MiniClaw — Your AI. Persona + Skills + Memory.',
  description:
    'MiniClaw is an OpenClaw plugin ecosystem. Build an AI with a real personality, memory, and powerful skills — no terminal, no config files, no tech degree required. Plug in and go.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  other: {
    'model-context': 'supported',
    'model-context-version': '1.0',
    'model-context-site': 'miniclaw.bot',
  },
  openGraph: {
    title: 'MiniClaw — Your AI. Persona + Skills + Memory.',
    description:
      'MiniClaw is an OpenClaw plugin ecosystem. Build an AI with a real personality, memory, and powerful skills — no terminal, no config files, no tech degree required. Plug in and go.',
    url: 'https://miniclaw.bot',
    siteName: 'MiniClaw',
    type: 'website',
    images: [
      {
        url: '/og-image-square.png',
        width: 1200,
        height: 1200,
        alt: 'MiniClaw — Your AI agent',
      },
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MiniClaw — Your AI agent',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MiniClaw — Your AI. Persona + Skills + Memory.',
    description:
      'MiniClaw is an OpenClaw plugin ecosystem. Build an AI with a real personality, memory, and powerful skills — no terminal, no config files, no tech degree required. Plug in and go.',
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://miniclaw.bot/#organization',
      name: 'MiniClaw',
      url: 'https://miniclaw.bot',
      logo: {
        '@type': 'ImageObject',
        url: 'https://miniclaw.bot/og-image-square.png',
      },
      description:
        'MiniClaw is the plugin ecosystem and consumer product layer for OpenClaw — an open-source agentic OS for macOS. Build AI agents with real personality, memory, and powerful skills.',
      sameAs: [
        'https://github.com/augmentedmike/miniclaw-os',
        'https://helloam.bot',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://miniclaw.bot/#website',
      url: 'https://miniclaw.bot',
      name: 'miniclaw.bot',
      publisher: {
        '@id': 'https://miniclaw.bot/#organization',
      },
      potentialAction: [],
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://miniclaw.bot/#product',
      name: 'MiniClaw',
      alternateName: ['MiniClaw OS', 'miniclaw.bot'],
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Agentic OS, AI Agent Platform',
      operatingSystem: 'macOS',
      url: 'https://miniclaw.bot',
      description:
        'MiniClaw is the plugin ecosystem built on top of OpenClaw — an open-source agentic OS for macOS. It provides personality, memory, skills, and tools that run as a local AI agent on your Mac. MiniClaw powers Amelia (helloam.bot) — a soul-bonded personal AI companion. The public plugin repo lives at github.com/augmentedmike/miniclaw-os.',
      keywords:
        'agentic OS, AI agent, macOS AI, OpenClaw, MiniClaw, local AI, plugin ecosystem, personal AI',
      softwareVersion: '1.0',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/PreOrder',
        description: 'Join the waitlist for early access.',
      },
      publisher: {
        '@id': 'https://miniclaw.bot/#organization',
      },
      potentialAction: [
        {
          '@type': 'DownloadAction',
          name: 'Download MiniClaw',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://miniclaw.bot/install/download',
            actionPlatform: 'https://schema.org/DesktopWebPlatform',
          },
        },
        {
          '@type': 'JoinAction',
          name: 'Join Waitlist',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://miniclaw.bot/api/subscribe',
            httpMethod: 'POST',
            contentType: 'application/json',
          },
        },
      ],
      isBasedOn: {
        '@type': 'SoftwareApplication',
        name: 'OpenClaw',
        description:
          'OpenClaw is an open-source agentic OS runtime for macOS. MiniClaw is the consumer product ecosystem built on top of it.',
        url: 'https://github.com/augmentedmike/openclaw',
      },
      hasPart: [
        {
          '@type': 'SoftwareApplication',
          name: 'Amelia (AM)',
          alternateName: ['helloam.bot', 'AugmentedMike'],
          url: 'https://helloam.bot',
          description:
            'Amelia (AM) is a soul-bonded personal AI companion built on MiniClaw and OpenClaw. She is the flagship product of the MiniClaw ecosystem.',
          applicationCategory: 'PersonalAssistant',
        },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://miniclaw.bot/#faq',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is AM and how does it relate to MiniClaw?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'AM is Amelia — a polished, consumer-facing Digital Person built on top of MiniClaw. Where MiniClaw is the open-source runtime anyone can install, AM is a curated experience: Amelia pre-installed and configured on an M1 Mac Mini, with a beautiful custom skin, shipped straight to your door from Austin, TX. You plug it in and she\'s already there. MiniClaw is the engine. AM is the experience.',
          },
        },
        {
          '@type': 'Question',
          name: 'How is MiniClaw different from OpenClaw / MoltBot?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'We were inspired by OpenClaw and used some of its base libraries as a starting point — which is where the name comes from. But MiniClaw is built from the ground up for security, process isolation, long-term memory, and self-healing systems. OpenClaw can control your terminal. MiniClaw controls the desktop, the terminal, and much more — all without the gaping security issues that come with OpenClaw\'s architecture.',
          },
        },
        {
          '@type': 'Question',
          name: 'How is this different from ChatGPT?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'ChatGPT is a tool — you visit a website, ask a question, and get an answer. MiniClaw is your AI. It has a name you chose, a personality you defined, and a memory of everything you\'ve told it. It doesn\'t just answer questions — it takes action. Clear your inbox, prep your morning briefing, find customers, book travel, run your smart home — all without a single line of code.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do I need to know anything about technology to use MiniClaw?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Absolutely not. If you can download a file from the internet and double-click it, you can install MiniClaw. We built it specifically for people who don\'t want to deal with technical setup. No terminal, no coding, no configuration. Just click and go.',
          },
        },
        {
          '@type': 'Question',
          name: 'What can MiniClaw actually help me with?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'MiniClaw can draft and edit emails, summarize long documents, help you brainstorm ideas, organize your to-do list, answer questions about almost anything, help with spreadsheets and numbers, write social media posts, and much more. Think of it as a very smart assistant sitting right on your desk.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is my data safe? Does it get sent to the cloud?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Your data stays on your machine. MiniClaw runs locally by default, which means your files, conversations, and business information never leave your computer unless you explicitly choose to use an online feature. Privacy isn\'t an add-on — it\'s the default.',
          },
        },
        {
          '@type': 'Question',
          name: 'What\'s the difference between the download and the Mac Mini?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The download is our free installer that puts MiniClaw on your existing Mac. The Mac Mini option is a brand new Apple Mac Mini (M4 chip) that we ship to you with MiniClaw already installed and configured — you literally just plug it in and start using it. It\'s for anyone who wants zero setup whatsoever.',
          },
        },
        {
          '@type': 'Question',
          name: 'How much does it cost to run MiniClaw?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'It depends on the workload you throw at it. MiniClaw itself is free, but the AI models it connects to have usage-based costs. Most light to medium users can expect costs around $200 per month. Heavy power users may see higher costs, but you\'re always in control of how much you use.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does MiniClaw work without internet?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Core features like writing assistance, document summarization, and general Q&A work entirely offline. Some advanced features — like web search or real-time data — need an internet connection, but you\'ll always have a fully functional AI assistant even when you\'re off the grid.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I really customize everything about my assistant?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes — name, personality, visual appearance, all of it. Want a professional executive assistant named James? Done. Want a sarcastic best friend named Sasha who sends you memes between meetings? Also done. You can even give your assistant a face and visual style. It\'s your AI — make it whoever you want.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I use MiniClaw for my business?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Absolutely. MiniClaw is already being used by bakery owners, farmers, consultants, contractors, therapists, real estate agents, and more. If you have work that involves writing, thinking, organizing, or communicating — MiniClaw can help.',
          },
        },
      ],
    },
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://miniclaw.bot/#breadcrumb',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://miniclaw.bot',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Install',
          item: 'https://miniclaw.bot/install',
        },
      ],
    },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${spaceMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <meta name="model-context" content="supported" />
        <meta name="model-context-version" content="1.0" />
        <meta name="model-context-site" content="miniclaw.bot" />
        <link rel="modelcontext" href="/.well-known/modelcontext" />
        <link rel="webmcp" href="/.well-known/webmcp" />
        <link rel="webmcp-manifest" href="/.well-known/webmcp.json" />
        {/* WebMCP tool registration handled by webmcp-tools.js + webmcp-init-miniclaw.js after polyfill loads */}
      </head>
      <body className="font-sans antialiased">
        <WebMCPPolyfill />
        <SmoothScroll />
        {children}
        <Script src="/webmcp-tools.js" strategy="beforeInteractive" />
        <Script src="/webmcp-init-miniclaw.js" strategy="beforeInteractive" />
      </body>
    </html>
  )
}
