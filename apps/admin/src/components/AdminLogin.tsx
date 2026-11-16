import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, Pause, Play } from 'lucide-react';
import entrance from '../assets/admin-login/entrance.webp';
import courtyard from '../assets/admin-login/courtyard.webp';
import corridor from '../assets/admin-login/corridor.webp';
import logo from '../assets/admin-login/madar.webp';
import './admin-login.css';
import './glass-login.css';

const images = [entrance, courtyard, corridor];
const copy = {
  en: {
    brand: 'Madar', studio: 'Admin Studio', access: 'Administrator access', title: 'Welcome back.',
    description: 'Sign in to manage your content and TV screens.',
    email: 'Email address', password: 'Password', emailHint: 'name@organisation.om', passHint: 'Enter your password',
    show: 'Show password', hide: 'Hide password', submit: 'Sign in', busy: 'Signing in…',
    gallery: 'Omani architecture', titles: ['The main entrance', 'The courtyard', 'The gallery corridor'],
    pause: 'Pause animation', play: 'Play animation', next: 'Next image', previous: 'Previous image',
    fund: 'Military & Security Services Pension Fund', language: 'Switch to Arabic',
    error: 'Sign-in failed. Please try again.',
  },
  ar: {
    brand: 'مدار', studio: 'لوحة الإدارة', access: 'دخول المسؤولين', title: 'أهلاً بعودتك',
    description: 'سجّل الدخول لإدارة المحتوى وشاشات العرض.',
    email: 'البريد الإلكتروني', password: 'كلمة المرور', emailHint: 'name@organisation.om', passHint: 'أدخل كلمة المرور',
    show: 'إظهار كلمة المرور', hide: 'إخفاء كلمة المرور', submit: 'تسجيل الدخول', busy: 'جارٍ تسجيل الدخول…',
    gallery: 'العمارة العُمانية', titles: ['المدخل الرئيسي', 'الفناء الداخلي', 'الرواق الداخلي'],
    pause: 'إيقاف الحركة مؤقتاً', play: 'تشغيل الحركة', next: 'الصورة التالية', previous: 'الصورة السابقة',
    fund: 'صندوق تقاعد الأجهزة العسكرية والأمنية', language: 'Switch to English',
    error: 'تعذّر تسجيل الدخول. يرجى المحاولة مرة أخرى.',
  },
};
type Language = keyof typeof copy;
type Props = {
  onSubmit: (email: string, password: string) => Promise<void>;
  initialEmail?: string;
  onExploreDemo?: () => void;
};

export default function AdminLogin({ onSubmit, initialEmail = '', onExploreDemo }: Props) {
  const lang = 'en' as Language;
  const [slide, setSlide] = useState(0);
  const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const t = copy[lang];
  const arabic = lang === 'ar';
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setMotion(!media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (!motion) return;
    const timer = window.setTimeout(() => selectSlide(1), 12000);
    return () => window.clearTimeout(timer);
  }, [slide, motion]);
  function selectSlide(offset: number) {
    setSlide((slide + offset + images.length) % images.length);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await onSubmit(email.trim(), password);
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t.error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="ih-login" lang={lang} dir={arabic ? 'rtl' : 'ltr'}>
      <header className="ih-login__header">
        <div className="ih-login__identity">
          <span className="ih-login__symbol"><img src={logo} alt="MADAR" /></span>
          <span className="ih-login__wordmark"><strong>{t.brand}</strong><small>{t.studio}</small></span>
        </div>
      </header>
      <div className="ih-login__layout">
        <section className="ih-login__auth" aria-labelledby="ih-login-title">
          <div className="ih-login__formwrap">
            <div className="ih-login__access"><KeyRound size={16} aria-hidden="true" />{t.access}</div>
            <h1 id="ih-login-title">{t.title}</h1>
            <p className="ih-login__description">{t.description}</p>
            <form onSubmit={submit} className="ih-login__form">
              <label htmlFor="ih-login-email">{t.email}</label>
              <div className="ih-login__field">
                <Mail aria-hidden="true" size={19} /><input id="ih-login-email" type="email" name="email" autoComplete="username"
                  dir="ltr" placeholder={t.emailHint} value={email} onChange={event => setEmail(event.target.value)} required />
              </div>
              <label htmlFor="ih-login-password">{t.password}</label>
              <div className="ih-login__field">
                <LockKeyhole aria-hidden="true" size={19} /><input id="ih-login-password" name="password"
                  type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder={t.passHint}
                  value={password} onChange={event => setPassword(event.target.value)} required />
                <button type="button" className="ih-login__eye" aria-label={visible ? t.hide : t.show}
                  aria-pressed={visible} onClick={() => setVisible(value => !value)}>
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {error && <p className="ih-login__error" role="alert">{error}</p>}
              <button type="submit" className="ih-login__submit" disabled={busy}>
                {busy ? t.busy : t.submit}{arabic ? <ArrowLeft size={19}/> : <ArrowRight size={19}/>}
              </button>
            </form>
            {onExploreDemo && <button className="ih-login__explore" type="button" onClick={onExploreDemo}>
              {arabic ? 'استكشف النسخة التجريبية' : 'Explore demo'} {arabic ? <ArrowLeft size={15}/> : <ArrowRight size={15}/>}
            </button>}
          </div>
        </section>
        <figure className="ih-login__gallery" aria-label={t.gallery} data-motion={motion ? 'on' : 'off'}>
          {images.map((src, index) => <div className={'ih-login__picture'+(index === slide ? ' ih-login__picture--active' : '')}
            key={src} aria-hidden="true"><img src={src} alt="" fetchPriority={index === 0 ? 'high' : 'auto'}/></div>)}
          <button type="button" className="ih-login__motion" aria-label={motion ? t.pause : t.play}
            title={motion ? t.pause : t.play} onClick={() => setMotion(value => !value)}>
            {motion ? <Pause size={16}/> : <Play size={16}/>}
          </button>
          <figcaption className="ih-login__caption">
            <div className="ih-login__gallery-kicker"><span></span>{t.gallery}</div>
            <h2>{t.titles[slide]}</h2>
            <div className="ih-login__gallery-nav">
              <span className="ih-login__index" dir="ltr">0{slide + 1}<i> / </i>03</span>
              <div className="ih-login__tracks" aria-hidden="true">{images.map((_, i) => <span key={i} className={i===slide?'selected':''}/>)}</div>
              <button type="button" aria-label={t.previous} onClick={() => selectSlide(-1)}>{arabic ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>}</button>
              <button type="button" aria-label={t.next} onClick={() => selectSlide(1)}>{arabic ? <ChevronLeft size={18}/> : <ChevronRight size={18}/>}</button>
            </div>
          </figcaption>
        </figure>
      </div>
      <footer className="ih-login__footer">{t.fund}</footer>
    </main>
  );
}
