import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Check, X, User, AlertTriangle, RefreshCw, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/StatusBadge";
import { MarkdownEditor } from "@/components/common/MarkdownEditor";
import { MentionPillTextarea } from "@/components/common/MentionPillTextarea";
import { ImageUploadButton } from "@/components/common/ImageUploadButton";
import { ImageThumbnailGrid } from "@/components/common/ImageThumbnailGrid";
import { LinkPreviewGrid } from "@/components/common/LinkPreviewGrid";
import { ImageRehostingOptions } from "./ImageRehostingOptions";
import { PublishDialog } from "./PublishDialog";
import { FeedbackDialog } from "./FeedbackDialog";
import { useSubmissionStore } from "@/stores/submissionStore";
import { useUIStore } from "@/stores/uiStore";
import {
  getDisplayName,
  formatNpub,
} from "@/services/profileSearchService";
import { extractImageUrls } from "@/lib/blossom";
import { extractLinkUrls, type LinkMetadata } from "@/lib/urlUtils";
import { useProfileQuery } from "@/hooks/queries/useProfileQuery";
import { toast } from "@/hooks/useToast";
import { hasThreadMarker, joinThreadPosts, splitThreadPosts } from "@/lib/threadUtils";

interface ReviewPaneProps {
  onBack: () => void;
}

