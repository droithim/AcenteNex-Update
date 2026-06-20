const { createClient } = require('@supabase/supabase-js');
const store = require('./store');
const { logger } = require('./utils/logger');
const crypto = require('crypto');

let supabaseClient = null;

/**
 * PII Masking: Emails are hashed to comply with KVKK/GDPR
 */
function maskEmail(email) {
  if (!email) return 'unknown';
  const hash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
  return \`masked_\${hash.substring(0, 8)}\`;
}

/**
 * Supabase client'ı başlatır
 */
function initSupabase(url, anonKey) {
  try {
    const cleanKey = anonKey.trim().replace(/^Bearer\s+/i, '');
    
    supabaseClient = createClient(url, cleanKey);
    
    store.set('supabaseUrl', url);
    store.set('supabaseAnonKey', cleanKey);
    
    logger.info('Supabase client başlatıldı');
    return { success: true };
  } catch (error) {
    logger.error('Supabase başlatma hatası', { message: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Kayıtlı Supabase bağlantısını yükler
 */
function loadSupabase() {
  const url = store.get('supabaseUrl');
  const anonKey = store.get('supabaseAnonKey');
  
  if (url && anonKey) {
    logger.debug('Supabase bağlantısı yükleniyor...');
    const result = initSupabase(url, anonKey);
    if (result.success) {
      logger.info('Supabase bağlantısı başarıyla yüklendi');
    } else {
      logger.error('Supabase bağlantısı yüklenemedi', { error: result.error });
    }
    return result;
  }
  
  logger.warn('Supabase bilgileri store\'da bulunamadı');
  return { success: false, error: 'Supabase bilgileri bulunamadı' };
}

/**
 * Supabase client'ı döndürür
 */
function getSupabase() {
  if (!supabaseClient) {
    logger.debug('Supabase client yok, yükleniyor...');
    const result = loadSupabase();
    if (!result.success) {
      logger.error('Supabase client yüklenemedi', { error: result.error });
      return null;
    }
  }
  return supabaseClient;
}

/**
 * Bağlantıyı test eder
 */
async function testConnection() {
  try {
    const client = getSupabase();
    if (!client) {
      return { success: false, error: 'Client başlatılamadı' };
    }

    const { error } = await client.from('musteriler').select('count').limit(1);
    
    if (error && (error.code === 'PGRST116' || error.message.includes('relation "musteriler" does not exist'))) {
      // Tablo yoksa şemayı kurmak yerine kullanıcıya rehberlik et
      return { 
        success: false, 
        needsSchema: true,
        error: 'Veritabanı şeması henüz kurulmamış. Lütfen Ayarlar > Veritabanı bölümünden şemayı oluşturun.' 
      };
    }
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Veritabanı şemasını kurar (Robust Mechanism)
 */
async function setupSchema() {
  logger.info('Şema kurulumu tetiklendi.');
  // Burası gelecekte otomatik migration için kullanılabilir.
  // Şimdilik testConnection'dan dönen needsSchema flag'i ile UI tarafında yönlendirme yapılıyor.
  return { 
    success: false, 
    error: 'Otomatik şema kurulumu desteklenmiyor. Lütfen manuel kurulum adımlarını izleyin.' 
  };
}

/**
 * AUTH: Kullanıcı girişi yapar
 */
async function signIn(email, password) {
  try {
    logger.debug('Giriş denemesi', { email: maskEmail(email) });
    
    const client = getSupabase();
    if (!client) {
      logger.error('Supabase client bulunamadı');
      throw new Error('Supabase bağlantısı kurulamadı. Lütfen ayarları kontrol edin.');
    }

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.error('Supabase auth hatası', { message: error.message });
      throw error;
    }
    
    logger.info('Giriş başarılı', { email: maskEmail(data.user?.email) });
    
    return { success: true, session: data.session, user: data.user };
  } catch (error) {
    logger.error('signIn catch bloğu', { message: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * AUTH: Kullanıcı çıkışı yapar
 */
async function signOut() {
  try {
    const client = getSupabase();
    if (!client) return { success: true };

    const { error } = await client.auth.signOut();
    if (error) throw error;
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * AUTH: Mevcut oturumu döndürür
 */
async function getSession() {
  try {
    const client = getSupabase();
    if (!client) return { session: null };

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    
    return { session: data.session };
  } catch (error) {
    return { session: null, error: error.message };
  }
}

/**
 * AUTH: Şifre sıfırlama e-postası gönderir
 */
async function resetPassword(email) {
  try {
    const client = getSupabase();
    if (!client) throw new Error('Supabase client bulunamadı');

    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: 'acentenex://reset-password'
    });

    if (error) throw error;
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * STORAGE: Signed URL oluşturur
 */
async function getStorageSignedUrl(bucket, path, expiresIn = 604800) {
  try {
    const client = getSupabase();
    if (!client) throw new Error('Supabase client bulunamadı');

    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      logger.error('Signed URL oluşturma hatası', { message: error.message });
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    logger.error('getStorageSignedUrl hatası', { message: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = {
  initSupabase,
  loadSupabase,
  getSupabase,
  testConnection,
  setupSchema,
  signIn,
  signOut,
  getSession,
  resetPassword,
  getStorageSignedUrl
};

/**
 * DATABASE: Müşteri arama (Server-side filtering & Pagination)
 */
async function searchCustomers(query, limit = 50, offset = 0) {
  try {
    const client = getSupabase();
    if (!client) throw new Error('Supabase client not initialized');
    
    let dbQuery = client
      .from('musteriler')
      .select('*', { count: 'exact' });

    if (query) {
      // SQL injection safe via Supabase filters
      dbQuery = dbQuery.or(\`ad.ilike.%\${query}%,soyad.ilike.%\${query}%,tckn.eq.\${query}\`);
    }

    const { data, count, error } = await dbQuery
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data, count };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports.searchCustomers = searchCustomers;
