import { useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Code,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { parseMarkdown } from '@/lib/utils/markdown'
import { cn } from '@/lib/utils/cn'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Write your content here...',
  disabled = false,
  className,
}: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertMarkdown = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = value.substring(start, end) || defaultText

    const newValue =
      value.substring(0, start) +
      before +
      selectedText +
      after +
      value.substring(end)

    onChange(newValue)

    // Restore focus and selection
    setTimeout(() => {
      textarea.focus()
      const newCursorPos = start + before.length + selectedText.length
      textarea.setSelectionRange(start + before.length, newCursorPos)
    }, 0)
  }

  const handleBold = () => insertMarkdown('**', '**', 'bold text')
  const handleItalic = () => insertMarkdown('*', '*', 'italic text')

  const handleLink = () => {
    const url = prompt('Enter URL:')
    if (url) {
      insertMarkdown('[', `](${url})`, 'link text')
    }
  }

  const handleBulletList = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const needsNewline = start > 0 && value.charAt(start - 1) !== '\n'
    const prefix = (needsNewline ? '\n' : '') + '- '

    insertMarkdown(prefix, '', 'list item')
  }

  const handleNumberedList = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const needsNewline = start > 0 && value.charAt(start - 1) !== '\n'
    const prefix = (needsNewline ? '\n' : '') + '1. '

    insertMarkdown(prefix, '', 'list item')
  }

  const handleQuote = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const previousChar = start > 0 ? value.charAt(start - 1) : ''
    const before = start === 0 || previousChar === '\n' ? '> ' : '\n> '

    insertMarkdown(before, '', 'quote')
  }

  const handleCode = () => insertMarkdown('`', '`', 'code')

  const handleKeydown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault()
      handleBold()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault()
      handleItalic()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      handleLink()
    }
  }

  return (
    <div className={cn('rounded-lg border overflow-hidden', className)}>
      {/* Tabs */}
      <div className="flex border-b bg-muted/30">
        <button
          type="button"
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'write'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('write')}
        >
          Write
        </button>
        <button
          type="button"
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'preview'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('preview')}
        >
          Preview
        </button>
      </div>

      {activeTab === 'write' ? (
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

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeydown}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[400px] rounded-none border-0 resize-y font-mono focus-visible:ring-0"
          />
        </>
      ) : (
        /* Preview */
        <div className="p-4 min-h-[400px] prose prose-sm dark:prose-invert max-w-none">
          {value.trim() ? (
            <div dangerouslySetInnerHTML={{ __html: parseMarkdown(value) }} />
          ) : (
            <p className="text-muted-foreground italic">Nothing to preview</p>
          )}
        </div>
      )}
    </div>
  )
}
