-- ====================================
-- SETUP ADMIN USER
-- ====================================
-- 
-- Langkah 1: Buka Supabase Dashboard → Authentication → Users
-- Langkah 2: Klik "Add user" → isi email dan password
-- Langkah 3: Catat User ID (UUID) dari user yang baru dibuat
-- Langkah 4: Ganti 'YOUR-USER-ID-HERE' di bawah dengan UUID tersebut
-- Langkah 5: Jalankan SQL ini di Supabase → SQL Editor

-- Ganti UUID di bawah ini
DO $$
DECLARE
  admin_user_id uuid := 'YOUR-USER-ID-HERE';
BEGIN
  -- Buat profil user
  INSERT INTO public.users_profiles (id, full_name, role)
  VALUES (admin_user_id, 'Admin', 'super_admin')
  ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

  -- Daftarkan sebagai admin
  INSERT INTO public.admins (user_id, role, is_active)
  VALUES (admin_user_id, 'super_admin', true)
  ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', is_active = true;

  RAISE NOTICE 'Admin berhasil dibuat!';
END $$;
