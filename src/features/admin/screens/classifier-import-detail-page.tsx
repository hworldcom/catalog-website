import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMySeller } from "@/features/seller/current-seller.functions";

import { ClassifierImportDetailScreen } from "./classifier-import-detail-screen";

export function ClassifierImportDetailPage({ importId }: { importId: string }) {
  const getSeller = useServerFn(getMySeller);
  const seller = useQuery({
    queryKey: ["my-seller"],
    queryFn: () => getSeller(),
  });

  return (
    <ClassifierImportDetailScreen
      importId={importId}
      currentSellerId={seller.data?.seller?.id ?? null}
      currentSellerLoading={seller.isLoading}
    />
  );
}
