import { type ReactNode, type FormEvent, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  useGetCurrentUser, useGetDashboard, useListDocuments, useCreateDocument, useGetDocument,
  useUpdateDocument, useDeleteDocument, useCompleteDocumentUpload, useGrantDocumentPermission,
  useRevokeDocumentPermission, useGetAdminOverview, useListAuditEvents, useVerifyAuditChain,
  useListUsers, useChangeUserRole, useSearchUsers, getGetDocumentQueryKey,
  getSearchUsersQueryKey, getVerifyAuditChainQueryKey,
} from '@workspace/api-client-react';
import type { AuditEvent, Document, DocumentGrant, User } from '@workspace/api-client-react';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Check, CircleAlert,
  FileArchive, FileCheck2, FilePlus2, FileText, Fingerprint, FolderLock,
  KeyRound, LoaderCircle, LockKeyhole, LogOut, Menu, Search, ShieldCheck,
  ShieldEllipsis, UploadCloud, Users, X,
} from 'lucide-react';
import { Toaster as SonnerToaster, toast } from 'sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#356f62', colorForeground: '#26313a', colorMutedForeground: '#6d7779',
    colorDanger: '#b8493e', colorBackground: '#fbfaf6', colorInput: '#f4f1e9',
    colorInputForeground: '#26313a', colorNeutral: '#d9d5ca', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbfaf6] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#26313a] font-semibold', headerSubtitle: 'text-[#6d7779]',
    socialButtonsBlockButtonText: 'text-[#26313a]', formFieldLabel: 'text-[#38464c]',
    footerActionLink: 'text-[#356f62]', footerActionText: 'text-[#6d7779]', dividerText: 'text-[#737a78]',
    identityPreviewEditButton: 'text-[#356f62]', formFieldSuccessText: 'text-[#356f62]', alertText: 'text-[#813d36]',
    logoBox: 'rounded-xl', logoImage: 'rounded-xl', socialButtonsBlockButton: 'border-[#d9d5ca] bg-[#fbfaf6]',
    formButtonPrimary: 'bg-[#356f62] hover:bg-[#285a4e] text-white',
    formFieldInput: 'border-[#d9d5ca] bg-[#f4f1e9] text-[#26313a]',
    footerAction: 'text-[#6d7779]', dividerLine: 'bg-[#d9d5ca]', alert: 'border-[#d9b9b2]',
    otpCodeFieldInput: 'border-[#d9d5ca] bg-[#f4f1e9]', formFieldRow: 'text-[#38464c]', main: 'text-[#26313a]',
  },
};

const button = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50';
const btnPrimary = `${button} bg-primary text-primary-foreground shadow-xs hover:brightness-95 active:scale-[.98]`;
const btnSecondary = `${button} border border-border bg-card text-foreground hover:bg-muted`;
const btnQuiet = 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground';
const field = 'w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/75 focus:border-primary focus:ring-2 focus:ring-primary/15';

