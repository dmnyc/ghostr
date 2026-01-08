# React Query Performance Optimization Plan for Ghostr

## Executive Summary

This plan details a **5-phase incremental migration** to integrate React Query (TanStack Query v5) into the Ghostr Nostr application. The migration will deliver dramatic performance improvements while maintaining backward compatibility and zero data loss risk.

### Expected Performance Gains

- **90% reduction in duplicate profile fetches** - Currently fetching the same profile 10x if shown in 10 places
- **10x faster perceived load times** - localStorage cache hydration (<100ms vs 1-2s relay fetches)
- **Instant UI feedback** - Optimistic updates eliminate waiting for relay confirmation
- **Simplified codebase** - Replace 200+ lines of manual cache/retry logic with declarative queries

### Migration Strategy

**Hybrid Architecture: React Query + Zustand**
- **React Query for**: Data fetching, caching, mutations, background sync
- **Zustand for**: UI state, auth state, NDK connection state, settings

This hybrid approach leverages the strengths of both libraries while maintaining all existing functionality.

---

## Current Architecture Analysis

### Key Performance Bottlenecks Identified

1. **Profile Fetching Duplication (CRITICAL)**
   - `ProfileDisplay.tsx`: Manual `useEffect` per component instance
   - `NotePreview.tsx`: Parallel `Promise.all` for mention profiles
   - No request deduplication - same profile fetched 10x simultaneously
   - Files affected: `ProfileDisplay.tsx`, `NotePreview.tsx`, `ReviewPane.tsx`

2. **Custom Cache Management (HIGH COMPLEXITY)**
   - `profileSearchService.ts`: Hand-rolled LRU cache (100 items)
   - `draftStore.ts`: Complex dual-cache (localStorage + relay) with race condition protection
   - Manual retry logic with exponential backoff (3 attempts)
   - No TTL or stale-while-revalidate patterns

3. **Real-Time Subscription Integration (MEDIUM COMPLEXITY)**
   - `useAdminInbox.ts`: NDK subscription with manual cache updates
   - `useDelegateReceipts.ts`: Queue-based receipt handling with refs
   - No integration with centralized cache layer

4. **No Optimistic Updates**
   - All mutations wait for relay confirmation
   - UI feels sluggish on slow connections

### Current State Management

**Zustand Stores:**
- `ndkStore.ts` - NDK instance, relay connections
- `authStore.ts` - User authentication, signer management
- `draftStore.ts` - Draft CRUD with NIP-37 encryption
- `submissionStore.ts` - Admin inbox with NIP-78 processed IDs
- `publishHistoryStore.ts`, `favoritesStore.ts`, `settingsStore.ts`, `uiStore.ts`

**Data Flow:**
```
User Action → Zustand Store → localStorage + Debounced Relay Publish → Store Update → Re-render
```

---

## Phase 1: Foundation & Profile Queries (Week 1)

**Goal:** Set up React Query infrastructure and migrate profile fetching (highest ROI, lowest risk)

### 1.1 Installation

```bash
npm install @tanstack/react-query@^5.62.8
npm install @tanstack/react-query-persist-client@^5.62.8
npm install @tanstack/query-sync-storage-persister@^5.62.8
npm install @tanstack/react-query-devtools@^5.62.8 --save-dev
```

### 1.2 Create Query Provider

**File:** `/Users/daniel/GitHub/ghostr/src/providers/QueryProvider.tsx` (NEW)

- Create QueryClient with offline-first configuration
- Set up localStorage persister (24-hour cache)
- Configure stale time: 5 minutes for profiles, 30 seconds for drafts
- Implement exponential backoff retry (matches existing draftStore)
- Add global error handler integration point
- Include React Query DevTools (dev mode only)

**Key Configuration:**
```tsx
defaultOptions: {
  queries: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
    retry: 2,
    networkMode: 'offlineFirst',
  }
}
```

### 1.3 Update App Entry Point

**File:** `/Users/daniel/GitHub/ghostr/src/main.tsx`

- Wrap `<App />` with `<QueryProvider>`
- Export `queryClient` for use in stores and hooks

### 1.4 Create Profile Query Hooks

