-- Visitor analytics migration for web-azkazamdigital2026
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Visitor sessions table
CREATE TABLE IF NOT EXISTS public.visitor_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  country_code TEXT,
  country_name TEXT,
  city TEXT,
  region TEXT,
  user_agent TEXT,
  device_type TEXT,
  os TEXT,
  browser TEXT,
  referrer TEXT,
  landing_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  language TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Page views table
CREATE TABLE IF NOT EXISTS public.page_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL REFERENCES public.visitor_sessions(session_id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  title TEXT,
  query_params TEXT,
  referrer TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_created_at ON public.visitor_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_session_id ON public.visitor_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON public.page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views(created_at DESC);

-- Row Level Security (RLS): allow service role full access; restrict anon/user reads
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access on visitor_sessions"
  ON public.visitor_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role full access on page_views"
  ON public.page_views
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Upsert function used by /api/track-visitor
CREATE OR REPLACE FUNCTION public.upsert_visitor_session(
  p_session_id TEXT,
  p_ip_address TEXT,
  p_country_code TEXT,
  p_country_name TEXT,
  p_city TEXT,
  p_region TEXT,
  p_user_agent TEXT,
  p_device_type TEXT,
  p_os TEXT,
  p_browser TEXT,
  p_referrer TEXT,
  p_landing_page TEXT,
  p_utm_source TEXT,
  p_utm_medium TEXT,
  p_utm_campaign TEXT,
  p_screen_width INTEGER,
  p_screen_height INTEGER,
  p_language TEXT
) RETURNS void AS $$
BEGIN
  INSERT INTO public.visitor_sessions (
    session_id, ip_address, country_code, country_name, city, region,
    user_agent, device_type, os, browser, referrer, landing_page,
    utm_source, utm_medium, utm_campaign, screen_width, screen_height, language
  ) VALUES (
    p_session_id, p_ip_address, p_country_code, p_country_name, p_city, p_region,
    p_user_agent, p_device_type, p_os, p_browser, p_referrer, p_landing_page,
    p_utm_source, p_utm_medium, p_utm_campaign, p_screen_width, p_screen_height, p_language
  )
  ON CONFLICT (session_id) DO UPDATE SET
    ip_address = COALESCE(EXCLUDED.ip_address, public.visitor_sessions.ip_address),
    country_code = COALESCE(EXCLUDED.country_code, public.visitor_sessions.country_code),
    country_name = COALESCE(EXCLUDED.country_name, public.visitor_sessions.country_name),
    city = COALESCE(EXCLUDED.city, public.visitor_sessions.city),
    region = COALESCE(EXCLUDED.region, public.visitor_sessions.region),
    user_agent = COALESCE(EXCLUDED.user_agent, public.visitor_sessions.user_agent),
    device_type = COALESCE(EXCLUDED.device_type, public.visitor_sessions.device_type),
    os = COALESCE(EXCLUDED.os, public.visitor_sessions.os),
    browser = COALESCE(EXCLUDED.browser, public.visitor_sessions.browser),
    referrer = COALESCE(EXCLUDED.referrer, public.visitor_sessions.referrer),
    landing_page = COALESCE(EXCLUDED.landing_page, public.visitor_sessions.landing_page),
    utm_source = COALESCE(EXCLUDED.utm_source, public.visitor_sessions.utm_source),
    utm_medium = COALESCE(EXCLUDED.utm_medium, public.visitor_sessions.utm_medium),
    utm_campaign = COALESCE(EXCLUDED.utm_campaign, public.visitor_sessions.utm_campaign),
    screen_width = COALESCE(EXCLUDED.screen_width, public.visitor_sessions.screen_width),
    screen_height = COALESCE(EXCLUDED.screen_height, public.visitor_sessions.screen_height),
    language = COALESCE(EXCLUDED.language, public.visitor_sessions.language),
    last_seen_at = now();
END;
$$ LANGUAGE plpgsql;
