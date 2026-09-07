import { getAllBooks, getLibraryStats } from '@/lib/books';
import { Splash } from '@/components/Splash';
import { Hero } from '@/components/Hero';
import { Shelf } from '@/components/Shelf';
import { Footer } from '@/components/Footer';

export default function Home() {
  const books = getAllBooks();
  const stats = getLibraryStats();

  return (
    <>
      <Splash />
      <main>
        <Hero stats={stats} />
        <Shelf books={books} />
      </main>
      <Footer />
    </>
  );
}
