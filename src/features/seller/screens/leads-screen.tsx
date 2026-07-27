import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listMyLeads } from "@/features/seller/leads.functions";

export function LeadsScreen() {
  const list = useServerFn(listMyLeads);
  const { data, isLoading } = useQuery({ queryKey: ["my-leads"], queryFn: () => list() });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Buyer inquiries sent to your storefront and products.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : data?.leads.length ? (
        <ul className="flex flex-col gap-3">
          {data.leads.map((l) => {
            const productTitle = (l as unknown as { products?: { title?: string } }).products
              ?.title;
            return (
              <li key={l.id} className="border border-border bg-card/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">{l.buyer_name ?? "Anonymous buyer"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()} · via {l.source}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {l.buyer_email ? (
                    <a href={`mailto:${l.buyer_email}`} className="hover:text-foreground">
                      {l.buyer_email}
                    </a>
                  ) : null}
                  {l.buyer_phone ? <span>{l.buyer_phone}</span> : null}
                  {l.buyer_country ? <span>{l.buyer_country}</span> : null}
                  {productTitle ? <span>Re: {productTitle}</span> : null}
                </div>
                {l.message ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{l.message}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          No leads yet.
        </div>
      )}
    </div>
  );
}
