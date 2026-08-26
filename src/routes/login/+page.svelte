<script lang="ts">
	let { data, form } = $props();
</script>

<h2>Anmelden</h2>

{#if !data.configured}
	<p class="error">
		Es ist noch keine Adresse freigeschaltet. In <code>.env</code> (bzw. in den Vercel-Variablen)
		<code>ALLOWED_EMAILS</code> auf die drei WG-Adressen setzen, kommagetrennt.
	</p>
{/if}

{#if form?.sent}
	<div class="card">
		<p>Der Link ist unterwegs an <strong>{form.email}</strong>.</p>
		<p class="muted">
			Öffne ihn auf dem Gerät, auf dem du die App benutzen willst — er meldet dich direkt dort an.
		</p>
	</div>
{:else}
	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<form method="POST" class="card">
		<label for="email">E-Mail</label>
		<input
			id="email"
			name="email"
			type="text"
			inputmode="email"
			autocomplete="email"
			value={form?.email ?? ''}
			placeholder="du@example.com"
		/>
		<button class="primary" type="submit" style="margin-top: 0.75rem" disabled={!data.configured}>
			Magic Link schicken
		</button>
	</form>
	<p class="muted">Kein Passwort. Du bekommst einen Link per E-Mail, der dich anmeldet.</p>
{/if}
