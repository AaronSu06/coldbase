import { useState } from 'react';

const COLORS = ['bg-teal-600', 'bg-violet-500', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500'];

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'icloud.com', 'me.com', 'live.com', 'msn.com',
  'protonmail.com', 'aol.com',
]);

function inferDomain(domain, company) {
  if (domain && !GENERIC_DOMAINS.has(domain.toLowerCase())) return domain;
  if (company) return company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  return null;
}

export default function CompanyAvatar({ domain, company, size = 'small' }) {
  const resolvedDomain = inferDomain(domain, company);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const initial = company?.[0]?.toUpperCase() || '?';
  const hash = company.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0);
  const color = COLORS[Math.abs(hash) % COLORS.length];

  const sizeClasses = size === 'large'
    ? 'w-12 h-12 rounded-xl text-sm'
    : 'w-8 h-8 rounded-lg text-xs';

  if (!resolvedDomain || imgFailed) {
    return (
      <div className={`${sizeClasses} ${color} flex items-center justify-center flex-shrink-0`}>
        <span className="text-white font-bold">{initial}</span>
      </div>
    );
  }

  return (
    <div className={`${sizeClasses} flex-shrink-0 overflow-hidden relative`}>
      {!imgLoaded && (
        <div className={`absolute inset-0 ${color} flex items-center justify-center`}>
          <span className="text-white font-bold">{initial}</span>
        </div>
      )}
      <img
        src={`https://www.google.com/s2/favicons?domain=${resolvedDomain}&sz=64`}
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgFailed(true)}
        loading="lazy"
        className={`w-full h-full object-cover transition-opacity duration-150 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
        alt={company}
      />
    </div>
  );
}
