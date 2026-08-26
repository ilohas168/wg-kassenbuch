<script lang="ts">
	import {
		computeReceiptShares,
		effectiveRate,
		formatMinor,
		formatMoney,
		formatRate,
		freezeTotalChf,
		parseRate,
		tryParseMoneyInput,
		type Currency,
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
		/** Fehlt beim Vorschlag aus dem Foto - wer bezahlt hat, steht selten auf dem Beleg. */
		paidBy?: ParticipantId;
		currency?: Currency;
		fxRateToChf?: string;
		totalChfMinor?: number;
		rows: DraftRow[];
	}

	let {
		participants,
		initial = null,
		submitLabel = 'Speichern',
		error = null,
		photoPath = null,
		scannedTotalMinor = null
	}: {
		participants: Participant[];
		initial?: InitialDraft | null;
		submitLabel?: string;
		error?: string | null;
		/** Pfad des schon hochgeladenen Belegfotos, falls der Beleg vom Foto kommt. */
		photoPath?: string | null;
		/** Beleg-Total laut Foto. Weicht es von den Positionen ab, wird gewarnt. */
		scannedTotalMinor?: number | null;
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
	let currency = $state<Currency>(initial?.currency ?? 'CHF');
	// svelte-ignore state_referenced_locally
	let rows = $state<DraftRow[]>(initialRows());

	/**
	 * Kurs-Eingabe. Der Effektivkurs ist die Voreinstellung, weil er der genauere ist:
	 * in der Kartenbelastung stecken die Gebuehren schon drin, im EZB-Kurs nicht.
	 */
	let rateMode = $state<'effective' | 'reference'>('effective');
	// svelte-ignore state_referenced_locally
	let chargedChfText = $state(initial?.totalChfMinor != null ? formatMinor(initial.totalChfMinor) : '');
	// svelte-ignore state_referenced_locally
	let rateText = $state(initial?.fxRateToChf && initial.fxRateToChf !== '1' ? initial.fxRateToChf : '');

	let reference = $state<{ rate: string; date: string } | null>(null);
	let referenceError = $state<string | null>(null);
	let referenceLoading = $state(false);

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

	const chargedChfMinor = $derived(
		chargedChfText.trim() === '' ? null : tryParseMoneyInput(chargedChfText)
	);

	/**
	 * Der eingefrorene Kurs und das CHF-Total kommen immer aus derselben Quelle:
	 * beim Effektivkurs ist das CHF-Total die Kartenbelastung und der Kurs folgt daraus,
	 * beim Referenzkurs ist es umgekehrt.
	 */
	const fx = $derived.by((): { rate: string | null; totalChfMinor: number | null; problem: string | null } => {
		if (currency === 'CHF') {
			return { rate: '1', totalChfMinor: totalMinor, problem: null };
		}
		if (totalMinor === null) {
			return { rate: null, totalChfMinor: null, problem: 'Für den Kurs fehlen noch die Beträge' };
		}

		if (rateMode === 'effective') {
			if (totalMinor <= 0) {
				return {
					rate: null,
					totalChfMinor: null,
					problem: 'Effektivkurs braucht ein positives Total — bei Rückgaben den Referenzkurs nehmen'
				};
			}
			if (chargedChfMinor === null || chargedChfMinor <= 0) {
				return { rate: null, totalChfMinor: null, problem: 'CHF-Belastung der Karte fehlt' };
			}
			return {
				rate: formatRate(effectiveRate(chargedChfMinor, totalMinor)),
				totalChfMinor: chargedChfMinor,
				problem: null
			};
		}

		try {
			const rate = parseRate(rateText);
			return { rate: formatRate(rate), totalChfMinor: freezeTotalChf(totalMinor, rate), problem: null };
		} catch {
			return { rate: null, totalChfMinor: null, problem: 'Kurs fehlt oder ist ungültig' };
		}
	});

	const problems = $derived(collectProblems());
	const isValid = $derived(problems.length === 0);

	/** Vorschau der Anteile - dieselbe Funktion, die spaeter auch den Saldo rechnet. */
	const preview = $derived.by(() => {
		if (totalMinor === null || !isValid || fx.rate === null || fx.totalChfMinor === null) return null;
		try {
			return computeReceiptShares({
				currency,
				paidBy,
				totalMinor,
				fxRateToChf: fx.rate,
				totalChfMinor: fx.totalChfMinor,
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

	/**
	 * Die Pruefung aus der Spec, im Code statt im Prompt: weicht die Summe der Positionen
	 * vom Total auf dem Beleg ab, sieht der Nutzer die Differenz. Verboten ist nichts -
	 * er kann speichern, die Differenz als Position uebernehmen oder die Zeilen korrigieren.
	 */
	const mismatchMinor = $derived(
		scannedTotalMinor !== null && totalMinor !== null ? scannedTotalMinor - totalMinor : 0
	);

	const payload = $derived(
		JSON.stringify({
			merchant,
			purchasedAt,
			currency,
			fxRateToChf: fx.rate,
			totalChfMinor: fx.totalChfMinor,
			photoPath,
			paidBy,
			lineItems: rows.map((row, index) => ({
				label: row.label,
				amountMinor: parsedRows[index].amountMinor,
				participantIds: row.participantIds
			}))
		})
	);

	// Referenzkurs im Hintergrund holen. Schlaegt das fehl, blockiert nichts - dann steht
	// da ein Hinweis und der Kurs wird von Hand eingetragen.
	$effect(() => {
		const date = purchasedAt;
		if (currency !== 'EUR' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			reference = null;
			referenceError = null;
			return;
		}

		let cancelled = false;
		referenceLoading = true;

		fetch(`/api/fx-rate?date=${date}`)
			.then((response) => response.json())
			.then((result) => {
				if (cancelled) return;
				if (result.rate) {
					reference = { rate: result.rate, date: result.date };
					referenceError = null;
				} else {
					reference = null;
					referenceError = result.error ?? 'Kein Referenzkurs verfügbar.';
				}
			})
			.catch(() => {
				if (cancelled) return;
				reference = null;
				referenceError = 'Der Kursdienst ist nicht erreichbar.';
			})
			.finally(() => {
				if (!cancelled) referenceLoading = false;
			});

		return () => {
			cancelled = true;
		};
	});

	function collectProblems(): string[] {
		const found: string[] = [];
		if (merchant.trim() === '') found.push('Laden fehlt');
		if (purchasedAt === '') found.push('Datum fehlt');
		if (paidBy === '') found.push('Zahler fehlt');
		parsedRows.forEach((row, index) => {
			if (row.amountMinor === null) found.push(`Position ${index + 1}: Betrag fehlt oder ist ungültig`);
			if (row.participantIds.length === 0) found.push(`Position ${index + 1}: niemand zugeordnet`);
		});
		if (fx.problem) found.push(fx.problem);
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

	/** Die nicht erkannte Differenz als eigene Position - explizit statt stillschweigend. */
	function addDifferenceRow() {
		rows = [
			...rows,
			{
				label: 'Nicht erkannt',
				amount: formatMinor(mismatchMinor),
				participantIds: activeMembers.map((participant) => participant.id)
			}
		];
	}

	/** Gäste sind hier bewusst nicht dabei - sonst zahlt der Gast das Waschmittel mit. */
	function allTogether() {
		const ids = activeMembers.map((participant) => participant.id);
		rows = rows.map((row) => ({ ...row, participantIds: [...ids] }));
	}

	function allPrivate() {
		rows = rows.map((row) => ({ ...row, participantIds: paidBy ? [paidBy] : [] }));
	}

	function applyReferenceRate() {
		if (!reference) return;
		rateMode = 'reference';
		rateText = reference.rate;
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
			<div>
				<label for="currency">Währung</label>
				<select id="currency" bind:value={currency}>
					<option value="CHF">CHF</option>
					<option value="EUR">EUR</option>
				</select>
			</div>
		</div>
	</div>

	{#if currency === 'EUR'}
		<div class="card">
			<div class="chips" style="margin-bottom: 0.6rem">
				<button
					type="button"
					class="chip"
					aria-pressed={rateMode === 'effective'}
					onclick={() => (rateMode = 'effective')}
				>
					Effektivkurs
				</button>
				<button
					type="button"
					class="chip"
					aria-pressed={rateMode === 'reference'}
					onclick={() => (rateMode = 'reference')}
				>
					Referenzkurs
				</button>
			</div>

			{#if rateMode === 'effective'}
				<label for="charged">Was die Karte in CHF belastet hat</label>
				<input
					id="charged"
					type="text"
					inputmode="decimal"
					bind:value={chargedChfText}
					placeholder="45.12"
					class="amount"
				/>
				<p class="muted" style="margin-bottom: 0">
					Der genauere Weg: in der Kartenbelastung stecken die Gebühren schon drin.
				</p>
			{:else}
				<label for="rate">Kurs EUR → CHF</label>
				<input
					id="rate"
					type="text"
					inputmode="decimal"
					bind:value={rateText}
					placeholder="0.9312"
					class="amount"
				/>
				<p class="muted" style="margin-bottom: 0">
					{#if referenceLoading}
						EZB-Kurs wird geholt …
					{:else if reference}
						EZB-Kurs vom {reference.date}: {reference.rate}
					{:else if referenceError}
						{referenceError} Bitte von Hand eintragen.
					{/if}
				</p>
			{/if}

			{#if reference && rateText !== reference.rate}
				<button type="button" onclick={applyReferenceRate} style="margin-top: 0.5rem">
					EZB-Kurs {reference.rate} übernehmen
				</button>
			{/if}

			{#if fx.rate && fx.totalChfMinor !== null}
				<div
					class="row"
					style="margin-top: 0.6rem; border-top: 1px solid var(--border); padding-top: 0.5rem"
				>
					<span class="muted">Eingefrorener Kurs {fx.rate}</span>
					<span class="amount">{formatMoney(fx.totalChfMinor)}</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if mismatchMinor !== 0}
		<div class="error">
			<strong>Das Total stimmt nicht mit den Positionen überein.</strong>
			<div style="margin-top: 0.3rem">
				Auf dem Beleg steht {formatMoney(scannedTotalMinor ?? 0, currency)}, erfasst sind
				{formatMoney(totalMinor ?? 0, currency)} — Differenz {formatMoney(mismatchMinor, currency)}.
				Vermutlich hat die Erkennung eine Zeile nicht gelesen.
			</div>
			<button type="button" onclick={addDifferenceRow} style="margin-top: 0.5rem">
				Differenz als Position übernehmen
			</button>
		</div>
	{/if}

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
			<strong class="amount">{totalMinor === null ? '—' : formatMoney(totalMinor, currency)}</strong>
		</div>
		{#if preview}
			{#each [...preview.entries()].sort( (a, b) => b[1] - a[1] ) as [participantId, shareMinor] (participantId)}
				<div class="row muted">
					<span>{byId.get(participantId)?.displayName ?? 'Unbekannt'}</span>
					<span class="amount">{formatMoney(shareMinor)}</span>
				</div>
			{/each}
			{#if currency !== 'CHF'}
				<p class="muted" style="margin: 0.4rem 0 0">Anteile in CHF, zum eingefrorenen Kurs.</p>
			{/if}
		{/if}
	</div>

	{#if problems.length > 0}
		<p class="muted">{problems.join(' · ')}</p>
	{/if}

	<button class="primary" type="submit" disabled={!isValid}>{submitLabel}</button>
</form>
