import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USER_ID = 1; // admin account

const now = new Date();
const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000);

const existingUpdates = [
  {
    id: 17, // Amazon / Jeff Bezos
    threadId: 'thread-amazon-001',
    company: 'Amazon',
    contactName: 'Jeff Bezos',
    status: 'Ghosted',
    sentDate: daysAgo(12),
    latestActivity: daysAgo(12),
    isOpened: true,
    openCount: 3,
    lastOpenedAt: daysAgo(9),
    hasReply: false,
    messageCount: 1,
    subject: 'Software Engineer - Amazon AWS',
    snippet: 'Hi Jeff, reaching out about opportunities on the AWS infrastructure team...',
    contactEmail: 'jeff@amazon.com',
    domain: 'amazon.com',
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-amazon-001',
    notes: '',
  },
  {
    id: 18, // Anthropic
    threadId: 'thread-anthropic-001',
    company: 'Anthropic',
    contactName: 'Dario Amodei',
    status: 'Interviewing',
    sentDate: daysAgo(6),
    latestActivity: daysAgo(1),
    isOpened: true,
    openCount: 5,
    lastOpenedAt: daysAgo(1),
    hasReply: true,
    repliedAt: daysAgo(4),
    messageCount: 4,
    subject: 'ML Engineer Role - Anthropic',
    snippet: 'Hi Dario, I have been following Anthropic safety research closely and would love to contribute...',
    contactEmail: 'dario@anthropic.com',
    domain: 'anthropic.com',
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-anthropic-001',
    notes: 'They want to schedule a technical screen',
  },
  {
    id: 19, // Meta / Mark Zuckerberg
    threadId: 'thread-meta-001',
    company: 'Meta',
    contactName: 'Mark Zuckerberg',
    status: 'Interviewing',
    sentDate: daysAgo(8),
    latestActivity: daysAgo(2),
    isOpened: true,
    openCount: 2,
    lastOpenedAt: daysAgo(5),
    hasReply: true,
    repliedAt: daysAgo(6),
    messageCount: 3,
    subject: 'Software Engineer - Meta AI',
    snippet: 'Hi Mark, I am passionate about large-scale systems and would love to discuss the Meta AI team...',
    contactEmail: 'zuck@meta.com',
    domain: 'meta.com',
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-meta-001',
    notes: 'Loop interview scheduled for next week',
  },
  {
    id: 20, // OpenAI / Sam Altman
    threadId: 'thread-openai-001',
    company: 'OpenAI',
    contactName: 'Sam Altman',
    status: 'Replied',
    sentDate: daysAgo(5),
    latestActivity: daysAgo(1),
    isOpened: true,
    openCount: 7,
    lastOpenedAt: daysAgo(1),
    hasReply: true,
    repliedAt: daysAgo(3),
    messageCount: 2,
    subject: 'Product Engineer - OpenAI',
    snippet: 'Hi Sam, huge admirer of the work at OpenAI. I would love to explore product engineering roles...',
    contactEmail: 'sam@openai.com',
    domain: 'openai.com',
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-openai-001',
    notes: 'Warm reply - forwarded to recruiter',
  },
];

