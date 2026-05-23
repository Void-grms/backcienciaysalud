export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  perPage: number,
): Paginated<T> {
  return { items, total, page, perPage };
}
