/** A tiny fake JPEG (valid magic bytes, chosen size) as a data URL, for the ID verification tests. */
export const jpeg = (bytes = 8000, head: number[] = [0xff, 0xd8, 0xff, 0xe0]): string => {
  const a = new Uint8Array(bytes); a.set(head); let s = ''
  for (const b of a) s += String.fromCharCode(b)
  return `data:image/jpeg;base64,${btoa(s)}`
}
