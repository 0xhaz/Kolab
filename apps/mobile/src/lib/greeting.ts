export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** "siti.reviews@gmail.com" → "Siti" */
export function firstName(displayName: string | null | undefined, email: string | null | undefined): string {
  const raw = displayName ?? email?.split('@')[0] ?? 'there';
  const first = raw.split(/[\s._-]+/)[0] ?? raw;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
