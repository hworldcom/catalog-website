type SellerLookupResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

export type SellerLookupSupabase = {
  from: (table: "sellers") => {
    select: (columns: string) => {
      eq: (
        column: "owner_id",
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<SellerLookupResult>;
      };
    };
  };
};

export async function getCurrentSellerId({
  supabase,
  userId,
}: {
  supabase: SellerLookupSupabase;
  userId: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("sellers")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data?.id ?? null;
}

export async function requireCurrentSellerId(ctx: {
  supabase: SellerLookupSupabase;
  userId: string;
}): Promise<string> {
  const sellerId = await getCurrentSellerId(ctx);

  if (!sellerId) throw new Error("Create your storefront first");

  return sellerId;
}
