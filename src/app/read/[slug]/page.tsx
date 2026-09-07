import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getBookMeta, getBookPages, getBookSlugs } from '@/lib/books';
import { Reader } from '@/components/reader/Reader';

export function generateStaticParams() {
  return getBookSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!getBookSlugs().includes(slug)) return {};
  return {
    title: `قراءة — ${getBookMeta(slug).title}`,
    // صفحات القراءة لا تُفهرس: التعريف يُفهرس، والنصّ الكامل لا
    robots: { index: false, follow: true },
  };
}

export default async function ReadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getBookSlugs().includes(slug)) notFound();

  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-950" />}>
      <Reader book={getBookMeta(slug)} pages={getBookPages(slug)} />
    </Suspense>
  );
}