function Loading({ label = 'Loading secure workspace' }: { label?: string }) {
  return <div className="grid min-h-[38vh] place-items-center"><div className="w-full max-w-sm space-y-3 px-6">
    <div className="h-3 w-28 animate-pulse rounded bg-muted" /><div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
    <div className="h-24 animate-pulse rounded-xl border border-border bg-card" /><div className="text-xs text-muted-foreground">{label}</div>
  </div></div>;
}
function ErrorState({ message, retry }: { message?: string; retry?: () => void }) {
  return <div className="rounded-xl border border-[#e4c9c3] bg-[#fbf0ed] p-5 text-sm text-[#773e36]" role="alert">
    <div className="flex items-start gap-3"><CircleAlert size={18} /><div className="flex-1"><strong className="block">We couldn't load this view</strong><span className="mt-1 block opacity-80">{message || 'The service did not return a response. Your access has not changed.'}</span></div>
      {retry && <button className={btnSecondary} onClick={retry} data-testid="button-retry">Retry</button>}</div>
  </div>;
}
function Empty({ icon: Icon, title, copy, action }: { icon: typeof FileText; title: string; copy: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card/55 px-6 py-14 text-center">
    <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent/60 text-primary"><Icon size={22} /></div>
    <h3 className="font-display text-xl font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{copy}</p>{action && <div className="mt-6">{action}</div>}
  </div>;
}
function PageHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.17em] text-primary"><span className="h-px w-5 bg-primary" />{eyebrow}</div>
      <h1 className="font-display text-3xl font-bold tracking-[-.035em] sm:text-[2.55rem]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy}</p></div>{action}
  </div>;
}
function Brand({ compact = false, lightOnDark = false }: { compact?: boolean; lightOnDark?: boolean }) {
  return <Link href="/" className="group inline-flex items-center gap-3" data-testid="link-brand">
    <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#d6ae63] text-[#26313a] shadow-sm transition-transform group-hover:rotate-[-5deg]"><ShieldCheck size={21} strokeWidth={2.4} /></span>
    {!compact && <span className="leading-tight"><strong className={`font-display text-lg tracking-[-.04em] ${lightOnDark?'text-sidebar-foreground':'text-foreground'}`}>TrustVault</strong><span className={`mt-0.5 block font-mono text-[9px] uppercase tracking-[.17em] ${lightOnDark?'text-sidebar-foreground/55':'text-muted-foreground'}`}>Private by design</span></span>}
  </Link>;
}
function SiteShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: user, isLoading } = useGetCurrentUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [
    { href: '/dashboard', label: 'Overview', icon: Activity },
    { href: '/documents', label: 'Documents', icon: FolderLock },
    { href: '/admin', label: 'Administration', icon: ShieldEllipsis },
  ];
  const visibleNav = nav.filter(({ href }) => href !== '/admin' || user?.role === 'admin');
  return <div className="min-h-[100dvh] bg-background md:flex">
    <aside className="hidden w-[252px] shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="px-6 pb-8 pt-7"><Brand lightOnDark /></div>
      <div className="px-4"><div className="mb-3 px-3 font-mono text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/45">Workspace</div>
        <nav className="space-y-1">{visibleNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition ${location === href || (href === '/documents' && location.startsWith('/documents/')) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`nav-${label.toLowerCase()}`}><Icon size={17} strokeWidth={1.8} />{label}</Link>)}</nav>
      </div>
      <div className="mt-auto px-4 pb-5"><div className="mb-4 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold"><span className="h-1.5 w-1.5 rounded-full bg-[#91c6a6]" />Access is document-scoped</div>
        <p className="mt-2 text-[10px] leading-4 text-sidebar-foreground/55">Every grant is explicit. Each request is checked again when it matters.</p>
      </div><button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-sidebar-accent" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d6ae63]/20 text-xs font-semibold text-[#e6c889]">{user?.name?.slice(0, 1) || '·'}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{isLoading ? 'Loading profile' : user?.name || user?.email || 'Account'}</span><span className="block truncate text-[10px] text-sidebar-foreground/50">{user?.email || 'TrustVault member'}</span></span><LogOut size={15} className="text-sidebar-foreground/50" /></button></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:hidden">
        <Brand compact /><span className="font-display text-lg font-bold">TrustVault</span><button className={btnQuiet} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation" data-testid="button-mobile-menu">{mobileOpen ? <X size={19} /> : <Menu size={19} />}</button>
      </header>
      {mobileOpen && <div className="fixed inset-x-0 top-[66px] z-20 border-b border-border bg-sidebar p-4 text-sidebar-foreground md:hidden"><nav className="grid gap-1">{visibleNav.map(({ href, label, icon: Icon }) => <Link onClick={() => setMobileOpen(false)} href={href} key={href} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-sidebar-accent"><Icon size={17} />{label}<ArrowRight className="ml-auto" size={15} /></Link>)}</nav><button className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-sidebar-accent" onClick={() => signOut({ redirectUrl: basePath || '/' })}><LogOut size={17} />Sign out</button></div>}
      <main className="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-8 sm:px-8 sm:pt-10 lg:px-12"><div className="page-enter">{children}</div>
        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5 text-[10px] text-muted-foreground"><span>TRUSTVAULT · A considered record of access.</span><span className="inline-flex items-center gap-1.5 font-mono"><Fingerprint size={12} /> VERIFIED REQUEST PATH</span></footer>
      </main>
    </div>
  </div>;
}
function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}
function Home() {
  const { isLoaded, isSignedIn } = useUser();
  if (isLoaded && isSignedIn) return <Redirect to="/dashboard" />;
  return <main className="grain min-h-[100dvh] overflow-hidden bg-[#f6f3ea] text-[#28343b]">
    <header className="relative z-10 mx-auto flex max-w-[1320px] items-center justify-between px-6 py-6 sm:px-10">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#d6ae63]"><ShieldCheck size={21} /></span><span className="font-display text-xl font-extrabold tracking-[-.05em]">TrustVault</span></div>
      <div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-[#34444a] hover:bg-[#eae5d8]" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="rounded-lg bg-[#356f62] px-4 py-2.5 text-sm font-semibold text-[#fbfaf6] transition hover:bg-[#285a4e]" data-testid="link-sign-up">Create account <ArrowRight className="ml-1 inline" size={15} /></Link></div>
    </header>
    <section className="relative mx-auto grid min-h-[calc(100dvh-88px)] max-w-[1320px] items-center gap-14 px-6 pb-16 pt-8 sm:px-10 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
      <div className="relative z-10 max-w-[660px]">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#d6d2c6] bg-[#fbfaf6]/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.14em] text-[#53776c]"><span className="h-1.5 w-1.5 rounded-full bg-[#4d8b70]" />Clear access. Verifiable history.</div>
        <h1 className="font-display text-[clamp(3.4rem,7vw,6.8rem)] font-extrabold leading-[.96] tracking-[-.075em]">Confidential,<br /><span className="text-[#356f62]">not mysterious.</span></h1>
        <p className="mt-7 max-w-[510px] text-base leading-7 text-[#687479] sm:text-lg sm:leading-8">Share sensitive files with the people who need them—and keep a clear, verifiable record of who reached each one.</p>
        <div className="mt-9 flex flex-wrap items-center gap-3"><Link href="/sign-up" className="inline-flex items-center gap-2 rounded-lg bg-[#356f62] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(53,111,98,.18)] transition hover:-translate-y-0.5 hover:bg-[#285a4e]" data-testid="link-start"><LockKeyhole size={16} />Set up your workspace<ArrowRight size={15} /></Link><a href="#how-it-works" className="rounded-lg px-4 py-3 text-sm font-semibold text-[#536267] hover:bg-[#eae5d8]">How access works</a></div>
        <div className="mt-12 flex items-center gap-6 border-t border-[#dcd7ca] pt-5 text-[11px] text-[#748080]"><span className="inline-flex items-center gap-2"><KeyRound size={14} className="text-[#356f62]" />Explicit document grants</span><span className="inline-flex items-center gap-2"><Fingerprint size={14} className="text-[#356f62]" />Append-only activity</span></div>
      </div>
      <div className="relative mx-auto w-full max-w-[550px]">
        <div className="absolute -right-[10%] -top-[13%] h-[320px] w-[320px] rounded-full border border-[#d8d1c1]/70" /><div className="absolute -right-[3%] -top-[6%] h-[270px] w-[270px] rounded-full border border-[#d8d1c1]/60" />
        <div className="relative rounded-[28px] border border-[#d9d3c6] bg-[#fbfaf6] p-5 shadow-[0_30px_90px_rgba(54,64,64,.12)] sm:p-7">
          <div className="flex items-center justify-between border-b border-[#e8e4da] pb-5"><div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-[#8a8e88]">The access model</div><div className="mt-1 font-display text-lg font-bold">One file. Explicit boundaries.</div></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6efe8] text-[#356f62]"><ShieldCheck size={20} /></div></div>
          <div className="my-5 rounded-xl bg-[#f1eee5] p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-[#dfd7c4] text-[#5d635c]"><FileText size={19} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">A confidential document</div><div className="mt-1 text-[10px] text-[#7e8580]">Access is assigned here—not inherited</div></div><span className="rounded-full bg-[#e4efe6] px-2.5 py-1 font-mono text-[9px] uppercase text-[#356f62]">Scoped</span></div><div className="mt-4 flex items-center justify-between border-t border-[#ddd8cd] pt-3 text-[10px] text-[#79817d]"><span>Reach requires a named grant</span><KeyRound size={13} className="text-[#648073]" /></div></div>
          <div className="space-y-2.5">{[['01', 'Grant by name', 'A specific person, read or edit'], ['02', 'Re-check at request', 'Current permission decides'], ['03', 'Link the activity', 'An event joins the chain']].map(([index,title,copy]) => <div key={index} className="flex items-center gap-3 rounded-lg border border-[#e8e4da] bg-[#fdfcf9] px-3 py-3"><span className="font-mono text-[9px] text-[#9a9a90]">{index}</span><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e6efe8] text-[#356f62]">{index==='01'?<Users size={14}/>:index==='02'?<LockKeyhole size={14}/>:<Fingerprint size={14}/>}</span><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{title}</div><div className="mt-0.5 text-[10px] text-[#828781]">{copy}</div></div><ArrowRight size={13} className="text-[#97a19b]"/></div>)}</div>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#dfe6dd] bg-[#f0f5ef] px-3 py-2.5 text-[10px] text-[#577064]"><BadgeCheck size={15} />Activity records are linked and verifiable.</div>
        </div>
        <div className="absolute -bottom-6 -left-7 hidden rounded-xl border border-[#ded9cd] bg-[#fbfaf6] px-4 py-3 shadow-lg sm:block"><div className="flex items-center gap-2 text-[10px] text-[#76807b]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f3e6c8] text-[#8f6d32]"><KeyRound size={14} /></span><span><strong className="block text-[#34434a]">Document-level control</strong>not broad folder access</span></div></div>
      </div>
    </section>
    <section id="how-it-works" className="border-t border-[#e1dccf] bg-[#efece3] px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-[1200px]"><div className="max-w-2xl"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-[#648073]">A deliberate model</div><h2 className="mt-3 font-display text-4xl font-bold tracking-[-.05em] sm:text-5xl">Trust is easier to earn<br />when the rules are visible.</h2></div>
        <div className="mt-12 grid gap-0 md:grid-cols-3">{[{n:'01',icon:KeyRound,title:'Name the people',copy:'Grant a registered person read or edit access to one document. Nothing is inherited from a broad team folder.'},{n:'02',icon:ArrowDownToLine,title:'Check every request',copy:'Downloads pass through the server, which checks current access again on every request.'},{n:'03',icon:Fingerprint,title:'Keep the evidence',copy:'Access and administration events are recorded in a linked audit trail that admins can verify.'}].map(({n,icon:Icon,title,copy})=><article key={n} className="border-t border-[#d6d1c5] py-7 md:mr-8 md:py-8"><div className="flex items-center justify-between"><span className="font-mono text-xs text-[#8d918a]">{n}</span><Icon size={19} className="text-[#54786b]" /></div><h3 className="mt-6 font-display text-xl font-bold">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#707b7a]">{copy}</p></article>)}</div>
      </div>
    </section>
    <footer className="bg-[#28343b] px-6 py-9 text-[#e8e4d8] sm:px-10"><div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><ShieldCheck size={18} className="text-[#d6ae63]" /><span className="font-display font-bold">TrustVault</span></div><span className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9ca7a4]">Confidential, accountable, clear.</span><Link href="/sign-up" className="text-sm font-semibold text-[#e6c889] hover:text-white">Create your account <ArrowRight className="ml-1 inline" size={14} /></Link></div></footer>
  </main>;
}
function HomeRedirect() { return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><Home /></Show></>; }
function SignInPage() { return <div className="grain flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10"><div className="w-full"><div className="mb-6 text-center"><Brand /></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>; }
function SignUpPage() { return <div className="grain flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10"><div className="w-full"><div className="mb-6 text-center"><Brand /></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>; }
function ClerkCacheClear() {
  const { addListener } = useClerk(); const qc = useQueryClient();
  useEffect(() => { let prior: string | null | undefined; const unsub = addListener(({ user }) => { const current = user?.id ?? null; if (prior !== undefined && prior !== current) qc.clear(); prior = current; }); return unsub; }, [addListener, qc]);
  return null;
}
function AuthRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your secure workspace' } }, signUp: { start: { title: 'Create your account', subtitle: 'A clearer way to share confidential files' } } }}
    routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkCacheClear /><TooltipProvider><Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/dashboard"><Protected><SiteShell><DashboardPage /></SiteShell></Protected></Route>
      <Route path="/documents"><Protected><SiteShell><DocumentsPage /></SiteShell></Protected></Route>
      <Route path="/documents/:id"><Protected><SiteShell><DocumentPage /></SiteShell></Protected></Route>
      <Route path="/admin"><Protected><SiteShell><AdminPage /></SiteShell></Protected></Route>
      <Route component={NotFound} />
    </Switch><Toaster /><SonnerToaster position="top-right" richColors closeButton /></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}
function App() { return <WouterRouter base={basePath}><AuthRoutes /></WouterRouter>; }

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number | string; detail: string; icon: typeof FileText }) {
  return <div className="rounded-xl border border-card-border bg-card p-5 shadow-xs transition-transform duration-200 hover:-translate-y-0.5">
    <div className="flex items-start justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/55 text-primary"><Icon size={17} /></span></div>
    <div className="mt-5 font-display text-3xl font-bold tracking-[-.04em]">{value}</div><div className="mt-1.5 text-[11px] text-muted-foreground">{detail}</div>
  </div>;
}
function EventRow({ event, showHash = false }: { event: AuditEvent; showHash?: boolean }) {
  const good = event.outcome === 'allowed' || event.outcome === 'recorded';
  return <div className="flex gap-3 border-b border-border/70 py-4 last:border-0">
    <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${good ? 'bg-[#e7f0e8] text-[#477c5b]' : 'bg-[#f7e9e5] text-[#aa5b49]'}`}><Activity size={15} /></div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-xs font-semibold">{event.actorName || event.actorEmail}</strong><span className="text-[10px] text-muted-foreground">{event.action}</span><span className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase ${good ? 'bg-[#e7f0e8] text-[#477c5b]' : 'bg-[#f7e9e5] text-[#aa5b49]'}`}>{event.outcome}</span></div>
      <div className="mt-1 text-[11px] text-muted-foreground">{event.documentName || 'Workspace event'}{event.details ? ` · ${event.details}` : ''}</div>
      {showHash && <div className="mt-2 flex flex-wrap gap-3 font-mono text-[9px] text-muted-foreground"><span>prev {event.previousHash.slice(0, 14)}…</span><span>event {event.eventHash.slice(0, 14)}…</span></div>}</div>
    <time className="shrink-0 pt-1 font-mono text-[9px] text-muted-foreground">{new Date(event.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
  </div>;
}
function DashboardPage() {
  const { data: user, isLoading: userLoading } = useGetCurrentUser();
  const { data, isLoading, error, refetch } = useGetDashboard();
  if (isLoading || userLoading) return <Loading />;
  if (error || !data) return <ErrorState retry={() => { void refetch(); }} />;
  const first = user?.name?.split(' ')[0];
  return <><PageHeading eyebrow="Your workspace" title={`Good to see you${first ? `, ${first}` : ''}.`} copy="A quiet overview of the documents in your reach and the activity recorded around them." action={<Link className={btnPrimary} href="/documents"><FilePlus2 size={16} />Browse documents</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Documents you own" value={data.ownedCount} detail="Stored under your ownership" icon={FolderLock} /><Metric label="Shared with you" value={data.sharedWithMeCount} detail="Named access granted to you" icon={Users} /><Metric label="Recent downloads" value={data.recentDownloads} detail="Downloads attributed to your access" icon={ArrowDownToLine} /><Metric label="Recorded activity" value={data.recentActivity.length} detail="Events visible in this summary" icon={Fingerprint} /></div>
    <div className="mt-7 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
      <section className="rounded-xl border border-card-border bg-card p-5 sm:p-6"><div className="mb-1 flex items-center justify-between"><div><div className="font-mono text-[9px] uppercase tracking-[.17em] text-primary">Latest signals</div><h2 className="mt-1 font-display text-xl font-bold">Recent activity</h2></div><Link href="/documents" className={btnQuiet}>Documents <ArrowRight size={14} /></Link></div>
        {data.recentActivity.length ? <div className="mt-3">{data.recentActivity.map((e) => <EventRow key={e.id} event={e} />)}</div> : <div className="py-8"><Empty icon={Activity} title="No activity yet" copy="When a document is accessed, its verified activity will appear here." /></div>}
      </section>
      <aside className="rounded-xl border border-[#d9dfd5] bg-[#edf2eb] p-5 sm:p-6"><div className="flex items-center gap-2 text-primary"><ShieldCheck size={18} /><span className="font-mono text-[9px] uppercase tracking-[.16em]">The TrustVault model</span></div><h2 className="mt-5 font-display text-2xl font-bold tracking-[-.04em]">Access belongs to a document.</h2><p className="mt-3 text-sm leading-6 text-[#62726d]">A role never silently unlocks someone else's files. Access is granted by name, on a document-by-document basis.</p>
        <div className="mt-6 space-y-3 border-t border-[#d5dfd4] pt-5"><div className="flex gap-3 text-xs"><KeyRound size={15} className="shrink-0 text-primary" /><span><strong>Specific people.</strong> Read or edit, granted individually.</span></div><div className="flex gap-3 text-xs"><Fingerprint size={15} className="shrink-0 text-primary" /><span><strong>Traceable events.</strong> Each request leaves a record.</span></div></div>
      </aside>
    </div>
  </>;
}
function DocumentCard({ doc }: { doc: Document }) {
  return <Link href={`/documents/${doc.id}`} className="group block rounded-xl border border-card-border bg-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm" data-testid={`document-card-${doc.id}`}>
    <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/55 text-primary"><FileText size={19} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold group-hover:text-primary">{doc.name}</div><div className="mt-1 truncate text-[11px] text-muted-foreground">{doc.category} <span className="px-1">·</span>{formatBytes(doc.size)}</div></div><span className={`rounded-full px-2 py-1 font-mono text-[9px] uppercase ${doc.state === 'active' ? 'bg-[#e7f0e8] text-[#477c5b]' : 'bg-[#f4ebd7] text-[#927439]'}`}>{doc.state}</span></div>
    <p className="mt-4 line-clamp-2 min-h-[40px] text-xs leading-5 text-muted-foreground">{doc.description || 'No description added.'}</p>
    <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3 text-[10px] text-muted-foreground"><span>{doc.isOwner ? 'Owned by you' : `Shared by ${doc.ownerName}`}</span><span className="inline-flex items-center gap-1 text-primary">{doc.canEdit ? 'Can edit' : 'Read access'}<ArrowRight size={12} /></span></div>
  </Link>;
}
function formatBytes(size: number) { if (!size) return '—'; const units = ['B', 'KB', 'MB', 'GB']; const i = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3); return `${(size / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`; }
function DocumentsPage() {
  const [q, setQ] = useState(''); const [category, setCategory] = useState(''); const [owner, setOwner] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: currentUser } = useGetCurrentUser();
  const canUpload = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const params = useMemo(() => ({ ...(q.trim() ? { q: q.trim() } : {}), ...(category.trim() ? { category: category.trim() } : {}), ...(owner.trim() ? { owner: owner.trim() } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }), [q, category, owner, from, to]);
  const { data, isLoading, error, refetch } = useListDocuments(params);
  return <><PageHeading eyebrow="Document library" title="Documents" copy="Search the files you own or have been explicitly given access to." action={canUpload ? <button className={btnPrimary} onClick={() => setUploadOpen(true)} data-testid="button-upload-document"><UploadCloud size={16} />Upload document</button> : undefined} />
    <section className="mb-6 rounded-xl border border-card-border bg-card p-3.5 sm:p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_1fr_1fr_150px_150px]"><label className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><input value={q} onChange={e=>setQ(e.target.value)} className={`${field} pl-9`} placeholder="Search names and descriptions" aria-label="Search documents" data-testid="input-document-search" /></label><input value={category} onChange={e=>setCategory(e.target.value)} className={field} placeholder="Filter by category" aria-label="Filter by category" data-testid="input-category-filter" /><input value={owner} onChange={e=>setOwner(e.target.value)} className={field} placeholder="Filter by owner" aria-label="Filter by owner" data-testid="input-owner-filter" /><label className="block text-[10px] font-semibold text-muted-foreground">Created from<input type="date" value={from} max={to || undefined} onChange={e=>setFrom(e.target.value)} className={`${field} mt-1`} aria-label="Created from date" data-testid="input-document-from" /></label><label className="block text-[10px] font-semibold text-muted-foreground">Created through<input type="date" value={to} min={from || undefined} onChange={e=>setTo(e.target.value)} className={`${field} mt-1`} aria-label="Created through date" data-testid="input-document-to" /></label></div>
      <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3 text-[10px] text-muted-foreground"><span>Results are limited to documents you can access.</span>{(q || category || owner || from || to) && <button className="font-semibold text-primary hover:underline" onClick={()=>{setQ('');setCategory('');setOwner('');setFrom('');setTo('');}} data-testid="button-clear-filters">Clear filters</button>}</div></section>
    {isLoading ? <DocumentSkeleton /> : error ? <ErrorState retry={()=>{void refetch();}} /> : !data?.length ? <Empty icon={Search} title={q || category || owner || from || to ? 'No matching documents' : 'Nothing shared with you yet'} copy={q || category || owner || from || to ? 'Try another search or remove a filter. Results only include documents available to your account.' : 'Your document library will show the files you own and those shared directly with you.'} action={!q && !category && !owner && !from && !to && canUpload ? <button className={btnPrimary} onClick={()=>setUploadOpen(true)}><UploadCloud size={16} />Upload a document</button> : undefined} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.map(doc=><DocumentCard key={doc.id} doc={doc} />)}</div>}
    {uploadOpen && <UploadModal close={()=>setUploadOpen(false)} />}
  </>;
}
function DocumentSkeleton() { return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0,1,2,3,4,5].map(i=><div key={i} className="h-[176px] animate-pulse rounded-xl border border-border bg-card p-4"><div className="h-10 w-full rounded bg-muted" /><div className="mt-6 h-8 rounded bg-muted" /><div className="mt-5 h-5 rounded bg-muted" /></div>)}</div>; }
function Modal({ title, description, close, children }: { title: string; description: string; close: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-40 grid place-items-center bg-[#1e2a2e]/55 p-4 backdrop-blur-[3px]" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section role="dialog" aria-modal="true" aria-label={title} className="page-enter w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-5"><div><h2 className="font-display text-2xl font-bold">{title}</h2><p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p></div><button className={btnQuiet} onClick={close} aria-label="Close dialog"><X size={17} /></button></div><div className="mt-6">{children}</div></section></div>;
}
function UploadModal({ close }: { close: () => void }) {
  const create = useCreateDocument(); const complete = useCompleteDocumentUpload(); const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null); const [name, setName] = useState(''); const [category, setCategory] = useState(''); const [description, setDescription] = useState('');
  const [progress, setProgress] = useState(0); const [phase, setPhase] = useState<'idle'|'uploading'|'completing'|'failed'|'done'>('idle'); const [failure, setFailure] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!file || !name.trim() || !category.trim()) return;
    if (file.size > 25 * 1024 * 1024) { setFailure('Files must be 25 MB or smaller.'); setPhase('failed'); return; }
    setPhase('uploading'); setFailure('');
    try {
      const uploaded = await create.mutateAsync({ data: { name: name.trim(), category: category.trim(), description: description.trim(), size: file.size, contentType: file.type || 'application/octet-stream' } });
      await new Promise<void>((resolve,reject)=>{
        const xhr = new XMLHttpRequest(); xhr.open('PUT', uploaded.uploadURL); xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = ev => { if (ev.lengthComputable) setProgress(Math.round(ev.loaded / ev.total * 100)); };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload was declined (${xhr.status}).`));
        xhr.onerror = () => reject(new Error('The secure upload connection was interrupted.'));
        xhr.onabort = () => reject(new Error('Upload was canceled.'));
        xhr.send(file);
      });
      setPhase('completing'); await complete.mutateAsync({ documentId: uploaded.document.id }); await qc.invalidateQueries(); setPhase('done'); toast.success('Document uploaded and validated.');
    } catch (err) { setFailure(err instanceof Error ? err.message : 'Upload could not be completed.'); setPhase('failed'); }
  }
  return <Modal title="Add a document" description="Files stay inaccessible until the server validates the completed upload." close={close}>
    {phase === 'done' ? <div className="py-2"><div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#e7f0e8] text-[#477c5b]"><Check size={22} /></div><p className="text-sm">Your document is active and available according to its current access grants.</p><button className={`${btnPrimary} mt-6`} onClick={close}>Done</button></div> :
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-xs font-semibold">File<input className={`${field} mt-2`} type="file" onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);if(f&&!name)setName(f.name);}} data-testid="input-upload-file" required /></label>
      {file && <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"><FileText size={15} />{file.name}<span className="ml-auto">{formatBytes(file.size)}</span></div>}
      <label className="block text-xs font-semibold">Document name<input className={`${field} mt-2`} value={name} onChange={e=>setName(e.target.value)} maxLength={255} required data-testid="input-upload-name" /></label>
      <label className="block text-xs font-semibold">Category<input className={`${field} mt-2`} value={category} onChange={e=>setCategory(e.target.value)} maxLength={80} placeholder="Legal, Finance, Operations…" required data-testid="input-upload-category" /></label>
      <label className="block text-xs font-semibold">Description <span className="font-normal text-muted-foreground">optional</span><textarea className={`${field} mt-2 min-h-20 resize-y`} value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000} data-testid="input-upload-description" /></label>
      {phase === 'uploading' && <div><div className="flex justify-between text-[11px] text-muted-foreground"><span>Uploading encrypted destination</span><span>{progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{width:`${progress}%`}} /></div></div>}
      {phase === 'completing' && <div className="flex items-center gap-2 rounded-lg bg-accent/50 p-3 text-xs text-primary"><LoaderCircle className="animate-spin" size={15} />Validating file and activating document…</div>}
      {phase === 'failed' && <div className="rounded-lg bg-[#fbf0ed] p-3 text-xs text-[#803e35]" role="alert">{failure}<p className="mt-1">If a pending upload was created, it remains inaccessible until completion succeeds.</p></div>}
      <div className="flex justify-end gap-2 pt-2"><button type="button" className={btnSecondary} onClick={close}>Cancel</button><button className={btnPrimary} disabled={!file || !name.trim() || !category.trim() || phase === 'uploading' || phase === 'completing'} data-testid="button-submit-upload">{phase === 'uploading' ? <><LoaderCircle className="animate-spin" size={15} />Uploading</> : phase === 'completing' ? 'Validating…' : phase === 'failed' ? 'Try again' : <><UploadCloud size={15} />Upload securely</>}</button></div>
    </form>}
  </Modal>;
}

function DocumentPage() {
  const [pathname, setLocation] = useLocation();
  const id = Number(pathname.split('/').at(-1));
  const validId = Number.isInteger(id) && id > 0;
  const query = useGetDocument(id, { query: { enabled: validId, queryKey: getGetDocumentQueryKey(id) } });
  const doc = query.data?.document;
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'read'|'edit'>('read');
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const update = useUpdateDocument({ mutation: { onSuccess: async () => { await qc.invalidateQueries(); setEdit(false); toast.success('Document details saved.'); }, onError: () => toast.error('Changes could not be saved.') } });
  const remove = useDeleteDocument({ mutation: { onSuccess: async () => { await qc.invalidateQueries(); toast.success('Document deleted.'); setLocation('/documents'); }, onError: () => toast.error('Document could not be deleted.') } });
  const grant = useGrantDocumentPermission({ mutation: { onSuccess: async () => { await qc.invalidateQueries({ queryKey: getGetDocumentQueryKey(id) }); setEmail(''); setSearch(''); toast.success('Named access granted.'); }, onError: () => toast.error('Access could not be granted. Check the registered account email.') } });
  const revoke = useRevokeDocumentPermission({ mutation: { onSuccess: async () => { await qc.invalidateQueries({ queryKey: getGetDocumentQueryKey(id) }); toast.success('Access revoked.'); }, onError: () => toast.error('Access could not be revoked.') } });
  const results = useSearchUsers({ q: search }, { query: { enabled: search.trim().length >= 2, queryKey: getSearchUsersQueryKey({ q: search }) } });
  useEffect(() => { if (doc) { setName(doc.name); setCategory(doc.category); setDescription(doc.description || ''); } }, [doc?.id]);
  if (!validId) return <ErrorState message="This document address is not valid." />;
  if (query.isLoading) return <Loading label="Checking document access" />;
  if (query.error || !doc) return <><Link href="/documents" className={btnQuiet}><ArrowLeft size={15} />All documents</Link><div className="mt-5"><ErrorState message="This document is unavailable or your access may have changed. The server remains authoritative." retry={()=>{void query.refetch();}} /></div></>;
  const permissions = query.data?.permissions || [];
  function save(e: FormEvent) { e.preventDefault(); update.mutate({ documentId: id, data: { name: name.trim(), category: category.trim(), description: description.trim() } }); }
  function giveAccess(e: FormEvent) { e.preventDefault(); if (!email.trim()) return; grant.mutate({ documentId: id, data: { email: email.trim(), permission } }); }
  return <><Link href="/documents" className={`${btnQuiet} mb-6`}><ArrowLeft size={15} />All documents</Link>
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <PageHeading eyebrow={doc.category} title={doc.name} copy={doc.description || 'No description provided.'} action={<a href={`/api/documents/${id}/download`} className={btnPrimary} data-testid="link-authorized-download"><ArrowDownToLine size={16} />Download</a>} />
        <section className="rounded-xl border border-card-border bg-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4"><div className="flex items-center gap-2"><FileCheck2 size={18} className="text-primary" /><h2 className="font-display text-lg font-bold">Document record</h2></div>
          <span className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase ${doc.state === 'active' ? 'bg-[#e7f0e8] text-[#477c5b]' : 'bg-[#f4ebd7] text-[#927439]'}`}>{doc.state}</span></div>
          {edit ? <form className="mt-5 space-y-4" onSubmit={save}><label className="block text-xs font-semibold">Name<input className={`${field} mt-2`} value={name} onChange={e=>setName(e.target.value)} required maxLength={255} /></label><label className="block text-xs font-semibold">Category<input className={`${field} mt-2`} value={category} onChange={e=>setCategory(e.target.value)} required maxLength={80} /></label><label className="block text-xs font-semibold">Description<textarea className={`${field} mt-2 min-h-24`} value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000} /></label><div className="flex justify-end gap-2"><button className={btnSecondary} type="button" onClick={()=>{setEdit(false);setName(doc.name);setCategory(doc.category);setDescription(doc.description||'');}}>Cancel</button><button className={btnPrimary} disabled={update.isPending}>{update.isPending?'Saving…':'Save changes'}</button></div></form> :
          <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">{[['Owner', doc.ownerName], ['Owner email', doc.ownerEmail], ['File size', formatBytes(doc.size)], ['Content type', doc.contentType], ['Created', new Date(doc.createdAt).toLocaleString()], ['Last updated', new Date(doc.updatedAt).toLocaleString()], ['Your access', doc.isOwner ? 'Owner' : doc.canEdit ? 'Edit grant' : 'Read grant']].map(([k,v])=><div key={k}><div className="font-mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">{k}</div><div className="mt-1.5 break-words text-sm font-medium">{v}</div></div>)}</div>}
          <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-border/70 pt-4">{doc.canEdit && !edit && <button className={btnSecondary} onClick={()=>setEdit(true)} data-testid="button-edit-document">Edit metadata</button>}{doc.isOwner && <button className={`${button} border border-[#e4c9c3] text-[#984e43] hover:bg-[#fbf0ed]`} onClick={()=>{if(window.confirm(`Permanently delete "${doc.name}"?`)) remove.mutate({documentId:id});}} disabled={remove.isPending} data-testid="button-delete-document">{remove.isPending?'Deleting…':'Delete document'}</button>}</div>
        </section>
        <section className="mt-5 rounded-xl border border-card-border bg-card p-5 sm:p-6"><div className="flex items-center gap-2"><Fingerprint size={17} className="text-primary" /><div><div className="font-mono text-[9px] uppercase tracking-[.16em] text-primary">Activity provenance</div><h2 className="font-display text-lg font-bold">Authorized at request time</h2></div></div><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">The download link points to the TrustVault server. That route re-checks your live access before returning bytes and records the outcome in the audit trail.</p></section>
      </div>
      <aside className="space-y-5">
        <section className="rounded-xl border border-card-border bg-card p-5"><div className="flex items-center gap-2"><Users size={17} className="text-primary" /><h2 className="font-display text-lg font-bold">Named access</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Only people listed here have a document-specific grant.</p>
          {doc.isOwner ? <form className="mt-5 space-y-3 border-t border-border/70 pt-4" onSubmit={giveAccess}><label className="block text-xs font-semibold">Registered person<input className={`${field} mt-2`} value={email} onChange={e=>{setEmail(e.target.value);setSearch(e.target.value);}} type="email" placeholder="person@company.com" required data-testid="input-grant-email" /></label>
            {search.trim().length >= 2 && <div className="max-h-28 overflow-y-auto rounded-lg border border-border bg-background p-2 text-[10px] text-muted-foreground">{results.isLoading?'Searching registered accounts…':results.data?.length ? results.data.map(person=><button type="button" key={person.id} className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted" onClick={()=>{setEmail(person.email);setSearch('');}}>{person.name} · {person.email}</button>) : 'No matching registered accounts. The email must belong to a TrustVault user.'}</div>}
            <label className="block text-xs font-semibold">Permission<select className={`${field} mt-2`} value={permission} onChange={e=>setPermission(e.target.value as 'read'|'edit')} data-testid="select-grant-permission"><option value="read">Read only</option><option value="edit">Read and edit</option></select></label>
            <button className={`${btnPrimary} w-full`} disabled={grant.isPending} data-testid="button-grant-access">{grant.isPending?'Granting…':'Grant named access'}</button>
          </form> : <div className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Only the document owner can add or revoke named access.</div>}
          <div className="mt-4 space-y-2">{permissions.length ? permissions.map((p: DocumentGrant)=><div key={p.id} className="flex items-center gap-3 rounded-lg border border-border/75 p-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-primary">{p.name?.slice(0,1)||p.email.slice(0,1)}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{p.name}</div><div className="truncate text-[10px] text-muted-foreground">{p.email}</div></div><span className="rounded bg-muted px-2 py-1 font-mono text-[9px] uppercase">{p.permission}</span>{doc.isOwner&&<button className="rounded p-1.5 text-muted-foreground hover:bg-[#fbf0ed] hover:text-[#984e43]" onClick={()=>{if(window.confirm(`Revoke ${p.name}'s access?`)) revoke.mutate({documentId:id,permissionId:p.id});}} aria-label={`Revoke access for ${p.name}`} data-testid={`button-revoke-${p.id}`}><X size={14}/></button>}</div>) : <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No additional people have access.</div>}</div>
        </section>
        <div className="rounded-xl border border-[#d9dfd5] bg-[#edf2eb] p-4 text-xs leading-5 text-[#5f7066]"><LockKeyhole size={16} className="mb-2 text-primary" />Revoking access applies to the next server-checked request. Already delivered copies cannot be recalled.</div>
      </aside>
    </div>
  </>;
}

function AdminPage() {
  const [actor, setActor] = useState(''); const [action, setAction] = useState('');
  const auditParams = useMemo(()=>({ ...(actor.trim()?{actor:actor.trim()}:{}), ...(action.trim()?{action:action.trim()}:{}), limit:100 }),[actor,action]);
  const overview = useGetAdminOverview();
  const audit = useListAuditEvents(auditParams);
  const users = useListUsers();
  const verify = useVerifyAuditChain({ query: { enabled: false, queryKey: getVerifyAuditChainQueryKey() } });
  const qc = useQueryClient();
  const changeRole = useChangeUserRole({ mutation: { onSuccess: async () => { await qc.invalidateQueries(); toast.success('Account role updated.'); }, onError: () => toast.error('Role could not be changed.') } });
  return <><PageHeading eyebrow="System administration" title="Administration" copy="System-wide counts, a searchable verification trail, and registered account roles." />
    {overview.isLoading ? <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(i=><div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />)}</div> : overview.error || !overview.data ? <div className="mb-5"><ErrorState message="System overview is unavailable. Administrative access is checked by the server." retry={()=>{void overview.refetch();}} /></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Documents" value={overview.data.documentCount} detail="System-wide metadata count" icon={FileArchive} /><Metric label="Registered accounts" value={overview.data.userCount} detail="TrustVault identities" icon={Users} /><Metric label="Denied attempts · 24h" value={overview.data.deniedAttempts24h} detail="Recorded denied requests" icon={CircleAlert} /><Metric label="Audit chain" value={overview.data.auditChainValid?'Intact':'Attention'} detail={overview.data.auditChainValid?'Latest system check':'Verification may be needed'} icon={overview.data.auditChainValid?ShieldCheck:CircleAlert} /></div>}
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <section className="rounded-xl border border-card-border bg-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono text-[9px] uppercase tracking-[.16em] text-primary">Append-only record</div><h2 className="mt-1 font-display text-xl font-bold">Audit events</h2><p className="mt-1 text-xs text-muted-foreground">Allowed, denied, and administrative actions.</p></div><button className={btnSecondary} onClick={()=>void verify.refetch()} disabled={verify.isFetching} data-testid="button-verify-chain">{verify.isFetching?<LoaderCircle className="animate-spin" size={15}/>:<ShieldCheck size={15}/>}Verify hash chain</button></div>
        {verify.data&&<div className={`mt-4 flex items-start gap-3 rounded-lg p-3 text-xs ${verify.data.valid?'bg-[#e7f0e8] text-[#477c5b]':'bg-[#fbf0ed] text-[#984e43]'}`} role="status"><BadgeCheck size={16}/><span><strong>{verify.data.valid?'Chain verified':'Chain verification failed'}</strong><br/>{verify.data.checkedEvents} events checked{verify.data.firstInvalidEventId?` · first invalid event #${verify.data.firstInvalidEventId}`:''}</span></div>}
        <div className="mt-5 grid gap-2 sm:grid-cols-2"><label className="relative"><Search size={14} className="absolute left-3 top-3 text-muted-foreground"/><input className={`${field} pl-9`} value={actor} onChange={e=>setActor(e.target.value)} placeholder="Search actor" aria-label="Search audit actor" data-testid="input-audit-actor"/></label><input className={field} value={action} onChange={e=>setAction(e.target.value)} placeholder="Filter action" aria-label="Filter audit action" data-testid="input-audit-action"/></div>
        {audit.isLoading?<div className="mt-5 space-y-4">{[1,2,3].map(i=><div key={i} className="h-14 animate-pulse rounded-lg bg-muted"/> )}</div>:audit.error?<div className="mt-5"><ErrorState message="Audit events could not be loaded." retry={()=>{void audit.refetch();}}/></div>:audit.data?.length?<div className="mt-3">{audit.data.map(e=><EventRow key={e.id} event={e} showHash/>)}</div>:<div className="mt-5"><Empty icon={Fingerprint} title="No matching events" copy="Adjust your search filters to inspect another part of the record."/></div>}
      </section>
      <section className="rounded-xl border border-card-border bg-card p-5 sm:p-6"><div className="flex items-center gap-2"><Users size={17} className="text-primary"/><div><div className="font-mono text-[9px] uppercase tracking-[.16em] text-primary">Registered identities</div><h2 className="font-display text-xl font-bold">Role management</h2></div></div><p className="mt-2 text-xs leading-5 text-muted-foreground">A role does not grant access to existing documents. Document grants remain individually scoped.</p>
        {users.isLoading?<div className="mt-5 space-y-3">{[1,2,3].map(i=><div className="h-14 animate-pulse rounded-lg bg-muted" key={i}/>)}</div>:users.error?<div className="mt-5"><ErrorState message="Registered accounts are not available." retry={()=>{void users.refetch();}}/></div>:users.data?.length?<div className="mt-5 space-y-2">{users.data.map((person:User)=><div key={person.id} className="flex items-center gap-3 rounded-lg border border-border/75 p-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary">{person.name?.slice(0,1)||person.email.slice(0,1)}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{person.name}</div><div className="truncate text-[10px] text-muted-foreground">{person.email}</div></div><select aria-label={`Role for ${person.email}`} className="max-w-[110px] rounded-lg border border-input bg-background px-2 py-2 text-[10px]" value={person.role} disabled={changeRole.isPending} onChange={e=>changeRole.mutate({userId:person.id,data:{role:e.target.value as 'admin'|'owner'|'viewer'}})} data-testid={`select-role-${person.id}`}><option value="admin">Admin</option><option value="owner">Owner</option><option value="viewer">Viewer</option></select></div>)}</div>:<div className="mt-5"><Empty icon={Users} title="No accounts to show" copy="Registered TrustVault accounts will appear here."/></div>}
      </section>
    </div>
  </>;
}

export default App;
