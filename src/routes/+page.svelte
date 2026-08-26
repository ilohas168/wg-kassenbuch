<script lang="ts">
	import { formatBalance, formatMoney } from '$lib/money/index.js';

	let { data } = $props();
</script>

{#if data.error}
	<p class="error">{data.error}</p>
{/if}

<h2>Salden</h2>

{#if data.balances.length === 0}
	<p class="empty">Noch keine Teilnehmer.</p>
{:else}
	{#each data.balances as person (person.id)}
		<div class="card row">
			<span>
				{person.displayName}
				{#if person.kind === 'guest'}<span class="muted">· Gast</span>{/if}
				{#if !person.isActive}<span class="muted">· archiviert</span>{/if}
			</span>
			<span class="amount" class:positive={person.balanceMinor > 0} class:negative={person.balanceMinor < 0}>
				{formatBalance(person.balanceMinor)}
			</span>
		</div>
	{/each}
	<p class="muted">
		Positiv heisst: hat mehr bezahlt als konsumiert und bekommt Geld zurück.
	</p>
{/if}

<h2>Ausgleich</h2>

{#if data.transfers.length === 0}
	<p class="empty">
		{data.receiptCount === 0 ? 'Noch keine Belege erfasst.' : 'Alles ausgeglichen.'}
	</p>
{:else}
	{#each data.transfers as transfer (transfer.from + transfer.to)}
		<div class="card row">
			<span>{transfer.from} → {transfer.to}</span>
			<span class="amount">{formatMoney(transfer.amountChfMinor)}</span>
		</div>
	{/each}
	<p class="muted">
		{data.transfers.length}
		{data.transfers.length === 1 ? 'Überweisung gleicht' : 'Überweisungen gleichen'} alles aus.
		<a href="/settle">Abrechnen</a>
	</p>
{/if}
