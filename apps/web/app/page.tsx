const stages = [
  [
    'Исследование',
    'Есть foundation-код; пользовательское рабочее пространство не реализовано.',
    'NOT_IMPLEMENTED',
  ],
  [
    'Контент',
    'Есть domain/service foundation; сквозной редакционный flow не реализован.',
    'NOT_IMPLEMENTED',
  ],
  [
    'Публикации',
    'Есть contracts и state foundation; календарь и dispatch не реализованы.',
    'NOT_IMPLEMENTED',
  ],
  [
    'Аналитика',
    'Есть data/provider foundation; сбор и интерфейс метрик не реализованы.',
    'NOT_IMPLEMENTED',
  ],
] as const;

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AMS CONTENT FACTORY</p>
          <h1>Операционная система контента</h1>
        </div>
        <button
          className="button button-secondary"
          type="button"
          disabled
          aria-describedby="brand-help"
        >
          Выбрать бренд
        </button>
      </header>
      <p id="brand-help" className="sr-only">
        Сначала подключите бренд в рабочем пространстве.
      </p>
      <section className="intro" aria-labelledby="workspace-title">
        <div>
          <p className="eyebrow">Рабочее пространство</p>
          <h2 id="workspace-title">Технический фундамент</h2>
          <p>
            Продуктовый интерфейс ещё не подключён к рабочим операциям. Разработка идёт по Master
            Implementation Plan с проверяемыми безопасными этапами.
          </p>
        </div>
        <div className="status-card" role="status">
          <span className="status-dot" aria-hidden="true" />
          FOUNDATION
        </div>
      </section>
      <section aria-labelledby="modules-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Контур продукта</p>
            <h2 id="modules-title">Модули</h2>
          </div>
          <span className="muted">0 из 4 пользовательских модулей реализовано</span>
        </div>
        <div className="module-grid">
          {stages.map(([title, description, status]) => (
            <article className="module-card" key={title}>
              <div className="module-card__top">
                <h3>{title}</h3>
                <span className="badge">{status}</span>
              </div>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="empty-state" aria-labelledby="empty-title">
        <div>
          <p className="eyebrow">Следующее действие</p>
          <h2 id="empty-title">Рабочее пространство ещё не реализовано</h2>
          <p>
            Следующая продуктовая задача — закрыть security invariants, затем подключить защищённый
            application shell и реальные операции бренда.
          </p>
        </div>
        <button className="button" type="button" disabled>
          Недоступно до W5
        </button>
      </section>
      <section className="notice" aria-labelledby="security-title">
        <h2 id="security-title">Безопасный режим</h2>
        <p>
          Публикация и внешние интеграции выполняются только после проверки tenant-доступа и явного
          согласования.
        </p>
      </section>
    </main>
  );
}
