<script lang="ts">
	import ReceiptForm from '$lib/components/ReceiptForm.svelte';
	import { formatMinor } from '$lib/money/index.js';

	let { data, form } = $props();

	const initial = $derived({
		merchant: data.receipt.merchant,
		purchasedAt: data.receipt.purchasedAt,
		paidBy: data.receipt.paidBy,
		rows: data.receipt.lineItems.map((item) => ({
			label: item.label,
			amount: formatMinor(item.amountMinor),
			participantIds: item.shares.map((share) => share.participantId)
		}))
	});
</script>

<h2>Beleg bearbeiten</h2>

<!-- key: beim Wechsel auf einen anderen Beleg muss das Formular neu aufgebaut werden. -->
{#key data.receipt.id}
	<ReceiptForm
		participants={data.participants}
		{initial}
		error={form?.error ?? null}
		submitLabel="Änderungen speichern"
	/>
{/key}

<form method="POST" action="?/delete" style="margin-top: 1rem">
	<button class="ghost" type="submit">Beleg löschen</button>
</form>
