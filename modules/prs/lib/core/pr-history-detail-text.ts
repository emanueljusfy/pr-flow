/**
 * Visible-text approximation of a markdown/HTML comment body, used to decide
 * whether the detail is long enough to collapse. Bot comments (CodeRabbit etc.)
 * carry lots of hidden HTML comments and tags that should not count.
 */
export function prHistoryDetailVisibleText(detail: string): string {
  return detail
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
