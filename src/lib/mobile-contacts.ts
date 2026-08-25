export type MobileContact = {
  id?: string;
  displayName?: string;
  phones: string[];
};

function normalizePhone(input: string): string {
  const digits = (input || '').replace(/\D/g, '');
  return digits;
}

export async function importContactsFromPhone(options?: {
  /**
   * Maximum contacts to return to keep UI responsive.
   * Default: 500
   */
  limit?: number;
}): Promise<MobileContact[]> {
  const limit = options?.limit ?? 500;

  // Plugin may not be available in all builds/environments.
  // Dynamic require keeps web builds from crashing.
  let contactsPlugin: any;
  try {
    // @ts-expect-error - module may not be installed in web builds / type declarations might be missing
    contactsPlugin = (await import('@capacitor-community/contacts')).Contacts;
  } catch {
    throw new Error('Contacts plugin not available. Use CSV/paste import instead.');
  }

  // Request permission (plugin API can vary a bit; handle common shapes)
  try {
    if (typeof contactsPlugin.requestPermissions === 'function') {
      const res: any = await contactsPlugin.requestPermissions();
      const state = res?.receive ?? res?.contacts ?? res?.status ?? res?.permission ?? res;
      if (typeof state === 'boolean' && !state) throw new Error('Contacts permission denied.');
    } else if (typeof contactsPlugin.checkPermissions === 'function') {
      const res: any = await contactsPlugin.checkPermissions();
      const state = res?.receive ?? res?.contacts ?? res?.status ?? res?.permission ?? res;
      if (typeof state === 'boolean' && !state) {
        if (typeof contactsPlugin.requestPermissions === 'function') await contactsPlugin.requestPermissions();
        else throw new Error('Contacts permission denied.');
      }
    }
  } catch (e: any) {
    throw new Error(e?.message || 'Failed to get contacts permission.');
  }

  // Fetch contacts
  // Common plugin method names: getContacts(), list(), query()
  const contacts: any[] = await (async () => {
    if (typeof contactsPlugin.getContacts === 'function') {
      return (await contactsPlugin.getContacts({ limit })).contacts ?? (await contactsPlugin.getContacts({ limit })) ?? [];
    }
    if (typeof contactsPlugin.list === 'function') {
      return (await contactsPlugin.list({ limit })) ?? [];
    }
    if (typeof contactsPlugin.query === 'function') {
      return (await contactsPlugin.query({ limit })) ?? [];
    }
    throw new Error('Unsupported contacts plugin API.');
  })();

  if (!Array.isArray(contacts) || contacts.length === 0) return [];

  const mapped: MobileContact[] = [];
  for (const c of contacts) {
    const displayName = c?.displayName || c?.name?.displayName || c?.name || c?.givenName || c?.fullName;
    const rawPhones: string[] =
      (c?.phones && Array.isArray(c.phones) ? c.phones : [])
        .flatMap((p: any) => p?.number || p?.value || p?.phone || p)
        .filter(Boolean)
        .map((p: string) => normalizePhone(p));

    const uniquePhones = Array.from(new Set(rawPhones)).filter(Boolean);
    if (uniquePhones.length === 0) continue;

    mapped.push({
      id: c?.id || c?.recordId,
      displayName,
      phones: uniquePhones,
    });

    if (mapped.length >= limit) break;
  }

  return mapped;
}
