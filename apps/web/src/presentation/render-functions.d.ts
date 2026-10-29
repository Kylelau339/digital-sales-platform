export interface Presentation {
  render(options: Record<string, unknown>): string;
  translate(key: string, vars?: Record<string, unknown>): string;
  policy(): string;
}
export function createPresentation(data: Record<string, unknown>, dictionaries: Record<string, Record<string, string>>): Presentation;
