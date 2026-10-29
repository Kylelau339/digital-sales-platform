export interface Presentation {
  render(options: Record<string, unknown>): string;
  translate(key: string, vars?: Record<string, unknown>): string;
  policy(): string;
  refundDialog(detail: Record<string, unknown>, mode: 'approve' | 'reject'): string;
  takedownDialog(template: Record<string, unknown>): string;
}
export function createPresentation(data: Record<string, unknown>, dictionaries: Record<string, Record<string, string>>): Presentation;
