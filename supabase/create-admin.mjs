// Script untuk membuat admin user di Supabase
// Jalankan: node supabase/create-admin.mjs

const SUPABASE_URL = 'https://rgzjrrqlbvvnzoiwjjku.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnempycnFsYnZ2bnpvaXdqamt1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMjY1NywiZXhwIjoyMDg2MTA4NjU3fQ.jvpH4XS165bWwBM6MPvIe_aQuWE4KRUJoHP7nIs_CxI';

const ADMIN_EMAIL = 'azam@gmail.com';
const ADMIN_PASSWORD = 'Nr201105';

async function createAdmin() {
  console.log('🔧 Membuat admin user...');
  console.log(`📧 Email: ${ADMIN_EMAIL}`);

  // Step 1: Buat user di Supabase Auth (atau dapatkan existing user)
  console.log('\n1️⃣ Membuat user di Supabase Auth...');
  
  const createUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true, // Auto-confirm email
    }),
  });

  const createUserData = await createUserRes.json();
  
  let userId;
  
  if (createUserRes.ok) {
    userId = createUserData.id;
    console.log(`   ✅ User berhasil dibuat! ID: ${userId}`);
  } else if (createUserData.msg?.includes('already been registered') || createUserData.message?.includes('already been registered')) {
    console.log('   ⚠️ User sudah ada, mencari ID...');
    
    // List users dan cari yang matching
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
    });
    const listData = await listRes.json();
    const existingUser = listData.users?.find(u => u.email === ADMIN_EMAIL);
    
    if (existingUser) {
      userId = existingUser.id;
      console.log(`   ✅ User ditemukan! ID: ${userId}`);
      
      // Update password
      console.log('   🔑 Memperbarui password...');
      const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          password: ADMIN_PASSWORD,
          email_confirm: true,
        }),
      });
      
      if (updateRes.ok) {
        console.log('   ✅ Password diperbarui!');
      } else {
        const err = await updateRes.json();
        console.log('   ❌ Gagal update password:', err);
      }
    } else {
      console.log('   ❌ User tidak ditemukan dalam daftar!');
      return;
    }
  } else {
    console.log('   ❌ Error:', JSON.stringify(createUserData));
    return;
  }

  // Step 2: Buat profile di users_profiles
  console.log('\n2️⃣ Membuat profile di users_profiles...');
  
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/users_profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: userId,
      full_name: 'Admin Azkazam',
      role: 'super_admin',
    }),
  });

  if (profileRes.ok || profileRes.status === 201 || profileRes.status === 209) {
    console.log('   ✅ Profile berhasil dibuat!');
  } else {
    const err = await profileRes.text();
    console.log('   ⚠️ Profile response:', profileRes.status, err);
  }

  // Step 3: Masukkan ke tabel admins
  console.log('\n3️⃣ Menambahkan ke tabel admins...');
  
  const adminRes = await fetch(`${SUPABASE_URL}/rest/v1/admins`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      role: 'super_admin',
      is_active: true,
    }),
  });

  if (adminRes.ok || adminRes.status === 201 || adminRes.status === 209) {
    console.log('   ✅ Admin record berhasil dibuat!');
  } else {
    const err = await adminRes.text();
    console.log('   ⚠️ Admin response:', adminRes.status, err);
  }

  // Step 4: Verifikasi
  console.log('\n4️⃣ Verifikasi login...');
  
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });

  if (loginRes.ok) {
    console.log('   ✅ Login berhasil! Admin siap digunakan.');
  } else {
    const err = await loginRes.json();
    console.log('   ❌ Login gagal:', err.error_description || err.message || JSON.stringify(err));
  }

  console.log('\n🎉 Selesai! Silakan login di http://localhost:3000/login');
  console.log(`   Email: ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
}

createAdmin().catch(console.error);
