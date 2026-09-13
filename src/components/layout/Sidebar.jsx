import { Link, useLocation } from 'react-router-dom';
import { TOOL_ICONS } from '../icons/toolIcons';
import { TOOL_CATEGORIES } from '../../config/toolCatalog';
import { useI18n } from '../../contexts/I18nContext';

export default function Sidebar({ className = '' }) {
  const { t } = useI18n();
  const location = useLocation();

  return (
    <nav className={`space-y-7 ${className}`} aria-label={t('layout_tool_directory')}>
      {TOOL_CATEGORIES.map((category) => {
        const CategoryIcon = TOOL_ICONS[category.icon];
        return (
          <section key={category.id}>
            <h2 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--faint)]">
              <CategoryIcon className="size-3.5" aria-hidden="true" />
              {t(category.titleKey)}
            </h2>
            <ul className="border-l border-[var(--line)]">
              {category.tools.map((tool) => {
                const isActive = location.pathname === tool.path;
                return (
                  <li key={tool.path}>
                    <Link
                      to={tool.path}
                      className={`-ml-px flex min-h-11 items-center border-l px-3 text-sm transition-colors ${
                        isActive
                          ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] font-medium text-[var(--text-strong)]'
                          : 'border-transparent text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-strong)]'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {t(tool.titleKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
