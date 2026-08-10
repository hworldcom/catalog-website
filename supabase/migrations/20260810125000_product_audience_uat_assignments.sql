BEGIN;

-- Explicit operator-owned assignments for the retained User Acceptance
-- Testing catalog inspected before the audience release. Missing identifiers
-- are ignored so clean environments remain deterministic.
WITH assignments(product_id, audience) AS (
  VALUES
    ('75cb2fc7-0b02-4280-8244-7215804e7eab'::uuid, 'women'::text),
    ('922d312f-26ba-4e52-b252-bc1084f63e99'::uuid, 'women'::text),
    ('fa3db008-1e11-475c-875b-1a95905cfa88'::uuid, 'women'::text),
    ('92775a80-b7dc-4953-a9bf-6e865a097c48'::uuid, 'men'::text)
)
INSERT INTO public.product_audience_memberships (product_id, audience)
SELECT product.id, assignment.audience
FROM assignments AS assignment
JOIN public.products AS product ON product.id = assignment.product_id
ON CONFLICT (product_id, audience) DO NOTHING;

-- Fail deployment if any other retained published product still lacks an
-- explicit audience assignment.
SELECT public.validate_product_audience_release_preflight();

COMMIT;
