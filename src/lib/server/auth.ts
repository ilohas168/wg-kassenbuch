import type { Participant } from '$lib/money/index.js';
import { supabaseAdmin } from './supabase.js';

/**
 * Der erste Login: ein Konto mit einem Mitglied verknuepfen.
 *
 * Die Spec sagt, dass participants.auth_user_id nur bei Mitgliedern gesetzt ist, aber
 * nicht, wie die Verknuepfung zustande kommt. Es gibt keine E-Mail-Spalte, und eine
 * hinzuzuerfinden waere ein Schema, das niemand bestellt hat. Stattdessen waehlt der
 * Nutzer beim ersten Login aus den noch freien Mitgliedern - bei drei Leuten genau
 * einmal pro Person, danach nie wieder. Missbrauch faengt die Allowlist ab: nur wer
 * dort steht, bekommt ueberhaupt einen Magic Link.
 */
export async function unlinkedMembers(): Promise<Participant[]> {
	const { data, error } = await supabaseAdmin()
		.from('participants')
		.select('id, display_name, kind, is_active')
		.eq('kind', 'member')
		.eq('is_active', true)
		.is('auth_user_id', null)
		.order('created_at', { ascending: true });

	if (error) throw new Error(`Mitglieder konnten nicht geladen werden: ${error.message}`);

	return (data ?? []).map((row) => ({
		id: row.id as string,
		displayName: row.display_name as string,
		kind: 'member' as const,
		isActive: row.is_active as boolean
	}));
}

/**
 * Verknuepft Konto und Mitglied - aber nur, solange das Mitglied noch frei ist.
 * Die Bedingung steht im UPDATE selbst, damit zwei gleichzeitige Versuche nicht
 * beide durchgehen.
 */
export async function claimMember(participantId: string, authUserId: string): Promise<boolean> {
	const { data, error } = await supabaseAdmin()
		.from('participants')
		.update({ auth_user_id: authUserId })
		.eq('id', participantId)
		.eq('kind', 'member')
		.eq('is_active', true)
		.is('auth_user_id', null)
		.select('id');

	if (error) throw new Error(`Konto konnte nicht verknuepft werden: ${error.message}`);
	return (data ?? []).length === 1;
}