**File:** `/Users/daniel/GitHub/ghostr/src/hooks/queries/useProfileQuery.ts` (NEW)

Implement:
- Query key factory for type safety
- `useProfileQuery(pubkey)` - Single profile with 10-minute stale time
- `useProfileQueries(pubkeys[])` - Batch profiles with automatic deduplication
- `useProfileSearch(query, limit)` - Search with 5-minute stale time

**Benefits:**
- Automatic request deduplication
- Shared cache across all components
- Type-safe query keys

### 1.5 Migrate Profile Components

**Files to Modify:**
- `/Users/daniel/GitHub/ghostr/src/components/common/ProfileDisplay.tsx`
  - Replace manual `useEffect` + `fetchProfile` with `useProfileQuery(pubkey)`
  - Remove local state (`profile`, `loading`)
  - Instant render from cache on mount

- `/Users/daniel/GitHub/ghostr/src/components/common/NotePreview.tsx`
  - Replace `Promise.all` profile fetching with `useProfileQueries(pubkeys)`
  - Automatic deduplication if profiles already cached

- `/Users/daniel/GitHub/ghostr/src/components/admin/ReviewPane.tsx`
  - Use `useProfileQuery` for delegate profile
  - Profile instantly available if cached from inbox list

### Phase 1 Success Metrics

- ✅ Profile fetch count reduced by 90%+ (measure via network tab)
- ✅ Instant profile renders on subsequent views (cache hits)
- ✅ No functionality regressions
- ✅ DevTools show proper cache behavior

---

## Phase 2: Draft Store Migration (Week 2)

**Goal:** Migrate draft fetching/mutations to React Query while maintaining NIP-37 encryption

### 2.1 Create Draft Query Hooks

**File:** `/Users/daniel/GitHub/ghostr/src/hooks/queries/useDraftQueries.ts` (NEW)

Implement:
- `useDraftsQuery()` - Load all drafts with migration
  - Use localStorage as `initialData` for instant hydration
  - Call `loadDraftsWithMigration()` in background
  - 30-second stale time (drafts change frequently)

- `useDraftQuery(id)` - Single draft (derived from list query, no extra fetch)

- `useSaveDraftMutation()` - Save draft to NIP-37
  - Optimistic update to cache
  - Update localStorage
  - Auto-rollback on error

- `useCreateDraftMutation()` - Create new draft
- `useDeleteDraftMutation()` - Delete with optimistic removal
- `useUpdateDraftStatusMutation()` - Update status (submitted/published/rejected)
- `useAutoSaveDraft()` - Debounced auto-save hook (1-second debounce)

**All mutations include:**
- `onMutate`: Optimistic cache updates
- `onError`: Rollback with previous data
- `onSettled`: Invalidate to ensure consistency
- localStorage sync on success

### 2.2 Simplify Draft Store

**File:** `/Users/daniel/GitHub/ghostr/src/stores/draftStore.ts`

**Strategy:** Keep only UI state in Zustand, delegate data to React Query

Remove:
- `drafts: Draft[]`
- `loadDrafts()`, `saveDraft()`, `deleteDraft()`, etc.
- All sync logic, retry logic, merge logic

Keep:
- `currentDraftId: string | null`
- `unseenRejectionIds: Set<string>`
- UI action methods

### 2.3 Update Draft Components

**Files to Modify:**
- `/Users/daniel/GitHub/ghostr/src/components/delegate/DraftsList.tsx`
  - Replace `draftStore.drafts` with `useDraftsQuery()`
  - Use `useDeleteDraftMutation()` for deletions

- `/Users/daniel/GitHub/ghostr/src/components/delegate/DraftEditor.tsx`
  - Use `useAutoSaveDraft()` for content changes
  - Optimistic updates for instant feedback

- `/Users/daniel/GitHub/ghostr/src/components/delegate/DelegateDashboard.tsx`
  - Remove `useEffect` with `loadDrafts()` call
  - Query loads automatically

### 2.4 Maintain NIP-37 Encryption

**No changes to:** `/Users/daniel/GitHub/ghostr/src/lib/nostr/nip37.ts`
- Query hooks call existing functions
- Encryption logic unchanged
- Migration from NIP-78 still works

