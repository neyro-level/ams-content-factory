export type FeatureStatus = 'READY' | 'LIMITED' | 'PLANNED';
export type Feature = {
  key: string;
  label: string;
  group: string;
  status: FeatureStatus;
  description: string;
  workflow: string;
  planned: string[];
  path: string;
};

export const featureCatalog: Feature[] = [
  {
    key: 'content',
    label: 'Контент',
    group: 'Работа с контентом',
    status: 'READY',
    description: 'Создание, генерация, версии и редакционная подготовка текста.',
    workflow: 'Knowledge → Content → READY → Copy',
    planned: [],
    path: 'content',
  },
  {
    key: 'research',
    label: 'Исследования',
    group: 'Работа с контентом',
    status: 'LIMITED',
    description: 'Материалы и источники в границах бренда.',
    workflow: 'Источники → контекст контента',
    planned: ['Внешний поиск и извлечение после подключения provider.'],
    path: 'research',
  },
  {
    key: 'knowledge',
    label: 'База знаний',
    group: 'Работа с контентом',
    status: 'READY',
    description: 'Контекст и документы бренда для подготовки текста.',
    workflow: 'Brand Context → Knowledge → Content',
    planned: [],
    path: 'knowledge',
  },
  {
    key: 'media',
    label: 'Медиа',
    group: 'Производство',
    status: 'PLANNED',
    description: 'Визуальные материалы бренда.',
    workflow: 'Content → Media → Publishing',
    planned: ['Загрузка изображений и видео', 'AI-визуалы', 'Привязка к публикациям'],
    path: 'media',
  },
  {
    key: 'video',
    label: 'Видео',
    group: 'Производство',
    status: 'PLANNED',
    description: 'Сценарии, storyboard и video QC.',
    workflow: 'Script → Storyboard → Video → QC',
    planned: ['Avatar video', 'Render jobs', 'Caption tracks'],
    path: 'video',
  },
  {
    key: 'calendar',
    label: 'Контент-календарь',
    group: 'Дистрибуция',
    status: 'PLANNED',
    description: 'Планирование будущих публикаций.',
    workflow: 'READY → Schedule → Publish',
    planned: ['Календарь бренда', 'Безопасное расписание', 'Статусы публикаций'],
    path: 'calendar',
  },
  {
    key: 'publishing',
    label: 'Публикации',
    group: 'Дистрибуция',
    status: 'PLANNED',
    description: 'Доставка одобренного контента в социальные сети.',
    workflow: 'READY → Platform → Result',
    planned: ['VK', 'Instagram', 'Reconciliation результата'],
    path: 'publishing',
  },
  {
    key: 'social-accounts',
    label: 'Социальные аккаунты',
    group: 'Дистрибуция',
    status: 'PLANNED',
    description: 'Безопасное подключение аккаунтов бренда.',
    workflow: 'Connect → Publish → Analytics',
    planned: ['VK OAuth', 'Instagram OAuth', 'Безопасное хранение токенов'],
    path: 'social-accounts',
  },
  {
    key: 'analytics',
    label: 'Аналитика',
    group: 'Аналитика',
    status: 'PLANNED',
    description: 'Эффективность публикаций без выдуманных метрик.',
    workflow: 'Published → Metrics → Insights',
    planned: ['Охваты', 'Вовлечённость', 'Рекомендации'],
    path: 'analytics',
  },
  {
    key: 'automation',
    label: 'Workflows',
    group: 'Автоматизация',
    status: 'PLANNED',
    description: 'Будущая оркестрация безопасных фоновых процессов.',
    workflow: 'Research → Content → Approval → Publishing',
    planned: ['Durable workflows', 'Контроль выполнения', 'Безопасные retries'],
    path: 'automation',
  },
  {
    key: 'integrations',
    label: 'MCP и интеграции',
    group: 'Автоматизация',
    status: 'PLANNED',
    description: 'Будущие подключения MCP, n8n, webhooks и API.',
    workflow: 'External tool → Scoped service',
    planned: ['MCP', 'n8n', 'Webhooks'],
    path: 'integrations',
  },
  {
    key: 'settings',
    label: 'Бренд',
    group: 'Настройки',
    status: 'READY',
    description: 'Контекст, позиционирование и голос бренда.',
    workflow: 'Brand Context → Knowledge → Content',
    planned: [],
    path: 'settings',
  },
];

export function resolveFeatureCatalog(input: { textGenerationAvailable: boolean }): Feature[] {
  return featureCatalog.map((feature) =>
    feature.key === 'content' && !input.textGenerationAvailable
      ? {
          ...feature,
          status: 'LIMITED',
          description:
            'Создание, версии и редакционное согласование текста доступны; AI-генерация требует подключения модели.',
          planned: ['AI-генерация и rewrite после безопасного подключения модели.'],
        }
      : feature,
  );
}

export const featureStatusLabel: Record<FeatureStatus, string> = {
  READY: 'Доступно',
  LIMITED: 'Ограниченный режим',
  PLANNED: 'В разработке',
};

export function featureHref(base: string, feature: Feature) {
  return feature.status === 'PLANNED'
    ? `${base}/planned/${feature.key}`
    : `${base}/${feature.path}`;
}
