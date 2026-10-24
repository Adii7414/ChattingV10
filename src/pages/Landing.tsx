import { lazy, Suspense } from 'react';
import Nav from '../components/Nav';
import Hero from '../components/Hero';
import { FeatureMarquee } from '../components/landing/Stats';
import ScrollChrome from '../components/landing/ScrollChrome';

// Everything below the fold loads in the background so the hero paints fast.
const Unfold = lazy(() => import('../components/Unfold'));
const DayStory = lazy(() => import('../components/landing/DayStory'));
const Organize = lazy(() => import('../components/Organize'));
const Presence = lazy(() => import('../components/Presence'));
const StatsBand = lazy(() => import('../components/landing/Stats').then((m) => ({ default: m.StatsBand })));
const StoriesReel = lazy(() => import('../components/landing/StoriesReel'));
const CallScene = lazy(() => import('../components/landing/CallScene'));
const Speed = lazy(() => import('../components/Speed'));
const Detail = lazy(() => import('../components/Detail'));
const CommunityBuilder = lazy(() => import('../components/landing/CommunityBuilder'));
const BotPlayground = lazy(() => import('../components/landing/BotPlayground'));
const Customize = lazy(() => import('../components/Customize'));
const Privacy = lazy(() => import('../components/Privacy'));
const Everywhere = lazy(() => import('../components/Everywhere'));
const Faq = lazy(() => import('../components/Faq'));
const FinalCta = lazy(() => import('../components/FinalCta'));

function Placeholder() {
  return <div className="min-h-[100svh]" aria-hidden />;
}

export default function Landing() {
  return (
    <>
      <ScrollChrome />
      <Nav />
      <main className="overflow-x-clip">
        <Hero />
        <FeatureMarquee />
        <Suspense fallback={<Placeholder />}>
          <Unfold />
          <DayStory />
          <Organize />
          <Presence />
          <StatsBand />
          <StoriesReel />
          <CallScene />
          <Speed />
          <Detail />
          <CommunityBuilder />
          <BotPlayground />
          <Customize />
          <Privacy />
          <Everywhere />
          <Faq />
          <FinalCta />
        </Suspense>
      </main>
    </>
  );
}