### Phase 2 Success Metrics

- ✅ Draft loading <100ms (localStorage cache hit)
- ✅ Optimistic updates work (instant UI response)
- ✅ NIP-37 encryption verified
- ✅ Migration from NIP-78 still functional
- ✅ No race conditions on rapid edits
- ✅ Rollback on error works correctly

---

## Phase 3: Submission Store Migration (Week 3)

**Goal:** Migrate submission inbox to React Query with processed/archived tracking

### 3.1 Create Submission Query Hooks

**File:** `/Users/daniel/GitHub/ghostr/src/hooks/queries/useSubmissionQueries.ts` (NEW)

Implement:
- `useActiveSubmissionsQuery()` - Active (non-archived) submissions
  - Load from localStorage as initial data
  - Updated by real-time subscription

- `useArchivedSubmissionsQuery()` - Archived submissions
- `useProcessedIdsQuery()` - Set of processed submission IDs (localStorage + relay merge)
- `useArchivedIdsQuery()` - Set of archived submission IDs

Mutations:
- `useMarkProcessedMutation()` - Add to processed set, debounced relay save
- `useArchiveSubmissionMutation()` - Move from active to archived (optimistic)
- `useUpdateSubmissionContentMutation()` - Edit content (optimistic)

### 3.2 Simplify Submission Store

**File:** `/Users/daniel/GitHub/ghostr/src/stores/submissionStore.ts`

Keep only:
- `currentSubmissionId: string | null`
- `isLoading: boolean`
- UI action methods

Remove all data arrays and sync logic.

### 3.3 Integrate Real-Time Subscription with Cache

**File:** `/Users/daniel/GitHub/ghostr/src/hooks/useAdminInbox.ts`

**Key Change:** Update React Query cache directly on new events

```tsx
sub.on('event', async (event) => {
  const submission = await processGiftWrap(event)
  
  // Check if already processed (from cache)
  const processedIds = queryClient.getQueryData(submissionKeys.processed())
  if (processedIds?.has(submission.id)) return
  
  // Add to cache
  queryClient.setQueryData(submissionKeys.active(), (old) => [submission, ...old])
  
  // Update localStorage
  localStorage.setItem('ghostr-active-submissions', JSON.stringify(current))
})
```

**Benefits:**
- Real-time events seamlessly integrate with cache
- No manual state management
- Automatic deduplication via processed IDs

### Phase 3 Success Metrics

- ✅ Submissions load instantly from cache
- ✅ Real-time updates work seamlessly
- ✅ Processed/archived tracking persists
- ✅ No duplicate submissions in inbox
- ✅ Archive operations instant (optimistic)

---

## Phase 4: Real-Time Integration (Week 4 - Part 1)

**Goal:** Integrate NDK subscriptions with React Query cache invalidation

### 4.1 Create Query Invalidation Helpers

**File:** `/Users/daniel/GitHub/ghostr/src/lib/queryInvalidation.ts` (NEW)

Implement:
- `invalidateDraftOnReceipt(queryClient, submissionId)` - Refresh draft when receipt arrives
- `invalidateSubmissionsOnNewEvent(queryClient)` - Fallback invalidation
- `clearUserDataQueries(queryClient)` - Clear all user data on logout

### 4.2 Update Delegate Receipts Hook

**File:** `/Users/daniel/GitHub/ghostr/src/hooks/useDelegateReceipts.ts`

**Key Changes:**
- Get drafts from React Query cache (not refs)
- Use `useUpdateDraftStatusMutation()` when receipt arrives
- Automatic cache updates via mutation
- Remove manual queue management

**Flow:**
```
Receipt Arrives → Find Draft in Cache → Trigger Mutation → Optimistic Update → Toast Notification
```

### 4.3 Update Logout Flow

**File:** `/Users/daniel/GitHub/ghostr/src/stores/authStore.ts`

Add to `logout()` method:
```tsx
clearUserDataQueries(queryClient)
```

Clears:
- All draft queries
- All submission queries
- (Profile cache persists - not user-specific)

### Phase 4 Success Metrics

