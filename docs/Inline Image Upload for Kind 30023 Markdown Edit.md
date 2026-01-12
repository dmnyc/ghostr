# Inline Image Upload for Kind 30023 Markdown Editor — Spec (Ghostr)

## Context
Habla’s editor uses an image toolbar button that opens an “upload image to Blossom” modal and inserts a preview at the cursor. Ghostr’s Markdown editor shows raw markdown with a preview toggle, so we only need to insert the correct Markdown syntax for inline images.

## Goal
Add an image toolbar button to the long-form Markdown editor that uploads to Blossom and inserts `![alt](url)` at the cursor so the preview and final post render the image inline.

## UX Requirements
- Toolbar button labeled “Image” (or icon + tooltip).
- Clicking opens a file picker or modal to upload to Blossom.
- On success, insert the inline image Markdown at the current cursor position.
- Preview shows the image inline because it is standard Markdown.
- Raw Markdown remains visible in the editor (no WYSIWYG required).

## Markdown Insertion Rules
- Insert format: `![image](https://...)`
- If a text selection exists, use the selection as alt text:
  - `![<selection>](url)`
- If no selection, use default alt text: `image`
- Insert at cursor position; preserve surrounding text.

## Upload Flow
1. User clicks toolbar image button.
2. File picker opens (image types only).
3. Upload to Blossom.
4. On success, insert Markdown into editor content.
5. Cursor placed after inserted Markdown.

## Validation
- Only image MIME types.
- Max size 10MB (consistent with current Ghostr upload rules).
- If not authenticated, show a “Please log in to upload images” error and do not modify content.

## Error Handling
- Upload failure: show error toast, do not insert Markdown.
- Cancel: no content changes.

## Integration Points
- The long-form editors that use the Markdown editor:
  - Delegate long-form draft editor
  - Publisher direct post editor
  - Submission review editor (kind 30023)
  - Edit article editor
- Implemented at the shared `MarkdownEditor` level so all long-form use cases inherit the feature.

## Acceptance Criteria
- Users can upload an image and see the Markdown inserted into the body.
- Preview renders the image inline.
- Published kind 30023 content includes the image in body Markdown.
- No changes to hero/cover image behavior.
- No changes to kind 1 image handling.

## Notes
- This spec intentionally does not require inline WYSIWYG previews in the editor.
- The markdown preview already sanitizes and renders HTML; inline image Markdown should render with no additional changes.
