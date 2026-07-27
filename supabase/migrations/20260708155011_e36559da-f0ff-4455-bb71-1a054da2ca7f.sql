
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

-- SEED SELLERS
INSERT INTO public.sellers (slug, name, city, country, whatsapp, email, verified, about, cover_image_url, established_year, primary_category_id)
SELECT 'kesar-textiles', 'Kesar Textiles', 'Surat', 'India', '919812345678', 'sales@kesartextiles.example',
       true, 'Family-run wholesale house specialising in sarees, dress materials, and home linens. MOQ 12 pieces.',
       'https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=1600&q=60',
       1998, id FROM public.categories WHERE slug='textiles';

INSERT INTO public.sellers (slug, name, city, country, whatsapp, email, verified, about, cover_image_url, established_year, primary_category_id)
SELECT 'jaipur-handicrafts', 'Jaipur Handicrafts Co.', 'Jaipur', 'India', '919811112222', 'orders@jaipurhc.example',
       true, 'Blue pottery, brass décor, and hand-block printed home accents. Ships worldwide.',
       'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=1600&q=60',
       2005, id FROM public.categories WHERE slug='home-decor';

INSERT INTO public.sellers (slug, name, city, country, whatsapp, email, verified, about, cover_image_url, established_year, primary_category_id)
SELECT 'aroma-naturals', 'Aroma Naturals', 'Kochi', 'India', '919833334444', 'wholesale@aromanaturals.example',
       false, 'Ayurvedic skincare and essential oils. Private-label available from 500 units.',
       'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=1600&q=60',
       2015, id FROM public.categories WHERE slug='beauty';

-- SEED PRODUCTS
WITH s AS (SELECT id, slug FROM public.sellers),
     c AS (SELECT id, slug FROM public.categories)
INSERT INTO public.products (seller_id, category_id, title, description, moq, pack_size, price, currency, stock, status, cover_image_url, trending)
SELECT s.id, c.id, p.title, p.description, p.moq, p.pack_size, p.price, 'USD', p.stock::stock_status, 'published'::product_status, p.image, p.trending
FROM (VALUES
  ('kesar-textiles','textiles','Banarasi Silk Saree — Rust', 'Handloom Banarasi silk with zari border. Assorted colours in each pack.', 12, 'Pack of 12', 22.50, 'in_stock', 'https://images.unsplash.com/photo-1610030006645-6a3d3a3d5a5b?auto=format&fit=crop&w=1200&q=60', true),
  ('kesar-textiles','textiles','Cotton Dress Material Set', 'Unstitched dress material — top, bottom, dupatta. Mixed prints.', 24, 'Pack of 24', 8.90, 'low_stock', 'https://images.unsplash.com/photo-1583391733981-8698e5cf8b91?auto=format&fit=crop&w=1200&q=60', true),
  ('kesar-textiles','textiles','Cotton Bedsheet Set (King)', '100% cotton, 220 TC. King size with 2 pillow covers.', 20, 'Pack of 20', 11.20, 'in_stock', 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=60', false),
  ('jaipur-handicrafts','home-decor','Blue Pottery Vase — 8"', 'Hand-painted Jaipur blue pottery vase. Fragile — packed with foam.', 24, 'Pack of 24', 6.40, 'in_stock', 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=1200&q=60', true),
  ('jaipur-handicrafts','home-decor','Brass Diya Set (12 pcs)', 'Traditional brass oil lamps, polished finish.', 50, 'Box of 50', 3.10, 'in_stock', 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?auto=format&fit=crop&w=1200&q=60', false),
  ('aroma-naturals','beauty','Cold-Pressed Coconut Oil 250ml', 'Virgin coconut oil, private-label available.', 100, 'Case of 100', 2.20, 'in_stock', 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1200&q=60', true),
  ('aroma-naturals','beauty','Ayurvedic Face Serum 30ml', 'Kumkumadi-inspired brightening serum.', 60, 'Case of 60', 4.75, 'made_to_order', 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1200&q=60', false)
) AS p(seller_slug, category_slug, title, description, moq, pack_size, price, stock, image, trending)
JOIN s ON s.slug = p.seller_slug
JOIN c ON c.slug = p.category_slug;
