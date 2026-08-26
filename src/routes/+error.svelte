<script lang="ts">
	import { page } from '$app/state';
</script>

<h2>{page.status === 404 ? 'Nicht gefunden' : 'Da ist etwas schiefgelaufen'}</h2>

<div class="card">
	<p>{page.error?.message ?? 'Unbekannter Fehler.'}</p>
	<p class="muted">
		Wenn die Datenbank noch nicht verbunden ist: <code>.env</code> aus
		<code>.env.example</code> anlegen und <code>npm run db:push</code> laufen lassen.
	</p>
	<a href="/">Zurück zur Übersicht</a>
</div>
