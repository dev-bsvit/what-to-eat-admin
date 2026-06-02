-- Migration: add language_code column and 8 language-gift catalog placeholders
-- Run in Supabase SQL Editor

-- 1. Add language_code column to cuisines
ALTER TABLE cuisines ADD COLUMN IF NOT EXISTS language_code TEXT;

-- 2. Extend type check constraint to allow 'language_gift'
ALTER TABLE cuisines DROP CONSTRAINT IF EXISTS cuisines_type_check;
ALTER TABLE cuisines ADD CONSTRAINT cuisines_type_check
  CHECK (type IN ('free', 'premium', 'gift', 'unlockable', 'language_gift'));

-- 2. Insert 8 placeholder language-gift catalogs
INSERT INTO cuisines (name, description, type, status, language_code, created_at, updated_at)
VALUES
  (
    'International Cuisine',
    'A curated collection of global recipes — easy to cook, delicious every time.',
    'language_gift', 'active', 'en', NOW(), NOW()
  ),
  (
    'Русская кухня',
    'Классические рецепты русской кухни — сытно, просто и вкусно.',
    'language_gift', 'active', 'ru', NOW(), NOW()
  ),
  (
    'Deutsche Küche',
    'Klassische deutsche Rezepte — einfach, herzhaft und lecker.',
    'language_gift', 'active', 'de', NOW(), NOW()
  ),
  (
    'Cucina Italiana',
    'Ricette classiche italiane — semplici, gustose e autentiche.',
    'language_gift', 'active', 'it', NOW(), NOW()
  ),
  (
    'Cuisine Française',
    'Recettes classiques françaises — simples, savoureuses et authentiques.',
    'language_gift', 'active', 'fr', NOW(), NOW()
  ),
  (
    'Cocina Española',
    'Recetas clásicas españolas — sencillas, sabrosas y auténticas.',
    'language_gift', 'active', 'es', NOW(), NOW()
  ),
  (
    'Culinária Brasileira',
    'Receitas clássicas brasileiras — simples, saborosas e autênticas.',
    'language_gift', 'active', 'pt', NOW(), NOW()
  ),
  (
    'Українська кухня',
    'Класичні рецепти української кухні — смачно, просто та по-домашньому.',
    'language_gift', 'active', 'uk', NOW(), NOW()
  );
