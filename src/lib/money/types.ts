/** Gemeinsame Typen der Geld- und Aufteilungslogik. */

export type Currency = 'CHF' | 'EUR';

export type ParticipantId = string;

export type ParticipantKind = 'member' | 'guest';

export interface Participant {
	id: ParticipantId;
	displayName: string;
	kind: ParticipantKind;
	isActive: boolean;
}

/** Zuordnung einer Position zu einem Teilnehmer. weight ist in v1 immer 1. */
export interface ShareAssignment {
	participantId: ParticipantId;
	weight: number;
}

/** Eine Position in Belegwaehrung. amountMinor darf negativ sein (Rabatt, Pfandrueckgabe). */
export interface LineItem {
	label: string;
	amountMinor: number;
	shares: ShareAssignment[];
}

/**
 * Ein Beleg, so wie ihn die Aufteilungslogik braucht.
 * fxRateToChf und totalChfMinor sind beim Erfassen eingefroren und werden hier nur gelesen.
 */
export interface Receipt {
	currency: Currency;
	/** Wer den Beleg bezahlt hat. Darf auch ein Gast sein. */
	paidBy: ParticipantId;
	totalMinor: number;
	fxRateToChf: string;
	totalChfMinor: number;
	lineItems: LineItem[];
}

/** Eine Ausgleichszahlung. Markiert eine Schuld als beglichen, bewegt kein Geld. */
export interface Settlement {
	fromParticipant: ParticipantId;
	toParticipant: ParticipantId;
	amountChfMinor: number;
}

/** Eine vorgeschlagene Ueberweisung aus der Saldo-Vereinfachung. */
export interface Transfer {
	fromParticipant: ParticipantId;
	toParticipant: ParticipantId;
	amountChfMinor: number;
}
