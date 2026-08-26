<script lang="ts">
	import {
		computeReceiptShares,
		formatMoney,
		tryParseMoneyInput,
		type Participant,
		type ParticipantId
	} from '$lib/money/index.js';
	import { todayIso } from '$lib/date.js';

	interface DraftRow {
		label: string;
		amount: string;
		participantIds: ParticipantId[];
	}

	interface InitialDraft {
		merchant: string;
		purchasedAt: string;
		paidBy: ParticipantId;
		rows: DraftRow[];
	}

	let {
		participants,
		initial = null,
		submitLabel = 'Speichern',
		error = null
	}: {
		participants: Participant[];
		initial?: InitialDraft | null;
		submitLabel?: string;
		error?: string | null;
	} = $props();

	const activeMembers = $derived(
		participants.filter((participant) => participant.kind === 'member' && participant.isActive)
	);
	const activeGuests = $derived(
		participants.filter((participant) => participant.kind === 'guest' && participant.isActive)
	);

	// Auf einem alten Beleg koennen archivierte Teilnehmer stehen. Die gehoeren weiter
	// angezeigt, sonst verschwindet beim Bearbeiten stillschweigend ihre Zuordnung.
	const archived = $derived.by(() => {
		const referenced = new Set((initial?.rows ?? []).flatMap((row) => row.participantIds));
		return participants.filter(
			(participant) => !participant.isActive && referenced.has(participant.id)
		);
	});

	const byId = $derived(new Map(participants.map((participant) => [participant.id, participant])));

	// Das Formular wird einmal aus initial befuellt und gehoert danach dem Nutzer.
	// Beim Wechsel auf einen anderen Beleg haengt ein {#key} darum, das es neu aufbaut.
	// svelte-ignore state_referenced_locally
	let merchant = $state(initial?.merchant ?? '');
	// svelte-ignore state_referenced_locally
	let purchasedAt = $state(initial?.purchasedAt ?? todayIso());
	// svelte-ignore state_referenced_locally
	let paidBy = $state(initial?.paidBy ?? firstMemberId());
	// svelte-ignore state_referenced_locally
	let rows = $state<DraftRow[]>(initialRows());

	function firstMemberId(): string {
		return participants.find((participant) => participant.kind === 'member' && participant.isActive)?.id ?? '';
	}

	function emptyRow(): DraftRow {
		return {
			label: '',
			amount: '',
			participantIds: participants
				.filter((participant) => participant.kind === 'member' && participant.isActive)
				.map((participant) => participant.id)
		};
	}

	function initialRows(): DraftRow[] {
		const seeded = initial?.rows.map((row) => ({ ...row, participantIds: [...row.participantIds] }));
		return seeded && seeded.length > 0 ? seeded : [emptyRow()];
	}

	const parsedRows = $derived(
		rows.map((row) => ({
			amountMinor: row.amount.trim() === '' ? null : tryParseMoneyInput(row.amount),
			participantIds: row.participantIds
		}))
	);

	const totalMinor = $derived(
		parsedRows.every((row) => row.amountMinor !== null)
			? parsedRows.reduce((sum, row) => sum + (row.amountMinor as number), 0)
			: null
	);

	const problems = $derived(collectProblems());
	const isValid = $derived(problems.length === 0);

	/** Vorschau der Anteile - dieselbe Funktion, die spaeter auch den Saldo rechnet. */
	const preview = $derived.by(() => {
		if (totalMinor === null || !isValid) return null;
		try {
			return computeReceiptShares({
				currency: 'CHF',
				paidBy,
				totalMinor,
				fxRateToChf: '1',
				totalChfMinor: totalMinor,
				lineItems: rows.map((row, index) => ({
					label: row.label,
					amountMinor: parsedRows[index].amountMinor as number,
					shares: row.participantIds.map((participantId) => ({ participantId, weight: 1 }))
				}))
			});
		} catch {
			return null;
		}
	});

	const payload = $derived(
		JSON.stringify({
			merchant,
			purchasedAt,
			currency: 'CHF',
			paidBy,
			lineItems: rows.map((row, index) => ({
				label: row.label,
				amountMinor: parsedRows[index].amountMinor,
				participantIds: row.participantIds
			}))
		})
	);

	function collectProblems(): string[] {
		const found: string[] = [];
		if (merchant.trim() === '') found.push('Laden fehlt');
		if (purchasedAt === '') found.push('Datum fehlt');
		if (paidBy === '') found.push('Zahler fehlt');
		parsedRows.forEach((row, index) => {
			if (row.amountMinor === null) found.push(`Position ${index + 1}: Betrag fehlt oder ist ungültig`);
			if (row.participantIds.length === 0) found.push(`Position ${index + 1}: niemand zugeordnet`);
		});
		return found;
	}

	function toggle(rowIndex: number, participantId: ParticipantId) {
		const current = rows[rowIndex].participantIds;
		rows[rowIndex].participantIds = current.includes(participantId)
			? current.filter((id) => id !== participantId)
			: [...current, participantId];
	}

	function addRow() {
		rows = [...rows, emptyRow()];
	}

	function removeRow(index: number) {
		rows = rows.filter((_, rowIndex) => rowIndex !== index);
		if (rows.length === 0) addRow();
	}

	/** Gäste sind hier bewusst nicht dabei - sonst zahlt der Gast das Waschmittel mit. */
	function allTogether() {
		const ids = activeMembers.map((participant) => participant.id);
		rows = rows.map((row) => ({ ...row, participantIds: [...ids] }));
	}

	function allPrivate() {
		rows = rows.map((row) => ({ ...row, participantIds: paidBy ? [paidBy] : [] }));
	}
