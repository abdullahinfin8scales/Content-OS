const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Random, URL-safe id. Uses getRandomValues (available outside secure contexts,
 * unlike crypto.randomUUID) so the app also works when served over plain http.
 */
export function uid(size = 14): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = '';
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}
