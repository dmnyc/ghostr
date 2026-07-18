import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Save,
  Send,
  Loader2,
  ExternalLink,
  X,
  User,
  Check,
  AlertCircle,
  Trash2,
  RefreshCw,
  Plus,
  MessageSquare,
  LayoutList,
  BookOpen,
  Lock,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/StatusBadge";
import { MarkdownEditor } from "@/components/common/MarkdownEditor";
import { MentionPillTextarea } from "@/components/common/MentionPillTextarea";
import { ProfileSearchInput } from "@/components/common/ProfileSearchInput";
import { CoverImageInput } from "@/components/common/CoverImageInput";
import { ImageUploadButton } from "@/components/common/ImageUploadButton";
import { ImageThumbnailGrid } from "@/components/common/ImageThumbnailGrid";
import { LinkPreviewGrid } from "@/components/common/LinkPreviewGrid";
import { ShortNoteLengthWarning } from "@/components/common/ShortNoteLengthWarning";
import { SubmitDialog } from "./SubmitDialog";
import { useDraftStore } from "@/stores/draftStore";
import { useFavoritesStore } from "@/stores/favoritesStore";
import { useUIStore } from "@/stores/uiStore";
import { toast } from "@/hooks/useToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDebounce } from "@/hooks/useDebounce";
import {
  getDisplayName,
  formatNpub,
  type SearchProfile,
} from "@/services/profileSearchService";
import type { DraftPublisher } from "@/types/draft";
import { extractImageUrls } from "@/lib/blossom";
import { extractAllUrls, fetchLinkMetadata, type LinkMetadata, isImageUrl } from "@/lib/urlUtils";
import { cn } from "@/lib/utils/cn";
import { Switch } from "@/components/ui/switch";
import { hasThreadMarker, joinThreadPosts, splitThreadPosts, stripThreadMarker } from "@/lib/threadUtils";
import { getNoteUrl } from '@/lib/nostrClients'
import { useSettingsStore } from '@/stores/settingsStore'

interface DraftEditorProps {
  onBack: () => void;
}

