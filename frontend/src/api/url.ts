/** All browser requests stay under the portal prefix; the gateway strips it. */
export const apiBaseUrl = new URL(
  import.meta.env.VITE_API_BASE_URL || `${import.meta.env.BASE_URL}api/v1/`,
  location.origin,
);

export function apiUrl(path: string): string {
  return new URL(path, apiBaseUrl).href;
}

export function appUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
