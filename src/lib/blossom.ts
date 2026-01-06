import { BlossomClient, type SignedEvent } from 'blossom-client-sdk'
import type { NDKSigner } from '@nostr-dev-kit/ndk'

const DEFAULT_SERVER = 'https://blossom.nostr.build'

/**
 * Compute SHA-256 hash of a file
 */
async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Encode auth event for Authorization header
 */
function encodeAuthorizationHeader(auth: SignedEvent): string {
  return 'Nostr ' + btoa(unescape(encodeURIComponent(JSON.stringify(auth))))
}

/**
 * Create a signer function compatible with blossom-client-sdk
 */
function createBlossomSigner(ndkSigner: NDKSigner) {
  return async (template: { kind: number; content: string; tags: string[][]; created_at: number }) => {
    // Import NDKEvent dynamically to avoid circular deps
    const { NDKEvent } = await import('@nostr-dev-kit/ndk')
    const event = new NDKEvent()
    event.kind = template.kind
    event.content = template.content
    event.tags = template.tags
    event.created_at = template.created_at
    await event.sign(ndkSigner)
    return {
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags,
      content: event.content,
      sig: event.sig!,
    }
  }
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface UploadResult {
  url: string
  sha256: string
  size: number
  type: string
}

/**
 * Upload a file to a Blossom server
 *
 * @param file - The file to upload
 * @param signer - NDK signer for authentication
 * @param server - Blossom server URL (defaults to blossom.nostr.build)
 * @param onProgress - Optional progress callback
 * @returns The uploaded file URL
 */
export async function uploadToBlossom(
  file: File,
  signer: NDKSigner,
  server: string = DEFAULT_SERVER,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  // Create signer function for blossom-client-sdk
  const blossomSigner = createBlossomSigner(signer)

  // Create upload authorization
  const auth = await BlossomClient.createUploadAuth(blossomSigner, file, {
    message: 'media upload',
  })

  // Compute file hash
  const fileSha = await sha256(file)

  // Encode authorization header
  const encodedAuth = encodeAuthorizationHeader(auth)

  // Build URLs - try /media first (BUD-05, strips EXIF), fallback to /upload
  const baseUrl = server.endsWith('/') ? server.slice(0, -1) : server
  const mediaUrl = `${baseUrl}/media`
  const uploadUrl = `${baseUrl}/upload`

  // Headers for the upload
  const headers: Record<string, string> = {
    'X-SHA-256': fileSha,
    'Authorization': encodedAuth,
    'Content-Type': file.type || 'application/octet-stream',
  }

  // Try /media endpoint first (BUD-05)
  let targetUrl = mediaUrl
  try {
    const headResponse = await fetch(mediaUrl, {
      method: 'HEAD',
      headers: {
        ...headers,
        'X-Content-Length': String(file.size),
        'X-Content-Type': file.type || 'application/octet-stream',
      },
    })
    if (headResponse.status !== 200) {
      // Fall back to /upload
      targetUrl = uploadUrl
    }
  } catch {
    // Fall back to /upload on error
    targetUrl = uploadUrl
  }

  // Upload with XHR for progress support
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100),
        })
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          resolve({
            url: response.url,
            sha256: response.sha256 || fileSha,
            size: response.size || file.size,
            type: response.type || file.type,
          })
        } catch {
          reject(new Error('Invalid response from server'))
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText || 'Unknown error'}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed: Network error'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'))
    })

    xhr.open('PUT', targetUrl, true)

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value)
    }

    xhr.send(file)
  })
}

/**
 * Validate that a URL points to an image
 */
export function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
