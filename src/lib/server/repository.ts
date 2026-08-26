import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Currency,
	LineItem,
	Participant,
	ParticipantId,
	Receipt,
	Settlement
} from '$lib/money/index.js';

/** Ein Beleg, wie er aus der DB kommt: die Rechenfelder plus Anzeige- und Schluesselfelder. */
export interface StoredReceipt extends Receipt {
	id: string;
	merchant: string;
	purchasedAt: string;
	photoPath: string | null;
	createdAt: string;
	lineItems: StoredLineItem[];
}

export interface StoredLineItem extends LineItem {
	id: string;
	sortOrder: number;
}

/** Was die Erfassungs-UI schickt, bevor daraus ein Beleg wird. */
export interface ReceiptDraft {
	merchant: string;
	purchasedAt: string;
	currency: Currency;
	totalMinor: number;
	fxRateToChf: string;
	totalChfMinor: number;
	paidBy: ParticipantId;
	/** Wer den Beleg erfasst hat. Beschreibt die Erfassung, nicht den Einkauf. */
	createdBy?: ParticipantId | null;
	/** Pfad im Storage-Bucket, falls ein Foto dazugehoert. */
	photoPath?: string | null;
	lineItems: { label: string; amountMinor: number; shares: { participantId: ParticipantId; weight: number }[] }[];
}

const RECEIPT_COLUMNS =
	'id, merchant, purchased_at, currency, total_minor, fx_rate_to_chf::text, total_chf_minor, paid_by, photo_path, created_at, ' +
	'line_items(id, label, amount_minor, sort_order, line_item_shares(participant_id, weight))';

export async function listParticipants(client: SupabaseClient): Promise<Participant[]> {
	const { data, error } = await client
		.from('participants')
		.select('id, display_name, kind, is_active')
		.order('kind', { ascending: true })
		.order('created_at', { ascending: true });

	if (error) throw new Error(`Teilnehmer konnten nicht geladen werden: ${error.message}`);

	return (data ?? []).map((row) => ({
		id: row.id as string,
		displayName: row.display_name as string,
		kind: row.kind as Participant['kind'],
		isActive: row.is_active as boolean
	}));
}

/**
 * Der Teilnehmer hinter einem Konto. Laeuft bewusst ueber den Nutzer-Client: wer noch
 * nicht verknuepft ist, bekommt von den Policies nichts zurueck - genau die Antwort,
 * die der Guard braucht.
 */
export async function participantForAuthUser(
	client: SupabaseClient,
	authUserId: string
): Promise<Participant | null> {
	const { data, error } = await client
		.from('participants')
		.select('id, display_name, kind, is_active')
		.eq('auth_user_id', authUserId)
		.maybeSingle();

	if (error) throw new Error(`Konto konnte nicht zugeordnet werden: ${error.message}`);
	if (!data) return null;

	return {
		id: data.id as string,
		displayName: data.display_name as string,
		kind: data.kind as Participant['kind'],
		isActive: data.is_active as boolean
	};
}

export async function listReceipts(client: SupabaseClient): Promise<StoredReceipt[]> {
	const { data, error } = await client
		.from('receipts')
		.select(RECEIPT_COLUMNS)
		.order('purchased_at', { ascending: false })
		.order('created_at', { ascending: false })
		.order('sort_order', { referencedTable: 'line_items', ascending: true });

	if (error) throw new Error(`Belege konnten nicht geladen werden: ${error.message}`);
	return (data ?? []).map(toStoredReceipt);
}

export async function getReceipt(client: SupabaseClient, id: string): Promise<StoredReceipt | null> {
	const { data, error } = await client
		.from('receipts')
		.select(RECEIPT_COLUMNS)
		.eq('id', id)
		.order('sort_order', { referencedTable: 'line_items', ascending: true })
		.maybeSingle();

	if (error) throw new Error(`Beleg konnte nicht geladen werden: ${error.message}`);
	return data ? toStoredReceipt(data) : null;
}

