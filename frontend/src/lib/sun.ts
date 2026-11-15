export function subsolarPoint(date: Date): [number, number] {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  const declination = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365.24);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const longitude = ((((12 - hours) * 15 + 180) % 360) + 360) % 360 - 180;
  return [longitude, declination];
}
