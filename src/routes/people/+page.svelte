<script lang="ts">
	import { formatBalance, formatMoney } from '$lib/money/index.js';

	let { data, form } = $props();

	const activeGuests = $derived(data.guests.filter((guest) => guest.isActive));
	const archivedGuests = $derived(data.guests.filter((guest) => !guest.isActive));

	/** Voreinstellung: wer am meisten offen hat, rechnet mit dem Gast ab. */
	const defaultCounterpart = $derived(
		[...data.counterparts].sort((a, b) => b.balanceMinor - a.balanceMinor)[0]?.id ?? ''
	);
</script>

<h2>Personen</h2>

{#if data.error}
	<p class="error">{data.error}</p>
{/if}
{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

<h2>Mitglieder</h2>
{#each data.members as member (member.id)}
	<div class="card row">
		<span>{member.displayName}{member.isActive ? '' : ' · archiviert'}</span>
		<span class="amount" class:positive={member.balanceMinor > 0} class:negative={member.balanceMinor < 0}>
			{formatBalance(member.balanceMinor)}
		</span>
	</div>
{/each}

<h2>Gäste</h2>

<form method="POST" action="?/addGuest" class="card">
	<label for="guest-name">Neuer Gast</label>
	<div style="display: flex; gap: 0.5rem">
		<input id="guest-name" name="displayName" type="text" placeholder="Name" autocomplete="off" />
		<button type="submit">Anlegen</button>
	</div>
	<p class="muted" style="margin-bottom: 0">
		Nur ein Name — kein Konto, keine E-Mail. Gäste sind bei „alles gemeinsam" nicht dabei und
		müssen pro Position angetippt werden.
	</p>
</form>

{#if activeGuests.length === 0}
	<p class="empty">Zurzeit keine Gäste.</p>
{:else}
	{#each activeGuests as guest (guest.id)}
		<div class="card">
			<div class="row">
				<strong>{guest.displayName}</strong>
				<span class="amount" class:positive={guest.balanceMinor > 0} class:negative={guest.balanceMinor < 0}>
					{formatBalance(guest.balanceMinor)}
				</span>
			</div>

			<form method="POST" action="?/settle" style="margin-top: 0.6rem">
				<input type="hidden" name="participantId" value={guest.id} />
				{#if guest.balanceMinor !== 0}
					<label for="counterpart-{guest.id}">
						{guest.balanceMinor < 0
							? `Zahlt ${formatMoney(-guest.balanceMinor)} an`
							: `Bekommt ${formatMoney(guest.balanceMinor)} von`}
					</label>
					<select id="counterpart-{guest.id}" name="counterpartId">
						{#each data.counterparts as counterpart (counterpart.id)}
							<option value={counterpart.id} selected={counterpart.id === defaultCounterpart}>
								{counterpart.displayName}
							</option>
						{/each}
					</select>
				{:else}
					<p class="muted" style="margin: 0 0 0.4rem">Saldo ausgeglichen — nichts zu zahlen.</p>
				{/if}
				<button type="submit" style="margin-top: 0.5rem; width: 100%">
					Abrechnen und archivieren
				</button>
			</form>
		</div>
	{/each}
{/if}

{#if archivedGuests.length > 0}
	<h2>Archiviert</h2>
	<p class="muted">
		Aus der Erfassung verschwunden, in alten Belegen weiterhin sichtbar. Gelöscht wird niemand.
	</p>
	{#each archivedGuests as guest (guest.id)}
		<div class="card row">
			<span class="muted">{guest.displayName}</span>
			<span class="amount" class:negative={guest.balanceMinor !== 0}>
				{guest.balanceMinor === 0 ? 'abgerechnet' : formatBalance(guest.balanceMinor)}
			</span>
		</div>
	{/each}
{/if}
