BEGIN;

INSERT INTO public.categories (slug, name, sort_order)
VALUES
  ('t-shirts', 'T-shirts', 100),
  ('hoodies', 'Hoodies', 101),
  ('trousers', 'Trousers', 102),
  ('jackets', 'Jackets', 103),
  ('sportswear', 'Sportswear', 104),
  ('sweatshirts', 'Sweatshirts', 105),
  ('sweaters', 'Sweaters', 106),
  ('cardigans', 'Cardigans', 107),
  ('jeans', 'Jeans', 108),
  ('shorts', 'Shorts', 109),
  ('skirts', 'Skirts', 110),
  ('leggings', 'Leggings', 111),
  ('sweatpants', 'Sweatpants', 112),
  ('dresses', 'Dresses', 113),
  ('blazers', 'Blazers', 114),
  ('coats', 'Coats', 115),
  ('vests', 'Vests', 116),
  ('tracksuit-sets', 'Tracksuit sets', 117)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
