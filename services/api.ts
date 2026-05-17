import { auth } from "@/services/firebase";

interface ApiRequestOptions {
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  params?: Record<string, string | number | boolean | null | undefined>;
}

export class ApiRequestError extends Error {
  code?: string;
  details?: unknown;
  status: number;

  constructor(
    message: string,
    options: { code?: string; details?: unknown; status: number }
  ) {
    super(message);
    this.name = "ApiRequestError";
    Object.setPrototypeOf(this, new.target.prototype);
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

function getApiBaseUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");

  if (!baseUrl) {
    throw new Error("Reservation service is not configured for this app.");
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
    | { error?: { code?: string; details?: unknown; message?: string } }
    | null;

  if (!response.ok) {
    throw new ApiRequestError(payload?.error?.message ?? "The request failed.", {
      code: payload?.error?.code,
      details: payload?.error?.details,
      status: response.status,
    });
  }

  return payload as T;
}
