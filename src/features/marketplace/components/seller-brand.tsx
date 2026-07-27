import { getSellerInitial } from "../seller-storefront";

export function SellerBrand({
  name,
  logoUrl,
  subtitle,
}: {
  name: string;
  logoUrl: string | null;
  subtitle?: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className="h-10 w-10 shrink-0 border border-primary/40 bg-background object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center border border-primary/40 bg-primary/10 font-display text-lg font-bold text-primary"
        >
          {getSellerInitial(name)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-display text-lg font-semibold leading-none tracking-tight">
          {name}
        </span>
        {subtitle ? (
          <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
