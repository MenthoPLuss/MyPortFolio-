/** Deposit a continuous pointer segment with energy measured per second, not per frame. */
export function depositStroke(
  x: number, y: number, dx: number, dy: number, dt: number, aspect: number,
  emit: (x: number, y: number, dx: number, dy: number, amount: number) => void,
): void {
  if (dt <= 0 || !Number.isFinite(dx + dy + dt + x + y + aspect)) return;
  const distance = Math.hypot(dx * aspect, dy);
  if (distance < 1e-7) return;
  const speed = distance / dt;
  const steps = Math.min(8, Math.max(1, Math.ceil(distance / 0.025)));
  const amount = (5.4 + Math.min(19.2, speed * 6)) * dt / steps;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    emit(x - dx * (1 - t), y - dy * (1 - t), dx / steps, dy / steps, amount);
  }
}
