import { auth } from "@/services/firebase";

interface UploadReservationDocumentInput {
  file: {
    mimeType: string;
    name: string;
    size?: number | null;
    uri: string;
  };
  reservationId?: string;
}

export interface UploadedReservationDocument {
  bucket: string;
  contentType: string;
  name: string;
  path: string;
  size: number;
}

function getApiBaseUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");

  if (!baseUrl) {
    throw new Error("Reservation service is not configured for this app.");
  }

  return baseUrl;
}

export async function uploadReservationDocument(
  input: UploadReservationDocumentInput
): Promise<UploadedReservationDocument> {
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : null;
  const formData = new FormData();

  formData.append("file", {
    name: input.file.name,
    type: input.file.mimeType,
    uri: input.file.uri,
  } as unknown as Blob);

  if (input.reservationId?.trim()) {
    formData.append("reservationId", input.reservationId.trim());
  }

  const response = await fetch(`${getApiBaseUrl()}/api/reservations/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(currentUser?.uid ? { "x-user-id": currentUser.uid } : {}),
    },
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as
    | UploadedReservationDocument
    | { error?: { message?: string } }
    | null;

  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error?.message
        ? payload.error.message
        : "The file upload failed.";

    throw new Error(
      errorMessage
    );
  }

  return payload as UploadedReservationDocument;
}
