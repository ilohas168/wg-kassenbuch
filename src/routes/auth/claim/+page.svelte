<script lang="ts">
	let { data, form } = $props();
</script>

<h2>Wer bist du?</h2>

<p class="muted">
	Angemeldet als {data.email}. Wähle einmalig dein Mitglied aus — danach gehört dieses Konto dazu.
</p>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#if data.members.length === 0}
	<div class="card">
		<p>Alle Mitglieder sind bereits mit einem Konto verknüpft.</p>
		<p class="muted">
			Wenn das ein Versehen war: im Supabase-Dashboard bei der betroffenen Person
			<code>auth_user_id</code> auf <code>null</code> setzen.
		</p>
	</div>
{:else}
	{#each data.members as member (member.id)}
		<form method="POST" class="card row">
			<span>{member.displayName}</span>
			<input type="hidden" name="participantId" value={member.id} />
			<button type="submit">Das bin ich</button>
		</form>
	{/each}
{/if}

<form method="POST" action="/auth/signout" style="margin-top: 1rem">
	<button class="ghost" type="submit">Abmelden</button>
</form>
