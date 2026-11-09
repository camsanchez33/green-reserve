// CART-4: what the starter's sheet and the cart ticket read from the day's tee times (GET /api/operator/tee-times).
import { ballCounts, ballWords } from '@/lib/range-balls';

export type SheetBooking = {
  id: string; golferName: string; golferPhone: string; players: number; status: string; paymentStatus: string;
  paidOffline?: boolean; roundPaid?: boolean; checkedInPlayers?: number | null; noShowAt?: string | null;
  cartSelected?: boolean; cartRiders?: number | null; cartUnitCents?: number | null; cartNumbers?: string;
  rangeBallsSize?: string; notes?: string[]; splitFromId?: string | null;
};
export type SheetTime = { id: string; date: string; time: string; tee?: string | null; teeRank?: number; status: string; event?: { name: string } | null; bookings?: SheetBooking[] };
export type CartSettings = { courseName: string; mode: 'off' | 'checkin' | 'required' | 'starter'; ticket: 'off' | 'printed' | 'receipt' | 'both'; columns: string[] };

export const clock = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const longDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export const isPaid = (b: SheetBooking) => b.status === 'completed' || !!b.paidOffline || !!b.roundPaid || ['paid', 'paid_offline', 'on_account'].includes(b.paymentStatus);
export const riding = (b: SheetBooking) => (b.cartSelected ? (b.cartRiders ?? b.players) : 0);
export const ridingWords = (b: SheetBooking) => { const r = riding(b); return r === 0 ? 'Walking' : r === b.players ? `All ${r}` : `${r} of ${b.players}`; };
export const bucketWords = (b: SheetBooking) => ballWords(ballCounts(b.rangeBallsSize));
