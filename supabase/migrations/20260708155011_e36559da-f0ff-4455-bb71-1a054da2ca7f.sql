
-- Enums
CREATE TYPE public.product_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.lead_source AS ENUM ('form', 'whatsapp');
CREATE TYPE public.stock_status AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'made_to_order');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are public" ON public.categories FOR SELECT USING (true);
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SELLERS
CREATE TABLE public.sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  city text,
  country text,
  whatsapp text,
  email text,
  verified boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT true,
  about text,
  cover_image_url text,
  logo_url text,
  established_year int,
  primary_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sellers TO anon, authenticated;
GRANT ALL ON public.sellers TO service_role;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published sellers are public" ON public.sellers FOR SELECT USING (published = true);
CREATE TRIGGER trg_sellers_updated BEFORE UPDATE ON public.sellers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_sellers_category ON public.sellers(primary_category_id);

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  moq int,
  pack_size text,
  price numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  stock stock_status NOT NULL DEFAULT 'in_stock',
  status product_status NOT NULL DEFAULT 'draft',
  cover_image_url text,
  trending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published products are public" ON public.products
  FOR SELECT USING (status = 'published');
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_products_seller ON public.products(seller_id);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_trending ON public.products(trending) WHERE trending = true;

-- PRODUCT IMAGES
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Product images visible when parent published" ON public.product_images
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.status = 'published')
  );
CREATE INDEX idx_product_images_product ON public.product_images(product_id);

-- LEADS
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  buyer_country text,
  message text,
  source lead_source NOT NULL DEFAULT 'form',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit a lead" ON public.leads FOR INSERT WITH CHECK (true);
CREATE INDEX idx_leads_seller ON public.leads(seller_id);
CREATE INDEX idx_leads_product ON public.leads(product_id);

-- SEED CATEGORIES
INSERT INTO public.categories (slug, name, tagline, sort_order) VALUES
  ('textiles', 'Textiles & Fabrics', 'Sarees, dress materials, home linens', 1),
  ('home-decor', 'Home & Decor', 'Handicrafts, kitchenware, lighting', 2),
  ('fashion', 'Fashion & Apparel', 'Ready-to-wear, accessories, footwear', 3),
  ('beauty', 'Beauty & Personal Care', 'Skincare, haircare, wellness', 4),
  ('food', 'Food & Beverages', 'Spices, snacks, packaged goods', 5),
  ('electronics', 'Electronics & Gadgets', 'Consumer electronics, accessories', 6);

-- Synthetic seller and product fixtures are created only by the guarded UAT
-- fixture command. Fresh migration replays must not create public business data.
