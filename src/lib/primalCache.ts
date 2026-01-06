/**
 * Primal Cache Service for Nostr profile search
 * Uses Primal's WebSocket cache API for fast, reliable profile searches
 */

export interface PrimalProfile {
  pubkey: string
  name?: string
  display_name?: string
  picture?: string
  nip05?: string
  about?: string
}

interface PrimalSearchResult {
  profiles: PrimalProfile[]
}

interface PendingRequest {
  resolve: (value: PrimalSearchResult) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
  profiles: PrimalProfile[]
}

export class PrimalCacheService {
  private ws: WebSocket | null = null
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private currentEndpoint = 0
  private endpoints = [
    'wss://cache2.primal.net/v1',
    'wss://cache1.primal.net/v1',
  ]
  private connectionPromise: Promise<void> | null = null

  constructor() {
    this.connect()
  }

  private connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      const endpoint = this.endpoints[this.currentEndpoint]
      if (!endpoint) {
        reject(new Error('No endpoint available'))
        return
      }
      console.log(`[PrimalCache] Connecting to ${endpoint}`)

      try {
        this.ws = new WebSocket(endpoint)

        this.ws.onopen = () => {
          console.log('[PrimalCache] Connected')
          this.reconnectAttempts = 0
          this.connectionPromise = null
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.handleMessage(data)
          } catch (error) {
            console.error('[PrimalCache] Error parsing message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('[PrimalCache] WebSocket error:', error)
        }

        this.ws.onclose = () => {
          console.log('[PrimalCache] Connection closed')
          this.connectionPromise = null
          this.handleDisconnect()
        }

        // Timeout connection attempt
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close()
            reject(new Error('Connection timeout'))
          }
        }, 5000)
      } catch (error) {
        console.error('[PrimalCache] Connection error:', error)
        this.connectionPromise = null
        reject(error)
      }
    })

    return this.connectionPromise
  }

  private handleDisconnect() {
    // Clear pending requests with error
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new Error('WebSocket disconnected'))
    })
    this.pendingRequests.clear()

    // Try reconnecting
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`[PrimalCache] Reconnecting... (attempt ${this.reconnectAttempts})`)

      // Try next endpoint on reconnect
      this.currentEndpoint = (this.currentEndpoint + 1) % this.endpoints.length

      setTimeout(() => this.connect(), 1000 * this.reconnectAttempts)
    } else {
      console.error('[PrimalCache] Max reconnect attempts reached')
    }
  }

  private handleMessage(data: unknown) {
    if (!Array.isArray(data) || data.length < 2) return

    const [messageType, requestId, ...rest] = data

    if (messageType === 'EVENT' && requestId && rest.length > 0) {
      const event = rest[0] as { kind: number; pubkey: string; content: string }
      const pending = this.pendingRequests.get(requestId as string)

      if (pending && event.kind === 0) {
        try {
          const metadata = JSON.parse(event.content)
          pending.profiles.push({
            pubkey: event.pubkey,
            name: metadata.name,
            display_name: metadata.display_name,
            picture: metadata.picture,
            nip05: metadata.nip05,
            about: metadata.about,
          })
        } catch (error) {
          console.error('[PrimalCache] Error parsing profile metadata:', error)
        }
      }
    } else if (messageType === 'EOSE' && requestId) {
      // End of stream - resolve the request
      const pending = this.pendingRequests.get(requestId as string)
      if (pending) {
        clearTimeout(pending.timeout)
        pending.resolve({ profiles: pending.profiles })
        this.pendingRequests.delete(requestId as string)
      }
    } else if (messageType === 'NOTICE') {
      console.warn('[PrimalCache] Notice:', rest)
    }
  }

  private generateRequestId(): string {
    return `search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  public async searchProfiles(
    query: string,
    limit: number = 10,
    timeoutMs: number = 5000
  ): Promise<PrimalProfile[]> {
    if (!query || query.length < 2) {
      return []
    }

    // Ensure connection is ready
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      try {
        await this.connect()
      } catch {
        throw new Error('Failed to connect to Primal cache')
      }
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const requestId = this.generateRequestId()

    const request = [
      'REQ',
      requestId,
      {
        cache: [
          'user_search',
          {
            query,
            limit,
          },
        ],
      },
    ]

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('Search request timed out'))
      }, timeoutMs)

      this.pendingRequests.set(requestId, {
        resolve: (result) => resolve(result.profiles),
        reject,
        timeout,
        profiles: [],
      })

      try {
        this.ws!.send(JSON.stringify(request))
      } catch (error) {
        clearTimeout(timeout)
        this.pendingRequests.delete(requestId)
        reject(error)
      }
    })
  }

  public async fetchProfile(pubkey: string, timeoutMs: number = 5000): Promise<PrimalProfile | null> {
    // Ensure connection is ready
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      try {
        await this.connect()
      } catch {
        throw new Error('Failed to connect to Primal cache')
      }
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const requestId = this.generateRequestId()

    const request = [
      'REQ',
      requestId,
      {
        cache: [
          'user_infos',
          {
            pubkeys: [pubkey],
          },
        ],
      },
    ]

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('Profile fetch timed out'))
      }, timeoutMs)

      this.pendingRequests.set(requestId, {
        resolve: (result) => resolve(result.profiles[0] || null),
        reject,
        timeout,
        profiles: [],
      })

      try {
        this.ws!.send(JSON.stringify(request))
      } catch (error) {
        clearTimeout(timeout)
        this.pendingRequests.delete(requestId)
        reject(error)
      }
    })
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

// Singleton instance
let primalCache: PrimalCacheService | null = null

export const getPrimalCache = (): PrimalCacheService => {
  if (!primalCache) {
    primalCache = new PrimalCacheService()
  }
  return primalCache
}
