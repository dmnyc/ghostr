import { fetchProfile, getDisplayName } from '@/services/profileSearchService'

export interface NotificationContext {
  delegatePubkey?: string
  delegateName?: string
  publisherPubkey?: string
  publisherName?: string
  submissionId?: string
  eventId?: string
  feedback?: string
  contentPreview?: string
}

async function getUserName(pubkey: string): Promise<string> {
  try {
    const profile = await fetchProfile(pubkey)
    if (profile) {
      return getDisplayName(profile)
    }
  } catch (error) {
    console.error('[MessageTemplates] Failed to fetch profile:', error)
  }
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`
}

export async function createNewSubmissionNotification(
  context: NotificationContext
): Promise<string> {
  const delegateName = context.delegateName ||
    (context.delegatePubkey ? await getUserName(context.delegatePubkey) : 'Unknown')

  const contentPreview = context.contentPreview
    ? `\n\nPreview: "${context.contentPreview.slice(0, 100)}${context.contentPreview.length > 100 ? '...' : ''}"`
    : ''

  return `📬 New Submission from ${delegateName}

You have received a new content submission in Ghostr.${contentPreview}

Open Ghostr to review and publish: https://ghostr.org

Submission ID: ${context.submissionId || 'N/A'}`
}

export async function createSubmissionReceivedNotification(
  context: NotificationContext
): Promise<string> {
  const publisherName = context.publisherName ||
    (context.publisherPubkey ? await getUserName(context.publisherPubkey) : 'the publisher')

  return `✅ Submission Received

Your content has been sent to ${publisherName} for review.

We'll notify you when it's been reviewed. Track status in Ghostr: https://ghostr.org

Submission ID: ${context.submissionId || 'N/A'}`
}

export async function createApprovalNotification(
  context: NotificationContext
): Promise<string> {
  const eventLink = context.eventId
    ? `\n\nView on nostr: nostr:${context.eventId}`
    : ''

  return `🎉 Content Published!

Great news! Your submission has been approved and published to Nostr.${eventLink}

View your published content in Ghostr: https://ghostr.org

Submission ID: ${context.submissionId || 'N/A'}`
}

export async function createRejectionNotification(
  context: NotificationContext
): Promise<string> {
  const feedbackSection = context.feedback
    ? `\n\nFeedback from publisher:\n"${context.feedback}"\n\nYou can revise and resubmit in Ghostr.`
    : '\n\nYou can revise and resubmit your content in Ghostr.'

  return `📝 Submission Update

Your submission has been reviewed and requires revisions.${feedbackSection}

Open Ghostr to edit and resubmit: https://ghostr.org

Submission ID: ${context.submissionId || 'N/A'}`
}
