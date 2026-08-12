export default function AppHomePage() {
  return (
    <main className="app-content">
      <section className="empty-state" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">Рабочее пространство</p>
          <h1 id="app-title">Доступ к приложению подтверждён</h1>
          <p>
            Создайте или выберите организацию, чтобы продолжить настройку брендов и
            контент-процессов.
          </p>
        </div>
        <a className="button" href="/app/organizations">
          Перейти к организациям
        </a>
      </section>
    </main>
  );
}
