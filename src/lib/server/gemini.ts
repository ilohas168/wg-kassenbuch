import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '$env/dynamic/private';

/**
 * Belegerkennung ueber die Gemini API mit Bild-Input.
 *
 * Der Key steht ausschliesslich hier, serverseitig (harte Regel 6). Diese Datei liegt
 * unter lib/server/, damit SvelteKit den Build abbricht, falls sie je in Client-Code
 * importiert wird.
 */
/** Bildformate, die die API annimmt. HEIC gehoert nicht dazu - der Client wandelt zu JPEG. */
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

const SYSTEM_PROMPT = `Du liest Kassenbelege aus der Schweiz und aus Deutschland und gibst sie als JSON zurück.

Antworte ausschliesslich mit JSON. Kein Fliesstext, keine Erklärung, keine Markdown-Fences.

Schema:
{"merchant":"string","purchased_at":"YYYY-MM-DD","currency":"CHF"|"EUR","total_minor":4730,"line_items":[{"label":"string","amount_minor":1860}]}

Beträge sind ganzzahlig in Minor Units: Rappen bei CHF, Eurocent bei EUR. 47.30 CHF sind 4730. Niemals Kommazahlen.

Regeln für die Positionen:
- Rabatte (Aktion, Cumulus-Bon, Supercard, Coupon, Treuerabatt) sind eigene Zeilen mit negativem Betrag. Übernimm sie als negative Position, verrechne sie nicht mit dem Artikel.
- Depot und Pfand sind eigene Positionen mit positivem Betrag. Pfandrückgabe und Leergutrücknahme sind eigene Positionen mit negativem Betrag.
- Die MwSt-Aufstellung am Belegende (Schweiz) und die Steuerübersicht (Deutschland, "A 19%", "B 7%") sind keine Positionen. Ebenso wenig Zwischensummen, das Total, Rundungszeilen, Zahlungsart, Rückgeld, Punktestände und Kundennummern.
- Deutsche Belege schreiben das Dezimaltrennzeichen als Komma: "2,49" sind 249.
- Artikelnamen brechen manchmal über zwei Zeilen um. Fasse sie zu einem Label zusammen.
- Eine Zeile "2 x 1,29" gehört als eine Position mit dem Gesamtbetrag (258), nicht als zwei.
- Die Reihenfolge der Positionen bleibt die des Belegs.

Weitere Regeln:
- purchased_at ist das Kaufdatum vom Beleg. Ist keines lesbar, lass das Feld leer ("").
- currency: Migros, Coop, Denner, Aldi Suisse, Lidl Schweiz und Preise in CHF oder Fr. bedeuten "CHF". Rewe, Lidl, Aldi, Edeka, Netto, Penny und Preise in EUR oder € bedeuten "EUR".
- total_minor ist das Total, das auf dem Beleg steht. Rechne es nicht aus den Positionen aus. Wenn du eine Zeile nicht lesen kannst, lass sie weg - die Differenz fällt dann auf, und das ist gewollt.`;

let client: GoogleGenerativeAI | null = null;

function gemini(): GoogleGenerativeAI {
	if (client) return client;

	const apiKey = env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY fehlt. Ohne den Key gibt es keine Belegerkennung.');
	}

	client = new GoogleGenerativeAI(apiKey);
	return client;
}

/** Schickt das Foto an das Modell und gibt dessen Rohtext zurueck. Geparst wird anderswo. */
export async function readReceiptImage(
	imageBase64: string,
	mediaType: SupportedImageType
): Promise<string> {
	const model = gemini().getGenerativeModel({
		model: 'gemini-3.6-flash',
		systemInstruction: SYSTEM_PROMPT
	});

	const imagePart = {
		inlineData: {
			mimeType: mediaType,
			data: imageBase64
		}
	};

	const textPart = {
		text: 'Lies diesen Beleg und gib ihn als JSON zurück.'
	};

	const response = await model.generateContent([imagePart, textPart]);

	if (response.response.candidates?.[0]?.finishReason === 'RECITATION' ||
		response.response.candidates?.[0]?.finishReason === 'SAFETY') {
		throw new Error('Das Modell hat die Antwort abgelehnt.');
	}

	return response.response.text();
}