export function DraftEditor({ onBack }: DraftEditorProps) {
  const { currentDraftId, drafts, updateDraft, saveDraft, deleteDraft, isSaving } =
    useDraftStore();
  const { noteViewerClient } = useSettingsStore();
  const {
    favorites,
    loadFavorites,
    isLoaded: favoritesLoaded,
    addFavorite,
    removeFavorite,
    isFavorite,
  } = useFavoritesStore();
  const { isSubmitDialogOpen, setSubmitDialogOpen } = useUIStore();

  // Find draft by ID to avoid creating new object references
  const draft = drafts.find((d) => d.id === currentDraftId);

  // Track which draft ID we've initialized to prevent re-initialization on auto-save
  const initializedDraftId = useRef<string | null>(null);

  const [title, setTitle] = useState(draft?.title ?? "");
  const [summary, setSummary] = useState(draft?.summary ?? "");
  const [content, setContent] = useState(draft?.content ?? "");
  const [isLongForm, setIsLongForm] = useState(draft?.targetKind === 30023);
  const [lengthWarningDismissed, setLengthWarningDismissed] = useState(false);
  const [threadAutoNumber, setThreadAutoNumber] = useState(false);
  const [threadPosts, setThreadPosts] = useState<string[]>(() => {
    const savedAsThread = draft?.targetKind === 1 && hasThreadMarker(draft?.tags ?? []);
    if (!savedAsThread) return [draft?.content ?? ""];
    const existingPosts = splitThreadPosts(draft?.content ?? "");
    return existingPosts.length > 0 ? existingPosts : [""];
  });
  const [isThread, setIsThread] = useState(() =>
    draft?.targetKind === 1 && hasThreadMarker(draft?.tags ?? []),
  );
  const [splitVersion, setSplitVersion] = useState(0);
  const [threadPostImages, setThreadPostImages] = useState<string[][]>([[]]);
  const [coverImage, setCoverImage] = useState<string | undefined>(
    draft?.coverImage,
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [publisherSearch, setPublisherSearch] = useState("");
  const [selectedPublisher, setSelectedPublisher] =
    useState<DraftPublisher | null>(draft?.targetPublisher ?? null);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedLinks, setAttachedLinks] = useState<LinkMetadata[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [postTypeLocked, setPostTypeLocked] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [pendingModeChange, setPendingModeChange] = useState<"short" | "long" | "thread" | null>(null);
  const [lastRelaySave, setLastRelaySave] = useState<number | null>(null);

  // Track if initial mount to avoid auto-save on first render
  const isInitialMount = useRef(true);

  const threadContent = (posts: string[] = threadPosts) => joinThreadPosts(posts);

  const threadContentWithImages = (
    posts: string[] = threadPosts,
    images: string[][] = threadPostImages,
  ) =>
    joinThreadPosts(
      posts.map((post, i) => {
        const imgs = images[i] ?? [];
        const text = post.trim();
        if (imgs.length === 0) return text;
        return text.length > 0 ? `${text}\n${imgs.join("\n")}` : imgs.join("\n");
      }),
    );

  const tagsForCurrentMode = () => {
    const baseTags = stripThreadMarker(draft?.tags ?? []);
    return isThread ? [...baseTags, ['ghostr-thread', 'true']] : baseTags;
  };

  // Stable callback for MarkdownEditor onChange
  const handleMarkdownChange = useCallback((val: string) => {
    setContent(val);
    setHasChanges(true);
  }, []);

  // Extract URLs from draft content on load (only once per draft)
  useEffect(() => {
    if (!draft || !currentDraftId) return;

    // Only initialize if this is a different draft than last time
    if (initializedDraftId.current === currentDraftId) {
      return;  // Already initialized this draft
    }

    // Mark this draft as initialized
    initializedDraftId.current = currentDraftId;

    if (!isLongForm) {
      const allUrls = extractAllUrls(draft.content);

      // Restore uploaded images separately (these should show as thumbnails)
      if (draft.uploadedImages && draft.uploadedImages.length > 0) {
        setAttachedImages(draft.uploadedImages);
      }

      if (allUrls.length > 0) {
        // Clear previous state
        setAttachedLinks([]);

        // Track which URLs to remove from content
        const urlsToRemove: string[] = [];

        // Process each URL - separate uploaded images from pasted URLs
        allUrls.forEach(async (url) => {
          // Check if this is an uploaded image (in uploadedImages array)
          const isUploadedImage = draft.uploadedImages?.includes(url);

          if (isUploadedImage) {
            // Skip - already handled by setAttachedImages above
            urlsToRemove.push(url);
          } else if (isImageUrl(url)) {
            // Pasted image URL - show as link preview with placeholder
            setAttachedLinks(prev => [...prev, { url, loading: false }]);
            urlsToRemove.push(url);
          } else {
            // Regular URL - fetch metadata and show as link preview
            setAttachedLinks(prev => [...prev, { url, loading: true }]);
            const metadata = await fetchLinkMetadata(url);
            setAttachedLinks(prev =>
              prev.map(l => l.url === url ? metadata : l)
            );
            urlsToRemove.push(url);
          }
        });

        // Remove URLs from content for clean editing
        let cleanContent = draft.content;
        urlsToRemove.forEach(url => {
          // Escape special regex characters in URL
          const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Remove the URL and one newline before/after if present
          cleanContent = cleanContent.replace(new RegExp(`\n${escapedUrl}`, 'g'), '');
          cleanContent = cleanContent.replace(new RegExp(`${escapedUrl}\n`, 'g'), '');
          cleanContent = cleanContent.replace(new RegExp(escapedUrl, 'g'), '');
        });
        // Clean up any remaining double newlines from URL removal
        cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n');
        setContent(cleanContent.trim());
      } else {
        // No URLs, just set content as-is
        setContent(draft.content);
      }
    } else {
      // Long form, set content as-is
      setContent(draft.content);
    }
  }, [currentDraftId, isLongForm]);

  // Image handling for kind 1 notes
  const imageUrls = extractImageUrls(content);
  const hasImages = imageUrls.length > 0 || attachedImages.length > 0;

  const handleImageUpload = (url: string) => {
    if (isLongForm) {
      // For long-form articles, keep the old behavior (append to content)
      setContent(
        (prev) => prev + (prev.endsWith("\n") || prev === "" ? "" : "\n") + url,
      );
    } else {
      // For kind 1 notes, add to separate state array
      setAttachedImages((prev) => [...prev, url]);
    }
    setHasChanges(true);
  };

  const handleRemoveImage = (url: string) => {
    if (isLongForm) {
      // For long-form articles, remove from content
      setContent((prev) =>
        prev.replace(url, "").replace(/\n\n+/g, "\n\n").trim(),
      );
    } else {
      // For kind 1 notes, remove from state array
      setAttachedImages((prev) => prev.filter((u) => u !== url));
    }
    setHasChanges(true);
  };

  const handleRemoveLink = (url: string) => {
    setAttachedLinks((prev) => prev.filter((l) => l.url !== url));
    setHasChanges(true);
  };

  // Load favorites on mount
  useEffect(() => {
    if (!favoritesLoaded) {
      loadFavorites();
    }
  }, [favoritesLoaded, loadFavorites]);

  // Two-tier auto-save system:
  // - Fast local save (1s): Updates Zustand store + localStorage for quick UI feedback
  // - Slower relay save (3s): Publishes to Nostr relays, preventing spam and reducing network usage
  const debouncedContentLocal = useDebounce(content, 1000);
  const debouncedTitleLocal = useDebounce(title, 1000);
  const debouncedSummaryLocal = useDebounce(summary, 1000);
  const debouncedImagesLocal = useDebounce(attachedImages, 1000);
  const debouncedLinksLocal = useDebounce(attachedLinks, 1000);

  const debouncedContentRelay = useDebounce(content, 3000);
  const debouncedTitleRelay = useDebounce(title, 3000);
  const debouncedSummaryRelay = useDebounce(summary, 3000);
  const debouncedImagesRelay = useDebounce(attachedImages, 3000);
  const debouncedLinksRelay = useDebounce(attachedLinks, 3000);

  // Local auto-save (1 second debounce) - updates store and localStorage
  useEffect(() => {
    // Skip the initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (currentDraftId && hasChanges) {
      // For kind 1 notes, append images and links at the end
      let finalContent = (isThread ? threadContentWithImages() : debouncedContentLocal).trim();

      if (!isLongForm && !isThread) {
        if (debouncedImagesLocal.length > 0) {
          finalContent += '\n' + debouncedImagesLocal.join('\n');
        }
        if (debouncedLinksLocal.length > 0) {
          finalContent += '\n' + debouncedLinksLocal.map(l => l.url).join('\n');
        }
      }

      updateDraft(currentDraftId, {
        title: debouncedTitleLocal,
        summary: isLongForm && debouncedSummaryLocal.trim() ? debouncedSummaryLocal : undefined,
        content: finalContent,
        targetKind: isLongForm ? 30023 : 1,
        tags: tagsForCurrentMode(),
        targetPublisher: selectedPublisher ?? undefined,
        coverImage: isLongForm ? coverImage : undefined,
        uploadedImages: !isLongForm && debouncedImagesLocal.length > 0 ? debouncedImagesLocal : undefined,
      });
    }
  }, [
    debouncedContentLocal,
    debouncedTitleLocal,
    debouncedSummaryLocal,
    debouncedImagesLocal,
    debouncedLinksLocal,
    isLongForm,
    coverImage,
    selectedPublisher,
    currentDraftId,
    hasChanges,
    updateDraft,
  ]);

  // Relay auto-save (3 second debounce) - publishes to Nostr relays
  useEffect(() => {
    // Skip the initial mount
    if (isInitialMount.current) {
      return;
    }

    if (currentDraftId && hasChanges) {
      // Also persist to relay (fire and forget)
      saveDraft(currentDraftId)
        .then(() => {
          setLastRelaySave(Date.now());
        })
        .catch(() => {
          // Silently fail - will retry on next change
        });
    }
  }, [
    debouncedContentRelay,
    debouncedTitleRelay,
    debouncedSummaryRelay,
    debouncedImagesRelay,
    debouncedLinksRelay,
    currentDraftId,
    hasChanges,
    saveDraft,
  ]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setHasChanges(true);
  };

  const handleSummaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSummary(e.target.value);
    setHasChanges(true);
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasChanges(true);

    // Only detect links for kind 1 notes
    if (!isLongForm) {
      // Detect ALL URLs (including image URLs) for link previews
      const allUrls = extractAllUrls(value);
      const existingLinkUrls = attachedLinks.map(l => l.url);
      const newLinkUrls = allUrls.filter(url => !existingLinkUrls.includes(url));

      // Add new URLs as link previews
      newLinkUrls.forEach(async (url) => {
        // For image URLs, show placeholder without fetching metadata
        if (isImageUrl(url)) {
          setAttachedLinks(prev => [...prev, { url, loading: false }]);
        } else {
          // For regular URLs, fetch metadata
          setAttachedLinks(prev => [...prev, { url, loading: true }]);
          const metadata = await fetchLinkMetadata(url);
          setAttachedLinks(prev =>
            prev.map(l => l.url === url ? metadata : l)
          );
        }
      });

      // Remove links that were deleted from content
      const removedLinkUrls = existingLinkUrls.filter(url => !allUrls.includes(url));
      if (removedLinkUrls.length > 0) {
        setAttachedLinks(prev => prev.filter(l => !removedLinkUrls.includes(l.url)));
      }
    }
  };

  const handleKindChange = (checked: boolean) => {
    setIsLongForm(checked);
    setIsThread(false);
    setHasChanges(true);
  };

  const hasContent = () =>
    content?.trim() || title.trim() || summary.trim() ||
    attachedImages.length > 0 ||
    (isThread && threadPosts.some((p, i) => p.trim() || (threadPostImages[i]?.length ?? 0) > 0));

  const requestKindChange = (toLongForm: boolean) => {
    if (postTypeLocked) return;
    if (toLongForm === isLongForm && !isThread) return;
    if (hasContent()) { setPendingModeChange(toLongForm ? "long" : "short"); return; }
    handleKindChange(toLongForm);
  };

  const confirmPendingModeChange = () => {
    if (pendingModeChange === null) return;
    if (pendingModeChange === "thread") {
      const isInitialEmpty = threadPosts.length === 1 && threadPosts[0] === "";
      if (isInitialEmpty && (content?.trim() || attachedImages.length > 0)) {
        setThreadPosts([content ?? ""]);
        setThreadPostImages([attachedImages]);
      }
      setIsLongForm(false);
      setIsThread(true);
      setHasChanges(true);
    } else {
      handleKindChange(pendingModeChange === "long");
      setThreadPosts([""]);
      setThreadPostImages([[]]);
    }
    setPendingModeChange(null);
  };

  const handleThreadModeChange = () => {
    if (postTypeLocked) return;
    if (isThread) return;
    if (hasContent()) { setPendingModeChange("thread"); return; }
    if (!isThread) {
      // Only seed threadPosts from content the first time entering thread mode.
      // Otherwise preserve any structured thread the user already built.
      const isInitialEmpty = threadPosts.length === 1 && threadPosts[0] === "";
      if (isInitialEmpty && (content?.trim() || attachedImages.length > 0)) {
        setThreadPosts([content ?? ""]);
        setThreadPostImages([attachedImages]);
      }
    }
    setIsLongForm(false);
    setIsThread(true);
    setHasChanges(true);
  };

  const handleThreadPostChange = (index: number, value: string) => {
    let didSplit = false;
    let splitCount = 1;
    setThreadPosts((posts) => {
      let nextPosts: string[];
      if (/\n\s*-{2,}\s*\n/.test(value)) {
        const parts = splitThreadPosts(value);
        if (parts.length > 1) {
          nextPosts = [...posts];
          nextPosts.splice(index, 1, ...parts);
          didSplit = true;
          splitCount = parts.length;
        } else {
          nextPosts = posts.map((post, i) => (i === index ? value : post));
        }
      } else {
        nextPosts = posts.map((post, i) => (i === index ? value : post));
      }
      setContent(threadContent(nextPosts));
      return nextPosts;
    });
    if (didSplit) {
      setThreadPostImages((imgs) => {
        const next = [...imgs];
        const existing = next[index] ?? [];
        const newSlots = Array.from({ length: splitCount }, (_, i) => (i === 0 ? existing : []));
        next.splice(index, 1, ...newSlots);
        return next;
      });
      setSplitVersion((v) => v + 1);
    }
    setHasChanges(true);
  };

  const handleAddThreadPost = () => {
    setThreadPosts((posts) => [...posts, ""]);
    setThreadPostImages((imgs) => [...imgs, []]);
    setHasChanges(true);
  };

  const handleThreadPostImageUpload = (index: number, url: string) => {
    setThreadPostImages((imgs) =>
      imgs.map((postImgs, i) => (i === index ? [...postImgs, url] : postImgs))
    );
    setHasChanges(true);
  };

  const handleRemoveThreadPostImage = (index: number, url: string) => {
    setThreadPostImages((imgs) =>
      imgs.map((postImgs, i) => (i === index ? postImgs.filter((u) => u !== url) : postImgs))
    );
    setHasChanges(true);
  };

  const handleRemoveThreadPost = (index: number) => {
    setThreadPosts((posts) => {
      const nextPosts = posts.filter((_, i) => i !== index);
      setContent(threadContent(nextPosts));
      return nextPosts;
    });
    setThreadPostImages((imgs) => imgs.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleCoverImageChange = (url: string | undefined) => {
    setCoverImage(url);
    setHasChanges(true);
  };

  const handlePublisherSelect = (profile: SearchProfile) => {
    const publisher: DraftPublisher = {
      pubkey: profile.pubkey,
      npub: profile.npub,
      name: profile.name,
      displayName: profile.displayName,
      picture: profile.picture,
      nip05: profile.nip05,
    };
    setSelectedPublisher(publisher);
    setPublisherSearch("");
    setHasChanges(true);
  };

  const handleClearPublisher = () => {
    setSelectedPublisher(null);
    setPublisherSearch("");
    setHasChanges(true);
  };

  const handleToggleFavorite = async (profile: SearchProfile) => {
    try {
      if (isFavorite(profile.pubkey)) {
        await removeFavorite(profile.pubkey);
        toast({
          title: "Removed from favorites",
          description: `${getDisplayName(profile)} removed from favorites`,
        });
      } else {
        await addFavorite(profile);
        toast({
          title: "Added to favorites",
          description: `${getDisplayName(profile)} added to favorites`,
        });
      }
    } catch (err) {
      console.error("Failed to update favorites:", err);
    }
  };

  const handleSave = async () => {
    if (!draft) return;

    // For kind 1 notes, append images and links at the end
    let finalContent = (isThread ? threadContentWithImages() : content).trim();

    if (!isLongForm && !isThread) {
      if (attachedImages.length > 0) {
        finalContent += '\n' + attachedImages.join('\n');
      }
      if (attachedLinks.length > 0) {
        finalContent += '\n' + attachedLinks.map(l => l.url).join('\n');
      }
    }

    updateDraft(draft.id, {
      title,
      summary: isLongForm && summary.trim() ? summary : undefined,
      content: finalContent,
      targetKind: isLongForm ? 30023 : 1,
      tags: tagsForCurrentMode(),
      targetPublisher: selectedPublisher ?? undefined,
      coverImage: isLongForm ? coverImage : undefined,
      uploadedImages: !isLongForm && attachedImages.length > 0 ? attachedImages : undefined,
    });

    await saveDraft(draft.id);
    setHasChanges(false);
    toast({
      title: "Draft saved",
      description: "Your draft has been saved to your Nostr relays.",
    });
  };

  const handleSubmitForReview = () => {
    if (!(isThread ? threadContentWithImages() : content).trim()) {
      toast({
        title: "Cannot submit",
        description: "Please add some content before submitting.",
        variant: "destructive",
      });
      return;
    }
    if (
      isThread &&
      threadPosts.filter((post, i) => post.trim().length > 0 || (threadPostImages[i]?.length ?? 0) > 0).length < 2
    ) {
      toast({
        title: "Cannot submit thread",
        description: "Add at least two non-empty posts before submitting a thread.",
        variant: "destructive",
      });
      return;
    }
    if (draft) {
      updateDraft(draft.id, {
        content: (isThread ? threadContentWithImages() : content).trim(),
        targetKind: isLongForm ? 30023 : 1,
        tags: tagsForCurrentMode(),
        targetPublisher: selectedPublisher ?? undefined,
      });
    }
    setSubmitDialogOpen(true);
  };

  const handleDismissRejection = async () => {
    if (!draft) return;
    updateDraft(draft.id, { rejectionReason: undefined });
    await saveDraft(draft.id);
  };

  const handleDelete = async () => {
    if (!currentDraftId) return;
    setShowDeleteDialog(false);
    await deleteDraft(currentDraftId);
    toast({
      title: 'Draft deleted',
      description: 'Your draft has been permanently deleted.',
    });
    onBack();
  };

  const handleBack = async () => {
    // Save before going back if there are changes
    if (draft && hasChanges) {
      // For kind 1 notes, append images and links at the end
      let finalContent = (isThread ? threadContentWithImages() : content).trim();

      if (!isLongForm && !isThread) {
        if (attachedImages.length > 0) {
          finalContent += '\n' + attachedImages.join('\n');
        }
        if (attachedLinks.length > 0) {
          finalContent += '\n' + attachedLinks.map(l => l.url).join('\n');
        }
      }

      updateDraft(draft.id, {
        title,
        summary: isLongForm && summary.trim() ? summary : undefined,
        content: finalContent,
        targetKind: isLongForm ? 30023 : 1,
        tags: tagsForCurrentMode(),
        targetPublisher: selectedPublisher ?? undefined,
        coverImage: isLongForm ? coverImage : undefined,
        uploadedImages: !isLongForm && attachedImages.length > 0 ? attachedImages : undefined,
      });
      await saveDraft(draft.id).catch(() => {
        // Silently fail
      });
    }
    onBack();
  };

  if (!draft) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Draft not found</p>
        <Button onClick={onBack} variant="link">
          Go back
        </Button>
      </div>
    );
  }

  const isSubmittedOrPublished =
    draft.status === "submitted" || draft.status === "published" || draft.status === "retracted";
  const isPublished = draft.status === "published";

  return (
    <div className="space-y-6">
      {/* Rejection reason banner */}
      {draft.rejectionReason && (
        <div className="rounded-lg border-l-4 border-destructive bg-destructive/10 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Submission Rejected
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {draft.rejectionReason}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleDismissRejection}
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">
              {isPublished ? "View Published Post" : "Edit Draft"}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={draft.status} />
              {hasChanges && !isPublished && (
                <span className="text-xs text-muted-foreground">
                  Unsaved changes
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {isPublished && draft.publishedEventId ? (
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  getNoteUrl(draft.publishedEventId!, noteViewerClient),
                  "_blank",
                )
              }
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View on Nostr
            </Button>
          ) : (
            draft.status === 'draft' && lastRelaySave && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Saved to relays</span>
              </div>
            )
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px] items-start">
        <div className="space-y-4">
          {!isPublished && (
            <div className="flex items-center justify-end gap-2">
              {draft.status === 'draft' && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || isSubmittedOrPublished}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
              <Button
                className="flex-1 md:hidden"
                onClick={handleSubmitForReview}
                disabled={isSubmittedOrPublished || !selectedPublisher}
                title={!selectedPublisher ? "Select a publisher first" : undefined}
              >
                <Send className="mr-2 h-4 w-4" />
                Submit for Review
              </Button>
            </div>
          )}
          <div className="rounded-lg border velvet bg-card p-4 space-y-4">
          {isLongForm && (
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Enter a title for your article"
                value={title}
                onChange={handleTitleChange}
                disabled={isSubmittedOrPublished}
              />
            </div>
          )}

          {isLongForm && (
            <div className="space-y-2">
              <Label htmlFor="summary">Summary (optional)</Label>
              <Input
                id="summary"
                placeholder="Brief description of your article (recommended for discovery)"
                value={summary}
                onChange={handleSummaryChange}
                disabled={isSubmittedOrPublished}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                {summary.length}/200 characters - Helps readers discover your article
              </p>
            </div>
          )}

          {isLongForm && (
            <CoverImageInput
              value={coverImage}
              onChange={handleCoverImageChange}
              disabled={isSubmittedOrPublished}
            />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content" className="font-display">Content</Label>
              {!isLongForm && !isThread && !isSubmittedOrPublished && (
                <ImageUploadButton onUpload={handleImageUpload} />
              )}
            </div>
            {isThread ? (
              <div className="space-y-4">
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>Each post is sent for publisher review and published as a sequential kind 1 reply.</p>
                  <p className="italic">Paste a draft with <code className="font-mono not-italic">---</code> on its own line between posts to auto-split.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={threadAutoNumber}
                    onCheckedChange={setThreadAutoNumber}
                    disabled={isSubmittedOrPublished}
                  />
                  <span className="text-sm text-muted-foreground">Auto-number posts (1/N)</span>
                </div>
                {threadPosts.map((post, index) => (
                  <div key={`${splitVersion}-${index}`} className="space-y-1.5">
                    <div className="flex items-center justify-between min-h-[1.5rem]">
                      {threadPosts.length > 1 ? (
                        <Label htmlFor={`thread-post-${index}`} className="text-xs text-muted-foreground font-medium">
                          Post {index + 1}
                        </Label>
                      ) : <span />}
                      <div className="flex items-center gap-1">
                        {!isSubmittedOrPublished && (
                          <ImageUploadButton onUpload={(url) => handleThreadPostImageUpload(index, url)} />
                        )}
                        {threadPosts.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveThreadPost(index)}
                            disabled={isSubmittedOrPublished}
                            title="Remove post"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <MentionPillTextarea
                      value={post}
                      onChange={(value) => handleThreadPostChange(index, value)}
                      placeholder={index === 0 ? "Start your thread..." : "Continue the thread..."}
                      disabled={isSubmittedOrPublished}
                      minHeight="140px"
                    compact
                    />
                    {threadAutoNumber && (
                      <div className="text-right text-xs text-muted-foreground/50 italic">
                        ({index + 1}/{threadPosts.filter((p, i) => p.trim() || (threadPostImages[i]?.length ?? 0) > 0).length})
                      </div>
                    )}
                    <ImageThumbnailGrid
                      images={threadPostImages[index] ?? []}
                      onRemove={(url) => handleRemoveThreadPostImage(index, url)}
                      disabled={isSubmittedOrPublished}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddThreadPost}
                  disabled={isSubmittedOrPublished}
                  className="w-full border-dashed"
                >
                  <Plus className="mr-2 h-4 w-4" /> Add next post
                </Button>
              </div>
            ) : isLongForm ? (
              <MarkdownEditor
                value={content}
                onChange={handleMarkdownChange}
                placeholder="Write your article here..."
                disabled={isSubmittedOrPublished}
              />
            ) : (
              <>
                <MentionPillTextarea
                  value={content}
                  onChange={handleContentChange}
                  placeholder="What do you want to say? Use @ to mention someone..."
                  disabled={isSubmittedOrPublished}
                  minHeight="200px"
                />
                {/* Show thumbnail grid for kind 1 notes */}
                <ImageThumbnailGrid
                  images={attachedImages}
                  onRemove={handleRemoveImage}
                  disabled={isSubmittedOrPublished}
                />
                {/* Show link previews for kind 1 notes */}
                <LinkPreviewGrid
                  links={attachedLinks}
                  onRemove={handleRemoveLink}
                  disabled={isSubmittedOrPublished}
                />
                {!isSubmittedOrPublished && (
                  <ShortNoteLengthWarning
                    content={content}
                    dismissed={lengthWarningDismissed}
                    onDismiss={() => setLengthWarningDismissed(true)}
                    onConvert={() => setIsLongForm(true)}
                  />
                )}
              </>
            )}
            {hasImages && !isLongForm && !isThread && (
              <p className="text-xs text-muted-foreground">
                {attachedImages.length} image{attachedImages.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
        </div>

        <div className="space-y-4 md:sticky md:top-6">
          {!isPublished && (
            <Button
              className="hidden w-full md:flex"
              onClick={handleSubmitForReview}
              disabled={isSubmittedOrPublished || !selectedPublisher}
              title={
                !selectedPublisher ? "Select a publisher first" : undefined
              }
            >
              <Send className="mr-2 h-4 w-4" />
              Submit for Review
            </Button>
          )}

          {/* Publisher Selection */}
          <div className="rounded-lg border velvet bg-card p-4 space-y-3">
            <h3 className="font-medium">Publisher</h3>
            {selectedPublisher ? (
              <div className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                {selectedPublisher.picture ? (
                  <img
                    src={selectedPublisher.picture}
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
                    {selectedPublisher.displayName ||
                      selectedPublisher.name ||
                      formatNpub(selectedPublisher.pubkey)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {selectedPublisher.nip05 ||
                      formatNpub(selectedPublisher.pubkey)}
                  </div>
                </div>
                {!isSubmittedOrPublished && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={handleClearPublisher}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Quick select favorites */}
                {favorites.length > 0 && !isSubmittedOrPublished && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium">
                      Favorites
                    </div>
                    {favorites.map((fav) => (
                      <div key={fav.pubkey} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handlePublisherSelect({
                              pubkey: fav.pubkey,
                              npub: fav.npub,
                              name: fav.name,
                              displayName: fav.displayName,
                              picture: fav.picture,
                              nip05: fav.nip05,
                            })
                          }
                          className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm text-left min-w-0"
                        >
                          {fav.picture ? (
                            <img
                              src={fav.picture}
                              alt=""
                              className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                              <User className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <span className="truncate">
                            {fav.displayName ||
                              fav.name ||
                              formatNpub(fav.pubkey)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFavorite(fav.pubkey)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                          title="Remove from favorites"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <ProfileSearchInput
                  value={publisherSearch}
                  onChange={setPublisherSearch}
                  onSelect={handlePublisherSelect}
                  placeholder="Search publisher..."
                  disabled={isSubmittedOrPublished}
                  favorites={favorites.map((f) => ({
                    pubkey: f.pubkey,
                    npub: f.npub,
                    name: f.name,
                    displayName: f.displayName,
                    picture: f.picture,
                    nip05: f.nip05,
                  }))}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={isFavorite}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Choose who will publish this content
            </p>
          </div>

          {/* Post Type */}
          <div className="rounded-lg border velvet bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Post Type</h3>
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => postTypeLocked ? setShowUnlockDialog(true) : setPostTypeLocked(true)}
                title={postTypeLocked ? "Unlock post type" : "Lock post type"}
              >
                {postTypeLocked
                  ? <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium"><Lock className="h-3.5 w-3.5" /> Locked</span>
                  : <Unlock className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
                                    <div className={cn("flex flex-col gap-2 transition-opacity", postTypeLocked && "opacity-60")}>
              <button
                onClick={() => requestKindChange(false)}
                disabled={postTypeLocked || isSubmittedOrPublished}
                className={cn(
                  'w-full px-3 py-2.5 rounded-lg text-base font-medium text-left transition-colors',
                  !isLongForm && !isThread
                    ? 'ring-2 ring-primary bg-primary/10 text-primary'
                    : 'border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 shrink-0" />Short Note</span>
                <p className="text-sm font-normal opacity-75 mt-0.5 ml-6">Most common for social media</p>
              </button>
              <button
                onClick={handleThreadModeChange}
                disabled={postTypeLocked || isSubmittedOrPublished}
                className={cn(
                  'w-full px-3 py-2.5 rounded-lg text-base font-medium text-left transition-colors',
                  !isLongForm && isThread
                    ? 'ring-2 ring-primary bg-primary/10 text-primary'
                    : 'border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <span className="flex items-center gap-2"><LayoutList className="h-4 w-4 shrink-0" />Thread</span>
                <p className="text-sm font-normal opacity-75 mt-0.5 ml-6">A sequence of short notes</p>
              </button>
              <button
                onClick={() => requestKindChange(true)}
                disabled={postTypeLocked || isSubmittedOrPublished}
                className={cn(
                  'w-full px-3 py-2.5 rounded-lg text-base font-medium text-left transition-colors',
                  isLongForm
                    ? 'ring-2 ring-primary bg-primary/10 text-primary'
                    : 'border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 shrink-0" />Long-form</span>
                <p className="text-sm font-normal opacity-75 mt-0.5 ml-6">Articles with full markdown</p>
              </button>
            </div>
          </div>
          {draft.status === "submitted" && !draft.publishedEventId && (
            <div className="rounded-lg border velvet bg-card p-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
                <Check className="h-4 w-4" />
                <span className="font-medium">Submitted</span>
              </div>
            </div>
          )}

          {draft.publishedEventId && (
            <div className="rounded-lg border velvet bg-card p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
                <Check className="h-4 w-4" />
                <span className="font-medium">Published</span>
              </div>
              <a
                href={getNoteUrl(draft.publishedEventId!, noteViewerClient)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-mono break-all bg-muted/30 p-2 rounded hover:bg-muted transition-colors"
              >
                <span className="truncate">{draft.publishedEventId}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            </div>
          )}
        </div>
      </div>

      <SubmitDialog
        open={isSubmitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        draft={draft}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this draft from both your local storage and relays. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingModeChange !== null}
        onOpenChange={(open) => { if (!open) setPendingModeChange(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change post type?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching post types will alter your formatting. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingModeChange}>Change</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock post type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will allow changing the post type, which may alter your formatting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setPostTypeLocked(false); setShowUnlockDialog(false) }}>Unlock</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
