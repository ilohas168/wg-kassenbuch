/**
 * Datumshilfen. Bewusst ohne toISOString(): das rechnet nach UTC, und in Basel waere
 * ein Einkauf um 23:30 sonst auf gestern datiert.
 */

export function todayIso(now: Date = new Date()): string {
	const year = now.getFullYear();
	const month = `${now.getMonth() + 1}`.padStart(2, '0');
	const day = `${now.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** "2026-08-27" -> "27.08.2026" */
export function formatIsoDate(iso: string): string {
	const [year, month, day] = iso.split('-');
	return `${day}.${month}.${year}`;
}
