import { useRef, useState, useEffect, useCallback } from "react";
import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Code,
  Loader2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { parseMarkdown } from "@/lib/utils/markdown";
import { useProfileSearch } from "@/hooks/useProfileSearch";
import {
  getDisplayName,
  formatNpub,
  type SearchProfile,
} from "@/services/profileSearchService";
import { nip19 } from "nostr-tools";
import { cn } from "@/lib/utils/cn";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface MentionMatch {
  query: string;
  startIndex: number;
  endIndex: number;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your content here...",
  disabled = false,
  className,
}: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention state
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionMatch, setMentionMatch] = useState<MentionMatch | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const { results, isLoading, search, clear } = useProfileSearch(300);

  const insertMarkdown = (
    before: string,
    after: string = "",
    defaultText: string = "",
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end) || defaultText;

    const newValue =
      value.substring(0, start) +
      before +
      selectedText +
      after +
      value.substring(end);

    onChange(newValue);

    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(start + before.length, newCursorPos);
    }, 0);
  };

  const handleBold = () => insertMarkdown("**", "**", "bold text");
  const handleItalic = () => insertMarkdown("*", "*", "italic text");

  const handleLink = () => {
    const url = prompt("Enter URL:");
    if (url) {
      insertMarkdown("[", `](${url})`, "link text");
    }
  };

  const handleBulletList = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const needsNewline = start > 0 && value.charAt(start - 1) !== "\n";
    const prefix = (needsNewline ? "\n" : "") + "- ";

    insertMarkdown(prefix, "", "list item");
  };

  const handleNumberedList = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const needsNewline = start > 0 && value.charAt(start - 1) !== "\n";
    const prefix = (needsNewline ? "\n" : "") + "1. ";

    insertMarkdown(prefix, "", "list item");
  };

  const handleQuote = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const previousChar = start > 0 ? value.charAt(start - 1) : "";
    const before = start === 0 || previousChar === "\n" ? "> " : "\n> ";

    insertMarkdown(before, "", "quote");
  };

  const handleCode = () => insertMarkdown("`", "`", "code");

  // Mention detection
  const detectMention = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);

    // Match @username pattern (2+ chars after @)
    const match = textBeforeCursor.match(/@([\w]{2,})$/);

    if (match && match[1] && match[0]) {
      const query = match[1];
      const startIndex = cursorPos - match[0].length;
      const endIndex = cursorPos;

      setMentionMatch({ query, startIndex, endIndex });
      search(query);
      setIsMentionOpen(true);

      // Calculate popover position
      updatePopoverPosition(textarea, startIndex);
    } else {
      setMentionMatch(null);
      setIsMentionOpen(false);
      clear();
    }
  }, [value, search, clear]);

  const updatePopoverPosition = (
    textarea: HTMLTextAreaElement,
    startIndex: number,
  ) => {
    const div = document.createElement("div");
    const style = window.getComputedStyle(textarea);

    div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow: hidden;
      width: ${textarea.clientWidth}px;
      font: ${style.font};
      padding: ${style.padding};
      border: ${style.border};
      line-height: ${style.lineHeight};
    `;

    const textBeforeCursor = value.substring(0, startIndex);
    div.textContent = textBeforeCursor;

    const span = document.createElement("span");
    span.textContent = "@";
    div.appendChild(span);

    document.body.appendChild(div);

    const spanRect = span.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();

    const top = spanRect.top - textareaRect.top + textarea.scrollTop + 24;
    const left = spanRect.left - textareaRect.left;

    document.body.removeChild(div);

    setPopoverPosition({
      top: Math.min(top, textarea.clientHeight - 20),
      left: Math.min(left, textarea.clientWidth - 200),
    });
  };

  useEffect(() => {
    if (activeTab === "write") {
      detectMention();
    }
  }, [detectMention, activeTab]);

  useEffect(() => {
    setHighlightedIndex(results.length > 0 ? 0 : -1);
  }, [results]);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-mention-item]");
      const item = items[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  const handleMentionSelect = useCallback(
    (profile: SearchProfile) => {
      if (!mentionMatch) return;

      const nostrUri = `nostr:${nip19.npubEncode(profile.pubkey)}`;

      const newValue =
        value.substring(0, mentionMatch.startIndex) +
        nostrUri +
        " " +
        value.substring(mentionMatch.endIndex);

      onChange(newValue);
      setIsMentionOpen(false);
      setMentionMatch(null);
      clear();

      setTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          const newPos = mentionMatch.startIndex + nostrUri.length + 1;
          textarea.setSelectionRange(newPos, newPos);
          textarea.focus();
        }
      }, 0);
    },
    [mentionMatch, value, onChange, clear],
  );

  const handleKeydown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention navigation
    if (isMentionOpen && results.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : prev,
          );
          return;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          return;
        case "Enter": {
          const profile = results[highlightedIndex];
          if (highlightedIndex >= 0 && profile) {
            e.preventDefault();
            handleMentionSelect(profile);
            return;
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          setIsMentionOpen(false);
          setMentionMatch(null);
          clear();
          return;
        case "Tab": {
          const tabProfile = results[highlightedIndex];
          if (highlightedIndex >= 0 && tabProfile) {
            e.preventDefault();
            handleMentionSelect(tabProfile);
            return;
          }
          break;
        }
      }
    }

    // Handle markdown shortcuts
    if ((e.metaKey || e.ctrlKey) && e.key === "b") {
      e.preventDefault();
      handleBold();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "i") {
      e.preventDefault();
      handleItalic();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      handleLink();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleClick = () => {
    detectMention();
  };

  // Render mentions in preview as links
  const renderPreview = () => {
    // Replace nostr:npub mentions with styled links
    let html = parseMarkdown(value);

    // Simple replacement for nostr: URIs in the preview
    html = html.replace(
      /nostr:(npub1[a-zA-Z0-9]{58})/g,
      '<a href="https://jumble.social/notes/$1" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">@$1</a>',
    );

    return html;
  };

  return (
    <div className={cn("rounded-lg border overflow-hidden max-w-full", className)}>
      {/* Tabs */}
      <div className="flex border-b bg-muted/30">
        <button
          type="button"
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "write"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("write")}
        >
          Write
        </button>
        <button
          type="button"
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "preview"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("preview")}
        >
          Preview
        </button>
      </div>

      {activeTab === "write" ? (
        <>
          {/* Toolbar */}
          <div className="flex gap-1 p-2 border-b bg-muted/30">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleBold}
              disabled={disabled}
              title="Bold (Ctrl+B)"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleItalic}
              disabled={disabled}
              title="Italic (Ctrl+I)"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <div className="w-px mx-1 bg-border" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleLink}
              disabled={disabled}
              title="Link (Ctrl+K)"
            >
              <Link className="h-4 w-4" />
            </Button>
            <div className="w-px mx-1 bg-border" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleBulletList}
              disabled={disabled}
              title="Bullet List"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleNumberedList}
              disabled={disabled}
              title="Numbered List"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
            <div className="w-px mx-1 bg-border" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleQuote}
              disabled={disabled}
              title="Quote"
            >
              <Quote className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCode}
              disabled={disabled}
              title="Inline Code"
            >
              <Code className="h-4 w-4" />
            </Button>
          </div>

          {/* Textarea with mention support */}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={handleTextareaChange}
              onKeyDown={handleKeydown}
              onClick={handleClick}
              onSelect={detectMention}
              placeholder={placeholder}
              disabled={disabled}
              className="min-h-[400px] rounded-none border-0 resize-y font-mono focus-visible:ring-0 max-w-full overflow-x-auto"
              style={{
                wordBreak: 'break-all',
                overflowWrap: 'anywhere'
              }}
            />

            {/* Mention popover */}
            <Popover open={isMentionOpen && (results.length > 0 || isLoading)}>
              <PopoverAnchor asChild>
                <div
                  className="absolute pointer-events-none"
                  style={{
                    top: popoverPosition.top,
                    left: popoverPosition.left,
                    width: 1,
                    height: 1,
                  }}
                />
              </PopoverAnchor>

              <PopoverContent
                className="w-64 p-0"
                align="start"
                side="bottom"
                sideOffset={4}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <div ref={listRef} className="max-h-48 overflow-y-auto">
                  {isLoading && results.length === 0 && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {results.map((profile, index) => (
                    <button
                      key={profile.pubkey}
                      data-mention-item
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors",
                        highlightedIndex === index && "bg-muted",
                      )}
                      onClick={() => handleMentionSelect(profile)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      {profile.picture ? (
                        <img
                          src={profile.picture}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextElementSibling?.classList.remove(
                              "hidden",
                            );
                          }}
                        />
                      ) : null}
                      <div
                        className={cn(
                          "h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0",
                          profile.picture && "hidden",
                        )}
                      >
                        <User className="h-3 w-3 text-muted-foreground" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {getDisplayName(profile)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {profile.nip05 || formatNpub(profile.pubkey)}
                        </div>
                      </div>
                    </button>
                  ))}

                  {!isLoading && results.length === 0 && mentionMatch && (
                    <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                      No results found
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </>
      ) : (
        /* Preview */
        <div className="p-4 min-h-[400px] prose prose-sm dark:prose-invert max-w-none">
          {value.trim() ? (
            <div dangerouslySetInnerHTML={{ __html: renderPreview() }} />
          ) : (
            <p className="text-muted-foreground italic">Nothing to preview</p>
          )}
        </div>
      )}
    </div>
  );
}
