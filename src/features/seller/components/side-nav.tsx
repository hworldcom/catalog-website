import { Link } from "@tanstack/react-router";

import { useAdministratorNavigationContext } from "@/features/admin/administrator-navigation.context";
import { t, tr } from "@/lib/i18n";
import { useClassifierAssistedUploadEnabled } from "@/features/classifier-release/classifier-release-runtime";

export function SideNav({ sellerSlug }: { sellerSlug: string }) {
  const { prototypeAdministrator } = useAdministratorNavigationContext();
  const classifierAssistedUploadEnabled = useClassifierAssistedUploadEnabled();
  const link =
    "block border border-transparent px-3 py-2 text-sm text-muted-foreground hover:border-border hover:text-foreground";
  const active = "border-border bg-card text-foreground";

  return (
    <nav className="flex flex-col gap-1">
      <Link
        to="/seller"
        activeOptions={{ exact: true }}
        className={link}
        activeProps={{ className: `${link} ${active}` }}
      >
        Overview
      </Link>
      <Link
        to="/seller/storefront"
        className={link}
        activeProps={{ className: `${link} ${active}` }}
      >
        Storefront
      </Link>
      <Link to="/seller/products" className={link} activeProps={{ className: `${link} ${active}` }}>
        Products
      </Link>
      {classifierAssistedUploadEnabled ? (
        <Link
          to="/seller/classifier-batches"
          className={link}
          activeProps={{ className: `${link} ${active}` }}
        >
          {tr(
            t(
              "Classifier uploads",
              "Przesyłanie z klasyfikatorem",
              "Klassifikator-Uploads",
              "Tải lên bằng bộ phân loại",
            ),
          )}
        </Link>
      ) : null}
      <Link to="/seller/leads" className={link} activeProps={{ className: `${link} ${active}` }}>
        Leads
      </Link>
      {prototypeAdministrator ? (
        <Link
          to="/admin/moderation"
          search={{ reviewStatus: "pending", limit: 25 }}
          className={link}
          activeProps={{ className: `${link} ${active}` }}
        >
          {tr(
            t(
              "Moderation requests",
              "Prośby o moderację",
              "Moderationsanfragen",
              "Yêu cầu kiểm duyệt",
            ),
          )}
        </Link>
      ) : null}
      <a href={`/s/${sellerSlug}`} target="_blank" rel="noreferrer" className={link}>
        View public storefront ↗
      </a>
    </nav>
  );
}
