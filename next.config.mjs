/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  /*
   * محتوى الكتب يُقرأ بمسار مبنيّ وقت التشغيل (`process.cwd()/content`)،
   * ولا يستطيع متتبّع الملفات في Next استنتاجه ساكناً. صفحات الموقع
   * كلها ثابتة فتقرأه وقت البناء ولا تتأثّر، لكن المسارات الديناميكية
   * (لوحة الإدارة، وأي كتاب أُضيف قبل اكتمال إعادة النشر) تقرأه وقت
   * الطلب — فنُلزم Vercel بتضمينه في حزمة الدوال.
   */
  outputFileTracingIncludes: {
    '/admin': ['./content/**/*.json', './data/*.json'],
    '/book/[slug]': ['./content/**/*.json', './data/*.json'],
    '/read/[slug]': ['./content/**/*.json', './data/*.json'],
    '/search-index/[slug]': ['./content/**/*.json', './data/*.json'],
    '/api/admin/**': ['./content/**/*.json', './data/*.json'],
  },
  async headers() {
    return [
      {
        // ملفات الكتب الأصلية لا تُخدم مباشرة أبداً — طبقة حماية إضافية
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
