import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/common/MarkdownEditor";
import { CoverImageInput } from "@/components/common/CoverImageInput";
import { useNDKStore } from "@/stores/ndkStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  usePublishHistoryStore,
  type PublishedItem,
} from "@/stores/publishHistoryStore";
import { toast } from "@/hooks/useToast";
import { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";

interface EditArticleEditorProps {
  item: PublishedItem;
  onBack: () => void;
  onPublished?: () => void;
}

export function EditArticleEditor({
  item,
  onBack,
  onPublished,
}: EditArticleEditorProps) {
  const { ndk } = useNDKStore();
  const { signer } = useAuthStore();
  const { creditGhostr } = useSettingsStore();
  const { updateItem } = usePublishHistoryStore();

  const [title, setTitle] = useState(item.title ?? "");
  const [summary, setSummary] = useState(item.summary ?? "");
  const [content, setContent] = useState(item.content);
  const [coverImage, setCoverImage] = useState<string | undefined>(
    item.coverImage,
  );
  const [isPublishing, setIsPublishing] = useState(false);
  const [includeCredit, setIncludeCredit] = useState(creditGhostr);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // Track original values to detect changes
  const [originalTitle, setOriginalTitle] = useState(item.title ?? "");
  const [originalSummary, setOriginalSummary] = useState(item.summary ?? "");
  const [originalContent, setOriginalContent] = useState(item.content);
  const [originalCoverImage, setOriginalCoverImage] = useState<
    string | undefined
  >(item.coverImage);

  // Fetch full event content if it's missing (e.g., loaded from history without full content)
  useEffect(() => {
    const fetchEventContent = async () => {
      // Publish history only stores first 100 chars, so always fetch full content for kind 30023
      // For kind 1 notes, fetch if content seems truncated or empty
      const shouldFetch =
        !content ||
        content.trim().length === 0 ||
        (item.kind === 30023 && content.length <= 100) ||
        (item.kind === 1 && content.trim().length < 50);

      if (ndk && shouldFetch) {
        setIsLoadingContent(true);
        try {
          const { user } = useAuthStore.getState();
          if (!user) return;

          // For kind 30023 articles, use dTag to fetch the replaceable event
          const filter: NDKFilter = item.dTag
            ? {
                kinds: [30023],
                authors: [user.pubkey],
                "#d": [item.dTag],
                limit: 1,
              }
            : {
                kinds: [item.kind],
                ids: [item.id],
                limit: 1,
              };

          const fetchPromise = ndk.fetchEvents(filter);
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 10000),
          );
          const events = await Promise.race([fetchPromise, timeoutPromise]);
          if (!events) {
            throw new Error("Fetch timed out");
          }
          const event = Array.from(events)[0];

          if (event && event.content) {
            setContent(event.content);
            setOriginalContent(event.content);

            // Also update title, summary, and cover image if available
            const titleTag = event.tags.find((tag) => tag[0] === "title");
            if (titleTag && titleTag[1]) {
              setTitle(titleTag[1]);
              setOriginalTitle(titleTag[1]);
            }

            const summaryTag = event.tags.find((tag) => tag[0] === "summary");
            if (summaryTag && summaryTag[1]) {
              setSummary(summaryTag[1]);
              setOriginalSummary(summaryTag[1]);
            }

            const imageTag = event.tags.find((tag) => tag[0] === "image");
            if (imageTag && imageTag[1]) {
              setCoverImage(imageTag[1]);
              setOriginalCoverImage(imageTag[1]);
            }
          }
        } catch (error) {
          console.error("[EditArticleEditor] Failed to fetch event:", error);
          toast({
            title: "Failed to load content",
            description:
              "Could not fetch the full article content. You may need to re-enter it.",
            variant: "destructive",
          });
        } finally {
          setIsLoadingContent(false);
        }
      }
    };

    fetchEventContent();
  }, [ndk, item.id, item.kind, item.dTag]);

  // Check if any changes have been made
  const hasChanges = useMemo(() => {
    return (
      title !== originalTitle ||
      summary !== originalSummary ||
      content !== originalContent ||
      coverImage !== originalCoverImage
    );
  }, [
    title,
    originalTitle,
    summary,
    originalSummary,
    content,
    originalContent,
    coverImage,
    originalCoverImage,
  ]);

  const handlePublish = async () => {
    if (!content.trim()) {
      toast({
        title: "Cannot publish",
        description: "Please add some content before publishing.",
        variant: "destructive",
      });
      return;
    }

    if (!ndk || !signer) {
      toast({
        title: "Not connected",
        description: "Please ensure you are logged in and connected to relays.",
        variant: "destructive",
      });
      return;
    }

    if (!item.dTag) {
      toast({
        title: "Cannot update",
        description: "This article cannot be updated (missing identifier).",
        variant: "destructive",
      });
      return;
    }

    setIsPublishing(true);

    try {
      // Normalize line breaks for markdown: convert single \n to \n\n for proper paragraph breaks
      const normalizedContent = content.replace(
        /([^\n])\n([^\n])/g,
        "$1\n\n$2",
      );

      const event = new NDKEvent(ndk);
      event.kind = 30023;
      event.content = normalizedContent;

      // Use the same d-tag to replace the article
      const tags: string[][] = [
        ["d", item.dTag],
        ["title", title],
        ["published_at", Math.floor(Date.now() / 1000).toString()],
      ];

      // Add summary tag if set (NIP-23)
      if (summary.trim()) {
        tags.push(["summary", summary]);
      }

      // Add cover image tag if set
      if (coverImage) {
        tags.push(["image", coverImage]);
      }

      // Add client tag if enabled
      if (includeCredit) {
        tags.push(["client", "Ghostr"]);
      }

      event.tags = tags;

      await event.sign(signer);
      await event.publish();

      // Update history entry
      updateItem(item.id, {
        id: event.id,
        content,
        kind: 30023,
        title,
        summary: summary.trim() || undefined,
        dTag: item.dTag,
        coverImage,
        publishedAt: Date.now(),
        source: item.source,
        delegatePubkey: item.delegatePubkey,
        delegateNpub: item.delegateNpub,
      });

      toast({
        title: "Article updated!",
        description: "Your article has been republished.",
      });

      onPublished?.();
      onBack();
    } catch (err) {
      console.error("Failed to publish:", err);
      toast({
        title: "Failed to publish",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Edit Article</h1>
            <p className="text-sm text-muted-foreground">
              {isLoadingContent
                ? "Loading article content..."
                : "Update and republish this article"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 self-end sm:self-auto">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={includeCredit}
              onChange={(e) => setIncludeCredit(e.target.checked)}
              className="rounded border-muted-foreground"
            />
            Credit Ghostr
          </label>
          <Button
            onClick={handlePublish}
            disabled={isPublishing || !hasChanges}
          >
            {isPublishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {isPublishing ? "Publishing..." : "Update Article"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px] items-start">
        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Enter a title for your article"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">Summary (optional)</Label>
            <Input
              id="summary"
              placeholder="Brief description of your article (recommended for discovery)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              {summary.length}/200 characters - Helps readers discover your
              article
            </p>
          </div>

          <CoverImageInput value={coverImage} onChange={setCoverImage} />

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="Write your article here..."
            />
            <p className="text-xs text-muted-foreground">
              {content.length} characters
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-4">
            <h3 className="font-medium">Article Info</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Identifier:</span>
                <p className="font-mono text-xs break-all">{item.dTag}</p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Originally published:
                </span>
                <p>
                  {new Date(item.publishedAt).toLocaleString("en-US", {
                    month: "numeric",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  })}
                </p>
              </div>
              {item.source === "delegate" && (
                <div>
                  <span className="text-muted-foreground">Source:</span>
                  <p>From delegate</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Publishing will replace the existing article with the same
              identifier.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
