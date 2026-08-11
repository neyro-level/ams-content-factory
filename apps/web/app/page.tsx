const stages = [
  ['Исследование', 'Inbox и проверенные источники', 'Готово'],
  ['Контент', 'Проекты, версии и согласование', 'Готово'],
  ['Публикации', 'Календарь и социальные аккаунты', 'Готово'],
  ['Аналитика', 'Метрики, затраты и инсайты', 'Готово'],
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
          <h2 id="workspace-title">Контур готов к настройке</h2>
          <p>
            Подключите первый бренд, чтобы собирать знания, планировать контент, выпускать
            публикации и получать измеримые рекомендации.
          </p>
        </div>
        <div className="status-card" role="status">
          <span className="status-dot" aria-hidden="true" />
          Локальная инфраструктура доступна
        </div>
      </section>
      <section aria-labelledby="modules-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Контур продукта</p>
            <h2 id="modules-title">Модули</h2>
          </div>
          <span className="muted">4 из 4 доступны</span>
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
          <h2 id="empty-title">Нет активного бренда</h2>
          <p>
            После авторизации выберите бренд. Здесь появятся задачи, статусы публикаций и последние
            метрики.
          </p>
        </div>
        <button className="button" type="button" disabled>
          Создать контент-проект
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
