'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const FEATURES = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
    title: 'Auto Beat Count',
    desc: 'AI가 자동으로 비트를 분석하고 1-8 카운트를 표시해요',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
        <path d="M9 3v18" />
        <path d="M15 3v18" />
      </svg>
    ),
    title: 'Phrase Grid Edit',
    desc: '프레이즈 단위로 안무를 기록하고 편집할 수 있어요',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="m4.93 4.93 2.83 2.83" />
        <path d="m16.24 16.24 2.83 2.83" />
        <path d="M2 12h4" />
        <path d="M18 12h4" />
        <path d="m4.93 19.07 2.83-2.83" />
        <path d="m16.24 7.76 2.83-2.83" />
      </svg>
    ),
    title: 'Formation Mode',
    desc: '대형 이동까지 기록하는 포메이션 편집 모드',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Dance Crew',
    desc: '크루를 만들고 함께 안무를 공유하고 연습해요',
  },
];

export function HeroSection() {
  return (
    <div className="relative -mx-4 w-[calc(100%+2rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 px-6">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* App Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Image
                src="/ritmo-icon.png"
                alt="Ritmo"
                width={96}
                height={96}
                className="rounded-2xl shadow-2xl shadow-primary/20"
              />
              <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
              Ritmo
            </span>
          </h1>
          <p className="text-xl sm:text-2xl text-muted-foreground font-light mb-2">
            Feel the Beat, Own the Move
          </p>
          <p className="text-sm text-muted-foreground/70 mb-10 max-w-md mx-auto">
            라틴 댄스 자동 카운트 & 안무 연습 앱
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
            <Link href="/login">
              <Button size="lg" className="px-8 text-base font-semibold gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" x2="3" y1="12" y2="12" />
                </svg>
                Get Started
              </Button>
            </Link>
            <Link href="#download">
              <Button size="lg" variant="outline" className="px-8 text-base border-border/50 gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                Download App
              </Button>
            </Link>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group p-4 rounded-xl bg-card/50 border border-border/30 hover:border-primary/30 hover:bg-card/80 transition-all duration-300"
              >
                <div className="text-primary mb-3 flex justify-center group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className="py-16 px-6 border-t border-border/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-2">Download Ritmo</h2>
          <p className="text-muted-foreground mb-8">모바일에서 더 편하게 사용해보세요</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            {/* QR Code placeholder */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-36 h-36 rounded-xl bg-white p-3 flex items-center justify-center">
                <div className="w-full h-full rounded-lg bg-muted/20 border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">QR Code</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">Scan to download</span>
            </div>

            {/* Store Links */}
            <div className="flex flex-col gap-3">
              {/* App Store */}
              <a
                href="#"
                className="flex items-center gap-3 px-5 py-3 rounded-xl bg-card border border-border/50 hover:border-primary/40 transition-colors min-w-[200px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-foreground">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                <div className="text-left">
                  <div className="text-[10px] text-muted-foreground leading-none">Download on the</div>
                  <div className="text-base font-semibold leading-tight">App Store</div>
                </div>
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">Coming Soon</span>
              </a>

              {/* Google Play */}
              <a
                href="#"
                className="flex items-center gap-3 px-5 py-3 rounded-xl bg-card border border-border/50 hover:border-primary/40 transition-colors min-w-[200px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-foreground">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 0 1 0 1.38l-2.302 2.302L15.196 12l2.502-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302L5.864 2.658z" />
                </svg>
                <div className="text-left">
                  <div className="text-[10px] text-muted-foreground leading-none">GET IT ON</div>
                  <div className="text-base font-semibold leading-tight">Google Play</div>
                </div>
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">Coming Soon</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-8 px-6 border-t border-border/30">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
          <Link href="/guide" className="hover:text-primary transition-colors">
            Guide
          </Link>
          <span className="text-border">|</span>
          <Link href="/guide/grid-edit" className="hover:text-primary transition-colors">
            Grid Edit
          </Link>
          <span className="text-border">|</span>
          <Link href="/guide/formation-edit" className="hover:text-primary transition-colors">
            Formation Edit
          </Link>
          <span className="text-border">|</span>
          <a href="/terms.html" className="hover:text-primary transition-colors">
            Terms of Service
          </a>
          <span className="text-border">|</span>
          <a href="/privacy.html" className="hover:text-primary transition-colors">
            Privacy Policy
          </a>
        </div>
      </section>
    </div>
  );
}
