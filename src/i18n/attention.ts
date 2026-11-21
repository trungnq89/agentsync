import type { AttentionItem } from '@/server/tasks/queries';

type T = (key: string, values?: Record<string, string | number | Date>) => string;

/** Detail line of an attention item; `t` is a translator for the `attention` namespace. */
export function attentionDetail(t: T, item: Pick<AttentionItem, 'detail' | 'detailKey' | 'detailParams'>): string {
  return item.detailKey ? t(`detail.${item.detailKey}`, item.detailParams) : item.detail;
}
