import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { computeReceiptShares, type Receipt } from '$lib/money/index.js';

/**
 * Integrationstests gegen echtes Postgres (PGlite, WASM, im Prozess).
 *
 * Getestet werden die Migrationen selbst: Constraints, die Schreib-RPCs und der
 * Rueckweg in die Rechenlogik. Damit ist der SQL-Pfad geprueft, ohne dass Docker
 * oder ein Cloud-Projekt laufen muss.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const SHINICHIRO = '00000000-0000-4000-8000-000000000001';
const FABIAN = '00000000-0000-4000-8000-000000000002';
const PIERRE = '00000000-0000-4000-8000-000000000003';

let db: PGlite;

beforeAll(async () => {
	db = await PGlite.create();
	// Supabase bringt das auth-Schema mit; hier steht ein Stub dafuer, damit die
	// Fremdschluesselreferenz aus participants aufloest.
	await db.exec('create schema auth; create table auth.users (id uuid primary key);');

	for (const file of readdirSync(MIGRATIONS).sort()) {
		await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
	}
}, 60_000);

// Nach jedem Test zurueck auf den Seed-Stand. Belege raeumen ihre Positionen und
// Anteile per cascade selbst ab; die drei Mitglieder bleiben stehen.
afterEach(async () => {
	await db.exec(
		"delete from receipts; delete from settlements; delete from participants where kind = 'guest';"
	);
});

describe('Migrationen', () => {
	it('legt die drei Mitglieder an', async () => {
		const result = await db.query<{ display_name: string; kind: string; is_active: boolean }>(
			'select display_name, kind, is_active from participants order by display_name'
		);
		expect(result.rows.map((row) => row.display_name)).toEqual(['Fabian', 'Pierre', 'Shinichiro']);
		expect(result.rows.every((row) => row.kind === 'member' && row.is_active)).toBe(true);
	});

	it('ist idempotent - der Seed laeuft ohne Duplikate erneut', async () => {
		const seed = readdirSync(MIGRATIONS).find((file) => file.includes('seed_members')) as string;
		await db.exec(readFileSync(join(MIGRATIONS, seed), 'utf8'));
		const result = await db.query<{ count: string }>('select count(*)::text as count from participants');
		expect(result.rows[0].count).toBe('3');
	});

	it('hat RLS auf allen Tabellen aktiv', async () => {
		const result = await db.query<{ tablename: string; rowsecurity: boolean }>(
			"select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename"
		);
		expect(result.rows).toEqual([
			{ tablename: 'line_item_shares', rowsecurity: true },
			{ tablename: 'line_items', rowsecurity: true },
			{ tablename: 'participants', rowsecurity: true },
			{ tablename: 'receipts', rowsecurity: true },
			{ tablename: 'settlements', rowsecurity: true }
		]);
	});
});

describe('Constraints', () => {
	it('laesst bei CHF keinen anderen Kurs als 1 zu', async () => {
		await expect(
			insertReceipt({ currency: 'CHF', totalMinor: 1000, rate: '0.98', totalChfMinor: 980 })
		).rejects.toThrow(/receipts_chf_rate_is_one/);
	});

	it('erzwingt bei CHF gleiche Totale', async () => {
		await expect(
			insertReceipt({ currency: 'CHF', totalMinor: 1000, rate: '1', totalChfMinor: 999 })
		).rejects.toThrow(/receipts_chf_totals_match/);
	});

	it('gibt einem Gast kein Konto', async () => {
		await db.exec("insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000ff');");
		await expect(
			db.exec(
				"insert into participants (display_name, kind, auth_user_id) values ('Yuki', 'guest', '00000000-0000-4000-8000-0000000000ff');"
			)
		).rejects.toThrow(/participants_guest_has_no_auth_user/);
	});

	it('verhindert eine Ausgleichszahlung an sich selbst', async () => {
		await expect(
			db.exec(
				`insert into settlements (from_participant, to_participant, amount_chf_minor)
				 values ('${FABIAN}', '${FABIAN}', 500);`
			)
		).rejects.toThrow(/settlements_distinct_parties/);
	});

	it('laesst Teilnehmer nicht loeschen, solange Belege an ihnen haengen', async () => {
		const id = await createReceipt({
			merchant: 'Coop',
			paidBy: PIERRE,
			lineItems: [{ label: 'Brot', amountMinor: 380, shares: [PIERRE] }]
		});
		await expect(db.exec(`delete from participants where id = '${PIERRE}';`)).rejects.toThrow(
			/violates RESTRICT setting of foreign key constraint/
		);
	});
});

describe('create_receipt', () => {
	it('schreibt Beleg, Positionen und Anteile in einem Aufruf', async () => {
		const id = await createReceipt({
			merchant: 'Migros',
			paidBy: SHINICHIRO,
			lineItems: [
				{ label: 'Grillgut', amountMinor: 3000, shares: [SHINICHIRO, FABIAN, PIERRE] },
				{ label: 'Cumulus-Bon', amountMinor: -250, shares: [SHINICHIRO, FABIAN, PIERRE] },
				{ label: 'Zigaretten', amountMinor: 890, shares: [FABIAN] }
			]
		});

		const items = await db.query<{ label: string; amount_minor: number; sort_order: number; shares: number }>(
			`select label, amount_minor, sort_order,
			        (select count(*) from line_item_shares s where s.line_item_id = l.id)::int as shares
			 from line_items l where receipt_id = $1 order by sort_order`,
			[id]
		);

		expect(items.rows).toEqual([
			{ label: 'Grillgut', amount_minor: 3000, sort_order: 0, shares: 3 },
			{ label: 'Cumulus-Bon', amount_minor: -250, sort_order: 1, shares: 3 },
			{ label: 'Zigaretten', amount_minor: 890, sort_order: 2, shares: 1 }
		]);

	});

	it('nimmt keinen Beleg ohne Positionen an', async () => {
		await expect(
			db.query('select create_receipt($1::jsonb)', [
				JSON.stringify({
					merchant: 'Leer',
					purchased_at: '2026-08-27',
					currency: 'CHF',
					total_minor: 0,
					fx_rate_to_chf: '1',
					total_chf_minor: 0,
					paid_by: FABIAN,
					line_items: []
				})
			])
		).rejects.toThrow(/mindestens eine Position/);
	});

	it('nimmt keine Position ohne Teilnehmer an', async () => {
		await expect(
			createReceipt({
				merchant: 'Niemand',
				paidBy: FABIAN,
				lineItems: [{ label: 'Herrenlos', amountMinor: 100, shares: [] }]
			})
		).rejects.toThrow(/keinem Teilnehmer zugeordnet/);
	});

	it('rollt bei einem Fehler den ganzen Beleg zurueck', async () => {
		const before = await count('receipts');
		await expect(
			createReceipt({
				merchant: 'Halb',
				paidBy: FABIAN,
				lineItems: [
					{ label: 'Gute Position', amountMinor: 100, shares: [FABIAN] },
					{ label: 'Kaputte Position', amountMinor: 100, shares: [] }
				]
			})
		).rejects.toThrow();
		expect(await count('receipts')).toBe(before);
		expect(await count('line_items')).toBe(0);
	});
});

describe('update_receipt', () => {
	it('ersetzt Kopf und Positionen', async () => {
		const id = await createReceipt({
			merchant: 'Coop',
			paidBy: FABIAN,
			lineItems: [{ label: 'Alt', amountMinor: 500, shares: [FABIAN] }]
		});

		await db.query('select update_receipt($1::uuid, $2::jsonb)', [
			id,
			JSON.stringify({
				merchant: 'Coop Pronto',
				purchased_at: '2026-08-20',
				currency: 'CHF',
				total_minor: 700,
				fx_rate_to_chf: '1',
				total_chf_minor: 700,
				paid_by: PIERRE,
				line_items: [
					{ label: 'Neu A', amount_minor: 300, shares: [{ participant_id: PIERRE, weight: 1 }] },
					{ label: 'Neu B', amount_minor: 400, shares: [{ participant_id: FABIAN, weight: 1 }] }
				]
			})
		]);

		const receipt = await db.query<{ merchant: string; paid_by: string; total_minor: number }>(
			'select merchant, paid_by, total_minor from receipts where id = $1',
			[id]
		);
		expect(receipt.rows[0]).toEqual({ merchant: 'Coop Pronto', paid_by: PIERRE, total_minor: 700 });

		const labels = await db.query<{ label: string }>(
			'select label from line_items where receipt_id = $1 order by sort_order',
			[id]
		);
		expect(labels.rows.map((row) => row.label)).toEqual(['Neu A', 'Neu B']);

		// Die alten Anteile haengen nicht mehr herum.
		const orphans = await db.query<{ count: string }>(
			`select count(*)::text as count from line_item_shares s
			 where not exists (select 1 from line_items l where l.id = s.line_item_id)`
		);
		expect(orphans.rows[0].count).toBe('0');

	});

	it('meldet einen Beleg, den es nicht gibt', async () => {
		await expect(
			db.query('select update_receipt($1::uuid, $2::jsonb)', [
				'00000000-0000-4000-8000-00000000dead',
				JSON.stringify({
					merchant: 'X',
					purchased_at: '2026-08-27',
					currency: 'CHF',
					total_minor: 100,
					fx_rate_to_chf: '1',
					total_chf_minor: 100,
					paid_by: FABIAN,
					line_items: [{ label: 'A', amount_minor: 100, shares: [{ participant_id: FABIAN, weight: 1 }] }]
				})
			])
		).rejects.toThrow(/existiert nicht/);
	});
});

describe('Rueckweg in die Rechenlogik', () => {
	it('liefert einen EUR-Beleg so zurueck, dass die Anteile exakt aufgehen', async () => {
		const id = await createReceipt({
			merchant: 'Rewe',
			paidBy: FABIAN,
			currency: 'EUR',
			rate: '0.9537',
			totalChfMinor: 4511,
			lineItems: [
				{ label: 'Getraenke', amountMinor: 1860, shares: [SHINICHIRO, FABIAN, PIERRE] },
				{ label: 'Kaese', amountMinor: 1240, shares: [SHINICHIRO, FABIAN] },
				{ label: 'Pfand', amountMinor: 1630, shares: [PIERRE] }
			]
		});

		const row = await db.query<{
			currency: 'CHF' | 'EUR';
			paid_by: string;
			total_minor: number;
			fx_rate_to_chf: string;
			total_chf_minor: number;
		}>(
			// ::text wie im Repository: der eingefrorene Kurs darf nicht ueber eine
			// Gleitkommazahl laufen.
			'select currency, paid_by, total_minor, fx_rate_to_chf::text, total_chf_minor from receipts where id = $1',
			[id]
		);
		expect(row.rows[0].fx_rate_to_chf).toBe('0.9537000000');

		const items = await db.query<{ label: string; amount_minor: number; participant_id: string }>(
			`select l.label, l.amount_minor, s.participant_id
			 from line_items l join line_item_shares s on s.line_item_id = l.id
			 where l.receipt_id = $1 order by l.sort_order, s.participant_id`,
			[id]
		);

		const grouped = new Map<string, { label: string; amountMinor: number; shares: { participantId: string; weight: number }[] }>();
		for (const item of items.rows) {
			const entry = grouped.get(item.label) ?? { label: item.label, amountMinor: item.amount_minor, shares: [] };
			entry.shares.push({ participantId: item.participant_id, weight: 1 });
			grouped.set(item.label, entry);
		}

		const receipt: Receipt = {
			currency: row.rows[0].currency,
			paidBy: row.rows[0].paid_by,
			totalMinor: row.rows[0].total_minor,
			fxRateToChf: row.rows[0].fx_rate_to_chf,
			totalChfMinor: row.rows[0].total_chf_minor,
			lineItems: [...grouped.values()]
		};

		const shares = computeReceiptShares(receipt);
		expect([...shares.values()].reduce((sum, share) => sum + share, 0)).toBe(4511);
		expect(shares.get(SHINICHIRO)).toBe(1182);
		expect(shares.get(FABIAN)).toBe(1183);
		expect(shares.get(PIERRE)).toBe(2146);

	});

	it('haelt einen archivierten Gast in alten Belegen fest', async () => {
		const guest = await db.query<{ id: string }>(
			"insert into participants (display_name, kind) values ('Yuki', 'guest') returning id"
		);
		const guestId = guest.rows[0].id;

		const id = await createReceipt({
			merchant: 'Grill',
			paidBy: SHINICHIRO,
			lineItems: [{ label: 'Fleisch', amountMinor: 3000, shares: [SHINICHIRO, guestId] }]
		});

		await db.exec(`update participants set is_active = false where id = '${guestId}';`);

		const shares = await db.query<{ participant_id: string }>(
			`select s.participant_id from line_item_shares s
			 join line_items l on l.id = s.line_item_id where l.receipt_id = $1 order by s.participant_id`,
			[id]
		);
		expect(shares.rows.map((row) => row.participant_id).sort()).toEqual([SHINICHIRO, guestId].sort());

	});
});

async function count(table: string): Promise<number> {
	const result = await db.query<{ count: string }>(`select count(*)::text as count from ${table}`);
	return Number(result.rows[0].count);
}

async function insertReceipt(options: {
	currency: 'CHF' | 'EUR';
	totalMinor: number;
	rate: string;
	totalChfMinor: number;
}) {
	return db.exec(
		`insert into receipts (merchant, purchased_at, currency, total_minor, fx_rate_to_chf, total_chf_minor, paid_by)
		 values ('Test', '2026-08-27', '${options.currency}', ${options.totalMinor}, ${options.rate}, ${options.totalChfMinor}, '${FABIAN}');`
	);
}

async function createReceipt(options: {
	merchant: string;
	paidBy: string;
	currency?: 'CHF' | 'EUR';
	rate?: string;
	totalChfMinor?: number;
	lineItems: { label: string; amountMinor: number; shares: string[] }[];
}): Promise<string> {
	const totalMinor = options.lineItems.reduce((sum, item) => sum + item.amountMinor, 0);
	const result = await db.query<{ create_receipt: string }>('select create_receipt($1::jsonb)', [
		JSON.stringify({
			merchant: options.merchant,
			purchased_at: '2026-08-27',
			currency: options.currency ?? 'CHF',
			total_minor: totalMinor,
			fx_rate_to_chf: options.rate ?? '1',
			total_chf_minor: options.totalChfMinor ?? totalMinor,
			paid_by: options.paidBy,
			line_items: options.lineItems.map((item) => ({
				label: item.label,
				amount_minor: item.amountMinor,
				shares: item.shares.map((participantId) => ({ participant_id: participantId, weight: 1 }))
			}))
		})
	]);
	return result.rows[0].create_receipt;
}
