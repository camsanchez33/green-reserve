import s from '@/app/home.module.css';

/** "What your course pays" — the scorecard (also on the Payments page). */
export default function ScoreCard() {
  return (
    <div className={s.scard} role="group" aria-label="What your course pays">
      <div className={s.scHead}><b className={s.display}>What your course pays</b><span>GreenReserve</span></div>
      <table className={s.sc}>
        <tbody>
          <tr><th scope="row">Setup fee</th><td className={s.display}>$0</td></tr>
          <tr><th scope="row">Monthly fee</th><td className={s.display}>$0</td></tr>
          <tr><th scope="row">Commission on green fees</th><td className={s.display}>$0</td></tr>
          <tr className={s.scTot}><th scope="row">Your course pays GreenReserve</th><td className={s.display}>$0</td></tr>
        </tbody>
      </table>
    </div>
  );
}
