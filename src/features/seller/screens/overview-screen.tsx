import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { listMyLeads } from "@/features/seller/leads.functions";
import { getMyProductSummary } from "@/features/seller/products.functions";
import { getMySellerProfileWorkingCopy } from "@/features/seller/storefront.functions";
import { toast } from "sonner";

export function OverviewScreen() {
  const getProfile = useServerFn(getMySellerProfileWorkingCopy);
  const getProductSummary = useServerFn(getMyProductSummary);
  const listLeads = useServerFn(listMyLeads);

  const profile = useQuery({ queryKey: ["my-seller-profile"], queryFn: () => getProfile() });
  const productSummary = useQuery({
    queryKey: ["my-product-summary"],
    queryFn: () => getProductSummary(),
  });
  const leads = useQuery({ queryKey: ["my-leads"], queryFn: () => listLeads() });

  const s = profile.data?.seller;
  const workingCopy = profile.data?.workingCopy;
  const productCount = productSummary.data?.productCount ?? 0;
  const publishedProductCount = productSummary.data?.publishedProductCount ?? 0;
  const shareUrl =
    typeof window !== "undefined" && s ? `${window.location.origin}/s/${s.slug}` : "";

  const steps: Array<{ done: boolean; label: string; to: string; cta: string }> = workingCopy
    ? [
        {
          done: true,
          label: "Create storefront",
          to: "/seller/storefront",
          cta: "Edit",
        },
        {
          done: Boolean(workingCopy.whatsapp || workingCopy.email),
          label: "Add a way for buyers to contact you (WhatsApp or email)",
          to: "/seller/storefront",
          cta: "Add",
        },
        {
          done: publishedProductCount > 0,
          label: "Publish your first product",
          to: "/seller/products",
          cta: "Add product",
        },
      ]
    : [];

  const remaining = steps.filter((step) => !step.done).length;
  const sellerStatus = s?.published
    ? "Published"
    : s?.approved_profile_submission_id
      ? "Approved, hidden"
      : "Private draft";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">
          Welcome{workingCopy?.name ? `, ${workingCopy.name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {s?.published
            ? "Your storefront is live and buyers can find you."
            : "Your storefront profile is private while moderation is being prepared."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card label="Status" value={sellerStatus} tone={s?.published ? "good" : "warn"} />
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
        <div className="border border-primary/40 bg-primary/5 p-4 text-sm">
          <div>
            <div className="font-medium text-foreground">Storefront live</div>
            <div className="text-xs text-muted-foreground">
              Share your link with buyers to start receiving inquiries.
            </div>
          </div>
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
              This private draft is not available to buyers.
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
