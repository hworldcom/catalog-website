import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { supabase } from "@/lib/supabase/client";
import { tr } from "@/lib/i18n";

import {
  finalizeMySellerProfileAssetUpload,
  prepareMySellerProfileAssetUpload,
} from "../seller-profile-media.functions";
import type { SellerProfileMediaPreview } from "../seller-profile-moderation.types";
import {
  SELLER_PROFILE_IMAGE_BUCKET,
  SELLER_PROFILE_IMAGE_MAX_SIZE_BYTES,
  type SellerProfileAssetKind,
} from "../seller-profile-media.types";
import { sellerProfileMediaCopy, storefrontCopy } from "../storefront.copy";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function SellerProfileMediaField({
  kind,
  preview,
  disabled,
  onSelect,
  onRemove,
  onBusyChange,
  onPreviewRefresh,
}: {
  kind: SellerProfileAssetKind;
  preview: SellerProfileMediaPreview | null;
  disabled: boolean;
  onSelect(assetId: string): Promise<void>;
  onRemove(): Promise<void>;
  onBusyChange(busy: boolean): void;
  onPreviewRefresh(): Promise<void>;
}) {
  const prepare = useServerFn(prepareMySellerProfileAssetUpload);
  const finalize = useServerFn(finalizeMySellerProfileAssetUpload);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assetId = preview?.assetId ?? null;
  const label = tr(kind === "logo" ? sellerProfileMediaCopy.logo : sellerProfileMediaCopy.cover);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !acceptedTypes.has(file.type) ||
      file.size < 1 ||
      file.size > SELLER_PROFILE_IMAGE_MAX_SIZE_BYTES
    ) {
      setError(tr(sellerProfileMediaCopy.chooseFile));
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
        <p className="text-xs text-muted-foreground">{tr(sellerProfileMediaCopy.privateHelp)}</p>
      </div>
      <SellerProfileMediaPreviewImage
        preview={preview}
        kind={kind}
        onPreviewRefresh={onPreviewRefresh}
      />
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
            ? tr(sellerProfileMediaCopy.working)
            : `${tr(assetId ? sellerProfileMediaCopy.replace : sellerProfileMediaCopy.upload)} ${label.toLowerCase()}`}
        </button>
        {assetId ? (
          <button
            type="button"
            className="border border-destructive/50 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60"
            disabled={disabled || busy}
            onClick={() => void remove()}
          >
            {tr(sellerProfileMediaCopy.remove)}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}

export function SellerProfileMediaPreviewImage({
  preview,
  kind,
  onPreviewRefresh,
}: {
  preview: SellerProfileMediaPreview | null;
  kind: SellerProfileAssetKind;
  onPreviewRefresh?: () => Promise<void>;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const refreshedAssetId = useRef<string | null>(null);
  const onPreviewRefreshRef = useRef(onPreviewRefresh);
  const assetId = preview?.assetId ?? null;
  const deliveryUrl = preview?.deliveryStatus === "available" ? preview.url : null;

  useEffect(() => {
    onPreviewRefreshRef.current = onPreviewRefresh;
  }, [onPreviewRefresh]);

  useEffect(() => {
    let currentUrl: string | null = null;
    const controller = new AbortController();
    setObjectUrl(null);
    setUnavailable(false);
    if (!assetId || !deliveryUrl) return () => controller.abort();

    void (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          if (!token) throw new Error("authentication_required");
          const response = await fetch(deliveryUrl, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("seller_profile_image_not_found");
          currentUrl = URL.createObjectURL(await response.blob());
          setObjectUrl(currentUrl);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (
            attempt === 0 &&
            onPreviewRefreshRef.current &&
            refreshedAssetId.current !== assetId
          ) {
            refreshedAssetId.current = assetId;
            await onPreviewRefreshRef.current();
            continue;
          }
          setUnavailable(true);
          return;
        }
      }
    })();

    return () => {
      controller.abort();
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [assetId, deliveryUrl]);

  const shape = kind === "logo" ? "aspect-square max-w-40" : "aspect-[3/1] w-full";
  if (!assetId || unavailable || !objectUrl) {
    return (
      <div
        className={`${shape} grid place-items-center border border-dashed border-border bg-muted text-xs text-muted-foreground`}
      >
        {assetId && deliveryUrl && !unavailable
          ? tr(sellerProfileMediaCopy.loading)
          : tr(sellerProfileMediaCopy.placeholder)}
      </div>
    );
  }
  return (
    <img
      src={objectUrl}
      alt={tr(kind === "logo" ? sellerProfileMediaCopy.logo : sellerProfileMediaCopy.cover)}
      className={`${shape} object-cover`}
    />
  );
}

function mediaErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("seller_profile_revision_conflict")) {
    return tr(storefrontCopy.revisionConflict);
  }
  if (message.includes("seller_profile_image_invalid")) {
    return tr(sellerProfileMediaCopy.invalid);
  }
  if (message.includes("seller_profile_image_cleanup_required")) {
    return tr(sellerProfileMediaCopy.cleanup);
  }
  if (message.includes("seller_profile_image_not_ready")) {
    return tr(sellerProfileMediaCopy.notReady);
  }
  return tr(sellerProfileMediaCopy.unavailable);
}
