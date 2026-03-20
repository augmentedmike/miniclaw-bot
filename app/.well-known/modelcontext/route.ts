import { NextResponse } from "next/server"

const manifest = {
  schema_version: "1.0",
  name: "MiniClaw",
  description:
    "MiniClaw is an AI-native plugin ecosystem built on OpenClaw. Download the installer, join the waitlist, or explore available plugins.",
  url: "https://miniclaw.bot",
  logo: "https://miniclaw.bot/og-image-square.png",
  contact_email: "michael@claimhawk.app",
  tools: [
    {
      name: "download-miniclaw",
      description:
        "Download the MiniClaw bootstrap installer for macOS.",
      uri: "https://miniclaw.bot/install/download",
      method: "GET",
      inputSchema: {
        type: "object",
        properties: {},
      },
      returnSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
    },
    {
      name: "join-waitlist",
      description:
        "Join the MiniClaw waitlist to get notified when new plans and early access are available.",
      uri: "https://miniclaw.bot/api/subscribe",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: {
          email: {
            type: "string",
            format: "email",
            description: "Email address to subscribe",
          },
          name: {
            type: "string",
            description: "Your name (optional)",
          },
          plan: {
            type: "string",
            description: "Which plan tier to join the waitlist for",
          },
        },
        required: ["email"],
      },
      returnSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
    },
    {
      name: "check-plugin-list",
      description:
        "View the list of available MiniClaw plugins including memory, skills, persona, kanban, design, email, and more.",
      uri: "https://miniclaw.bot/#plugins",
      method: "GET",
      inputSchema: {
        type: "object",
        properties: {},
      },
      returnSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
    },
  ],
  support: {
    declarative: true,
    imperative: true,
  },
}

export async function GET() {
  return NextResponse.json(manifest, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "public, max-age=3600",
    },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
