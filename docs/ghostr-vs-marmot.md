# Ghostr vs Marmot Protocol — Comparison Report

**Date:** February 25, 2026  
**Purpose:** HRF grant positioning — understand competitive landscape and prepare talking points

---

## 1. What Each Project Is

### Ghostr
A **working Nostr app** (React/TypeScript) for secure content delegation and ephemeral messaging ("Ghost Notes"). Writers create content → publishers approve and publish — without sharing private keys. Ghost Notes provide burn-after-reading encrypted messages. Lightning payment integration planned.

**Stage:** Prototype-to-MVP. Working code, deployed.

### Marmot Protocol
A **protocol specification** for end-to-end encrypted group messaging over Nostr, using the MLS (Messaging Layer Security, RFC 9420) protocol. Defines how to do scalable group chats with forward secrecy on Nostr relays.

**Stage:** Experimental spec under review. Reference implementations exist (Rust MDK, TypeScript marmot-ts) but explicitly labeled "not for production."

---

## 2. Dimension-by-Dimension Comparison

### Encryption Model

| | Ghostr | Marmot |
|---|---|---|
| **Protocol** | NIP-44 (XChaCha20-Poly1305) + NIP-59 gift wrap | MLS (RFC 9420) + NIP-44 for transport |
| **Forward secrecy** | ❌ No — static key encryption | ✅ Yes — MLS ratchet with epoch-based key rotation |
| **Post-compromise security** | ❌ No | ✅ Yes — key rotation limits breach impact |
| **Group encryption** | ❌ 1:1 only | ✅ Designed for groups (2 to thousands) |

**Verdict:** Marmot is cryptographically stronger. MLS is a significant upgrade over NIP-44 alone for ongoing conversations. However, for Ghostr's use case (one-shot encrypted content + ephemeral notes), forward secrecy matters less — the content is meant to be consumed and destroyed, not part of a long-running session.

### Relay/Infrastructure Dependency

| | Ghostr | Marmot |
|---|---|---|
| **Relay dependency** | Standard Nostr relays | Standard Nostr relays |
| **If relays go down** | Content unavailable until relay returns; encrypted content unreadable to attackers | Same — messages unavailable but encrypted |
| **Special relay requirements** | None | None, but heavier relay load (MLS handshake messages, key packages, commits) |

**Verdict:** Roughly equal. Both use standard Nostr relays. Marmot generates more relay traffic (MLS protocol messages) which could be a fingerprinting concern.

### Ephemeral / Self-Destruct

| | Ghostr | Marmot |
|---|---|---|
| **Burn-after-reading** | ✅ Ghost Notes — content cleared from memory after read, kind 5 deletion events, NIP-40 expiration tags | ❌ No equivalent |
| **Expiration** | ✅ Built-in (client-enforced, advisory on relays) | ❌ Not specified |
| **Content deletion** | ✅ Revocation via kind 5 events | ❌ Not addressed |

**Verdict:** Ghostr wins clearly. Ephemeral messaging is a core feature. Marmot is a group chat protocol — messages persist for group history. This is a **major differentiator** for HRF use cases.

### Key Management

| | Ghostr | Marmot |
|---|---|---|
| **Identity** | Nostr keypair (NIP-07 or nsec) | Nostr keypair + separate MLS signing keys |
| **Key rotation** | ❌ Static keys | ✅ Automatic MLS key rotation per epoch |
| **Key separation** | Uses delegation tokens (NIP-26 style) — writer keys ≠ publisher keys | MLS signing keys ≠ Nostr identity keys |
| **Signer support** | NIP-07 browser extensions | Not yet specified for hardware/remote signers |

**Verdict:** Marmot has stronger key hygiene (rotation, separation). Ghostr has a unique delegation model where content attribution can be separated from identity — important for dissidents publishing through intermediaries.

### Lightning / Payment Integration

| | Ghostr | Marmot |
|---|---|---|
| **Lightning support** | 🔜 Planned — paid Ghost Notes with HODL invoices, Breez SDK | ❌ None |
| **Monetization** | Content gating, payment splits for delegation | Not in scope |
| **Self-custodial** | ✅ Planned (Breez SDK, client-side wallet) | N/A |

**Verdict:** Ghostr wins. Marmot is purely a messaging protocol with no economic layer. For HRF, the ability for oppressed creators to monetize without intermediaries is compelling.

### Censorship Resistance

| | Ghostr | Marmot |
|---|---|---|
| **Content protection** | Encrypted at rest on relays, unreadable without recipient key | Encrypted with MLS, unreadable to relays |
| **Identity protection** | NIP-59 gift wrap with ephemeral sender keys hides who sent what | Ephemeral pubkeys on every group message — observers can't link sender identity |
| **Delegation model** | ✅ Writer identity hidden behind publisher — dissident never needs to publish directly | ❌ All group members are participants |
| **Relay censorship** | Can use any relay; content looks like standard encrypted events | Same, but MLS handshake traffic is more distinctive |

**Verdict:** Ghostr's delegation model is a unique censorship-resistance tool — a dissident creates content that a publisher in a safe jurisdiction publishes. Marmot protects group chat but doesn't address the "publish without being identified" problem.

### Privacy Model / Metadata

