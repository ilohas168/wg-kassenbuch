import {
	assertReceiptIsConsistent,
	freezeTotalChf,
	parseRate,
	sumLineItems,
	type Currency,
	type Participant
} from '$lib/money/index.js';
import type { ReceiptDraft } from './repository.js';

/**
 * Liest den Entwurf aus dem Formular ein und prueft ihn, bevor er in die DB geht.
 *
 * Das Formular ist JavaScript, also nichts, worauf man sich verlassen kann. Betraege,
 * Zuordnungen und Summen werden hier noch einmal gerechnet - die Werte aus dem Client
 * werden nicht uebernommen, sondern nachvollzogen.
 */
export function parseReceiptDraft(raw: unknown, participants: Participant[]): ReceiptDraft {
	const input = expectObject(raw, 'Beleg');

	const merchant = expectString(input.merchant, 'Laden').trim();
	if (merchant.length === 0) {
		throw new DraftError('Der Laden fehlt.');
	}

	const purchasedAt = expectString(input.purchasedAt, 'Datum').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedAt) || Number.isNaN(Date.parse(purchasedAt))) {
		throw new DraftError(`"${purchasedAt}" ist kein gueltiges Datum.`);
	}

	const currency = expectString(input.currency, 'Waehrung') as Currency;
	if (currency !== 'CHF' && currency !== 'EUR') {
		throw new DraftError(`Waehrung ${currency} wird nicht unterstuetzt.`);
	}

	const known = new Map(participants.map((participant) => [participant.id, participant]));
	const paidBy = expectString(input.paidBy, 'Zahler');
	if (!known.has(paidBy)) {
		throw new DraftError('Der Zahler ist kein bekannter Teilnehmer.');
	}

	const rawLineItems = Array.isArray(input.lineItems) ? input.lineItems : [];
	if (rawLineItems.length === 0) {
		throw new DraftError('Ein Beleg braucht mindestens eine Position.');
	}

	const lineItems = rawLineItems.map((rawItem, index) => {
		const item = expectObject(rawItem, `Position ${index + 1}`);
		const label = expectString(item.label ?? '', `Position ${index + 1}`).trim();
		const amountMinor = item.amountMinor;
		if (!Number.isSafeInteger(amountMinor)) {
			throw new DraftError(`Position ${index + 1} hat keinen gueltigen Betrag.`);
		}

		const participantIds = Array.isArray(item.participantIds) ? item.participantIds : [];
		if (participantIds.length === 0) {
			throw new DraftError(
				`Position ${index + 1}${label ? ` ("${label}")` : ''} ist keinem Teilnehmer zugeordnet.`
			);
		}

		const seen = new Set<string>();
		for (const participantId of participantIds) {
			if (typeof participantId !== 'string' || !known.has(participantId)) {
				throw new DraftError(`Position ${index + 1} verweist auf einen unbekannten Teilnehmer.`);
			}
			if (seen.has(participantId)) {
				throw new DraftError(`Position ${index + 1} hat denselben Teilnehmer doppelt.`);
			}
			seen.add(participantId);
		}

		return {
			// Ein Beleg ohne Quittung ist ein Beleg mit einer Position - dann traegt sie
			// einfach den Namen des Ladens.
			label: label.length > 0 ? label : merchant,
			amountMinor: amountMinor as number,
			shares: [...seen].map((participantId) => ({ participantId, weight: 1 }))
		};
	});

	// Das Beleg-Total ist die Summe der Positionen. Ein abweichendes Total aus dem OCR
	// bekommt in Phase 3 einen eigenen Weg, in der manuellen Erfassung gibt es das nicht.
	const totalMinor = sumLineItems(lineItems);
	const fxRateToChf = currency === 'CHF' ? '1' : expectString(input.fxRateToChf, 'Wechselkurs');
	const rate = parseRate(fxRateToChf);
	const totalChfMinor = currency === 'CHF' ? totalMinor : freezeTotalChf(totalMinor, rate);

	const draft: ReceiptDraft = {
		merchant,
		purchasedAt,
		currency,
		totalMinor,
		fxRateToChf,
		totalChfMinor,
		paidBy,
		lineItems
	};

	try {
		assertReceiptIsConsistent({ ...draft, lineItems: draft.lineItems });
	} catch (error) {
		throw new DraftError(error instanceof Error ? error.message : String(error));
	}

	return draft;
}

/** Fehler, dessen Meldung direkt im Formular angezeigt werden darf. */
export class DraftError extends Error {}

function expectObject(value: unknown, what: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new DraftError(`${what} ist unvollstaendig.`);
	}
	return value as Record<string, unknown>;
}

function expectString(value: unknown, what: string): string {
	if (typeof value !== 'string') {
		throw new DraftError(`${what} fehlt.`);
	}
	return value;
}
