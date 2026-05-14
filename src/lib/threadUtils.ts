export const THREAD_DELIMITER = '\n---\n'
export const THREAD_DELIMITER_PATTERN = /\n\s*-{2,}\s*\n/g

export function splitThreadPosts(value: string): string[] {
  return value.split(THREAD_DELIMITER_PATTERN).map((post) => post.trim()).filter(Boolean)
}

export function joinThreadPosts(posts: string[]): string {
  return posts.map((post) => post.trim()).filter(Boolean).join(THREAD_DELIMITER)
}

export function hasThreadMarker(tags: string[][]): boolean {
  return tags.some((tag) => tag[0] === 'ghostr-thread' && tag[1] === 'true')
}

export function stripThreadMarker(tags: string[][]): string[][] {
  return tags.filter((tag) => tag[0] !== 'ghostr-thread')
}
