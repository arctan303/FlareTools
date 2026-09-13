import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { TOOL_ICONS } from '../components/icons/toolIcons';
import { HOME_TOOLS } from '../config/toolCatalog';
import { useI18n } from '../contexts/I18nContext';
import { motion } from 'framer-motion';

const stagger = {
  animate: { transition: { staggerChildren: 0.1 } },
};
const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] } },
};


export default function Home() {
  const { t } = useI18n();

  return (
    <div className="space-y-10 sm:space-y-12">
      <SEO titleKey="site_name" descriptionKey="site_description" />

      <motion.section variants={stagger} initial="initial" animate="animate" className="border-b border-[var(--line)] pb-8 pt-1 sm:pb-10">
        <div className="max-w-3xl">
          <motion.p variants={fadeUp} className="mb-3 font-mono text-base font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
            {t('hero_eyebrow')}
          </motion.p>
          <motion.h1 variants={fadeUp} className="text-balance font-brand text-3xl font-semibold leading-[1.18] tracking-[-0.03em] text-[var(--text-strong)] sm:text-4xl lg:text-5xl">
            {t('hero_title')}
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg sm:leading-8">
            {t('hero_description')}
          </motion.p>
        </div>
      </motion.section>

      <motion.section variants={stagger} initial="initial" animate="animate" aria-labelledby="all-tools-heading">
        <div className="mb-6 max-w-2xl">
          <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">{t('home_all_tools_eyebrow')}</motion.p>
          <motion.h2 variants={fadeUp} id="all-tools-heading" className="mt-2 font-brand text-2xl font-semibold text-[var(--text-strong)] sm:text-3xl">
            {t('home_all_tools_title')}
          </motion.h2>
        </div>

        <motion.div variants={stagger} className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {HOME_TOOLS.map((tool) => {
            const Icon = TOOL_ICONS[tool.icon];
            return (
              <motion.div variants={fadeUp} key={tool.path} className="flex h-full flex-col">
                <Link
                  to={tool.path}
                  data-tool-card
                  data-tool-kind={tool.categoryId === 'cross-device' ? 'cross-device' : 'local'}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                  }}
                  className="group relative flex h-full min-h-[210px] flex-col overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface)] transition-[border-color,transform] duration-[var(--motion-base)] hover:-translate-y-0.5 hover:border-[var(--line-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page)]"
                >
                  <div
                    className="pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: 'radial-gradient(400px circle at var(--mouse-x, 0) var(--mouse-y, 0), color-mix(in srgb, var(--accent) 12%, transparent), transparent 40%)',
                    }}
                    aria-hidden="true"
                  />
                  <div className="relative z-10 flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-4">
                      <span className="inline-flex size-10 items-center justify-center rounded-[8px] border border-[var(--line)] bg-[var(--page-soft)] text-[var(--accent)]">
                        <Icon className="size-[18px]" aria-hidden="true" />
                      </span>
                      <ArrowUpRight className="size-[18px] text-[var(--faint)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" aria-hidden="true" />
                    </div>
                    <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--faint)]">{t(tool.categoryTitleKey)}</p>
                    <h3 className="mt-2 font-brand text-xl font-semibold text-[var(--text-strong)]">{t(tool.titleKey)}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t(tool.descriptionKey)}</p>
                    <div className="mt-auto border-t border-[var(--line)] pt-4">
                      <span className="text-xs font-medium text-[var(--accent)]">{t(tool.scopeKey)}</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </motion.section>
    </div>
  );
}
