export default function AppHomePage() {
  return (
    <main className="app-content">
      <section className="empty-state" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">Рабочее пространство</p>
          <h1 id="app-title">Доступ к приложению подтверждён</h1>
          <p>
            Следующий шаг — создать или выбрать организацию. Управление организациями и брендами
            будет подключено отдельными задачами W5.2–W5.3.
          </p>
        </div>
        <span className="badge">FOUNDATION</span>
      </section>
    </main>
  );
}