- ✅ Receipt arrives → draft status updates instantly
- ✅ New submission → appears in inbox immediately
- ✅ Logout → all user data cleared from cache
- ✅ Reconnection → cache revalidated automatically

---

## Phase 5: Optimistic Updates & Polish (Week 4 - Part 2)

**Goal:** Enhanced UX with optimistic updates and auto-save

### 5.1 Optimistic Draft Editing

All mutations already have optimistic updates via `onMutate` (implemented in Phase 2).

This phase focuses on:
- Auto-save with 1-second debounce
- "Saving..." indicator in UI
- Instant status change feedback
- Graceful error handling with rollback

### 5.2 Enhanced DraftEditor

**File:** `/Users/daniel/GitHub/ghostr/src/components/delegate/DraftEditor.tsx`

Implement:
- Use `useAutoSaveDraft()` hook
- Optimistically update cache on keystroke
- Debounced relay save in background
- Show saving status indicator

### 5.3 DevTools Integration

**File:** `/Users/daniel/GitHub/ghostr/src/providers/QueryProvider.tsx`

Add React Query DevTools (dev mode only):
- View all queries and their state
- Inspect cache contents
- Trigger manual refetch
- Debug invalidation

### Phase 5 Success Metrics

- ✅ Draft edits feel instant (no lag)
- ✅ Status changes reflect immediately
- ✅ Network errors roll back gracefully
- ✅ "Saving..." indicator provides feedback
- ✅ DevTools useful for debugging

---

## Risk Mitigation

### Risk 1: Data Loss During Migration (HIGH)

**Mitigation:**
- Keep old Zustand code paths functional during transition
- localStorage schema unchanged (backward compatible)
- All user data remains in localStorage + relays
- Validation: Compare cache contents periodically
- Rollback: Revert git commits (data persists)

### Risk 2: Race Conditions (MEDIUM)

**Mitigation:**
- Use `queryClient.cancelQueries()` before optimistic updates
- Conflict resolution via `updatedAt` timestamps
- React Query's built-in request deduplication
- Stress testing with rapid concurrent updates

### Risk 3: localStorage Quota Exceeded (MEDIUM)

**Mitigation:**
- Only persist successful queries
- 24-hour cache expiration
- Catch storage errors, fall back to memory-only cache
- Show user warning if quota exceeded

### Risk 4: Performance Regression (LOW)

**Mitigation:**
- Measure render times before/after
- Use selective invalidation (not entire cache)
- Implement pagination if needed (infinite queries ready)
- Monitor bundle size increase (~100KB for React Query)

---

## Testing Strategy

### Unit Tests

Create test files:
- `src/hooks/queries/__tests__/useProfileQuery.test.ts`
- `src/hooks/queries/__tests__/useDraftQueries.test.ts`
- `src/hooks/queries/__tests__/useSubmissionQueries.test.ts`

Test:
- Request deduplication
- Cache hits/misses
- Optimistic updates
- Error rollback
- localStorage integration

### Integration Tests

Test:
- Draft CRUD flow (create → edit → save → delete)
- Submission inbox flow (receive → process → archive)
- Real-time updates (receipt → draft status change)
- Offline editing (disconnect → edit → reconnect → sync)

### E2E Manual Testing

**Critical Scenarios:**
1. Profile deduplication (verify network tab shows 90% fewer requests)
2. Offline draft editing (verify localStorage persistence)
3. Real-time receipt (verify instant status update)
4. Optimistic updates with rollback (simulate network failure)
5. Cache persistence (refresh page, verify instant load)

---

## Rollback Plan

### Phase 1 Rollback (Profiles)

```bash
git checkout HEAD~1 -- src/providers/QueryProvider.tsx
git checkout HEAD~1 -- src/components/common/ProfileDisplay.tsx
npm uninstall @tanstack/react-query
```

**Impact:** None - profiles refetch from Primal cache

### Phase 2 Rollback (Drafts)

```bash
git checkout HEAD~1 -- src/stores/draftStore.ts
git checkout HEAD~1 -- src/hooks/queries/useDraftQueries.ts
```

**Impact:** None - localStorage + relay data preserved

