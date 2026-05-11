function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function createCaptureFilename(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `capture-${yyyy}${mm}${dd}-${hh}${min}${ss}.png`;
}
