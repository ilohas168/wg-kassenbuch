<script lang="ts">
	import ReceiptForm from '$lib/components/ReceiptForm.svelte';

	let { data, form } = $props();
</script>

<h2>Beleg erfassen</h2>

<ReceiptForm participants={data.participants} error={form?.error ?? null} submitLabel="Beleg speichern" />