</script>

{#if error}
	<p class="error">{error}</p>
{/if}

<form method="POST">
	<input type="hidden" name="draft" value={payload} />

	<div class="card">
		<div class="field-grid">
			<div class="wide">
				<label for="merchant">Laden</label>
				<input
					id="merchant"
					type="text"
					bind:value={merchant}
					placeholder="Migros, Coop, …"
					autocomplete="off"
				/>
			</div>
			<div>
				<label for="purchased-at">Datum</label>
				<input id="purchased-at" type="date" bind:value={purchasedAt} />
			</div>
			<div>
				<label for="paid-by">Bezahlt von</label>
				<select id="paid-by" bind:value={paidBy}>
					{#each [...activeMembers, ...activeGuests, ...archived] as participant (participant.id)}
						<option value={participant.id}>
							{participant.displayName}{participant.isActive ? '' : ' (archiviert)'}
						</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<div class="row" style="margin-bottom: 0.5rem">
		<h2 style="margin: 0">Positionen</h2>
		<div style="display: flex; gap: 0.35rem">
			<button type="button" onclick={allTogether}>alles gemeinsam</button>
			<button type="button" onclick={allPrivate}>alles privat</button>
		</div>
	</div>

	{#each rows as row, index (index)}
		<div class="card">
			<div class="field-grid" style="grid-template-columns: 1fr 7rem auto">
				<input
					type="text"
					bind:value={row.label}
					placeholder={index === 0 ? 'Position (leer = Laden)' : 'Position'}
					aria-label="Bezeichnung Position {index + 1}"
					autocomplete="off"
				/>
				<input
					type="text"
					inputmode="decimal"
					bind:value={row.amount}
					placeholder="0.00"
					aria-label="Betrag Position {index + 1}"
					class="amount"
					style="text-align: right"
				/>
				<button
					type="button"
					class="ghost"
					onclick={() => removeRow(index)}
					aria-label="Position {index + 1} entfernen"
				>
					✕
				</button>
			</div>

			<div class="chips">
				{#each activeMembers as participant (participant.id)}
					<button
						type="button"
						class="chip"
						aria-pressed={row.participantIds.includes(participant.id)}
						onclick={() => toggle(index, participant.id)}
					>
						{participant.displayName}
					</button>
				{/each}
			</div>

			{#if activeGuests.length > 0 || archived.length > 0}
				<div class="chips" style="margin-top: 0.4rem">
					<span class="muted" style="align-self: center">Gäste:</span>
					{#each [...activeGuests, ...archived] as participant (participant.id)}
						<button
							type="button"
							class="chip guest"
							aria-pressed={row.participantIds.includes(participant.id)}
							onclick={() => toggle(index, participant.id)}
						>
							{participant.displayName}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}

	<button type="button" onclick={addRow} style="width: 100%; margin-bottom: 1rem">
		+ Position
	</button>

	<div class="card">
		<div class="row">
			<strong>Total</strong>
			<strong class="amount">{totalMinor === null ? '—' : formatMoney(totalMinor)}</strong>
		</div>
		{#if preview}
			{#each [...preview.entries()].sort( (a, b) => b[1] - a[1] ) as [participantId, shareMinor] (participantId)}
				<div class="row muted">
					<span>{byId.get(participantId)?.displayName ?? 'Unbekannt'}</span>
					<span class="amount">{formatMoney(shareMinor)}</span>
				</div>
			{/each}
		{/if}
	</div>

	{#if problems.length > 0}
		<p class="muted">{problems.join(' · ')}</p>
	{/if}

	<button class="primary" type="submit" disabled={!isValid}>{submitLabel}</button>
</form>
