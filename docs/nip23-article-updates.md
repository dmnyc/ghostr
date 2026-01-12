# NIP-23 Article Updates - Technical Notes

## Overview

This document explains how Ghostr handles kind 30023 (long-form content) article updates and why updated articles may appear as "new posts" in some Nostr clients.

## How Article Updates Work

### Protocol Behavior (NIP-23)

Kind 30023 events are **addressable/replaceable events** identified by the triplet:
- `kind:pubkey:d-tag`

When you update an article:

1. **A new event is created** with a new event ID
2. **The same d-tag is reused** to identify it as an update
3. **Relays replace** the old version with the new one
4. **The naddr remains constant** (based on kind:pubkey:d-tag, not event ID)

### Ghostr Implementation

```typescript
// EditArticleEditor.tsx (lines 149-151)
// Use the same d-tag to replace the article
const tags: string[][] = [
  ["d", item.dTag],
  ["title", title],
  ["published_at", Math.floor(Date.now() / 1000).toString()],
];
```

**This is the correct implementation per NIP-23 spec.**

### Comparison with zap.cooking

We analyzed zap.cooking's implementation and confirmed they use the **exact same pattern**:

1. Load existing article by naddr (address pointer)
2. Preserve the original d-tag
3. Publish updated event with same d-tag
4. Event ID changes, but d-tag/naddr stays constant

```typescript
// zap.cooking fork page (lines 232-239)
if (identifier == undefined) {
  identifier = title.toLowerCase().replaceAll(' ', '-');
}

const event = new NDKEvent($ndk);
event.kind = 30023;
event.tags.push(['d', identifier]); // Reuses existing identifier
```

## Why Updates Show as "New" in Some Clients

### The Issue

When you update an article in Ghostr, it may appear as a **new/separate post** in social clients like Damus and Yakihonne, rather than replacing the original.

### Why This Happens

**Event ID vs Address**:
- Each update creates a **new event ID** (new signature)
- Social feed clients (Damus, Yakihonne) typically show events by:
  - Event `created_at` timestamp
  - Event ID (which changes with each update)
  - They don't always deduplicate by `kind:pubkey:d-tag`

**Client Types**:

1. **Social Clients** (Damus, Yakihonne, Amethyst)
   - Optimized for real-time social feeds
   - Show each version as separate feed entry
   - Don't always deduplicate addressable events

2. **Article Clients** (Habla.news, Highlighter)
   - Specialized for long-form content
   - Properly deduplicate by address
   - Show only latest version of each article

### Is This Expected Behavior?

**Yes and No**:

- ✅ **Protocol-wise**: YES - Event ID changing is correct per NIP-23
- ❌ **UX-wise**: NO - Social clients should ideally deduplicate, but many don't yet

## Best Practices

### For Users

1. **Share using naddr**, not nevent:
   - `naddr` (address pointer) → Always resolves to latest version
   - `nevent` (event pointer) → Points to specific event ID

2. **Expect duplication** in social feeds for now - this is a known limitation of current clients

### For Developers

1. **Always reuse the d-tag** when updating articles ✅ (Already implemented)
2. **Generate naddr for external links** ✅ (Already implemented in HistoryList.tsx)
3. **Don't delete old versions** - The relay protocol handles replacement
4. **Don't use NIP-09 deletion** for updates - Not standard for replaceable events

## Implementation Details

### Creating Articles (DirectPostEditor.tsx)

```typescript
// Generate d-tag from title
const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '')
dTag = slug || `post-${Date.now()}`

tags.push(['d', dTag])
```

### Updating Articles (EditArticleEditor.tsx)

```typescript
// Reuse existing d-tag
const tags: string[][] = [
  ["d", item.dTag],  // Same d-tag = replacement
  ["title", title],
  ["published_at", Math.floor(Date.now() / 1000).toString()],
];

// Summary, image, and client tags are optional
if (summary.trim()) tags.push(["summary", summary]);
if (coverImage) tags.push(["image", coverImage]);
if (includeCredit) tags.push(["client", "Ghostr"]);
```

### External Links (HistoryList.tsx)

```typescript
// Use naddr for kind 30023, hex ID for kind 1
function getNostrIdentifier(item: PublishedItem): string {
  if (item.kind === 30023 && item.dTag && user) {
    return nip19.naddrEncode({
      kind: 30023,
      pubkey: user.pubkey,
      identifier: item.dTag,
    });
  }
  return item.id; // hex event ID for kind 1
}
```

## Future Improvements

As the Nostr ecosystem matures:

1. **Social clients will improve** deduplication of replaceable events
2. **NIP-23 support will become more consistent** across clients
3. **Users will better understand** the difference between event IDs and addresses

For now, our implementation is **correct and follows best practices**. The duplication in social feeds is a client implementation detail, not an issue with Ghostr.

## References

- **NIP-23**: Long-form Content (kind 30023)
  - https://github.com/nostr-protocol/nips/blob/master/23.md
- **NIP-19**: bech32-encoded entities (naddr, nevent)
  - https://github.com/nostr-protocol/nips/blob/master/19.md
- **NIP-33**: Parameterized Replaceable Events
  - https://github.com/nostr-protocol/nips/blob/master/33.md

## Last Updated

January 10, 2026 - Based on analysis of Ghostr and zap.cooking implementations
