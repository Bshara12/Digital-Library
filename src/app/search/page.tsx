import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getAllBooks } from '@/lib/books';
import { SearchView } from '@/components/search/SearchView';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'البحث',
  description: 'ابحث في متن كتب عصام السالم كاملة — لا في العناوين وحدها.',
};

export default function SearchPage() {
  return (
    <>
      <main className="mx-auto max-w-4xl px-6 pb-28 pt-20">
        <h1 className="font-display text-4xl text-gold-300 sm:text-5xl">البحث الشامل</h1>
        <hr className="rule-gold mt-6" />

        <Suspense
          fallback={<div className="mt-12 h-14 animate-pulse rounded-sm bg-ink-900" />}
        >
          <SearchView books={getAllBooks()} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
