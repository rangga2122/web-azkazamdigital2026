# AzkazamDigital - Platform Produk Digital Premium

Platform fullstack untuk penjualan produk digital dengan sistem afiliasi lengkap, CMS pages, form order, Facebook Pixel tracking, dan admin panel modern.

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Upload**: Local VPS storage via API endpoint

---

## 📋 Cara Install & Setup

### 1. Install Dependencies

```bash
cd az2
npm install
```

### 2. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Buka **SQL Editor** di Supabase Dashboard
3. Jalankan file `supabase/schema.sql` (copy paste seluruh isinya)
4. Jalankan file `supabase/seed.sql` untuk data contoh
5. Salin Project URL dan Anon Key dari **Settings > API**

### 3. Isi Environment Variables

Copy `.env.example` ke `.env.local`:

```bash
cp .env.example .env.local
```

Isi nilai berikut:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhxxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=AzkazamDigital
UPLOAD_MAX_SIZE_MB=5
```

### 4. Jalankan Lokal

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

### 5. Build Production

```bash
npm run build
npm start
```

---

## 🚀 Deploy ke VPS

### 1. Upload project ke VPS

```bash
git clone <repo-url>
cd az2
npm install
```

### 2. Buat file `.env.local` di VPS

```bash
nano .env.local
# Isi dengan konfigurasi production
```

### 3. Build & Start

```bash
npm run build
# Jalankan dengan PM2
npm install -g pm2
pm2 start npm --name "azkazam" -- start
pm2 save
```

### 4. Setup Nginx (opsional)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads {
        alias /path/to/az2/public/uploads;
        expires 30d;
    }
}
```

### 5. Setup Upload Folder

```bash
mkdir -p public/uploads/{products,banners,pages,site,testimonials,general}
chmod -R 755 public/uploads
```

---

## 👑 Cara Buat Admin Pertama

1. Buat user di Supabase Auth (Dashboard > Authentication > Users > Add User)
2. Setelah user dibuat, update role di tabel `user_profiles`:

```sql
UPDATE public.user_profiles
SET role = 'super_admin'
WHERE id = 'USER_UUID_DARI_AUTH';
```

3. Login di `http://localhost:3000/login` dengan email/password tersebut
4. Akses admin panel di `http://localhost:3000/admin`

---

## 🤝 Cara Approve Affiliate Pertama

1. Affiliate mendaftar di `/affiliate/register`
2. Admin login ke admin panel
3. Buka menu **Affiliates**
4. Ubah status dari `pending` ke `approved`
5. Affiliate bisa login dan melihat dashboard

---

## 📊 Cara Set Facebook Pixel ID

1. Login ke admin panel
2. Buka menu **Pixel/Tracking**
3. Masukkan Facebook Pixel ID
4. Aktifkan toggle "Facebook Pixel Aktif"
5. Klik **Simpan**
6. Events yang otomatis di-track:
   - `PageView` — semua halaman
   - `ViewContent` — halaman detail produk
   - `InitiateCheckout` — form order dikirim
   - `Purchase` — halaman thank you

---

## 🛒 Cara Testing Form Order

1. Buka halaman produk: `/produk/landing-page-pro-kit`
2. Klik **Beli Sekarang**
3. Isi form order (nama, email, WhatsApp)
4. Submit form
5. Akan redirect ke halaman thank you
6. Cek di admin panel menu **Orders** — order baru akan muncul

---

## 🎉 Cara Testing Thank You Page

1. Setelah submit order, otomatis redirect ke `/thank-you/ORDER_CODE`
2. Halaman menampilkan:
   - Kode order
   - Detail produk & harga
   - Instruksi pembayaran
   - Tombol WhatsApp
3. Bisa juga akses langsung: `/thank-you/ORD-XXXXXX-YYYY`

---

## 📁 Struktur Folder

```
src/
├── app/
│   ├── (public)/          # Halaman publik (dengan navbar & footer)
│   │   ├── page.tsx       # Homepage
│   │   ├── produk/        # Halaman produk
│   │   ├── order/         # Form order
│   │   ├── thank-you/     # Halaman terima kasih
│   │   ├── kontak/        # Halaman kontak
│   │   ├── affiliate/     # Halaman affiliate publik
│   │   └── [slug]/        # Halaman CMS dinamis
│   ├── admin/             # Panel admin (dengan sidebar)
│   │   ├── pages/         # CMS Pages CRUD
│   │   ├── products/      # Products CRUD
│   │   ├── categories/    # Categories CRUD
│   │   ├── orders/        # Orders management
│   │   ├── affiliates/    # Affiliates management
│   │   ├── commissions/   # Commissions management
│   │   ├── testimonials/  # Testimonials CRUD
│   │   ├── faqs/          # FAQs CRUD
│   │   ├── settings/      # Site settings
│   │   ├── tracking/      # Pixel/tracking settings
│   │   └── media/         # Media upload manager
│   ├── affiliate/         # Affiliate dashboard (protected)
│   ├── login/             # Login page
│   ├── api/               # API routes
│   │   ├── upload/        # Media upload endpoint
│   │   └── track-click/   # Affiliate click tracking
│   ├── sitemap.ts         # Dynamic sitemap
│   └── robots.ts          # robots.txt
├── components/
│   ├── layout/            # Navbar, Footer
│   ├── public/            # ProductCard, etc.
│   ├── tracking/          # Facebook Pixel, Custom Scripts
│   └── ui/                # WhatsApp Float, etc.
├── lib/
│   ├── supabase/          # Supabase client (browser + server)
│   └── utils.ts           # Helper functions
├── types/
│   └── index.ts           # TypeScript interfaces
└── middleware.ts           # Auth & referral tracking
```

---

## 🗄 Database Tables

| Table | Deskripsi |
|-------|-----------|
| `user_profiles` | Profil user dengan role |
| `site_settings` | Key-value settings website |
| `categories` | Kategori produk |
| `pages` | Halaman CMS dinamis |
| `products` | Produk digital |
| `product_categories` | Relasi produk-kategori |
| `testimonials` | Testimoni pelanggan |
| `faqs` | FAQ |
| `affiliates` | Data affiliate |
| `affiliate_clicks` | Log klik referral |
| `orders` | Data order |
| `commissions` | Data komisi affiliate |
| `media_files` | Tracking file upload |

---

## ⚡ Fitur Utama

- ✅ Homepage modern dengan hero, produk unggulan, testimoni, FAQ
- ✅ CMS Pages dinamis berbasis slug
- ✅ Import/render HTML custom (seperti WP Coder)
- ✅ CRUD Products + Categories
- ✅ Form Order dengan validasi
- ✅ Halaman Thank You dengan kode order
- ✅ Sistem afiliasi lengkap (pendaftaran, tracking, komisi)
- ✅ Affiliate dashboard
- ✅ Admin panel dengan sidebar modern
- ✅ Facebook Pixel tracking (PageView, ViewContent, Lead, Purchase)
- ✅ Custom head/body script injection
- ✅ Local media upload ke VPS
- ✅ SEO-friendly (meta tags, sitemap.xml, robots.txt)
- ✅ Floating WhatsApp button
- ✅ Referral tracking via cookie
- ✅ Route protection via middleware
- ✅ Dark mode premium design
- ✅ Responsive mobile-first

---

## 🚫 Yang Tidak Digunakan

- ❌ Firebase
- ❌ Prisma
- ❌ CMS pihak ketiga
