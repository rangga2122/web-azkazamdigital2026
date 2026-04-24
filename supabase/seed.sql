insert into public.site_settings (
  site_name, description, whatsapp_number, email, address, social_links,
  hero_title, hero_subtitle, primary_cta_label, primary_cta_url,
  footer_text, pixel_enabled, facebook_pixel_id
) values (
  'AZKAZAM Digital',
  'Produk digital, template, dan sistem pemasaran yang siap membantu bisnis online tumbuh lebih cepat.',
  '6281234567890',
  'halo@azkazamdigital.com',
  'Jakarta, Indonesia',
  '{"instagram":"https://instagram.com/azkazamdigital","tiktok":"https://tiktok.com/@azkazamdigital"}',
  'Produk Digital Premium untuk Bisnis Online yang Lebih Cepat',
  'Kelola landing page, produk, order, dan afiliasi dari satu dasbor modern tanpa WordPress.',
  'Lihat Produk',
  '/produk',
  '© 2026 AZKAZAM Digital. Semua hak dilindungi.',
  false,
  null
) on conflict do nothing;

insert into public.categories (name, slug, description, sort_order) values
  ('Template Website', 'template-website', 'Template landing page dan website siap pakai.', 1),
  ('Ebook & Panduan', 'ebook-panduan', 'Materi digital untuk belajar pemasaran dan bisnis online.', 2),
  ('Alat Digital', 'tools-digital', 'Spreadsheet, paket otomasi, dan aset produktivitas.', 3)
on conflict (slug) do nothing;

insert into public.products (
  title, slug, thumbnail_url, banner_url, short_description, description_html,
  price, compare_at_price, is_active, is_featured, purchase_url, checkout_url, demo_url, badge,
  seo_title, seo_description
) values
  (
    'Paket Peningkat Landing Page',
    'landing-page-booster-kit',
    '/uploads/products/landing-page-booster-kit.jpg',
    '/uploads/banners/landing-page-booster-kit.jpg',
    'Template landing page HTML premium untuk kampanye produk digital.',
    '<section><h2>Landing Page Siap Konversi</h2><p>Paket ini berisi struktur landing page, bagian penawaran, FAQ, testimoni, dan CTA yang mudah disesuaikan.</p><ul><li>HTML custom siap impor</li><li>Bagian copywriting lengkap</li><li>Responsif untuk mobile</li></ul></section>',
    199000,
    399000,
    true,
    true,
    '/order/landing-page-booster-kit',
    '/order/landing-page-booster-kit',
    '#',
    'Terlaris',
    'Paket Peningkat Landing Page',
    'Template landing page digital siap pakai untuk meningkatkan konversi.'
  ),
  (
    'Panduan Peluncuran Afiliasi',
    'affiliate-launch-blueprint',
    '/uploads/products/affiliate-launch-blueprint.jpg',
    '/uploads/banners/affiliate-launch-blueprint.jpg',
    'Panduan membangun program afiliasi untuk produk digital.',
    '<h2>Bangun Mesin Afiliasi</h2><p>Panduan langkah demi langkah untuk merekrut afiliasi, membuat materi promosi, dan mengukur performa kampanye.</p>',
    149000,
    249000,
    true,
    true,
    '/order/affiliate-launch-blueprint',
    '/order/affiliate-launch-blueprint',
    '#',
    'Baru',
    'Panduan Peluncuran Afiliasi',
    'Panduan lengkap membangun sistem afiliasi produk digital.'
  ),
  (
    'Spreadsheet Keuangan Produk Digital',
    'digital-product-finance-sheet',
    '/uploads/products/digital-product-finance-sheet.jpg',
    '/uploads/banners/digital-product-finance-sheet.jpg',
    'Spreadsheet untuk mencatat order, profit, komisi, dan pencairan.',
    '<h2>Kontrol Angka Bisnis</h2><p>Spreadsheet praktis untuk mengelola arus kas produk digital, komisi afiliasi, dan laporan penjualan.</p>',
    99000,
    179000,
    true,
    false,
    '/order/digital-product-finance-sheet',
    '/order/digital-product-finance-sheet',
    '#',
    'Promo',
    'Spreadsheet Keuangan Produk Digital',
    'Spreadsheet bisnis produk digital untuk order, profit, dan komisi.'
  )
on conflict (slug) do nothing;

insert into public.product_categories (product_id, category_id)
select p.id, c.id
from public.products p
join public.categories c on (
  (p.slug = 'landing-page-booster-kit' and c.slug = 'template-website') or
  (p.slug = 'affiliate-launch-blueprint' and c.slug = 'ebook-panduan') or
  (p.slug = 'digital-product-finance-sheet' and c.slug = 'tools-digital')
)
on conflict do nothing;

