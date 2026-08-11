const plannedModules = [
  'Бренды и знания',
  'Исследования',
  'Контент и согласование',
  'Видео, публикации и аналитика',
];

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl p-8 sm:p-12">
      <p className="text-sm font-medium tracking-wide text-sky-800">AMS CONTENT FACTORY</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Основа операционной системы готова
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
        Здесь появится управляемый контур от знаний бренда и исследования источников до
        согласования, публикации и обучения на результатах.
      </p>
      <section className="mt-10 grid gap-4 sm:grid-cols-2" aria-label="Запланированные модули">
        {plannedModules.map((module) => (
          <article
            key={module}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="font-medium text-slate-900">{module}</h2>
            <p className="mt-2 text-sm text-slate-600">Модуль будет подключён в своей Wave.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
