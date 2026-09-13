/** Renders a date as MM/DD/YYYY, independent of device locale. */
export function formatDate(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}
