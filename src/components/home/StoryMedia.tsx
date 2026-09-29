'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import s from '@/app/home.module.css';

// The pinned story's photo, and on wide screens its clip. Split out of
// HomeContent (PERF-1) so the rest of the homepage stays server-rendered.
export default function StoryMedia() {
  // H-2a: the story clip is mounted only when the page is wide enough (phones
  // never download it) and the user has not asked for reduced motion or data.
  const [storyVideo, setStoryVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const phRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!reduce && !saveData && window.matchMedia('(min-width: 960px)').matches) setStoryVideo(true);
  }, []);

  // H-2a: play only while the pinned story is on screen; pause the moment it
  // leaves. A clip that fails to load simply stays hidden behind the poster.
  useEffect(() => {
    const v = videoRef.current;
    const story = phRef.current?.closest('[data-story]');
    if (!storyVideo || !v || !story) return;
    let timer: number | null = null;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          v.play().catch(() => {});
          // A clip that cannot play within 4s of being asked stays hidden
          // behind the poster (slow network, unsupported codec, blocked autoplay).
          if (timer === null) timer = window.setTimeout(() => { if (v.readyState < 3 || v.paused) setStoryVideo(false); }, 4000);
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.1 });
    io.observe(story);
    return () => { io.disconnect(); if (timer !== null) window.clearTimeout(timer); };
  }, [storyVideo]);

  return (
    <div ref={phRef} data-story-ph="" className={`${s.storyPh} ${storyVideo ? s.hasVideo : ''}`}>
      <Image src="/home/bunker.jpg" alt="" fill sizes="100vw" loading="lazy" className={storyVideo ? undefined : s.drift} />
      {storyVideo && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster="/home/story-poster.jpg"
          aria-hidden="true"
          onError={() => setStoryVideo(false)}
        >
          {/* H-2d-R2: mp4 first — the v2 webm is the larger file, and browsers take the first source they can play. */}
          <source src="/home/story.mp4" type="video/mp4" />
          <source src="/home/story.webm" type="video/webm" />
        </video>
      )}
    </div>
  );
}
