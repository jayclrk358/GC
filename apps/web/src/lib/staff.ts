import 'server-only';
import { notFound } from 'next/navigation';
import { platformAdminFor, staffCan, type PlatformAdmin, type StaffAbility } from '@magnox/core';
import { getUser } from './auth';

/**
 * The staff member viewing a console page that needs `ability`. Anyone else gets a 404: to them
 * the page doesn't exist.
 */
export async function staffFor(ability: StaffAbility): Promise<PlatformAdmin> {
  const user = await getUser();
  const staff = await platformAdminFor(user?.id ?? null);
  if (!staff || !staffCan(staff.role, ability)) notFound();
  return staff;
}
