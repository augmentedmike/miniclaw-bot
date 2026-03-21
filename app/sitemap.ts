import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://miniclaw.bot'
  const lastModified = new Date()

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: baseUrl + "/compare",
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: baseUrl + "/invest",
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    }
  ]
}
