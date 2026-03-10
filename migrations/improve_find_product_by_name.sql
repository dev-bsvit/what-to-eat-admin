-- Migration: Improve find_product_by_name with fuzzy matching
-- Fixes: case-insensitive synonyms, partial matching
-- Date: 2026-03-10

DROP FUNCTION IF EXISTS find_product_by_name(text);

CREATE OR REPLACE FUNCTION find_product_by_name(search_name TEXT)
RETURNS TABLE (
    id UUID,
    canonical_name TEXT,
    category TEXT,
    preferred_unit TEXT,
    calories NUMERIC,
    protein NUMERIC,
    fat NUMERIC,
    carbohydrates NUMERIC,
    average_piece_weight_g NUMERIC,
    icon TEXT,
    image_url TEXT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    lower_name TEXT := LOWER(TRIM(search_name));
BEGIN
    -- Priority 1: Exact canonical name match (case insensitive)
    RETURN QUERY
    SELECT pd.id, pd.canonical_name, pd.category, pd.preferred_unit,
           pd.calories, pd.protein, pd.fat, pd.carbohydrates,
           pd.average_piece_weight_g, pd.icon, pd.image_url
    FROM product_dictionary pd
    WHERE LOWER(pd.canonical_name) = lower_name
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- Priority 2: Exact synonym match (case insensitive)
    RETURN QUERY
    SELECT pd.id, pd.canonical_name, pd.category, pd.preferred_unit,
           pd.calories, pd.protein, pd.fat, pd.carbohydrates,
           pd.average_piece_weight_g, pd.icon, pd.image_url
    FROM product_dictionary pd
    WHERE lower_name = ANY(
        SELECT LOWER(s) FROM unnest(pd.synonyms) AS s
    )
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- Priority 3: Partial match — canonical_name contains search OR search contains canonical_name
    -- e.g. "картофель молодой" → finds "Картофель"
    --      "куриная грудка"    → finds "Куриная грудка"
    RETURN QUERY
    SELECT pd.id, pd.canonical_name, pd.category, pd.preferred_unit,
           pd.calories, pd.protein, pd.fat, pd.carbohydrates,
           pd.average_piece_weight_g, pd.icon, pd.image_url
    FROM product_dictionary pd
    WHERE
        lower_name LIKE '%' || LOWER(pd.canonical_name) || '%'
        OR LOWER(pd.canonical_name) LIKE '%' || lower_name || '%'
    ORDER BY
        -- Prefer exact prefix match, then shorter names (more general)
        CASE WHEN LOWER(pd.canonical_name) LIKE lower_name || '%' THEN 0 ELSE 1 END,
        LENGTH(pd.canonical_name)
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- Priority 4: Partial synonym match
    RETURN QUERY
    SELECT pd.id, pd.canonical_name, pd.category, pd.preferred_unit,
           pd.calories, pd.protein, pd.fat, pd.carbohydrates,
           pd.average_piece_weight_g, pd.icon, pd.image_url
    FROM product_dictionary pd
    WHERE EXISTS (
        SELECT 1 FROM unnest(pd.synonyms) AS s
        WHERE lower_name LIKE '%' || LOWER(s) || '%'
           OR LOWER(s) LIKE '%' || lower_name || '%'
    )
    ORDER BY LENGTH(pd.canonical_name)
    LIMIT 1;
END;
$$;
