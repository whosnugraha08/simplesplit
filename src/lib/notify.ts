/** Fire-and-forget WA notifications — never blocks UI */
export async function notifyWhatsApp(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/api/webhook-wa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('WA notify failed:', err);
  }
}

export async function notifyWhatsAppGroup(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/api/wa-group/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('WA group notify failed:', err);
  }
}
