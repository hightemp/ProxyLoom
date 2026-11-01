/** Writes text after a user gesture; false when the browser refuses (no focus or permission). */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
