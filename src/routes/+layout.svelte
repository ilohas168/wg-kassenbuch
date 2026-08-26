<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children, data } = $props();

	// Vor dem Login und beim Verknuepfen gibt es nichts zu navigieren.
	const showNav = $derived(Boolean(data.participant));

	const tabs = [
		{ href: '/', label: 'Übersicht' },
		{ href: '/receipts/new', label: 'Erfassen' },
		{ href: '/receipts', label: 'Verlauf' }
	];

	// /receipts/new darf den Verlauf nicht mitmarkieren, sonst leuchten zwei Tabs.
	const isCurrent = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname === href;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>WG-Kassenbuch</title>
</svelte:head>

<div class="app">
	<header class="topbar">
		<h1>WG-Kassenbuch</h1>
		{#if data.participant}
			<form method="POST" action="/auth/signout">
				<button class="ghost" type="submit">{data.participant.displayName} · abmelden</button>
			</form>
		{:else}
			<span class="phase">Basel</span>
		{/if}
	</header>

	{#if showNav}
		<nav class="tabs">
			{#each tabs as tab (tab.href)}
				<a href={tab.href} aria-current={isCurrent(tab.href) ? 'page' : undefined}>{tab.label}</a>
			{/each}
		</nav>
	{/if}

	{@render children()}
</div>
