'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '../lib/auth-client';
import { featureHref, featureStatusLabel, type Feature } from '../lib/features';

const navigationItems = [
  { href: '/app', label: 'Рабочее пространство', exact: true },
  { href: '/app/organizations', label: 'Организации', exact: false },
] as const;

function isCurrentPath(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavigation({ features }: { features: Feature[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const brandMatch = pathname.match(/^\/app\/organizations\/([^/]+)\/brands\/([^/]+)/);
  const brandBase = brandMatch
    ? `/app/organizations/${brandMatch[1]}/brands/${brandMatch[2]}`
    : undefined;
  const featureGroups = Array.from(
    features.reduce((groups, feature) => {
      const entries = groups.get(feature.group) ?? [];
      entries.push(feature);
      groups.set(feature.group, entries);
      return groups;
    }, new Map<string, Feature[]>()),
  );

  async function signOut() {
    setError(undefined);
    setPending(true);
    const result = await authClient.signOut();
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? 'Не удалось завершить сессию. Повторите попытку.');
      return;
    }

    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="app-navigation-wrap">
      <nav className="app-navigation" aria-label="Навигация приложения">
        {navigationItems.map((item) => {
          const current = isCurrentPath(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              className={
                current
                  ? 'app-navigation__link app-navigation__link--current'
                  : 'app-navigation__link'
              }
              href={item.href}
              aria-current={current ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
        {brandBase
          ? featureGroups.map(([group, features]) => (
              <div className="app-navigation__group" key={group}>
                <p className="app-navigation__group-title">{group}</p>
                {features.map((feature) => {
                  const href = featureHref(brandBase, feature);
                  const current = isCurrentPath(pathname, href, false);
                  return (
                    <Link
                      key={feature.key}
                      className={
                        current
                          ? 'app-navigation__link app-navigation__link--current'
                          : 'app-navigation__link'
                      }
                      href={href}
                      aria-current={current ? 'page' : undefined}
                    >
                      {feature.label}{' '}
                      {feature.status === 'READY' ? '' : `(${featureStatusLabel[feature.status]})`}
                    </Link>
                  );
                })}
              </div>
            ))
          : null}
      </nav>
      <div className="app-session-actions">
        <button
          className="button button-secondary button-compact"
          type="button"
          onClick={signOut}
          disabled={pending}
        >
          {pending ? 'Выходим…' : 'Выйти'}
        </button>
        {error ? (
          <p className="form-error app-session-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
