export type LicenseUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  daily_limit: number | null;
  remaining_credits: number | null;
  last_reset_date: string | null;
  expiry_date: string | null;
  allowed_features: string[] | null;
  current_session_id: string | null;
  session_updated_at: string | null;
  max_sessions: number | null;
  is_active: boolean;
  product_name: string | null;
  created_at: string | null;
};

export type LicenseProduct = {
  id: number;
  name: string;
  description: string | null;
  default_features: string[] | null;
  default_expiry_days: number | null;
  is_active: boolean;
  created_at: string | null;
  matched_catalog_product_id?: string | null;
  matched_catalog_product_title?: string | null;
  matched_catalog_product_slug?: string | null;
  sync_keyword?: string | null;
};

export type LicenseCatalogProduct = {
  id: string;
  title: string;
  slug: string;
  badge: string | null;
  is_active: boolean;
};

export type LicenseSession = {
  id: string;
  user_id: string;
  user_email: string;
  session_token: string;
  device_info: string | null;
  ip_address: string | null;
  last_heartbeat: string;
  created_at: string;
  is_active: boolean;
};

export type LicenseNotification = {
  id: number;
  product_name: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "danger" | "light";
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

export type LicenseOrderLead = {
  id: string;
  wp_order_id: number | null;
  nama: string | null;
  email: string | null;
  no_hp: string | null;
  produk: string | null;
  product_id: number | null;
  harga: number | null;
  kode_unik: number | null;
  total: number | null;
  quantity: number | null;
  status: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type LicenseBootstrap = {
  configured: boolean;
  users: LicenseUser[];
  products: LicenseProduct[];
  catalogProducts: LicenseCatalogProduct[];
  sessions: LicenseSession[];
  notifications: LicenseNotification[];
  orderLeads: LicenseOrderLead[];
};