insert into public.pages (title, slug, content_html, status, seo_title, seo_description, featured_image, sort_order) values
  ('Tentang Kami', 'tentang-kami', '<h1>Tentang AZKAZAM Digital</h1><p>Kami membantu kreator dan pebisnis online menjual produk digital dengan website cepat, modern, dan mudah dikelola.</p>', 'published', 'Tentang AZKAZAM Digital', 'Kenali AZKAZAM Digital dan cara kami membantu bisnis produk digital.', '/uploads/pages/tentang-kami.jpg', 1),
  ('Promo Ramadhan', 'promo-ramadhan', '<section class="promo"><h1>Promo Ramadhan Produk Digital</h1><p>Dapatkan paket template dan panduan dengan harga spesial untuk kampanye musiman Anda.</p><a href="/produk">Pilih Produk</a></section>', 'published', 'Promo Ramadhan AZKAZAM Digital', 'Promo Ramadhan untuk template, ebook, dan alat produk digital.', '/uploads/pages/promo-ramadhan.jpg', 2),
  ('Syarat Afiliasi', 'syarat-affiliate', '<h1>Syarat dan Ketentuan Afiliasi</h1><p>Afiliasi wajib mempromosikan produk secara etis, tidak melakukan spam, dan mengikuti aturan komisi yang berlaku.</p>', 'published', 'Syarat Afiliasi', 'Syarat dan ketentuan program afiliasi AZKAZAM Digital.', null, 3)
on conflict (slug) do nothing;

insert into public.faqs (question, answer, sort_order) values
  ('Apakah website ini memakai WordPress?', 'Tidak. Project ini memakai Next.js, Tailwind CSS, dan Supabase sebagai pengganti WordPress.', 1),
  ('Apakah bisa impor HTML landing page?', 'Bisa. Admin dapat menempel HTML atau mengunggah file HTML, lalu kontennya disimpan dan dirender sebagai halaman berbasis slug.', 2),
  ('Bagaimana tracking afiliasi bekerja?', 'Sistem memakai kode referral, cookie last-click, tracking klik, order, konversi, dan komisi.', 3)
on conflict do nothing;

insert into public.testimonials (name, role, quote, rating, sort_order) values
  ('Raka Pratama', 'Pendiri Kursus Online', 'Dasbornya jauh lebih ringan dibanding setup WordPress lama saya.', 5, 1),
  ('Nadia Lestari', 'Pemasar Digital', 'Fitur afiliasi dan order membuat kampanye produk digital lebih mudah dipantau.', 5, 2),
  ('Bima Santoso', 'Kreator Template', 'Impor HTML landing page sangat membantu untuk memakai ulang aset kampanye yang sudah ada.', 5, 3)
on conflict do nothing;

insert into public.affiliates (full_name, email, whatsapp, referral_code, status, commission_rate, payout_method, payout_account) values
  ('Afiliasi Demo', 'affiliate@azkazamdigital.com', '6281111111111', 'DEMOAFF', 'approved', 30.00, 'Transfer Bank', 'BCA 123456789 a.n Afiliasi Demo')
on conflict (email) do nothing;

insert into public.affiliate_links (affiliate_id, product_id, referral_code, target_url, clicks_count, conversions_count)
select a.id, p.id, a.referral_code, '/produk/' || p.slug || '?ref=' || a.referral_code, 24, 3
from public.affiliates a
cross join public.products p
where a.referral_code = 'DEMOAFF'
on conflict do nothing;

insert into public.orders (
  order_code, product_id, affiliate_id, buyer_name, buyer_email, buyer_whatsapp,
  product_name, price, notes, coupon_code, referral_code, status
)
select 'AZK-20260421-DEMO1', p.id, a.id, 'Pelanggan Demo', 'customer@example.com', '6282222222222',
  p.title, p.price, 'Order dummy dari seed data', null, a.referral_code, 'paid'
from public.products p
join public.affiliates a on a.referral_code = 'DEMOAFF'
where p.slug = 'landing-page-booster-kit'
on conflict (order_code) do nothing;

insert into public.commissions (affiliate_id, order_id, amount, rate, status, notes)
select a.id, o.id, round(o.price * a.commission_rate / 100, 2), a.commission_rate, 'approved', 'Data contoh komisi'
from public.orders o
join public.affiliates a on a.id = o.affiliate_id
where o.order_code = 'AZK-20260421-DEMO1'
on conflict do nothing;
