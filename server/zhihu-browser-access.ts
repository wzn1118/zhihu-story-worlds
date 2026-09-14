/** Distinguish a page the user can verify from a terminal upstream refusal. */
export function zhihuBrowserAccessIssue(status: number | undefined, body: string, hasVerification: boolean): { kind: 'request-denied' | 'verification'; code?: number } | undefined {
  if (hasVerification) return { kind: 'verification' };
  let code: number | undefined;
  // Chromium's JSON viewer can prepend its “Pretty-print” control label.
  const start = body.indexOf('{');
  if (start >= 0 && /^(?:Pretty-print)?$/i.test(body.slice(0, start).trim()) && body.length < 32_000) {
    try {
      const data = JSON.parse(body.slice(start));
      if (data && typeof data === 'object' && data.error && typeof data.error === 'object' && Number.isSafeInteger(data.error.code)) code = data.error.code;
    } catch { /* A regular article mentioning JSON is not an API error. */ }
  }
  // A 403 HTML shell can redirect asynchronously to a verification page.
  // Only terminal API errors (or a plain rate-limit response) stop refreshing.
  if (code === 40362 || (code !== undefined && (status === 403 || status === 429)) || (status === 429 && /^Too Many Requests$/i.test(body.trim()))) return { kind: 'request-denied', ...(code === undefined ? {} : { code }) };
  return undefined;
}
