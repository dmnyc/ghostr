# Development Notes

## 2026-01-12: Fixed Timestamp Mismatch Between Delegate and Publisher

### Issue
Submission timestamps were inconsistent between delegate and publisher views:
- Delegate saw: "Jan 12, 06:32 PM" (correct - when draft was last updated)
- Publisher saw: "Jan 12, 05:20 PM" (wrong - randomized timestamp)

### Root Cause
NIP-59 gift wrap protocol randomizes timestamps for privacy (within past 2 days) to prevent timing analysis attacks. This is by design in the spec. However, we were using the gift wrap event's `created_at` timestamp to determine when a submission was received, which meant publishers saw a random timestamp instead of the actual submission time.

**The problem:**
1. When delegate submits, we create a gift wrap with `created_at = randomizeTimestamp()` (see `src/lib/nostr/nip59.ts:64`)
2. Publisher receives gift wrap and uses `event.created_at` as the submission timestamp
3. This gives a random time from the past 2 days instead of the actual submission time

### Solution
Added `submittedAt` field to the `SubmissionPayload` to carry the actual submission timestamp separately from the NIP-59 gift wrap metadata.

**Changes:**
1. **Type definition** (`src/types/submission.ts`): Added optional `submittedAt?: number` field to `SubmissionPayload`
2. **Sending** (`src/components/delegate/SubmitDialog.tsx:156`): Include `submittedAt: Math.floor(Date.now() / 1000)` in payload
3. **Receiving** (`src/hooks/useAdminInbox.ts:63`): Use `payload.submittedAt` if available, fall back to `event.created_at` for old submissions

### Backward Compatibility
The `submittedAt` field is optional, so:
- New submissions include accurate timestamp
- Old submissions (without `submittedAt`) fall back to gift wrap timestamp
- No migration needed

### Testing
Verified with test submission "Timestamp test 4":
- Delegate view: Jan 12, 06:32 PM ✅
- Publisher view: Jan 12, 06:32 PM ✅
