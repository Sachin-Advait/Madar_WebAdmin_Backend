import type {
  Catalog,
  LayoutResponse,
  PageLayout,
  PreviewResponse,
  Resource,
  Screen,
  TVProfile,
  User,
} from "./types";
const KEY = "madar_session_token";
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
export const getToken = () =>
  import.meta.env.VITE_SHOWCASE === "1"
    ? "preview"
    : sessionStorage.getItem(KEY) || "";
export const setToken = (token: string) => {
  if (token) sessionStorage.setItem(KEY, token);
  else sessionStorage.removeItem(KEY);
};

export async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (import.meta.env.VITE_SHOWCASE === "1")
    return (await import("./showcase-api")).showcaseRequest<T>(path, options);
  const headers = new Headers(options.headers || {});
  headers.set("X-Madar-Request", "1");
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      `Cannot connect to MADAR API at ${BASE_URL || "this origin"}. Start the MADAR API on port 8000.`,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : detail?.message ||
            JSON.stringify(detail) ||
            `Request failed (${response.status})`,
    );
  }
  return data as T;
}
const body = (value: unknown) => JSON.stringify(value);
export const API = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: body({ email, password }),
    }),
  me: () => request<User>("/api/admin/me"),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  catalog: () => request<Catalog>("/api/admin/catalog"),
  overview: () => request<any>("/api/admin/overview"),
  resources: (kind: string, query = "", published = false) =>
    request<Resource[]>(
      `/api/admin/resources/${kind}?query=${encodeURIComponent(query)}&published=${published ? 1 : 0}`,
    ),
  addResource: (kind: string, payload: Record<string, unknown>) =>
    request<Resource>(`/api/admin/resources/${kind}`, {
      method: "POST",
      body: body({ payload }),
    }),
  updateResource: (
    kind: string,
    id: string,
    payload: Record<string, unknown>,
  ) =>
    request<Resource>(`/api/admin/resources/${kind}/${id}`, {
      method: "PUT",
      body: body({ payload, expectedRevision: payload.revision }),
    }),
  deleteResource: (kind: string, id: string) =>
    request(`/api/admin/resources/${kind}/${id}`, { method: "DELETE" }),
  layout: (page: string, profile: string) =>
    request<LayoutResponse>(
      `/api/admin/layouts/${page}?profileId=${encodeURIComponent(profile)}`,
    ),
  saveLayout: (
    page: string,
    profile: string,
    layout: PageLayout,
    expectedRevision: number,
  ) =>
    request<{ revision: number }>(
      `/api/admin/layouts/${page}?profileId=${encodeURIComponent(profile)}`,
      { method: "PUT", body: body({ layout, expectedRevision }) },
    ),
  publish: (page: string, profile: string, expectedRevision: number) =>
    request<{ publishedVersion: number }>(
      `/api/admin/layouts/${page}/publish?profileId=${encodeURIComponent(profile)}`,
      { method: "POST", body: body({ expectedRevision }) },
    ),
  versions: (page: string, profile: string) =>
    request<{ version: number; publishedAt: string; publishedBy: string }[]>(
      `/api/admin/layouts/${page}/versions?profileId=${encodeURIComponent(profile)}`,
    ),
  rollback: (
    page: string,
    profile: string,
    version: number,
    expectedRevision: number,
  ) =>
    request(
      `/api/admin/layouts/${page}/rollback?profileId=${encodeURIComponent(profile)}`,
      { method: "POST", body: body({ version, expectedRevision }) },
    ),
  preview: (page: string, profile: string, mode: "draft" | "published") =>
    request<PreviewResponse>(
      `/api/admin/preview/${page}?profileId=${encodeURIComponent(profile)}&mode=${mode}`,
    ),
  profiles: () => request<TVProfile[]>("/api/admin/profiles"),
  createProfile: (payload: TVProfile) =>
    request("/api/admin/profiles", { method: "POST", body: body(payload) }),
  updateProfile: (id: string, payload: TVProfile) =>
    request(`/api/admin/profiles/${id}`, {
      method: "PUT",
      body: body(payload),
    }),
  screens: () => request<Screen[]>("/api/admin/screens"),
  createScreen: (payload: Omit<Screen, "id" | "lastSeen">) =>
    request<any>("/api/admin/screens", { method: "POST", body: body(payload) }),
  updateScreen: (id: string, payload: Omit<Screen, "id" | "lastSeen">) =>
    request<any>(`/api/admin/screens/${id}`, {
      method: "PUT",
      body: body(payload),
    }),
  rotateKey: (id: string) =>
    request<{ screenKey: string }>(`/api/admin/screens/${id}/rotate-key`, {
      method: "POST",
    }),
  settings: () => request<Record<string, any>>("/api/admin/settings"),
  updateSettings: (values: Record<string, unknown>) =>
    request("/api/admin/settings", { method: "PUT", body: body(values) }),
  audit: () => request<any[]>("/api/admin/audit"),
  users: () => request<User[]>("/api/admin/users"),
  createUser: (payload: Record<string, unknown>) =>
    request("/api/admin/users", { method: "POST", body: body(payload) }),
  schedules: () => request<any[]>("/api/admin/schedules"),
  createSchedule: (p: unknown) =>
    request("/api/admin/schedules", { method: "POST", body: body(p) }),
  updateSchedule: (id: string, p: unknown) =>
    request("/api/admin/schedules/" + id, { method: "PUT", body: body(p) }),
  deleteSchedule: (id: string) =>
    request("/api/admin/schedules/" + id, { method: "DELETE" }),
  updateUser: (id: string, p: unknown) =>
    request("/api/admin/users/" + id, { method: "PUT", body: body(p) }),
  uploadAsset: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ url: string }>("/api/admin/assets/upload", {
      method: "POST",
      body: form,
    });
  },
};
