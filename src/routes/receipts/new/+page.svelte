<script lang="ts">
	import ReceiptForm from '$lib/components/ReceiptForm.svelte';
	import { prepareReceiptPhoto } from '$lib/photo.js';
	import { formatMinor, type Currency, type ParticipantId } from '$lib/money/index.js';
	import { todayIso } from '$lib/date.js';

	let { data, form } = $props();

	interface Scan {
		id: number;
		photoPath: string;
		scannedTotalMinor: number | null;
		initial: {
			merchant: string;
			purchasedAt: string;
			currency: Currency;
			rows: { label: string; amount: string; participantIds: ParticipantId[] }[];
		} | null;
	}

	let scan = $state<Scan | null>(null);
	let busy = $state(false);
	let notice = $state<string | null>(null);
	let scanCount = 0;

	const memberIds = $derived(
		data.participants
			.filter((participant) => participant.kind === 'member' && participant.isActive)
			.map((participant) => participant.id)
	);

	async function onPhoto(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;

		busy = true;
		notice = null;

		try {
			const prepared = await prepareReceiptPhoto(file);
			const body = new FormData();
			body.append('photo', prepared);

			const response = await fetch('/api/receipt-scan', { method: 'POST', body });
			if (!response.ok) {
				const detail = await response.text();
				// SvelteKit schickt Fehler als JSON mit { message }, eigene 401er als { error }.
				let message = detail;
				try {
					const parsed = JSON.parse(detail);
					message = parsed.message ?? parsed.error ?? detail;
				} catch {
					// Dann war es kein JSON - der Rohtext tut es auch.
				}
				throw new Error(message || 'Der Beleg konnte nicht gelesen werden.');
			}

			const result = await response.json();
			scanCount += 1;

			if (!result.suggestion) {
				// Kein Fehlerdialog: das Foto liegt, der Rest geht von Hand.
				scan = { id: scanCount, photoPath: result.photoPath, scannedTotalMinor: null, initial: null };
				notice = `${result.ocrError ?? 'Der Beleg war nicht lesbar.'} Trag ihn bitte von Hand ein — das Foto ist gespeichert.`;
				return;
			}

			const suggestion = result.suggestion;
			scan = {
				id: scanCount,
				photoPath: result.photoPath,
				scannedTotalMinor: suggestion.totalMinor,
				initial: {
					merchant: suggestion.merchant,
					purchasedAt: suggestion.purchasedAt || todayIso(),
					currency: suggestion.currency,
					rows: suggestion.lineItems.map((item: { label: string; amountMinor: number }) => ({
						label: item.label,
						amount: formatMinor(item.amountMinor),
						participantIds: [...memberIds]
					}))
				}
			};

			if (suggestion.currency !== 'CHF') {
				notice = 'Der Beleg ist in EUR. Trag unten den Kurs ein — am besten die CHF-Belastung deiner Karte.';
			}
		} catch (caught) {
			notice = caught instanceof Error ? caught.message : String(caught);
		} finally {
			busy = false;
			// Damit dasselbe Foto noch einmal ausgewählt werden kann.
			input.value = '';
		}
	}
</script>

<h2>Beleg erfassen</h2>

<div class="card">
	<label for="photo">Foto</label>
	<input id="photo" type="file" accept="image/*" capture="environment" onchange={onPhoto} disabled={busy} />
	<p class="muted" style="margin-bottom: 0">
		{#if busy}
			Beleg wird gelesen …
		{:else}
			Der Vorschlag landet im Formular darunter. Eingetragen wird erst, was du bestätigst.
		{/if}
	</p>
</div>

{#if notice}
	<p class="error">{notice}</p>
{/if}

{#key scan?.id ?? 0}
	<ReceiptForm
		participants={data.participants}
		initial={scan?.initial ?? null}
		photoPath={scan?.photoPath ?? null}
		scannedTotalMinor={scan?.scannedTotalMinor ?? null}
		error={form?.error ?? null}
		submitLabel="Beleg speichern"
	/>
{/key}
