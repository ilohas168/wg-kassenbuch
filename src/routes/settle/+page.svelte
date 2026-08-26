<script lang="ts">
	import { formatMoney } from '$lib/money/index.js';
	import { formatIsoDate } from '$lib/date.js';

	let { data, form } = $props();
</script>

<h2>Abrechnung</h2>

{#if data.error}
	<p class="error">{data.error}</p>
{/if}
{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#if data.transfers.length === 0}
	<p class="empty">Alles ausgeglichen. Nichts zu tun.</p>
{:else}
	<p class="muted">
		{data.transfers.length}
		{data.transfers.length === 1 ? 'Überweisung gleicht' : 'Überweisungen gleichen'} alles aus,
		zusammen {formatMoney(data.openTotalMinor)}.
	</p>

	{#each data.transfers as transfer (transfer.fromParticipant + transfer.toParticipant)}
		<div class="card row">
			<span>{transfer.fromName} → {transfer.toName}</span>
			<span style="display: flex; align-items: center; gap: 0.6rem">
				<span class="amount">{formatMoney(transfer.amountChfMinor)}</span>
				<form method="POST" action="?/pay">
					<input type="hidden" name="from" value={transfer.fromParticipant} />
					<input type="hidden" name="to" value={transfer.toParticipant} />
					<input type="hidden" name="amount" value={transfer.amountChfMinor} />
					<button type="submit">bezahlt</button>
				</form>
			</span>
		</div>
	{/each}

	<form method="POST" action="?/payAll">
		<button class="primary" type="submit">Zeitraum abschliessen — alle als bezahlt markieren</button>
	</form>
	<p class="muted">
		Das bucht alle Zahlungen oben auf einmal. Die Belege bleiben unangetastet; eine
		Ausgleichszahlung verschiebt nur den Saldo.
	</p>
{/if}

<h2>Bisherige Ausgleichszahlungen</h2>

{#if data.history.length === 0}
	<p class="empty">Noch keine.</p>
{:else}
	{#each data.history as entry (entry.id)}
		<div class="card row">
			<span>
				{entry.fromName} → {entry.toName}
				<div class="muted">
					{formatIsoDate(entry.settledAt.slice(0, 10))}{entry.note ? ` · ${entry.note}` : ''}
				</div>
			</span>
			<span class="amount">{formatMoney(entry.amountChfMinor)}</span>
		</div>
	{/each}
{/if}
