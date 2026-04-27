// =============================================
// Core TypeScript Types for AzkazamDigital
// Aligned to Supabase schema.sql
// =============================================

export type UserRole = 'super_admin' | 'admin' | 'affiliate' | 'user';

export interface UserProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

// site_settings is a single-row table (NOT key-value)
export interface SiteSettings {
  id: string;
  site_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  description: string | null;
  whatsapp_number: string | null;
  email: string | null;
  address: string | null;
  social_links: Record<string, unknown>;
  hero_title: string | null;
  hero_subtitle: string | null;
  primary_cta_label: string | null;
  primary_cta_url: string | null;
  footer_text: string | null;
  custom_head_script: string | null;
  custom_body_script: string | null;
  pixel_enabled: boolean;
  facebook_pixel_id: string | null;
  custom_meta_script: string | null;
  custom_tracking_script: string | null;
  whatsapp_button_enabled: boolean;
  hide_checkout_chrome: boolean;
  hide_thank_you_chrome: boolean;
  checkout_coupon_enabled: boolean;
  payment_bank_name: string | null;
  payment_account_number: string | null;
  payment_account_name: string | null;
  payment_qris_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  title: string;
  slug: string;
  content_html: string;
  status: 'draft' | 'published';
  product_id: string | null;
  hide_header_footer: boolean;
  seo_title: string | null;
  seo_description: string | null;
  featured_image: string | null;
  sort_order: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  product?: Pick<Product, "id" | "title" | "slug" | "thumbnail_url" | "price" | "affiliate_commission_rate"> | null;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content_html: string;
  cover_image: string | null;
  status: 'draft' | 'published';
  seo_title: string | null;
  seo_description: string | null;
  focus_keyword: string | null;
  author_name: string | null;
  canonical_url: string | null;
  tags: string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleAutomationSettings {
  id: string;
  automation_enabled: boolean;
  auto_publish: boolean;
  schedule_interval_hours: number;
  articles_per_run: number;
  queue_cursor: number;
  last_run_at: string | null;
  default_author_name: string;
  site_context: string;
  prompt_template: string;
  topic_queue: string;
  target_keywords: string;
  avoid_topics: string;
  internal_link_url: string;
  internal_link_anchor: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  thumbnail_url: string | null;
  banner_url: string | null;
  short_description: string | null;
  description_html: string;
  landing_page_mode: 'default' | 'custom_html';
  landing_page_html: string;
  click_target_type: 'cms_page' | 'checkout';
  click_target_page_id: string | null;
  price: number;
  affiliate_commission_rate: number;
  affiliate_commission_type: 'percent' | 'fixed';
  affiliate_commission_amount: number;
  compare_at_price: number | null;
  is_active: boolean;
  is_featured: boolean;
  purchase_url: string | null;
  checkout_url: string | null;
  demo_url: string | null;
  digital_file_url: string | null;
  badge: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  categories?: Category[];
  click_target_page?: Pick<Page, "id" | "title" | "slug"> | null;
}

export interface ProductCategory {
  product_id: string;
  category_id: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string | null;
  quote: string;
  avatar_url: string | null;
  rating: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Affiliate {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  whatsapp: string | null;
  referral_code: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  commission_rate: number;
  qualifying_order_id: string | null;
  approved_at: string | null;
  payout_method: string | null;
  payout_account_number: string | null;
  payout_account: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateLink {
  id: string;
  affiliate_id: string;
  product_id: string | null;
  referral_code: string;
  target_url: string;
  clicks_count: number;
  conversions_count: number;
  created_at: string;
  updated_at: string;
  product?: Pick<Product, "id" | "title" | "slug" | "thumbnail_url" | "price" | "affiliate_commission_rate" | "click_target_type"> | null;
}

export interface AffiliateClick {
  id: string;
  affiliate_id: string | null;
  product_id: string | null;
  referral_code: string | null;
  landing_path: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_code: string;
  user_id: string | null;
  product_id: string | null;
  affiliate_id: string | null;
  buyer_name: string;
  buyer_email: string;
  buyer_whatsapp: string;
  product_name: string;
  price: number;
  subtotal: number;
  discount_amount: number;
  unique_code: number;
  total_amount: number;
  notes: string | null;
  coupon_code: string | null;
  referral_code: string | null;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  tracking_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CouponCode {
  id: string;
  code: string;
  name: string | null;
  discount_type: 'fixed' | 'percent';
  discount_value: number;
  is_active: boolean;
  usage_limit: number | null;
  usage_count: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  order_id: string;
  product_id: string | null;
  affiliate_id: string | null;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface AffiliateConversion {
  id: string;
  affiliate_id: string | null;
  product_id: string | null;
  order_id: string | null;
  referral_code: string | null;
  conversion_type: string;
  amount: number;
  created_at: string;
}

export interface Commission {
  id: string;
  affiliate_id: string;
  order_id: string | null;
  product_id: string | null;
  referral_code: string | null;
  amount: number;
  rate: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaFile {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  folder: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  source_path: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappBroadcast {
  id: string;
  status: "draft" | "running" | "paused" | "completed" | "stopped" | "failed";
  template: string;
  send_image: boolean;
  image_url: string | null;
  send_video: boolean;
  video_url: string | null;
  min_delay_seconds: number;
  max_delay_seconds: number;
  filter_statuses: string[] | null;
  filter_date_from: string | null;
  filter_date_to: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  current_index: number;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  stopped_at: string | null;
  last_processed_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappFollowupJob {
  id: string;
  order_id: string;
  level: number;
  scheduled_for: string;
  status: "pending" | "processing" | "sent" | "cancelled" | "failed";
  attempts: number;
  locked_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// Dashboard stats
export interface DashboardStats {
  totalProducts: number;
  totalPages: number;
  totalAffiliates: number;
  totalOrders: number;
  totalCommissions: number;
  totalClicks: number;
  totalSales: number;
  totalRevenue: number;
}

export interface PurchasedProductSummary {
  order: Order;
  product: Product | null;
}
