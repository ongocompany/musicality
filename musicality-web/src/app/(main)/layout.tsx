import { Header } from '@/components/layout/header';
import { OnboardingGuard } from '@/components/layout/onboarding-guard';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Header />
      <OnboardingGuard>
        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
      </OnboardingGuard>
    </div>
  );
}
