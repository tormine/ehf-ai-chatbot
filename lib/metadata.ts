export const siteConfig = {
  name: 'Charly, the Home of Handball AI',
  description: 'Your AI assistant for Handball Coaching Education',
  url: 'https://charly.homeofhandball.com',
  ogImage: 'https://charly.homeofhandball.com/og.png',
  links: {
    ehf: 'https://www.eurohandball.com',
    twitter: 'https://twitter.com/homeofhandball',
  },
  // Social Media Metadata
  social: {
    // Twitter Card
    twitter: {
      card: 'summary_large_image',
      site: '@homeofhandball',
      creator: '@homeofhandball',
      title: 'Charly, the Home of Handball AI',
      description: 'Your AI assistant for Handball Coaching Education',
      image: 'https://charly.homeofhandball.com/og.png',
    },
    // Facebook OpenGraph
    facebook: {
      appId: '', // Add your Facebook App ID if you have one
      type: 'website',
      title: 'Charly, the Home of Handball AI',
      description: 'Your AI assistant for Handball Coaching Education',
      image: 'https://charly.homeofhandball.com/og.png',
      siteName: 'Home of Handball',
      locale: 'en_US',
    },
    // General OpenGraph (also used by LinkedIn and other platforms)
    openGraph: {
      type: 'website',
      title: 'Charly, the Home of Handball AI',
      description: 'Your AI assistant for Handball Coaching Education',
      url: 'https://charly.homeofhandball.com',
      siteName: 'Home of Handball',
      images: [
        {
          url: 'https://charly.homeofhandball.com/og.png',
          width: 1200,
          height: 630,
          alt: 'Charly - Home of Handball AI Assistant',
        },
      ],
      locale: 'en_US',
    },
  },
  // Additional SEO metadata
  seo: {
    keywords: [
      'handball',
      'coaching',
      'education',
      'AI assistant',
      'RINCK Convention',
      'EHF',
      'Home of Handball',
      'coaching education',
      'handball coaching',
      'sports education',
    ],
    themeColor: '#1e78ff', // EHF brand color
    manifest: '/site.webmanifest',
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon-16x16.png',
      apple: '/apple-touch-icon.png',
    },
    robots: 'index, follow',
    googleSiteVerification: '', // Add your Google verification code
  },
};

export type SiteConfig = typeof siteConfig; 