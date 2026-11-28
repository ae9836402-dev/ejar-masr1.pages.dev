import { BRAND } from '../src/lib/brand'
import { FEATURES_DESC, FEATURES_FAQ, FEATURES_INTRO, FEATURES_PATH, FEATURES_TITLE, FEATURE_SECTIONS } from '../src/content/features'
import type { Env } from './_lib/env'
import { siteUrl } from './_lib/env'
import { renderShell } from './_lib/pages'
import { bodyHtml, faqJsonLd } from './_lib/seoBody'

/** GET /features: a server-rendered page about what the site offers (keywords for the site's real features), with FAQ structured data. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const base = siteUrl(env)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: FEATURES_TITLE, description: FEATURES_DESC, url: `${base}${FEATURES_PATH}`, inLanguage: 'ar' },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: BRAND, item: `${base}/` }, { '@type': 'ListItem', position: 2, name: 'المميزات' }] },
      faqJsonLd(FEATURES_FAQ),
    ],
  }
  const html = bodyHtml({
    h1: FEATURES_TITLE,
    paragraphs: FEATURES_INTRO,
    sections: [
      ...FEATURE_SECTIONS.map((s) => ({ h2: s.h2, text: s.text })),
      { h2: 'أسئلة شائعة', faqs: FEATURES_FAQ },
      { h2: 'ابدأ من هنا', links: [{ href: '/search', text: 'ابحث عن وحدة للإيجار' }, { href: '/dashboard/new', text: 'أضف وحدتك' }, { href: '/plans', text: 'الإعلانات المميزة وباقات السماسرة' }, { href: '/payments-policy', text: 'سياسة الإيجار والدفع' }, { href: '/blog', text: 'المدونة' }] },
    ],
  })
  return renderShell(request, env, { title: `${FEATURES_TITLE} | ${BRAND}`, description: FEATURES_DESC, path: FEATURES_PATH, jsonLd, bodyHtml: html, cacheControl: 'public, max-age=300, s-maxage=3600' })
}
