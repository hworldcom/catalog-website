import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import type { ProductDraftFactsEditorState } from "@/features/product-draft-facts/components/product-draft-facts-editor";
import { listCategoriesForPicker } from "@/features/seller/categories.functions";
import {
  getMyProductPublication,
  publishMyProduct,
  retryMyProductPublication,
} from "@/features/seller/product-publication.functions";
import type {
  SellerProductImagePublicationMode,
  SellerProductPublicationSnapshot,
  SellerProductPublicationStatus,
} from "@/features/seller/seller-product-publication.types";
import { saveMyProduct } from "@/features/seller/products.functions";

import { Field } from "./field";
import { ImageUpload } from "./image-upload";

type ProductInitial = {
  id: string;
  title: string;
  title_source: "human" | "model" | null;
  description: string | null;
  category_id: string | null;
  moq: number | null;
  pack_size: string | null;
  price: number | string | null;
  currency: string;
  stock: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
  cover_image_url: string | null;
  trending: boolean;
  status: "draft" | "published" | "archived";
  imagePublicationMode?: SellerProductImagePublicationMode;
} | null;

type ProductForm = {
  id: string | undefined;
  title: string;
  description: string;
  category_id: string;
  moq: string;
  pack_size: string;
  price: string;
  currency: string;
  stock: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
  cover_image_url: string;
  trending: boolean;
};

const cleanFactsState: ProductDraftFactsEditorState = {
  dirty: false,
  saving: false,
};

