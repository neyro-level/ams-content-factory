import type { Feature } from '../lib/features';
import { featureStatusLabel } from '../lib/features';

export function FeatureState({ feature }: { feature: Feature }) {
  return (
    <section className="empty-state" aria-labelledby={`${feature.key}-title`}>
      <div>
        <p className="eyebrow">{featureStatusLabel[feature.status]}</p>
        <h1 id={`${feature.key}-title`}>{feature.label}</h1>
        <p>{feature.description}</p>
        <p className="muted">Эта часть общей цепочки: {feature.workflow}.</p>
        <h2>Здесь появится</h2>
        <ul>
          {feature.planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <button className="button button-secondary" type="button" disabled>
        Функция пока недоступна
      </button>
    </section>
  );
}
