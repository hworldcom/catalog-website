import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { getMySeller } from "@/features/seller/current-seller.functions";
import { listMyLeads } from "@/features/seller/leads.functions";
import { getMyProductSummary } from "@/features/seller/products.functions";
import { setStorefrontPublished } from "@/features/seller/storefront.functions";
import { toast } from "sonner";

export function OverviewScreen() {
  const getSeller = useServerFn(getMySeller);
  const getProductSummary = useServerFn(getMyProductSummary);
  const listLeads = useServerFn(listMyLeads);
  const setPublished = useServerFn(setStorefrontPublished);
  const qc = useQueryClient();

  const seller = useQuery({ queryKey: ["my-seller"], queryFn: () => getSeller() });
  const productSummary = useQuery({
    queryKey: ["my-product-summary"],
    queryFn: () => getProductSummary(),
  });
  const leads = useQuery({ queryKey: ["my-leads"], queryFn: () => listLeads() });

  const publishMutation = useMutation({
    mutationFn: (next: boolean) => setPublished({ data: { published: next } }),
    onSuccess: (_res, next) => {
      qc.invalidateQueries({ queryKey: ["my-seller"] });
      toast.success(next ? "Storefront is live." : "Storefront unpublished.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't update publish state");
    },
  });

  const s = seller.data?.seller;
  const productCount = productSummary.data?.productCount ?? 0;
  const publishedProductCount = productSummary.data?.publishedProductCount ?? 0;
  const shareUrl =
    typeof window !== "undefined" && s ? `${window.location.origin}/s/${s.slug}` : "";

  const steps: Array<{ done: boolean; label: string; to: string; cta: string }> = s
    ? [
        {
          done: true,
          label: "Create storefront",
          to: "/seller/storefront",
          cta: "Edit",
        },
        {
          done: Boolean(s.primary_category_id),
          label: "Pick a primary category",
          to: "/seller/storefront",
          cta: "Pick",
        },
        {
          done: Boolean(s.whatsapp || s.email),
          label: "Add a way for buyers to contact you (WhatsApp or email)",
          to: "/seller/storefront",
          cta: "Add",
        },
        {
          done: Boolean(s.cover_image_url),
          label: "Add a cover image so your storefront looks branded",
          to: "/seller/storefront",
          cta: "Add",
        },
        {
          done: publishedProductCount > 0,
          label: "Publish your first product",
          to: "/seller/products",
          cta: "Add product",
        },
        {
          done: Boolean(s.published),
          label: "Publish your storefront",
          to: "/seller/storefront",
          cta: "Open storefront",
        },
      ]
    : [];

  const remaining = steps.filter((step) => !step.done).length;
  const canQuickPublish =
    !!s && !s.published && publishedProductCount > 0 && !!(s.whatsapp || s.email);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">
          Welcome{s?.name ? `, ${s.name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {s?.published
            ? "Your storefront is live and buyers can find you."
            : "Your storefront is a draft — finish the checklist below to go live."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          label="Status"
          value={s?.published ? "Published" : "Draft"}
          tone={s?.published ? "good" : "warn"}
        />
        <Card label="Products" value={String(productCount)} />
        <Card label="Leads" value={String(leads.data?.leads.length ?? 0)} />
      </div>

      {s && remaining > 0 ? (
        <div className="border border-border bg-card/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">
                Finish setting up your storefront
              </h2>
              <p className="text-xs text-muted-foreground">
                {remaining} {remaining === 1 ? "step" : "steps"} left
              </p>
            </div>
            {canQuickPublish ? (
              <button
                onClick={() => publishMutation.mutate(true)}
                disabled={publishMutation.isPending}
                className="bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {publishMutation.isPending ? "Publishing…" : "Publish storefront"}
              </button>
            ) : null}
          </div>
          <ul className="mt-4 divide-y divide-border">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={
                      "flex h-5 w-5 items-center justify-center border text-[11px] " +
                      (step.done
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                        : "border-border text-muted-foreground")
                    }
                  >
                    {step.done ? "✓" : ""}
                  </span>
                  <span className={step.done ? "text-muted-foreground line-through" : ""}>
                    {step.label}
                  </span>
                </div>
                {!step.done ? (
                  <Link to={step.to} className="text-xs text-primary hover:underline">
                    {step.cta} →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : s?.published ? (
        <div className="flex items-center justify-between border border-primary/40 bg-primary/5 p-4 text-sm">
          <div>
            <div className="font-medium text-foreground">Storefront live 🎉</div>
            <div className="text-xs text-muted-foreground">
              Share your link with buyers to start receiving inquiries.
            </div>
          </div>
          <button
            onClick={() => publishMutation.mutate(false)}
            disabled={publishMutation.isPending}
            className="border border-border px-3 py-1.5 text-xs hover:border-primary disabled:opacity-60"
          >
            Unpublish
          </button>
        </div>
      ) : null}

      {s ? (
        <div className="border border-border bg-card/40 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Share your storefront
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate border border-border bg-background px-3 py-2 text-xs">
              {shareUrl}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                toast.success("Link copied");
              }}
              className="border border-border px-3 py-2 text-xs hover:border-primary"
            >
              Copy
            </button>
          </div>
          {!s.published ? (
            <p className="mt-2 text-[11px] text-amber-400">
              This link only works once your storefront is published.
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Recent leads</h2>
          <Link to="/seller/leads" className="text-xs text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </div>
        {leads.data?.leads.length ? (
          <ul className="divide-y divide-border border border-border bg-card/40">
            {leads.data.leads.slice(0, 5).map((l) => (
              <li key={l.id} className="flex flex-col gap-1 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{l.buyer_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {(l as unknown as { products?: { title?: string } }).products?.title ??
                    "General inquiry"}
                </div>
                {l.message ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{l.message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            No leads yet.
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const toneClass =
    tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="border border-border bg-card/40 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 font-display text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
