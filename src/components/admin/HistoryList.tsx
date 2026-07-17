import { useEffect, useState } from "react";
import {
  Trash2,
  ExternalLink,
  User,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  usePublishHistoryStore,
  type PublishedItem,
} from "@/stores/publishHistoryStore";
import {
  fetchProfile,
  getDisplayName,
  type SearchProfile,
} from "@/services/profileSearchService";
import { nip19 } from "nostr-tools";
import { useAuthStore } from "@/stores/authStore";
import { getNoteUrl } from '@/lib/nostrClients'
import { useSettingsStore } from '@/stores/settingsStore'

interface HistoryListProps {
  onEditArticle?: (item: PublishedItem) => void;
}

/**
 * Generate the correct Nostr identifier for an item
 * - For kind 30023 articles: naddr (includes pubkey, kind, and d-tag)
 * - For kind 1 notes: use hex event ID (nevent requires relay hints)
 */
function getNostrIdentifier(item: PublishedItem): string {
  const { user } = useAuthStore.getState();

  // For kind 30023 articles, use naddr
  if (item.kind === 30023 && item.dTag && user) {
    try {
      return nip19.naddrEncode({
        kind: 30023,
        pubkey: user.pubkey,
        identifier: item.dTag,
      });
    } catch (error) {
      console.error("[HistoryList] Failed to encode naddr:", error);
      // Fallback to hex
      return item.id;
    }
  }

  // For kind 1 notes, use hex event ID
  // (nevent would require relay hints which we don't have in PublishedItem)
  return item.id;
}

export function HistoryList({ onEditArticle }: HistoryListProps) {
  const { items, isLoaded, loadHistory, removeItem } = usePublishHistoryStore();
  const [deletingItem, setDeletingItem] = useState<PublishedItem | null>(null);

  useEffect(() => {
    if (!isLoaded) {
      loadHistory();
    }
  }, [isLoaded, loadHistory]);

  const handleConfirmDelete = () => {
    if (deletingItem) {
      removeItem(deletingItem.id);
      setDeletingItem(null);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading history...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No history yet. Published posts will appear here.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {items.map((item) => (
          <HistoryItem
            key={item.id}
            item={item}
            onDelete={() => setDeletingItem(item)}
            onEdit={
              onEditArticle && item.kind === 30023 && item.dTag
                ? () => onEditArticle(item)
                : undefined
            }
          />
        ))}
      </div>

      <AlertDialog
        open={!!deletingItem}
        onOpenChange={(open: boolean) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from history?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the item from your local history only. The Nostr
              event will remain published on relays and cannot be deleted from
              here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Remove from history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface HistoryItemProps {
  item: PublishedItem;
  onDelete: () => void;
  onEdit?: () => void;
}

function HistoryItem({ item, onDelete, onEdit }: HistoryItemProps) {
  const { noteViewerClient } = useSettingsStore();
  const [delegateProfile, setDelegateProfile] = useState<SearchProfile | null>(
    null,
  );

  useEffect(() => {
    if (item.delegatePubkey) {
      fetchProfile(item.delegatePubkey)
        .then(setDelegateProfile)
        .catch(() => setDelegateProfile(null));
    }
  }, [item.delegatePubkey]);

  const excerpt =
    item.title ||
    item.content.slice(0, 60) + (item.content.length > 60 ? "..." : "");

  const formattedDate = new Date(item.publishedAt).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 group">
      {/* Delegate profile picture or source icon */}
      <div className="shrink-0">
        {item.source === "delegate" && item.delegatePubkey ? (
          delegateProfile?.picture ? (
            <img
              src={delegateProfile.picture}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
              title={`From ${getDisplayName(delegateProfile)}`}
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
          )
        ) : (
          <div
            className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"
            title="Direct post"
          >
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{excerpt}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            Kind {item.kind}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {item.source === "delegate" && delegateProfile ? (
            <>{getDisplayName(delegateProfile)} • </>
          ) : item.source === "delegate" && item.delegateNpub ? (
            <>{item.delegateNpub.slice(0, 12)}... • </>
          ) : null}
          {formattedDate}
        </div>
      </div>

      {/* Actions - visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onEdit}
            title="Edit article"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <a
          href={getNoteUrl(getNostrIdentifier(item), noteViewerClient)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent"
          title="View on Nostr"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Delete from history"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
