CREATE INDEX products_seller_created_id_idx
  ON public.products (seller_id, created_at DESC, id DESC);
