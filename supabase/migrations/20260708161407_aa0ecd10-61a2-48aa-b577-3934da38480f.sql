-- ============ Roles ============
CREATE TYPE public.app_role AS ENUM ('seller', 'admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============ Seller ownership ============
ALTER TABLE public.sellers ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_sellers_owner ON public.sellers(owner_id);

-- Sellers: existing public policy stays. Add owner policies.
GRANT INSERT, UPDATE, DELETE ON public.sellers TO authenticated;

CREATE POLICY "Sellers: owner can view own (including unpublished)"
  ON public.sellers FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Sellers: owner can insert own"
  ON public.sellers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.has_role(auth.uid(), 'seller'));

CREATE POLICY "Sellers: owner can update own"
  ON public.sellers FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Sellers: owner can delete own"
  ON public.sellers FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- ============ Products ============
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

CREATE POLICY "Products: owner can view own"
  ON public.products FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid()));

CREATE POLICY "Products: owner can insert own"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid()));

CREATE POLICY "Products: owner can update own"
  ON public.products FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid()));

CREATE POLICY "Products: owner can delete own"
  ON public.products FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid()));

-- ============ Product images ============
GRANT INSERT, UPDATE, DELETE ON public.product_images TO authenticated;

CREATE POLICY "ProductImages: owner can view own"
  ON public.product_images FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id
    WHERE p.id = product_images.product_id AND s.owner_id = auth.uid()
  ));

CREATE POLICY "ProductImages: owner can insert own"
  ON public.product_images FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id
    WHERE p.id = product_images.product_id AND s.owner_id = auth.uid()
  ));

CREATE POLICY "ProductImages: owner can update own"
  ON public.product_images FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id
    WHERE p.id = product_images.product_id AND s.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id
    WHERE p.id = product_images.product_id AND s.owner_id = auth.uid()
  ));

CREATE POLICY "ProductImages: owner can delete own"
  ON public.product_images FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id
    WHERE p.id = product_images.product_id AND s.owner_id = auth.uid()
  ));

-- ============ Leads ============
GRANT SELECT ON public.leads TO authenticated;

CREATE POLICY "Leads: owning seller can view"
  ON public.leads FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = leads.seller_id AND s.owner_id = auth.uid()));

-- ============ Auto-assign seller role on sign-up (self-service) ============
-- Handled from server function on sign-up; no trigger needed.