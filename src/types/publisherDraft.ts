/**
 * Publisher Draft
 *
 * Simplified draft type for publishers creating direct posts.
 * Unlike delegate drafts, publisher drafts don't involve submission workflow,
 * approval process, or publisher selection.
 */
export interface PublisherDraft {
  id: string
  title: string
  content: string
  targetKind: 1 | 30023  // 1 = short note, 30023 = long-form article
  tags: string[][]
  status: 'draft' | 'published'
  updatedAt: number
  publishedEventId?: string  // Event ID after publishing
  coverImage?: string  // Cover image URL (for long-form articles)
  archived?: boolean  // Whether draft is archived
  uploadedImages?: string[]  // Image URLs uploaded via ImageUploadButton
}
