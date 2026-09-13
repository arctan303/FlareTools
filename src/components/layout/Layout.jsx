import Header from './Header';
import Footer from './Footer';
import MouseHalo from '../ui/MouseHalo';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const { pathname } = useLocation();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative isolate flex min-h-screen flex-col overflow-x-clip"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_12%_8%,color-mix(in_srgb,var(--accent)_7%,transparent),transparent_38%)]" aria-hidden="true" />
      {pathname === '/' && <MouseHalo />}
      <Header />
      <main className="w-full flex-1 py-8 sm:py-12 lg:py-14">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <Footer />
    </motion.div>
  );
}
