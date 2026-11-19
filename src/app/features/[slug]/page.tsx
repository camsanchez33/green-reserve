import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import HomeCloser from '@/components/home/HomeCloser';
import ProductShot from '@/components/home/ProductShot';
import ScoreCard from '@/components/home/ScoreCard';
import TryIt from '@/components/home/TryIt';
import { FEATURE_PAGES, featurePage } from '@/components/home/feature-pages';
import { shopFeeVersionLive } from '@/lib/shop-fee';
import s from '@/app/home.module.css';

// Homepage redo (Cam 2026-11-18): the seven feature pages from one template — title, one-line summary,
// sections with real product screenshots, then the shared bottom block. Copy and pictures come from
// src/components/home/feature-pages.ts. No durations, no contract terms; fee sentences only from
// legal/LQ-2_FEE_COPY.md (the Payments page's cost list below).

export function generateStaticParams() {
  return FEATURE_PAGES.map(p => ({ slug: p.slug }));
}
export const dynamicParams = false;
// The Payments cost list reads whether the shop-fee agreement is in effect; re-checked hourly.
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = featurePage((await params).slug);
  if (!page) return {};
  const title = page.title.replace(/\.$/, '');
  return { title, description: page.line, openGraph: { title: `${title} | GreenReserve`, description: page.line } };
}

export default async function FeaturePageView({ params }: { params: Promise<{ slug: string }> }) {
  const page = featurePage((await params).slug);
  if (!page) notFound();
  // SHOP-FEE-1: the shop fee is listed only once the Operator Agreement version naming it is in effect.
  const shopFee = page.slug === 'payments' ? await shopFeeVersionLive() : false;

  return (
    <div data-home-root="" className={s.root}>
      <header className={s.ftop}>
        <div className={s.wrap}>
          <Link href="/" aria-label="GreenReserve home">
            <Image src="/brand/logo.svg" unoptimized alt="" width={128} height={24} className={s.ftopLogo} />
          </Link>
          <Link className={s.back} href="/#about"><span aria-hidden="true">←</span> All features</Link>
        </div>
      </header>
      <main>
        <section className={`${s.wrap} ${s.fhero}`}>
          <h1 className={s.display}>{page.title}</h1>
          <p>{page.line}</p>
        </section>
        <div className={`${s.wrap} ${s.fsecs}`}>
          {page.sections.map((sec, i) => (
            <div key={sec.h} className={i % 2 ? `${s.fsec} ${s.fsecFlip}` : s.fsec}>
              <div className={s.fsecTxt}>
                <h2 className={s.display}>{sec.h}</h2>
                {sec.p.map(p => <p key={p}>{p}</p>)}
                {sec.media.device === 'costs' && (
                  <ul className={s.costs}>
                    <li>Golfers pay $1.50 per player on each online booking, added to your price.</li>
                    <li>Membership dues collected through GreenReserve carry 1% of the dues (and any initiation fee), added to what the member pays.</li>
                    {shopFee && <li>Pro-shop items paid by card carry a GreenReserve service fee of 1% of the items; cash carries none.</li>}
                    <li>Your green fee and our fee are collected in one card payment to your own Stripe account; our $1.50 per player is then passed to GreenReserve.</li>
                    <li>Stripe&apos;s standard card-processing fee applies to the payment, the same as any card you take today. GreenReserve charges you nothing on top of it.</li>
                  </ul>
                )}
              </div>
              <div className={s.fsecMedia}>
                {sec.media.device === 'costs'
                  ? <div className={s.costCard}><ScoreCard /></div>
                  : <ProductShot shot={`features/${sec.media.shot}`} device={sec.media.device} alt={sec.media.alt} />}
              </div>
            </div>
          ))}
          {page.tryIt && <TryIt flip={page.sections.length % 2 === 1} />}
        </div>
      </main>
      <HomeCloser />
    </div>
  );
}