export function ReviewPane({ onBack }: ReviewPaneProps) {
  const { getCurrentSubmission, updateSubmissionContent, updateSubmissionEdits, getSubmissionEdits, clearSubmissionEdits } =
    useSubmissionStore();
  const { isPublishDialogOpen, setPublishDialogOpen } = useUIStore();

  const submission = getCurrentSubmission();

  // Capture the ORIGINAL content once on mount (before any edits)
  const originalContentRef = useRef<string | null>(null);
  if (originalContentRef.current === null && submission) {
    originalContentRef.current = submission.content;
  }

  // Extract title and summary from tags (for kind 30023)
  const titleTag = submission?.tags.find((t) => t[0] === "title");
  const summaryTag = submission?.tags.find((t) => t[0] === "summary");

  // Extract cover image from tags
  const coverImageTag = submission?.tags.find((t) => t[0] === "image");

  // Load saved edits on mount
  const savedEdits = submission ? getSubmissionEdits(submission.id) : null;

  const [editedTitle, setEditedTitle] = useState(savedEdits?.title || titleTag?.[1] || "");
  const [editedSummary, setEditedSummary] = useState(savedEdits?.summary || summaryTag?.[1] || "");
  const [editedContent, setEditedContent] = useState(savedEdits?.content || submission?.content || "");
  const [editedCoverImage, setEditedCoverImage] = useState(savedEdits?.coverImage || coverImageTag?.[1] || "");
  const isThreadSubmission = hasThreadMarker(submission?.tags ?? []);
  const getInitialThreadPosts = () => {
    if (!isThreadSubmission) return [];
    const savedPosts = splitThreadPosts(savedEdits?.content || "");
    if (savedPosts.length > 0) return savedPosts;
    const payloadPosts = submission?.threadPosts?.map((post) => post.trim()).filter(Boolean) ?? [];
    if (payloadPosts.length > 0) return payloadPosts;
    return splitThreadPosts(submission?.content || "");
  };
  const [editedThreadPosts, setEditedThreadPosts] = useState<string[]>(getInitialThreadPosts);
  const [isFeedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [attachedLinks, setAttachedLinks] = useState<LinkMetadata[]>([]);
  const [lastRelaySaveTime, setLastRelaySaveTime] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch delegate profile using React Query (automatic caching and deduplication)
  const { data: delegateProfile } = useProfileQuery(submission?.delegatePubkey);

  // Parse attached images and links from content (for kind 1)
  const attachedImages = useMemo(() => extractImageUrls(editedContent), [editedContent]);

  // Check if ORIGINAL submission had images (for delegate-provided image warning)
  // For kind 1: check content for image URLs
  // For kind 30023: check content AND tags for cover image
  const hasOriginalImages = useMemo(() => {
    if (!originalContentRef.current && !submission) return false;

    // Check content for image URLs
    const contentImages = originalContentRef.current ? extractImageUrls(originalContentRef.current) : [];

    // Check tags for cover image (kind 30023)
    const coverImageTag = submission?.tags.find((t) => t[0] === "image");
    const hasCoverImage = !!coverImageTag?.[1];

    return contentImages.length > 0 || hasCoverImage;
  }, [originalContentRef.current, submission]);

  // Reset local edits when switching between submissions
  useEffect(() => {
    setEditedTitle(savedEdits?.title || titleTag?.[1] || "");
    setEditedSummary(savedEdits?.summary || summaryTag?.[1] || "");
    setEditedContent(savedEdits?.content || submission?.content || "");
    setEditedCoverImage(savedEdits?.coverImage || coverImageTag?.[1] || "");
    setEditedThreadPosts(getInitialThreadPosts());
  }, [submission?.id]);

  // Auto-save edits (debounced, similar to DraftEditor)
  useEffect(() => {
    if (!submission || submission.status !== 'pending') return;

    const saveTimeout = setTimeout(() => {
      updateSubmissionEdits(submission.id, {
        content: editedContent,
        ...(submission.kind === 30023 && {
          title: editedTitle,
          summary: editedSummary,
          coverImage: editedCoverImage,
        }),
      });

      // Update relay save indicator after debounce completes
      setTimeout(() => {
        setLastRelaySaveTime(Date.now());
      }, 3000); // Match the relay debounce time in submissionStore
    }, 1000); // Local save debounce

    return () => clearTimeout(saveTimeout);
  }, [submission, editedContent, editedTitle, editedSummary, editedCoverImage, updateSubmissionEdits]);

  // Clear edits when submission is approved or rejected
  const handleClearEdits = useCallback(() => {
    if (submission) {
      clearSubmissionEdits(submission.id);
    }
  }, [submission, clearSubmissionEdits]);

  // Manual save handler (bypasses debounce for immediate save)
  const handleSave = useCallback(async () => {
    if (!submission || submission.status !== 'pending') return;

    setIsSaving(true);
    try {
      // Immediately save edits (localStorage + debounced relay save)
      updateSubmissionEdits(submission.id, {
        content: editedContent,
        ...(submission.kind === 30023 && {
          title: editedTitle,
          summary: editedSummary,
          coverImage: editedCoverImage,
        }),
      });

      // Small delay to show spinner
      await new Promise(resolve => setTimeout(resolve, 300));

      // Show success toast
      toast({
        title: 'Edits saved',
        description: 'Changes saved locally and syncing to relays...',
      });

      // Update relay save indicator after relay debounce (3s)
      setTimeout(() => {
        setLastRelaySaveTime(Date.now());
      }, 3000);
    } catch (error) {
      console.error('Failed to save edits:', error);
      toast({
        title: 'Save failed',
        description: 'Failed to save your edits. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [submission, editedContent, editedTitle, editedSummary, editedCoverImage, updateSubmissionEdits]);

  const updateThreadPost = (index: number, value: string) => {
    setEditedThreadPosts((posts) => {
      const nextPosts = posts.map((post, i) => (i === index ? value : post));
      const nextContent = joinThreadPosts(nextPosts);
      setEditedContent(nextContent);
      if (submission) {
        updateSubmissionContent(submission.id, nextContent);
      }
      return nextPosts;
    });
  };

  const addThreadPost = () => {
    setEditedThreadPosts((posts) => [...posts, ""]);
  };

  const removeThreadPost = (index: number) => {
    setEditedThreadPosts((posts) => {
      const nextPosts = posts.filter((_, i) => i !== index);
      const nextContent = joinThreadPosts(nextPosts);
      setEditedContent(nextContent);
      if (submission) {
        updateSubmissionContent(submission.id, nextContent);
      }
      return nextPosts;
    });
  };

  // Update content and persist to store
  const handleContentChange = (newContent: string) => {
    setEditedContent(newContent);
    if (submission) {
      updateSubmissionContent(submission.id, newContent);
    }

    // Detect new link URLs pasted/typed (for kind 1)
    if (submission?.kind === 1) {
      const linkUrls = extractLinkUrls(newContent);
      const existingUrls = attachedLinks.map(l => l.url);
      const newUrls = linkUrls.filter(url => !existingUrls.includes(url));

      if (newUrls.length > 0) {
        // Add new links with loading state
        setAttachedLinks(prev => [
          ...prev,
          ...newUrls.map(url => ({ url, loading: true }))
        ]);
      }
    }
  };

  // Handle image upload (for kind 1 - appends URL to content)
  const handleImageUpload = (url: string) => {
    const newContent = editedContent + (editedContent ? '\n' : '') + url;
    handleContentChange(newContent);
  };

  // Handle image removal (for kind 1)
  const handleRemoveImage = (url: string) => {
    const newContent = editedContent.replace(url, '').trim();
    handleContentChange(newContent);
  };

  // Handle link removal (for kind 1)
  const handleRemoveLink = (url: string) => {
    const newContent = editedContent.replace(url, '').trim();
    handleContentChange(newContent);
    setAttachedLinks(prev => prev.filter(l => l.url !== url));
  };

  if (!submission) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Submission not found</p>
        <Button onClick={onBack} variant="link">
          Go back
        </Button>
      </div>
    );
  }

  const isProcessed = submission.status !== "pending";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Review Submission</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={submission.status} />
              <span className="text-sm text-muted-foreground">
                {hasThreadMarker(submission.tags)
                  ? 'Thread'
                  : submission.kind === 1 ? "1 (Note)" : "30023 (Article)"}
              </span>
            </div>
          </div>
        </div>

        {!isProcessed && (
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {lastRelaySaveTime > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Saved to relays</span>
              </div>
            )}
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
            <Button
              variant="outline"
              onClick={() => setFeedbackDialogOpen(true)}
            >
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button onClick={() => setPublishDialogOpen(true)}>
              <Check className="mr-2 h-4 w-4" />
              Proceed to Publish
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px] items-start">
        <div className="rounded-lg border p-4 space-y-4">
          {/* Title field for long-form articles */}
          {submission.kind === 30023 && (
            <div className="space-y-2">
              <Label htmlFor="title">Title {!isProcessed && "(Editable)"}</Label>
              <Input
                id="title"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                disabled={isProcessed}
                placeholder="Article title"
              />
            </div>
          )}

          {/* Summary field for long-form articles */}
          {submission.kind === 30023 && (
            <div className="space-y-2">
              <Label htmlFor="summary">Summary (optional) {!isProcessed && "(Editable)"}</Label>
              <Input
                id="summary"
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                disabled={isProcessed}
                placeholder="Brief description of the article"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                {editedSummary.length}/200 characters
              </p>
            </div>
          )}

          {/* Cover Image Preview */}
          {editedCoverImage && (
            <div className="space-y-2">
              <Label>Cover Image</Label>
              <div className="rounded-lg overflow-hidden border">
                <img
                  src={editedCoverImage}
                  alt="Cover"
                  className="w-full aspect-video object-cover"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Content {!isProcessed && "(Editable)"}</Label>
              {submission.kind === 1 && !isProcessed && (
                <ImageUploadButton onUpload={handleImageUpload} />
              )}
            </div>

            {isThreadSubmission ? (
              <div className="space-y-4">
                {editedThreadPosts.map((post, index) => (
                  <div key={index} className="rounded-2xl border bg-background p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Post {index + 1} {!isProcessed && "(Editable)"}</Label>
                      {!isProcessed && editedThreadPosts.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeThreadPost(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <MentionPillTextarea
                      value={post}
                      onChange={(value) => updateThreadPost(index, value)}
                      placeholder="Thread post text..."
                      disabled={isProcessed}
                      minHeight="120px"
                    />
                  </div>
                ))}
                {!isProcessed && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={addThreadPost}
                      aria-label="Add post"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </div>
            ) : submission.kind === 30023 ? (
              // Long-form article - use MarkdownEditor
              <MarkdownEditor
                value={editedContent}
                onChange={handleContentChange}
                disabled={isProcessed}
                placeholder="Write your article here..."
              />
            ) : (
              // Short note - use MentionPillTextarea
              <>
                <MentionPillTextarea
                  value={editedContent}
                  onChange={handleContentChange}
                  placeholder="What do you want to say? Type @ to mention someone..."
                  disabled={isProcessed}
                  minHeight="200px"
                />
                {/* Show thumbnail grid for kind 1 notes */}
                <ImageThumbnailGrid
                  images={attachedImages}
                  onRemove={handleRemoveImage}
                  disabled={isProcessed}
                />
                {/* Show link previews for kind 1 notes */}
                <LinkPreviewGrid
                  links={attachedLinks}
                  onRemove={handleRemoveLink}
                  disabled={isProcessed}
                />
              </>
            )}

            {editedContent !== submission.content && (
              <p className="text-xs text-muted-foreground">Modified</p>
            )}
          </div>

          {/* Image Re-hosting Options for submissions with images */}
          {hasOriginalImages && !isProcessed && (
            <ImageRehostingOptions
              content={editedContent}
              onContentChange={handleContentChange}
              disabled={isProcessed}
              originalContent={originalContentRef.current || ""}
              coverImageUrl={coverImageTag?.[1]}
              onCoverImageChange={setEditedCoverImage}
            />
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-medium">Submission Details</h3>

            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">From:</span>
              <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                {delegateProfile?.picture ? (
                  <img
                    src={delegateProfile.picture}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {delegateProfile
                      ? getDisplayName(delegateProfile)
                      : "Loading..."}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {delegateProfile?.nip05 ||
                      formatNpub(submission.delegatePubkey)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Received:</span>
              <p className="text-sm">
                {(() => {
                  const date = new Date(submission.receivedAt);
                  // Debug: Log if timestamp seems wrong (year < 2020 means it's in seconds, not ms)
                  if (date.getFullYear() < 2020) {
                    console.warn('Timestamp in seconds detected:', submission.receivedAt, '→ multiplying by 1000');
                    return new Date(submission.receivedAt * 1000).toLocaleString("en-US", {
                      month: "numeric",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    });
                  }
                  return date.toLocaleString("en-US", {
                    month: "numeric",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  });
                })()}
              </p>
            </div>

          </div>

          {submission.tags.length > 0 && (
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="font-medium">Tags</h3>
              <div className="flex flex-col gap-1">
                {submission.tags.map((tag, i) => (
                  <div key={i} className="text-xs bg-muted px-2 py-1 rounded break-all">
                    <span className="font-medium">{tag[0]}</span>
                    {tag[1] && <span className="text-muted-foreground">: {tag[1]}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning about delegate-provided images */}
          {hasOriginalImages && !isProcessed && (
            <div className="rounded-lg border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <h3 className="font-medium text-orange-900 dark:text-orange-200">
                    Delegate-Provided Images
                  </h3>
                  <p className="text-sm text-orange-800 dark:text-orange-300">
                    This submission contains images from the delegate. Scroll down to re-host them to your own Blossom account before publishing.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <PublishDialog
        open={isPublishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        submission={submission}
        editedContent={editedContent}
        editedTitle={submission.kind === 30023 ? editedTitle : undefined}
        editedSummary={submission.kind === 30023 ? editedSummary : undefined}
        editedCoverImage={submission.kind === 30023 ? editedCoverImage : undefined}
        onSuccess={() => {
          handleClearEdits();
          onBack();
        }}
      />

      <FeedbackDialog
        open={isFeedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        submission={submission}
        onSuccess={() => {
          handleClearEdits();
          onBack();
        }}
      />
    </div>
  );
}