export async function listSettlements(client: SupabaseClient): Promise<Settlement[]> {
	const { data, error } = await client
		.from('settlements')
		.select('from_participant, to_participant, amount_chf_minor')
		.order('settled_at', { ascending: false });

	if (error) throw new Error(`Ausgleichszahlungen konnten nicht geladen werden: ${error.message}`);

	return (data ?? []).map((row) => ({
		fromParticipant: row.from_participant as string,
		toParticipant: row.to_participant as string,
		amountChfMinor: row.amount_chf_minor as number
	}));
}

/** Legt Beleg, Positionen und Anteile in einer Transaktion an (RPC create_receipt). */
export async function createReceipt(client: SupabaseClient, draft: ReceiptDraft): Promise<string> {
	const { data, error } = await client.rpc('create_receipt', { payload: toPayload(draft) });
	if (error) throw new Error(`Beleg konnte nicht gespeichert werden: ${error.message}`);
	return data as string;
}

/** Ersetzt Kopfdaten und saemtliche Positionen eines Belegs (RPC update_receipt). */
export async function updateReceipt(client: SupabaseClient, id: string, draft: ReceiptDraft): Promise<void> {
	const { error } = await client.rpc('update_receipt', {
		target_receipt_id: id,
		payload: toPayload(draft)
	});
	if (error) throw new Error(`Beleg konnte nicht aktualisiert werden: ${error.message}`);
}

export async function deleteReceipt(client: SupabaseClient, id: string): Promise<void> {
	const { error } = await client.from('receipts').delete().eq('id', id);
	if (error) throw new Error(`Beleg konnte nicht geloescht werden: ${error.message}`);
}

function toPayload(draft: ReceiptDraft) {
	return {
		merchant: draft.merchant,
		purchased_at: draft.purchasedAt,
		currency: draft.currency,
		total_minor: draft.totalMinor,
		fx_rate_to_chf: draft.fxRateToChf,
		total_chf_minor: draft.totalChfMinor,
		paid_by: draft.paidBy,
		created_by: draft.createdBy ?? '',
		photo_path: draft.photoPath ?? '',
		line_items: draft.lineItems.map((item) => ({
			label: item.label,
			amount_minor: item.amountMinor,
			shares: item.shares.map((share) => ({
				participant_id: share.participantId,
				weight: share.weight
			}))
		}))
	};
}

interface ReceiptRow {
	id: string;
	merchant: string;
	purchased_at: string;
	currency: Currency;
	total_minor: number;
	// Bewusst als Text aus der DB geholt (fx_rate_to_chf::text): eine JSON-Zahl waere
	// eine Gleitkommazahl, und der eingefrorene Kurs soll bleiben, was er ist.
	fx_rate_to_chf: string;
	total_chf_minor: number;
	paid_by: string;
	photo_path: string | null;
	created_at: string;
	line_items: {
		id: string;
		label: string;
		amount_minor: number;
		sort_order: number;
		line_item_shares: { participant_id: string; weight: number }[];
	}[];
}

function toStoredReceipt(row: unknown): StoredReceipt {
	const receipt = row as ReceiptRow;
	return {
		id: receipt.id,
		merchant: receipt.merchant,
		purchasedAt: receipt.purchased_at,
		currency: receipt.currency,
		paidBy: receipt.paid_by,
		totalMinor: receipt.total_minor,
		fxRateToChf: receipt.fx_rate_to_chf,
		totalChfMinor: receipt.total_chf_minor,
		photoPath: receipt.photo_path,
		createdAt: receipt.created_at,
		lineItems: [...(receipt.line_items ?? [])]
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((item) => ({
				id: item.id,
				label: item.label,
				amountMinor: item.amount_minor,
				sortOrder: item.sort_order,
				shares: [...(item.line_item_shares ?? [])].map((share) => ({
					participantId: share.participant_id,
					weight: share.weight
				}))
			}))
	};
}