export function ProductEditor({
  initial,
  factsState = cleanFactsState,
  onSaved,
}: {
  initial: ProductInitial;
  factsState?: ProductDraftFactsEditorState;
  onSaved?: (id: string) => void;
}) {
  const save = useServerFn(saveMyProduct);
  const publish = useServerFn(publishMyProduct);
  const getPublication = useServerFn(getMyProductPublication);
  const retryPublication = useServerFn(retryMyProductPublication);
  const listCats = useServerFn(listCategoriesForPicker);
  const queryClient = useQueryClient();
  const cats = useQuery({ queryKey: ["cats-picker"], queryFn: () => listCats() });

  const [form, setForm] = useState<ProductForm>(() => productForm(initial));
  const [busy, setBusy] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [titleSource, setTitleSource] = useState(initial?.title_source ?? null);
  const [publicationSnapshot, setPublicationSnapshot] =
    useState<SellerProductPublicationSnapshot | null>(null);
  const completionHandled = useRef(initial?.status === "published");

  const productId = initial?.id ?? null;
  const imagePublicationMode = initial?.imagePublicationMode ?? "direct";
  const isImported = imagePublicationMode === "imported";
  const isPublished = initial?.status === "published";
  const publicationQuery = useQuery({
    queryKey: ["my-product-publication", productId],
    queryFn: () => getPublication({ data: { productDraftId: productId! } }),
    enabled: Boolean(productId && isImported),
    retry: false,
    refetchInterval: (query) =>
      isActivePublication(query.state.data?.publicationStatus) ? 2_000 : false,
  });
  const currentPublication = publicationSnapshot ?? publicationQuery.data ?? null;
  const publicationActive = isActivePublication(currentPublication?.publicationStatus);

  useEffect(() => {
    if (!initial) return;
    setForm(productForm(initial));
    setTitleTouched(false);
    setDescriptionTouched(false);
    setTitleSource(initial.title_source);
  }, [initial]);

  useEffect(() => {
    if (publicationQuery.data) setPublicationSnapshot(publicationQuery.data);
  }, [publicationQuery.data]);

  useEffect(() => {
    const completed =
      currentPublication?.publicationStatus === "completed" ||
      (currentPublication?.publicationStatus === "not_required" &&
        currentPublication.productStatus === "published");
    if (!completed || completionHandled.current || !productId) return;
    completionHandled.current = true;

    void refreshCompletedProduct(queryClient, productId).then(() => {
      toast.success("Product and images were published.");
    });
  }, [currentPublication, productId, queryClient]);

  async function submitDraft() {
    setBusy(true);
    try {
      const res = await save({
        data: {
          ...productFields(form, {
            includeCover: !isImported,
            titleTouched,
            descriptionTouched,
          }),
          id: form.id,
          publish: isPublished,
        },
      });
      applySavedProduct(res);
      await refreshSavedProduct(queryClient, form.id, initial?.status, res.status);
      toast.success(isPublished ? "Changes saved" : "Draft saved");
      if (!form.id && onSaved) onSaved(res.id);
    } catch (error) {
      if (publicationErrorCode(error) === "product_publication_not_allowed" && form.id) {
        await queryClient.invalidateQueries({ queryKey: ["my-product", form.id] });
      }
      toast.error(publicationErrorMessage(error, "Product could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function submitPublication() {
    if (!form.id) {
      await submitNewProductPublication();
      return;
    }
    if (factsState.dirty || factsState.saving) return;

    setBusy(true);
    try {
      const snapshot = await publish({
        data: {
          ...productFields(form, {
            includeCover: !isImported,
            titleTouched,
            descriptionTouched,
          }),
          id: form.id,
        },
      });
      replacePublicationSnapshot(snapshot);
      if (snapshot.publicationStatus === "pending" || snapshot.publicationStatus === "running") {
        toast.success("Publication started.");
      }
    } catch (error) {
      const code = publicationErrorCode(error);
      if (code === "product_publication_in_progress") {
        await observeCurrentPublication();
      }
      if (code === "product_publication_not_allowed") {
        await queryClient.invalidateQueries({ queryKey: ["my-product", form.id] });
      }
      toast.error(publicationErrorMessage(error, "Product could not be published."));
    } finally {
      setBusy(false);
    }
  }

  async function submitNewProductPublication() {
    setBusy(true);
    try {
      const res = await save({
        data: {
          ...productFields(form, {
            includeCover: true,
            titleTouched: true,
            descriptionTouched: true,
          }),
          publish: true,
        },
      });
      applySavedProduct(res);
      await refreshSavedProduct(queryClient, null, null, res.status);
      toast.success("Published");
      onSaved?.(res.id);
    } catch (error) {
      toast.error(publicationErrorMessage(error, "Product could not be published."));
    } finally {
      setBusy(false);
    }
  }

  async function observeCurrentPublication() {
    if (!form.id) return;
    const result = await publicationQuery.refetch();
    if (result.data) replacePublicationSnapshot(result.data);
  }

  async function retryDurablePublication() {
    if (!form.id) return;
    setBusy(true);
    try {
      const snapshot = await retryPublication({
        data: { productDraftId: form.id },
      });
      replacePublicationSnapshot(snapshot);
      toast.success("Publication retry started.");
    } catch (error) {
      toast.error(publicationErrorMessage(error, "Publication could not be retried."));
    } finally {
      setBusy(false);
    }
  }

  function applySavedProduct(saved: { title: string; titleSource: "human" | "model" | null }) {
    setForm((current) => ({ ...current, title: saved.title }));
    setTitleTouched(false);
    setDescriptionTouched(false);
    setTitleSource(saved.titleSource);
  }

  function replacePublicationSnapshot(snapshot: SellerProductPublicationSnapshot) {
    setPublicationSnapshot(snapshot);
    queryClient.setQueryData(["my-product-publication", snapshot.productDraftId], snapshot);
  }

  const inputCls = "border border-border bg-background px-3 py-2 text-sm";
  const titleReadOnly = initial?.status === "published" || initial?.status === "archived";
  const descriptionReadOnly = titleReadOnly;
  const publishBlockedByFacts = factsState.dirty || factsState.saving;
  const actionsDisabled = busy || publicationActive;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {initial ? "Edit product" : "New product"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPublished ? "Live on your storefront." : "Draft — not visible to buyers yet."}
          </p>
        </div>
        <Link to="/seller/products" className="text-xs text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </div>

      {initial && isImported ? (
        <PublicationStatus
          snapshot={currentPublication}
          statusReadFailed={publicationQuery.isError}
          busy={busy}
          onRefresh={() => void observeCurrentPublication()}
          onRetry={() => void retryDurablePublication()}
        />
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitDraft();
        }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <div className="md:col-span-2">
          <Field label="Title">
            <input
              value={form.title}
              onChange={(event) => {
                setForm({ ...form, title: event.target.value });
                setTitleTouched(true);
              }}
              className={inputCls}
              disabled={titleReadOnly}
            />
          </Field>
          {titleSource ? (
            <span className="mt-1 block text-xs text-muted-foreground">
              Source: {titleSource === "human" ? "Human" : "Model suggestion"}
            </span>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <Field label="Description">
            <textarea
              rows={6}
              value={form.description}
              onChange={(event) => {
                setForm({ ...form, description: event.target.value });
                setDescriptionTouched(true);
              }}
              className={inputCls}
              disabled={descriptionReadOnly}
            />
          </Field>
        </div>
        <Field label="Category">
          <select
            value={form.category_id}
            onChange={(event) => setForm({ ...form, category_id: event.target.value })}
            className={inputCls}
          >
            <option value="">— none —</option>
            {cats.data?.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stock">
          <select
            value={form.stock}
            onChange={(event) =>
              setForm({ ...form, stock: event.target.value as ProductForm["stock"] })
            }
            className={inputCls}
          >
            <option value="in_stock">In stock</option>
            <option value="low_stock">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="made_to_order">Made to order</option>
          </select>
        </Field>
        <Field label="MOQ">
          <input
            type="number"
            min={0}
            value={form.moq}
            onChange={(event) => setForm({ ...form, moq: event.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Pack size">
          <input
            value={form.pack_size}
            onChange={(event) => setForm({ ...form, pack_size: event.target.value })}
            className={inputCls}
            placeholder="e.g. 12 per box"
          />
        </Field>
        <Field label="Price (per unit)">
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.price}
            onChange={(event) => setForm({ ...form, price: event.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Currency">
          <input
            value={form.currency}
            onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })}
            className={inputCls}
            maxLength={6}
          />
        </Field>
        {!isImported ? (
          <div className="md:col-span-2">
            <ImageUpload
              label="Cover image"
              folder="products"
              value={form.cover_image_url}
              onChange={(url) => setForm({ ...form, cover_image_url: url })}
            />
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.trending}
            onChange={(event) => setForm({ ...form, trending: event.target.checked })}
          />
          Mark as trending (may feature on marketplace home)
        </label>

        {publishBlockedByFacts && !isPublished ? (
          <p className="text-sm text-amber-700 md:col-span-2">
            Save optional product details before publishing.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button
            type="submit"
            disabled={actionsDisabled}
            className="border border-border bg-card px-4 py-2.5 text-sm font-medium hover:border-primary disabled:opacity-60"
          >
            {isPublished ? "Save changes" : "Save draft"}
          </button>
          {!isPublished ? (
            <button
              type="button"
              disabled={actionsDisabled || publishBlockedByFacts}
              onClick={() => void submitPublication()}
              className="bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Publish
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function PublicationStatus({
  snapshot,
  statusReadFailed,
  busy,
  onRefresh,
  onRetry,
}: {
  snapshot: SellerProductPublicationSnapshot | null;
  statusReadFailed: boolean;
  busy: boolean;
  onRefresh(): void;
  onRetry(): void;
}) {
  const status = snapshot?.publicationStatus;
  const active = isActivePublication(status);
  const failed = status === "failed" || status === "cleanup_required";

  return (
    <section className="border border-border bg-card p-4 text-sm" aria-live="polite">
      <h2 className="font-medium">{publicationStatusTitle(status)}</h2>
      <p className="mt-1 text-muted-foreground">
        {publicationStatusDescription(status, snapshot?.errorCode ?? null)}
      </p>
      {statusReadFailed ? (
        <div className="mt-3">
          <p className="text-destructive">
            Publication status could not be refreshed. The last known state is preserved.
          </p>
          <button
            type="button"
            className="mt-2 border border-border px-3 py-1.5"
            onClick={onRefresh}
          >
            Refresh status
          </button>
        </div>
      ) : null}
      {failed && snapshot?.retryAllowed ? (
        <button
          type="button"
          disabled={busy}
          className="mt-3 border border-border px-3 py-1.5 disabled:opacity-60"
          onClick={onRetry}
        >
          Retry publication
        </button>
      ) : null}
      {failed && !snapshot?.retryAllowed ? (
        <p className="mt-3 text-muted-foreground">
          Contact support before trying to publish this product again.
        </p>
      ) : null}
      {status === "completed" &&
      snapshot.productStatus === "published" &&
      snapshot.publicProductUrl ? (
        <Link
          to="/p/$productId"
          params={{ productId: snapshot.productDraftId }}
          search={(previous) => previous}
          className="mt-3 inline-block text-primary underline"
        >
          View published product
        </Link>
      ) : null}
      {active ? <span className="sr-only">Publication status refreshes automatically.</span> : null}
    </section>
  );
}

function productForm(initial: ProductInitial): ProductForm {
  return {
    id: initial?.id,
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category_id: initial?.category_id ?? "",
    moq: initial?.moq != null ? String(initial.moq) : "",
    pack_size: initial?.pack_size ?? "",
    price: initial?.price != null ? String(initial.price) : "",
    currency: initial?.currency ?? "USD",
    stock: initial?.stock ?? "in_stock",
    cover_image_url: initial?.cover_image_url ?? "",
    trending: initial?.trending ?? false,
  };
}

function productFields(
  form: ProductForm,
  options: {
    includeCover: boolean;
    titleTouched: boolean;
    descriptionTouched: boolean;
  },
) {
  return {
    ...(!form.id || options.titleTouched ? { title: form.title } : {}),
    ...(!form.id || options.descriptionTouched ? { description: form.description } : {}),
    category_id: form.category_id || null,
    moq: form.moq ? Number(form.moq) : null,
    pack_size: form.pack_size,
    price: form.price ? Number(form.price) : null,
    currency: form.currency,
    stock: form.stock,
    ...(options.includeCover ? { cover_image_url: form.cover_image_url } : {}),
    trending: form.trending,
  };
}

function isActivePublication(status: SellerProductPublicationStatus | undefined): boolean {
  return status === "pending" || status === "running";
}

function publicationStatusTitle(status: SellerProductPublicationStatus | undefined): string {
  if (status === "pending" || status === "running") return "Publishing product and images";
  if (status === "completed") return "Product published";
  if (status === "failed") return "Publication failed";
  if (status === "cleanup_required") return "Publication cleanup required";
  return "Product publication";
}

function publicationStatusDescription(
  status: SellerProductPublicationStatus | undefined,
  errorCode: string | null,
): string {
  if (status === "pending") return "Publication is queued and will start shortly.";
  if (status === "running") return "The public product images are being prepared.";
  if (status === "completed") return "The product and its images are publicly available.";
  if (status === "failed") {
    return errorCode
      ? `Publication stopped (${errorCode}).`
      : "Publication stopped before it completed.";
  }
  if (status === "cleanup_required") {
    return "Temporary public-image files must be cleaned up before publication can be retried.";
  }
  return "Publishing creates stable public copies of the approved imported images.";
}

function publicationErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function publicationErrorMessage(error: unknown, fallback: string): string {
  switch (publicationErrorCode(error)) {
    case "product_publication_invalid":
      return "Check the product fields and try again.";
    case "authentication_required":
      return "Sign in again before publishing this product.";
    case "product_not_found":
      return "The product was not found.";
    case "product_publication_image_required":
      return "Add at least one product picture before publishing.";
    case "product_publication_images_not_ready":
      return "The imported product images are not ready. Recover them before trying again.";
    case "product_publication_in_progress":
      return "Another publication is already running. Your submitted changes were not saved.";
    case "product_publication_not_allowed":
      return "The product cannot be published in its current state.";
    case "product_publication_configuration_invalid":
      return "Product publication is temporarily misconfigured.";
    case "product_publication_unavailable":
      return "Product publication is temporarily unavailable. Try again.";
    default:
      return error instanceof Error && error.message ? error.message : fallback;
  }
}

async function refreshSavedProduct(
  queryClient: ReturnType<typeof useQueryClient>,
  productId: string | null | undefined,
  previousStatus: string | null | undefined,
  savedStatus: string,
) {
  await queryClient.invalidateQueries({ queryKey: ["my-products"] });
  if (!productId || previousStatus !== savedStatus) {
    await queryClient.invalidateQueries({ queryKey: ["my-product-summary"] });
  }
  if (productId) {
    await queryClient.invalidateQueries({ queryKey: ["my-product", productId] });
  }
}

async function refreshCompletedProduct(
  queryClient: ReturnType<typeof useQueryClient>,
  productId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["my-products"] }),
    queryClient.invalidateQueries({ queryKey: ["my-product", productId] }),
    queryClient.invalidateQueries({ queryKey: ["my-product-summary"] }),
  ]);
}
