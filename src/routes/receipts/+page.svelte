<script lang="ts">
	import { formatMoney } from '$lib/money/index.js';
	import { formatIsoDate } from '$lib/date.js';

	let { data, form } = $props();
</script>

<div class="row" style="margin-bottom: 0.5rem">
	<h2 style="margin: 0">Verlauf</h2>
	<a href="/receipts/new">+ Beleg</a>
</div>

{#if data.error}
	<p class="error">{data.error}</p>
{/if}
{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#if data.receipts.length === 0}
	<p class="empty">Noch keine Belege erfasst.</p>
{:else}
	{#each data.receipts as receipt (receipt.id)}
		<div class="card">
			<div class="row">
				<div>
					<strong>{receipt.merchant}</strong>
					<div class="muted">
						{formatIsoDate(receipt.purchasedAt)} · bezahlt von {receipt.paidByName}
					</div>
				</div>
				<div style="text-align: right">
					<div class="amount"><strong>{formatMoney(receipt.totalChfMinor)}</strong></div>
					{#if receipt.currency !== 'CHF'}
						<div class="muted amount">{formatMoney(receipt.totalMinor, receipt.currency)}</div>
					{/if}
				</div>
			</div>

			{#if receipt.warning}
				<p class="error" style="margin: 0.6rem 0 0">{receipt.warning}</p>
			{/if}

			<div style="margin-top: 0.6rem">
				{#each receipt.lineItems as item (item.id)}
					<div class="row muted">
						<span>{item.label} <span style="opacity: 0.7">· {item.names.join(', ')}</span></span>
						<span class="amount">{formatMoney(item.amountMinor, receipt.currency)}</span>
					</div>
				{/each}
			</div>

			{#if receipt.shares.length > 0}
				<div style="margin-top: 0.6rem; border-top: 1px solid var(--border); padding-top: 0.5rem">
					{#each receipt.shares as share (share.name)}
						<div class="row muted">
							<span>{share.name}</span>
							<span class="amount">{formatMoney(share.amountChfMinor)}</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="row" style="margin-top: 0.6rem">
				<a href="/receipts/{receipt.id}">Bearbeiten</a>
				<form method="POST" action="?/delete">
					<input type="hidden" name="id" value={receipt.id} />
					<button class="ghost" type="submit">Löschen</button>
				</form>
			</div>
		</div>
	{/each}
{/if}
