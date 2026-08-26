/**
 * Belegfoto fuer den Upload vorbereiten - im Browser, vor dem Senden.
 *
 * Zwei Gruende, das nicht einfach hochzuladen wie es kommt:
 *
 *   1. iPhones speichern HEIC. Die Messages API nimmt JPEG, PNG, WebP und GIF - HEIC
 *      nicht. Der Umweg ueber ein Canvas macht daraus JPEG, weil Safari HEIC dekodieren
 *      kann, auch wenn die API es nicht lesen will.
 *   2. Ein Handyfoto hat gut und gern 4 MB. Fuer einen Kassenzettel bringt das nichts:
 *      jenseits von etwa 1600 Pixel Kantenlaenge wird die Erkennung nicht besser, der
 *      Upload im Zug aber deutlich laenger.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function prepareReceiptPhoto(file: File): Promise<File> {
	const bitmap = await createImageBitmap(file).catch(() => null);
	if (!bitmap) {
		// Kein Dekoder im Browser. Wenn das Format an sich passt, geht es unveraendert raus.
		if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return file;
		throw new Error('Dieses Bildformat kann der Browser nicht öffnen. Bitte als JPEG aufnehmen.');
	}

	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const context = canvas.getContext('2d');
	if (!context) throw new Error('Der Browser kann das Bild nicht verarbeiten.');
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/jpeg', QUALITY)
	);
	if (!blob) throw new Error('Das Bild konnte nicht umgewandelt werden.');

	return new File([blob], 'beleg.jpg', { type: 'image/jpeg' });
}
