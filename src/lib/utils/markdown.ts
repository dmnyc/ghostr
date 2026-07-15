import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import {
  NOSTR_ENTITY_RE,
  decodeNostrEntity,
  fallbackEntityLabel,
  isImageUrl,
  isVideoUrl,
} from '@/lib/nostrEntities'

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})

// Override link rendering to open in new tab with security attributes
const defaultRender =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  if (token) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }
  return defaultRender(tokens, idx, options, env, self)
}

export function parseMarkdown(markdown: string): string {
  const parsedMarkdown = md.render(markdown)
  return DOMPurify.sanitize(parsedMarkdown)
}

/**
 * Rich preview renderer for long-form markdown. Media URLs are turned into
 * inline <img>/<video> and nostr entities into styled mention chips BEFORE
 * markdown-it runs (so markdown structure is preserved around them). A separate
 * markdown-it instance allows the pre-injected HTML through (html:true); the
 * final output is sanitized.
 *
 * `resolveName` maps a hex pubkey to a display name when available, so mentions
 * preview as `@name` instead of a raw npub.
 */
const mdRich = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
})

const defaultRichLinkRender =
  mdRich.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

mdRich.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  if (token) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }
  return defaultRichLinkRender(tokens, idx, options, env, self)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderMarkdownRich(
  markdown: string,
  resolveName: (pubkey: string) => string | undefined,
): string {
  let src = markdown

  // Inline media: standalone URLs become img/video. Negative lookbehind on `](`
  // skips URLs that are markdown link/image targets (e.g. ![alt](url)) so
  // markdown-it renders those natively instead of being mangled.
  src = src.replace(/(?<!\]\()https?:\/\/(?:[^\s()]|\([^\s()]*\))+/g, (url) => {
    const clean = url.replace(/[.,;:!?]+$/, '')
    if (isImageUrl(clean)) {
      return `<img src="${escapeHtml(clean)}" alt="" referrerpolicy="no-referrer" loading="lazy" />`
    }
    if (isVideoUrl(clean)) {
      return `<video src="${escapeHtml(clean)}" controls referrerpolicy="no-referrer"></video>`
    }
    return url
  })

  // Nostr entities -> styled mention chips (resolved name when available)
  src = src.replace(NOSTR_ENTITY_RE, (full, bech32: string) => {
    const decoded = bech32 ? decodeNostrEntity(bech32) : null
    if (!decoded) return full
    const resolved = decoded.pubkey ? resolveName(decoded.pubkey) : undefined
    const label = resolved ? `@${resolved}` : fallbackEntityLabel(decoded)
    return `<span class="mention">${escapeHtml(label)}</span>`
  })

  const html = mdRich.render(src)
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['referrerpolicy', 'controls', 'target', 'loading'],
  })
}

