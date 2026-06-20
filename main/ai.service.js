/**
 * AI Service - Premium Lisans ile Edge Function Entegrasyonu
 */

const { logger } = require('./utils/logger');
const { EDGE_FUNCTIONS } = require('./config/constants');
const store = require('./store');

/**
 * Token-safe Chunking/Truncation
 * Approximation: 1 token ~= 4 characters for English/Technical text.
 * Max limit set to 12,000 tokens (approx 48,000 chars) to stay safe under 16k context limits.
 */
function truncateToTokenLimit(text, maxTokens = 12000) {
  const charMultiplier = 3.2; const maxChars = Math.floor(maxTokens * charMultiplier);
  if (text.length <= maxChars) return text;
  
  logger.warn('Metin token limitini aşıyor, kırpılıyor...', { 
    originalLength: text.length, 
    limit: maxChars 
  });
  
  // Try to cut at the last space to avoid breaking words
  const truncated = text.substring(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > (maxChars * 0.8) ? truncated.substring(0, lastSpace) : truncated;
}

/**
 * Edge Function ile fotoğraftan poliçe bilgilerini çıkarır
 */
async function extractPolicyDataFromImage(base64Image, mimeType) {
  try {
    const licenseKey = store.get('licenseKey');
    if (!licenseKey) {
      return { 
        success: false, 
        error: 'Lisans anahtarı bulunamadı. Lütfen giriş yapın.' 
      };
    }

    const { SUPABASE_ANON_KEY } = require('./config/constants');

    const response = await fetch(`${EDGE_FUNCTIONS.AI_ANALYZE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer \${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        licenseKey,
        base64Data: base64Image,
        mimeType,
        type: 'image'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('AI Edge Function HTTP hatası', { 
        status: response.status, 
        message: errorData.error 
      });
      
      return { 
        success: false, 
        error: errorData.error || \`Sunucu hatası: \${response.status}\` 
      };
    }

    const result = await response.json();
    return result;

  } catch (error) {
    logger.error('AI Edge Function çağrı hatası', { message: error.message });
    return { success: false, error: 'AI analizi sırasında bir hata oluştu.' };
  }
}

/**
 * Edge Function ile PDF metninden poliçe bilgilerini çıkarır
 */
async function extractPolicyDataFromText(pdfText) {
  try {
    const licenseKey = store.get('licenseKey');
    
    if (!licenseKey) {
      return { 
        success: false, 
        error: 'Lisans anahtarı bulunamadı. Lütfen giriş yapın.' 
      };
    }

    // ✅ GÜVENLİK: Token-safe chunking/truncation
    const safeText = truncateToTokenLimit(pdfText);

    const response = await fetch(`${EDGE_FUNCTIONS.AI_ANALYZE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer \${require('./config/constants').SUPABASE_ANON_KEY}`,
        'apikey': require('./config/constants').SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        licenseKey,
        base64Data: safeText,
        type: 'text'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('AI Edge Function HTTP hatası', { 
        status: response.status, 
        message: errorData.error
      });
      
      return { 
        success: false, 
        error: errorData.error || \`Sunucu hatası: \${response.status}\` 
      };
    }

    const result = await response.json();
    return result;

  } catch (error) {
    logger.error('AI Edge Function çağrı hatası', { message: error.message });
    return { success: false, error: 'PDF analizi sırasında bir hata oluştu.' };
  }
}

/**
 * AI servisini test eder
 */
async function testAIService() {
  try {
    const licenseKey = store.get('licenseKey');
    if (!licenseKey) {
      return { success: false, error: 'Lisans anahtarı bulunamadı' };
    }

    const testText = 'Test metni - AI servisi çalışıyor mu?';
    const { SUPABASE_ANON_KEY } = require('./config/constants');
    
    const response = await fetch(`${EDGE_FUNCTIONS.AI_ANALYZE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer \${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        licenseKey,
        base64Data: testText,
        type: 'text'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || 'Test başarısız' };
    }

    return { success: true };
  } catch (error) {
    logger.error('AI servisi test hatası', { message: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = {
  extractPolicyDataFromText,
  extractPolicyDataFromImage,
  testAIService
};