| | Ghostr | Marmot |
|---|---|---|
| **Sender metadata** | NIP-59 gift wrap uses ephemeral keys — relay sees random pubkey, not real sender | Ephemeral pubkeys per message — same protection |
| **Recipient metadata** | Recipient pubkey visible in `p` tags of wrapped events | Group ID (`h` tag) visible — reveals group membership patterns |
| **Timing metadata** | Randomized timestamps in gift wrap | Ephemeral keys make timing correlation harder |
| **Group size** | N/A (1:1) | Observers can estimate group activity from message volume |

**Verdict:** Comparable for 1:1. Marmot claims metadata protection but group messaging inherently leaks more patterns (message frequency, group ID correlation). Ghostr's 1:1 model has a smaller metadata footprint.

### Target Audience & Use Case

| | Ghostr | Marmot |
|---|---|---|
| **Primary use case** | Dissident content publishing, ephemeral secure messaging, paid content | Private group messaging |
| **Target users** | Journalists, dissidents, creators in authoritarian regimes | Teams, communities needing private group chat |
| **HRF alignment** | ✅ Direct — built for people who need to publish anonymously and communicate ephemerally | ⚠️ Indirect — group chat is useful but not the core HRF need |

**Verdict:** Ghostr is purpose-built for HRF's mission. Marmot is a general-purpose group messaging protocol that *could* serve dissidents but isn't designed specifically for them.

### Maturity & Adoption

| | Ghostr | Marmot |
|---|---|---|
| **Stage** | Working prototype (v0.7.1), deployed, usable | Experimental spec, "not for production" |
| **Code** | React/TS app — one can use it today | Reference implementations (Rust, TS) — libraries, not apps |
| **Security audit** | No formal audit | No formal audit; spec still changing |
| **Community** | Single developer | Small team, backed by Parres HQ |

**Verdict:** Both are early-stage. Ghostr is further along as a *usable product*. Marmot is further along as a *protocol specification* with formal structure (MIPs). Neither has been audited.

---

## 3. Ghostr's Unique Differentiators (What Marmot Cannot Do)

1. **Content delegation** — Writer creates, publisher approves and publishes. Identity separation by design. Marmot has nothing like this.
2. **Ghost Notes (ephemeral messaging)** — Burn-after-reading encrypted messages with expiration and revocation. Marmot messages persist.
3. **Lightning payment gating** — Planned self-custodial monetization for content. Marmot is purely messaging.
4. **Content publishing workflow** — Approval pipeline for sensitive content. Marmot is chat, not publishing.
5. **Simpler architecture** — No MLS handshake complexity. Works today with standard Nostr infrastructure.

## 4. Marmot's Advantages (Where It's Stronger)

1. **Forward secrecy & post-compromise security** — Cryptographically superior for ongoing conversations.
2. **Group messaging** — Scales to many participants. Ghostr is 1:1 only.
3. **Formal protocol spec** — MIPs provide clear implementation path for interoperability.
4. **Key rotation** — Automatic, reducing long-term key compromise risk.
5. **Based on RFC 9420 (MLS)** — Battle-tested cryptographic foundation vs NIP-44 which is newer.

---

## 5. Talking Points: "Why Not Just Use Marmot?"

When asked this in an HRF context, Daniel can use these responses:

### 1. "Different problems, different tools"
> "Marmot is a group chat protocol. Ghostr solves a different problem: how does a dissident in Iran get their writing published without being identified? Marmot encrypts group conversations. Ghostr separates the act of creation from the act of publication — the writer's identity is never on the published content."

### 2. "Ephemeral by design"
> "Ghost Notes are burn-after-reading. A journalist sends a source a sensitive tip — it self-destructs after reading. Marmot preserves message history for group continuity. When the threat model is 'if this device is seized, nothing should be recoverable,' ephemeral wins."

### 3. "Economic empowerment, not just privacy"
> "HRF's mission includes empowering people under authoritarian regimes economically. Ghostr's Lightning integration lets a dissident writer earn sats directly to their self-custodial wallet — no platform takes a cut, no bank can freeze it. Marmot doesn't address monetization at all."

### 4. "Working today vs. experimental spec"
> "Marmot explicitly says it's not ready for production. Ghostr is a working app people can use right now. For a grant focused on real-world impact, shipping matters."

### 5. "Complementary, not competing"
> "Marmot and Ghostr aren't rivals — they solve different parts of the problem. A dissident team could use Marmot for internal coordination AND Ghostr for publishing to the outside world. We're building on the same Nostr network. If Marmot matures, Ghostr could integrate MLS for its encrypted channels. Today, we're focused on what's most urgent: safe publishing and ephemeral communication."

### 6. "Metadata story is comparable"
> "Both use ephemeral keys to hide sender identity on relays. But Ghostr goes further with its delegation model — not only is the message encrypted, but the *authorship itself* is separated. The relay never sees the dissident's pubkey because the publisher's key is on the event."

---

## 6. Honest Assessment

**Where Daniel should be careful:**
- If asked about forward secrecy, acknowledge Marmot/MLS is stronger. Position it as: "Forward secrecy matters for long-running conversations. Our use case is ephemeral — messages self-destruct, so there's nothing to 'forward compromise.'"
- If asked about group messaging, acknowledge Ghostr doesn't do it. "We're focused on 1:1 delegation and ephemeral notes. Group coordination is a different product."
- If asked about formal specifications, acknowledge Marmot's MIP structure is more mature. "We prioritized shipping a working tool over writing specs. We'll formalize as adoption grows."

**Bottom line:** Ghostr and Marmot are not competitors. They're complementary tools in the Nostr privacy ecosystem. Ghostr's unique value is the **delegation + ephemeral + Lightning** combination, which no other project — including Marmot — offers.
