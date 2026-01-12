// URL Detection and Metadata Fetching Utilities

export const GENERIC_URL_REGEX = /https?:\/\/[^\s]+/gi
export const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|avif|svg)(\?[^\s]*)?/gi

export interface LinkMetadata {
  url: string
  title?: string
  description?: string
  image?: string
  favicon?: string
  siteName?: string
  error?: string
  loading?: boolean
}

/**
 * Check if a URL points to an image based on file extension
 */
export function isImageUrl(url: string): boolean {
  // Reset regex lastIndex to avoid issues with global flag
  IMAGE_URL_REGEX.lastIndex = 0
  return IMAGE_URL_REGEX.test(url)
}

/**
 * Extract all HTTP(S) URLs from content
 */
export function extractAllUrls(content: string): string[] {
  const matches = Array.from(content.matchAll(GENERIC_URL_REGEX), m => m[0])
  // Remove duplicates
  return Array.from(new Set(matches))
}

/**
 * Extract only non-image URLs (for link previews)
 */
export function extractLinkUrls(content: string): string[] {
  const allUrls = extractAllUrls(content)
  return allUrls.filter(url => !isImageUrl(url))
}

/**
 * Fetch OpenGraph metadata for a URL
 * Attempts direct fetch first, falls back to basic info on CORS error
 */
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  try {
    // Validate URL
    const urlObj = new URL(url)

    // Try direct fetch first (may fail due to CORS)
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; Ghostr/1.0; +https://ghostr.org)'
      },
      // Set a timeout
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()

    // Parse OpenGraph tags
    const metadata: LinkMetadata = { url }

    // Helper function to extract meta content
    const extractMeta = (property: string, name?: string): string | undefined => {
      // Try property first
      let match = html.match(new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']*?)["']`, 'i'))
      if (match) return match[1]

      // Try name attribute if provided
      if (name) {
        match = html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*?)["']`, 'i'))
        if (match) return match[1]
      }

      // Try reverse order (content before property/name)
      match = html.match(new RegExp(`<meta\\s+content=["']([^"']*?)["']\\s+property=["']${property}["']`, 'i'))
      if (match) return match[1]

      if (name) {
        match = html.match(new RegExp(`<meta\\s+content=["']([^"']*?)["']\\s+name=["']${name}["']`, 'i'))
        if (match) return match[1]
      }

      return undefined
    }

    // Extract og:title
    metadata.title = extractMeta('og:title', 'twitter:title')

    // Extract og:description
    metadata.description = extractMeta('og:description', 'description')

    // Extract og:image
    metadata.image = extractMeta('og:image', 'twitter:image')

    // Extract og:site_name
    metadata.siteName = extractMeta('og:site_name')

    // Fallback to title tag if no og:title
    if (!metadata.title) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch && titleMatch[1]) {
        metadata.title = titleMatch[1].trim()
      }
    }

    // If still no title, use hostname
    if (!metadata.title) {
      metadata.title = urlObj.hostname
    }

    // Make image URL absolute if relative
    if (metadata.image && !metadata.image.startsWith('http')) {
      metadata.image = new URL(metadata.image, url).toString()
    }

    return metadata
  } catch (error) {
    // CORS error, timeout, or fetch failed
    const urlObj = new URL(url)
    return {
      url,
      title: urlObj.hostname,
      description: url,
      error: error instanceof Error && error.name === 'AbortError'
        ? 'Request timed out'
        : 'Could not fetch preview'
    }
  }
}
