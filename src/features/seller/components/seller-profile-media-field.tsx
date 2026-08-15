import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { supabase } from "@/lib/supabase/client";

import {
  finalizeMySellerProfileAssetUpload,
  prepareMySellerProfileAssetUpload,
} from "../seller-profile-media.functions";
import {
  SELLER_PROFILE_IMAGE_BUCKET,
  SELLER_PROFILE_IMAGE_MAX_SIZE_BYTES,
  type SellerProfileAssetKind,
} from "../seller-profile-media.types";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function SellerProfileMediaField({
  kind,
  assetId,
  disabled,
  onSelect,
  onRemove,
  onBusyChange,
}: {
  kind: SellerProfileAssetKind;
  assetId: string | null;
  disabled: boolean;
  onSelect(assetId: string): Promise<void>;
  onRemove(): Promise<void>;
  onBusyChange(busy: boolean): void;
}) {
  const prepare = useServerFn(prepareMySellerProfileAssetUpload);
  const finalize = useServerFn(finalizeMySellerProfileAssetUpload);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === "logo" ? "Logo" : "Cover image";

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !acceptedTypes.has(file.type) ||
      file.size < 1 ||
      file.size > SELLER_PROFILE_IMAGE_MAX_SIZE_BYTES
    ) {
      setError("Choose a non-empty JPEG, PNG, or WebP image no larger than 20 MB.");
      return;
    }

    setBusyState(true);
    setError(null);
    try {
      const prepared = await prepare({
        data: {
          kind,
          originalFilename: file.name,
          contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
          sizeBytes: file.size,
          requestId: crypto.randomUUID(),
        },
      });
      if (!prepared.uploadPath || !prepared.uploadToken) {
        if (prepared.asset.status !== "available")
          throw new Error("seller_profile_image_not_ready");
      } else {
        const uploaded = await supabase.storage
          .from(SELLER_PROFILE_IMAGE_BUCKET)
          .uploadToSignedUrl(prepared.uploadPath, prepared.uploadToken, file, {
            contentType: file.type,
            upsert: false,
          });
        if (uploaded.error) throw new Error("seller_profile_image_storage_unavailable");
      }

      const finalized = await finalize({ data: { assetId: prepared.asset.assetId } });
      if (finalized.status !== "available") throw new Error("seller_profile_image_not_ready");
      await onSelect(finalized.assetId);
    } catch (uploadError) {
      setError(mediaErrorMessage(uploadError));
    } finally {
      setBusyState(false);
    }
  }

  async function remove() {
    setBusyState(true);
    setError(null);
    try {
      await onRemove();
    } catch (removeError) {
      setError(mediaErrorMessage(removeError));
    } finally {
      setBusyState(false);
    }
  }

  function setBusyState(next: boolean) {
    setBusy(next);
    onBusyChange(next);
  }

  return (
    <section className="flex flex-col gap-3 border border-border bg-muted/20 p-4">
      <div>
        <h2 className="text-sm font-semibold">{label}</h2>
        <p className="text-xs text-muted-foreground">
          Private until an administrator approves this profile revision.
        </p>
      </div>
      <AuthenticatedSellerProfileImage assetId={assetId} kind={kind} />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => void upload(event)}
        disabled={disabled || busy}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy
            ? "Working…"
            : assetId
              ? `Replace ${label.toLowerCase()}`
              : `Upload ${label.toLowerCase()}`}
        </button>
        {assetId ? (
          <button
            type="button"
            className="border border-destructive/50 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60"
            disabled={disabled || busy}
            onClick={() => void remove()}
          >
            Remove
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}

function AuthenticatedSellerProfileImage({
  assetId,
  kind,
}: {
  assetId: string | null;
  kind: SellerProfileAssetKind;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let currentUrl: string | null = null;
    const controller = new AbortController();
    setObjectUrl(null);
    setUnavailable(false);
    if (!assetId) return () => controller.abort();

    void (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) throw new Error("authentication_required");
        const response = await fetch(`/v1/seller-profile-assets/${assetId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("seller_profile_image_not_found");
        currentUrl = URL.createObjectURL(await response.blob());
        setObjectUrl(currentUrl);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setUnavailable(true);
      }
    })();

    return () => {
      controller.abort();
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [assetId]);

  const shape = kind === "logo" ? "aspect-square max-w-40" : "aspect-[3/1] w-full";
  if (!assetId || unavailable || !objectUrl) {
    return (
      <div
        className={`${shape} grid place-items-center border border-dashed border-border bg-muted text-xs text-muted-foreground`}
      >
        {assetId && !unavailable
          ? "Loading image…"
          : `${kind === "logo" ? "Logo" : "Cover"} placeholder`}
      </div>
    );
  }
  return <img src={objectUrl} alt={`Current seller ${kind}`} className={`${shape} object-cover`} />;
}

function mediaErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("seller_profile_revision_conflict")) {
    return "The profile changed elsewhere. Reload the page and try again.";
  }
  if (message.includes("seller_profile_image_invalid")) {
    return "The selected file is not a valid supported image.";
  }
  if (message.includes("seller_profile_image_cleanup_required")) {
    return "The profile was updated, but old image cleanup must be retried.";
  }
  if (message.includes("seller_profile_image_not_ready")) {
    return "The image is not ready. Select the file again or retry shortly.";
  }
  return "The seller profile image is temporarily unavailable.";
}
