export function getSafeAppPath(value: string | undefined) {
  return value?.startsWith('/app') && !value.startsWith('//') ? value : '/app';
}
