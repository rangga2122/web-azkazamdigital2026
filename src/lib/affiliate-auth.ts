import { createServiceRoleClient } from "@/lib/supabase/server";

export const DEFAULT_AFFILIATE_LOGIN_PASSWORD = "azkazamdigital123";

type ServiceSupabase = Awaited<ReturnType<typeof createServiceRoleClient>>;

export async function findAuthUserByEmail(
  supabase: ServiceSupabase,
  email: string
) {
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) return null;

    const user = data.users.find(
      (item) => item.email?.toLowerCase() === email.toLowerCase()
    );
    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }

  return null;
}

export async function ensureAffiliateAuthAccount({
  supabase,
  email,
  fullName,
}: {
  supabase: ServiceSupabase;
  email: string;
  fullName: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await findAuthUserByEmail(supabase, normalizedEmail);

  let userId = existingUser?.id || null;
  let createdAutomatically = false;

  if (!userId) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: DEFAULT_AFFILIATE_LOGIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "affiliate",
      },
    });

    if (authError || !authData.user?.id) {
      throw new Error(authError?.message || "Akun login affiliate gagal dibuat.");
    }

    userId = authData.user.id;
    createdAutomatically = true;
  }

  await supabase
    .from("users_profiles")
    .upsert(
      {
        id: userId,
        full_name: fullName || null,
        role: "affiliate",
      },
      { onConflict: "id" }
    );

  await supabase
    .from("affiliates")
    .update({ user_id: userId, full_name: fullName || undefined })
    .eq("email", normalizedEmail);

  return {
    userId,
    createdAutomatically,
    defaultPassword: createdAutomatically ? DEFAULT_AFFILIATE_LOGIN_PASSWORD : null,
  };
}
