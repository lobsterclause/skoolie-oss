/** Minimal cookie jar: enough for an ASP.NET session on a single host (no domain/path matching). */
export class CookieJar {
  private readonly jar = new Map<string, string>();

  absorb(res: Response): void {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const line of setCookies) {
      const first = line.split(";")[0];
      if (!first) continue;
      const eq = first.indexOf("=");
      if (eq < 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (value === "" || /expires=Thu, 01 Jan 1970/i.test(line)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  clear(): void {
    this.jar.clear();
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries(this.jar);
  }

  load(obj: Record<string, string>): void {
    this.jar.clear();
    for (const [k, v] of Object.entries(obj)) this.jar.set(k, v);
  }

  header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  get size(): number {
    return this.jar.size;
  }
}
