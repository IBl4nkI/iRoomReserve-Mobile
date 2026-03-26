import { auth } from "@/services/firebase";

interface ApiRequestOptions {
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  params?: Record<string, string | number | boolean | null | undefined>;
}

function getApiBaseUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");

  if (!baseUrl) {
    throw new Error(
      "EXPO_PUBLIC_API_BASE_URL is not set. Point it to the deployed web app URL."
    );
  }

  return baseUrl;
}

function buildUrl(pathname: string, params?: ApiRequestOptions["params"]) {
  const url = new URL(`${getApiBaseUrl()}${pathname}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

export async function apiRequest<T>(
  pathname: string,
  { body, method = "GET", params }: ApiRequestOptions = {}
): Promise<T> {
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : null;

  const response = await fetch(buildUrl(pathname, params), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(currentUser?.uid ? { "x-user-id": currentUser.uid } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The request failed.");
  }

  return payload as T;
}