const newOutreaches = [
  {
    threadId: 'thread-google-001',
    company: 'Google',
    contactName: 'Sundar Pichai',
    contactEmail: 'sundar@google.com',
    domain: 'google.com',
    subject: 'Software Engineer - Google DeepMind',
    snippet: 'Hi Sundar, I am reaching out about engineering roles within Google DeepMind...',
    status: 'Sent',
    sentDate: daysAgo(6),
    latestActivity: daysAgo(6),
    isOpened: false,
    openCount: 0,
    hasReply: false,
    messageCount: 1,
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-google-001',
    notes: '',
  },
  {
    threadId: 'thread-apple-001',
    company: 'Apple',
    contactName: 'Tim Cook',
    contactEmail: 'tcook@apple.com',
    domain: 'apple.com',
    subject: 'iOS Engineer - Apple',
    snippet: 'Hi Tim, I have been building iOS apps for 5 years and would love to join the platform team...',
    status: 'Offer',
    sentDate: daysAgo(14),
    latestActivity: daysAgo(1),
    isOpened: true,
    openCount: 4,
    lastOpenedAt: daysAgo(2),
    hasReply: true,
    repliedAt: daysAgo(10),
    messageCount: 6,
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-apple-001',
    notes: 'Received offer - reviewing comp package',
  },
  {
    threadId: 'thread-nvidia-001',
    company: 'NVIDIA',
    contactName: 'Jensen Huang',
    contactEmail: 'jhuang@nvidia.com',
    domain: 'nvidia.com',
    subject: 'GPU Systems Engineer - NVIDIA',
    snippet: 'Hi Jensen, I have been working on CUDA kernels and would love to contribute to the GPU architecture team...',
    status: 'Replied',
    sentDate: daysAgo(3),
    latestActivity: daysAgo(1),
    isOpened: true,
    openCount: 2,
    lastOpenedAt: daysAgo(1),
    hasReply: true,
    repliedAt: daysAgo(2),
    messageCount: 2,
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-nvidia-001',
    notes: '',
  },
  {
    threadId: 'thread-stripe-001',
    company: 'Stripe',
    contactName: 'Patrick Collison',
    contactEmail: 'patrick@stripe.com',
    domain: 'stripe.com',
    subject: 'Backend Engineer - Stripe',
    snippet: 'Hi Patrick, I am a big fan of the Stripe developer-first approach. I would love to discuss backend roles...',
    status: 'Sent',
    sentDate: daysAgo(2),
    latestActivity: daysAgo(2),
    isOpened: true,
    openCount: 1,
    lastOpenedAt: daysAgo(2),
    hasReply: false,
    messageCount: 1,
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-stripe-001',
    notes: '',
  },
  {
    threadId: 'thread-figma-001',
    company: 'Figma',
    contactName: 'Dylan Field',
    contactEmail: 'dylan@figma.com',
    domain: 'figma.com',
    subject: 'Frontend Engineer - Figma',
    snippet: 'Hi Dylan, I have been using Figma daily for 3 years and would love to help build the next version...',
    status: 'Ghosted',
    sentDate: daysAgo(10),
    latestActivity: daysAgo(10),
    isOpened: false,
    openCount: 0,
    hasReply: false,
    messageCount: 1,
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-figma-001',
    notes: '',
  },
  {
    threadId: 'thread-linear-001',
    company: 'Linear',
    contactName: 'Karri Saarinen',
    contactEmail: 'karri@linear.app',
    domain: 'linear.app',
    subject: 'Product Engineer - Linear',
    snippet: 'Hi Karri, Linear is my favorite tool and I would love to help make it even better...',
    status: 'Sent',
    sentDate: daysAgo(7),
    latestActivity: daysAgo(7),
    isOpened: true,
    openCount: 3,
    lastOpenedAt: daysAgo(5),
    hasReply: false,
    messageCount: 1,
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-linear-001',
    notes: '',
  },
  {
    threadId: 'thread-vercel-001',
    company: 'Vercel',
    contactName: 'Guillermo Rauch',
    contactEmail: 'rauch@vercel.com',
    domain: 'vercel.com',
    subject: 'DX Engineer - Vercel',
    snippet: 'Hi Guillermo, I have deployed hundreds of Next.js apps on Vercel and want to help shape the DX...',
    status: 'Interviewing',
    sentDate: daysAgo(9),
    latestActivity: daysAgo(3),
    isOpened: true,
    openCount: 6,
    lastOpenedAt: daysAgo(3),
    hasReply: true,
    repliedAt: daysAgo(7),
    messageCount: 5,
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-vercel-001',
    notes: 'Two rounds done, final panel coming up',
  },
  {
    threadId: 'thread-notion-001',
    company: 'Notion',
    contactName: 'Ivan Zhao',
    contactEmail: 'ivan@notion.so',
    domain: 'notion.so',
    subject: 'Full-Stack Engineer - Notion',
    snippet: 'Hi Ivan, Notion has changed how I work every day. I would love to contribute to the editor team...',
    status: 'Sent',
    sentDate: daysAgo(1),
    latestActivity: daysAgo(1),
    isOpened: false,
    openCount: 0,
    hasReply: false,
    messageCount: 1,
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-notion-001',
    notes: '',
  },
];

for (const update of existingUpdates) {
  const { id, ...data } = update;
  const existing = await prisma.outreach.findUnique({ where: { id } });
  if (existing) {
    await prisma.outreach.update({ where: { id }, data });
    console.log(`Updated: id=${id} (${data.company || data.contactName})`);
  } else {
    await prisma.outreach.create({ data: { ...data, userId: USER_ID } });
    console.log(`Created: ${data.company || data.contactName}`);
  }
}

for (const outreach of newOutreaches) {
  const existing = await prisma.outreach.findUnique({ where: { threadId: outreach.threadId } });
  if (existing) {
    await prisma.outreach.update({ where: { threadId: outreach.threadId }, data: outreach });
    console.log(`Updated existing: ${outreach.company}`);
  } else {
    await prisma.outreach.create({ data: { ...outreach, userId: USER_ID } });
    console.log(`Created: ${outreach.company}`);
  }
}

await prisma.$disconnect();
console.log('\nDone! Database seeded with demo data.');
