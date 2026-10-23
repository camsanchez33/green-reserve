import Image from 'next/image';
import s from '@/app/home.module.css';

// A real screenshot of the product (public/home/shots, taken by
// scripts/screenshots/capture.ts) in the homepage demo's laptop or phone
// frame — the homepage feature rows and /teesheet. A server component.

const SIZE = { laptop: { width: 2160, height: 1350 }, phone: { width: 1170, height: 2532 } } as const;

export default function ProductShot({ shot, device, alt }: { shot: string; device: 'laptop' | 'phone'; alt: string }) {
  const img = <Image src={`/home/shots/${shot}.png`} alt={alt} {...SIZE[device]} loading="lazy"
    sizes={device === 'laptop' ? '(max-width: 1000px) 100vw, 720px' : '300px'} />;
  if (device === 'phone') return <div className={`${s.shot} ${s.shotPhone}`}><div className={s.phone}>{img}</div></div>;
  return <div className={s.shot}><div className={s.laptopScreen}>{img}</div><div className={s.laptopBase} /></div>;
}