### Phase 3 Rollback (Submissions)

```bash
git checkout HEAD~1 -- src/stores/submissionStore.ts
git checkout HEAD~1 -- src/hooks/useAdminInbox.ts
```

**Impact:** None - submissions refetch from real-time stream

### Emergency Full Rollback

```bash
git revert <migration-commit-hash>
npm install
npm run build
```

**All user data preserved in:**
- localStorage: `ghostr-drafts-cache`, `ghostr-processed-submissions`, `ghostr-archived-submissions`
- Relays: NIP-37 drafts, NIP-78 processed IDs

---

## Implementation Timeline

**Week 1: Phase 1** - Foundation + Profile Queries
- Install React Query, create QueryProvider
- Migrate ProfileDisplay, NotePreview, ReviewPane
- Testing & validation

**Week 2: Phase 2** - Draft Store Migration
- Create draft query hooks with mutations
- Simplify draftStore to UI state
- Migrate draft components
- Test NIP-37 encryption, localStorage fallback

**Week 3: Phase 3** - Submission Store Migration
- Create submission query hooks
- Integrate useAdminInbox with cache
- Test real-time updates

**Week 4: Phases 4 & 5** - Real-Time Integration + Optimistic Updates
- Integrate useDelegateReceipts
- Polish optimistic updates
- DevTools integration
- E2E testing

**Week 5: Polish & Release**
- Documentation updates
- Performance benchmarking
- Final testing
- Release preparation

---

## Critical Files Summary

### Phase 1: Foundation & Profiles
- NEW: `/Users/daniel/GitHub/ghostr/src/providers/QueryProvider.tsx`
- NEW: `/Users/daniel/GitHub/ghostr/src/hooks/queries/useProfileQuery.ts`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/main.tsx`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/components/common/ProfileDisplay.tsx`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/components/common/NotePreview.tsx`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/components/admin/ReviewPane.tsx`

### Phase 2: Drafts
- NEW: `/Users/daniel/GitHub/ghostr/src/hooks/queries/useDraftQueries.ts`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/stores/draftStore.ts`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/components/delegate/DraftsList.tsx`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/components/delegate/DraftEditor.tsx`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/components/delegate/DelegateDashboard.tsx`
- NO CHANGE: `/Users/daniel/GitHub/ghostr/src/lib/nostr/nip37.ts` (used by queries)

### Phase 3: Submissions
- NEW: `/Users/daniel/GitHub/ghostr/src/hooks/queries/useSubmissionQueries.ts`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/stores/submissionStore.ts`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/hooks/useAdminInbox.ts`
- NO CHANGE: `/Users/daniel/GitHub/ghostr/src/lib/nostr/nip78.ts` (used by queries)

### Phase 4: Real-Time
- NEW: `/Users/daniel/GitHub/ghostr/src/lib/queryInvalidation.ts`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/hooks/useDelegateReceipts.ts`
- MODIFY: `/Users/daniel/GitHub/ghostr/src/stores/authStore.ts`

### Phase 5: Optimistic Updates
- Enhancements to existing mutation hooks from Phase 2-3
- DevTools integration in QueryProvider

---

## Success Criteria

**Performance Targets:**
- ✅ 90%+ reduction in duplicate profile requests
- ✅ <100ms initial draft load (cache hit)
- ✅ <50ms perceived save time (optimistic)
- ✅ Zero functionality regressions
- ✅ Zero data loss incidents

**Code Quality:**
- ✅ Remove 200+ lines of manual cache management
- ✅ Consistent loading/error patterns across app
- ✅ Full TypeScript type safety maintained
- ✅ Comprehensive test coverage

**User Experience:**
- ✅ Instant UI feedback on all actions
- ✅ Better offline experience
- ✅ Faster page loads
- ✅ No breaking changes

---

## Next Steps

1. ✅ Review and approve this plan
2. Create feature branch: `feature/react-query-integration`
3. Begin Phase 1 implementation (profiles)
4. Test on staging environment
5. Deploy to production incrementally
6. Monitor performance metrics
7. Iterate based on feedback

**Ready to proceed with implementation when approved.**
