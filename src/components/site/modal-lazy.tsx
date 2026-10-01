'use client';

import dynamic from 'next/dynamic';

const AnimeDetailModal = dynamic(() => import('./anime-detail-modal').then(m => ({ default: m.AnimeDetailModal })), { ssr: false });
const WatchPlayerModal = dynamic(() => import('./watch-player').then(m => ({ default: m.WatchPlayerModal })), { ssr: false });
const SearchModal = dynamic(() => import('./search-modal').then(m => ({ default: m.SearchModal })), { ssr: false });

export function LazyModals() {
  return (
    <>
      <AnimeDetailModal />
      <WatchPlayerModal />
      <SearchModal />
    </>
  );
}
