import { Hero } from '@/components/marketing/hero';
import { AnyChain } from '@/components/marketing/any-chain';
import { CreatorJourney, SellerJourney } from '@/components/marketing/journeys';
import { PaymentFlow } from '@/components/marketing/payments';
import { FinalCta, HowItWorks, Pricing, WhyKolab } from '@/components/marketing/sections';

export default function Home() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <SellerJourney />
      <CreatorJourney />
      <PaymentFlow />
      <AnyChain />
      <WhyKolab />
      <Pricing />
      <FinalCta />
    </>
  );
}
