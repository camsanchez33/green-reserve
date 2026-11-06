// MSG-2 (Cam 2026-11-06): the ready-made messages in Message golfers. Client-safe, pure.
/** Ready-made messages. [Brackets] are blanks staff fill in — Send waits until none are left. A message never
 *  promises what only an action does ("cancelled with no fee" is Weather → Cancel's job, not a message's). */
export const READY: { label: string; body: string }[] = [
  { label: 'Frost delay', body: 'Frost delay this morning. The first tee is now [time], and every tee time moves back by the same amount. See you soon.' },
  { label: 'Rain / closed', body: 'The course is closed today because of the weather. [What happens to their round.] Call us to book another day.' },
  { label: 'Cart path only', body: 'Carts are cart path only today. Please keep carts on the paths on every hole.' },
  { label: 'Aerating greens', body: 'We are aerating the greens today, so putting will be slower than usual. Thanks for bearing with us.' },
  { label: 'Course update', body: '[What golfers need to know today.]' },
];
export const BLANK = /\[[^\]]*\]/;
