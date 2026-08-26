import { describe, expect, it } from 'vitest';
import { computeBalances, simplifyDebts } from './balance.js';
import type { Participant, Receipt, Settlement } from './types.js';

const shinichiro: Participant = { id: 'm1', displayName: 'Shinichiro', kind: 'member', isActive: true };
const fabian: Participant = { id: 'm2', displayName: 'Fabian', kind: 'member', isActive: true };
const pierre: Participant = { id: 'm3', displayName: 'Pierre', kind: 'member', isActive: true };
const gast: Participant = { id: 'g1', displayName: 'Yuki', kind: 'guest', isActive: true };

const members = [shinichiro, fabian, pierre];

/** CHF 45.00: 30.00 fuer alle vier, 15.00 nur fuer die Mitglieder. Bezahlt von Shinichiro. */
const chfReceiptWithGuest: Receipt = {
	currency: 'CHF',
	paidBy: 'm1',
	totalMinor: 4500,
	fxRateToChf: '1',
	totalChfMinor: 4500,
	lineItems: [
		{ label: 'Grillgut', amountMinor: 3000, shares: shares('m1', 'm2', 'm3', 'g1') },
		{ label: 'Waschmittel', amountMinor: 1500, shares: shares('m1', 'm2', 'm3') }
	]
};

/** EUR 47.30 zum eingefrorenen Kurs 0.9537 = CHF 45.11. Bezahlt von Fabian. */
const eurReceipt: Receipt = {
	currency: 'EUR',
	paidBy: 'm2',
	totalMinor: 4730,
	fxRateToChf: '0.9537',
	totalChfMinor: 4511,
	lineItems: [
		{ label: 'Getraenke', amountMinor: 1860, shares: shares('m1', 'm2', 'm3') },
		{ label: 'Kaese', amountMinor: 1240, shares: shares('m1', 'm2') },
		{ label: 'Pfand', amountMinor: 1630, shares: shares('m3') }
	]
};

describe('computeBalances', () => {
	it('rechnet den Gast wie ein Mitglied ab, ohne ihm das Waschmittel unterzuschieben', () => {
		const balances = computeBalances([...members, gast], [chfReceiptWithGuest], []);
		expect(balances.get('g1')).toBe(-750); // nur das Grillgut
		expect(balances.get('m1')).toBe(4500 - 1250);
		expect(balances.get('m2')).toBe(-1250);
		expect(balances.get('m3')).toBe(-1250);
		expect(sum(balances)).toBe(0);
	});

	it('laesst archivierte Gaeste die Vergangenheit unveraendert', () => {
		const aktiv = computeBalances([...members, gast], [chfReceiptWithGuest, eurReceipt], []);
		const archiviert = computeBalances(
			[...members, { ...gast, isActive: false }],
			[chfReceiptWithGuest, eurReceipt],
			[]
		);
		expect([...archiviert.entries()]).toEqual([...aktiv.entries()]);
		expect(archiviert.get('g1')).toBe(-750);
	});

	it('aggregiert ueber mehrere Belege in beiden Waehrungen', () => {
		const balances = computeBalances([...members, gast], [chfReceiptWithGuest, eurReceipt], []);
		expect(balances.get('m1')).toBe(3250 - 1182);
		expect(balances.get('m2')).toBe(-1250 + (4511 - 1183));
		expect(balances.get('m3')).toBe(-1250 - 2146);
		expect(balances.get('g1')).toBe(-750);
		expect(sum(balances)).toBe(0);
	});

	it('verrechnet Ausgleichszahlungen', () => {
		const settlement: Settlement = { fromParticipant: 'g1', toParticipant: 'm1', amountChfMinor: 750 };
		const balances = computeBalances([...members, gast], [chfReceiptWithGuest], [settlement]);
		expect(balances.get('g1')).toBe(0);
		expect(balances.get('m1')).toBe(3250 - 750);
		expect(sum(balances)).toBe(0);
	});

	it('fuehrt Teilnehmer ohne jeden Beleg mit Saldo 0', () => {
		const balances = computeBalances([...members, gast], [], []);
		expect([...balances.values()]).toEqual([0, 0, 0, 0]);
	});
});

describe('simplifyDebts', () => {
	it('loest die WG mit drei Ueberweisungen statt mit sechs auf', () => {
		const balances = computeBalances([...members, gast], [chfReceiptWithGuest, eurReceipt], []);
		const transfers = simplifyDebts(balances);
		expect(transfers).toHaveLength(3);
		expectSettles(balances, transfers);
	});

	it('gibt bei ausgeglichenen Salden nichts zurueck', () => {
		expect(simplifyDebts(new Map([['m1', 0], ['m2', 0]]))).toEqual([]);
	});

	it('nutzt exakt passende Paare und bleibt unter n-1 Zahlungen', () => {
		// Zwei unabhaengige Paare: eine Kette ueber alle vier braeuchte drei Zahlungen.
		const balances = new Map([
			['a', 5000],
			['b', 3000],
			['c', -5000],
			['d', -3000]
		]);
		const transfers = simplifyDebts(balances);
		expectSettles(balances, transfers);
		expect(transfers).toHaveLength(2);
	});

	it('ist deterministisch', () => {
		const balances = new Map([
			['a', 6000],
			['b', 4000],
			['c', -5000],
			['d', -5000]
		]);
		expect(simplifyDebts(balances)).toEqual(simplifyDebts(new Map([...balances.entries()].reverse())));
	});

	it('gleicht beliebige Salden vollstaendig aus', () => {
		const random = lcg(31337);
		for (let run = 0; run < 300; run++) {
			const count = 2 + (random() % 5);
			const balances = new Map<string, number>();
			let rest = 0;
			for (let i = 0; i < count - 1; i++) {
				const amount = (random() % 20000) - 10000;
				balances.set(`p${i}`, amount);
				rest -= amount;
			}
			balances.set(`p${count - 1}`, rest);
			const transfers = simplifyDebts(balances);
			expectSettles(balances, transfers);
			expect(transfers.length).toBeLessThanOrEqual(count - 1);
			expect(transfers.every((transfer) => transfer.amountChfMinor > 0)).toBe(true);
		}
	});

	it('meldet Salden, die sich nicht auf 0 summieren', () => {
		expect(() => simplifyDebts(new Map([['m1', 100]]))).toThrow(/summieren sich/);
	});
});

function shares(...participantIds: string[]) {
	return participantIds.map((participantId) => ({ participantId, weight: 1 }));
}

function sum(balances: Map<string, number>): number {
	let result = 0;
	for (const balance of balances.values()) result += balance;
	return result;
}

/** Nach allen Ueberweisungen muss jeder Saldo auf 0 stehen. */
function expectSettles(balances: Map<string, number>, transfers: { fromParticipant: string; toParticipant: string; amountChfMinor: number }[]) {
	const remaining = new Map(balances);
	for (const transfer of transfers) {
		remaining.set(transfer.fromParticipant, (remaining.get(transfer.fromParticipant) ?? 0) + transfer.amountChfMinor);
		remaining.set(transfer.toParticipant, (remaining.get(transfer.toParticipant) ?? 0) - transfer.amountChfMinor);
	}
	expect([...remaining.values()].every((balance) => balance === 0)).toBe(true);
}

function lcg(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state;
	};
}
