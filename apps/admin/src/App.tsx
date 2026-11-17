import React,{useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {CircleUserRound,LogOut,Menu,PanelLeftClose,PanelLeftOpen,X} from 'lucide-react';
import {navigationItems,parseAdminHash,adminHash} from './navigation';
import {AdminSectionLinks,AdminSectionJump} from './components/AdminNavigation';
import {API,getToken,setToken} from './api';
import type {Catalog,User} from './types';
import {ErrorBox,Loading} from './components/Common';
import AdminLogin from './components/AdminLogin';
import Overview from './pages/ControlRoom';
const Masters=React.lazy(()=>import('./pages/Masters'));
const ContentFields=React.lazy(()=>import('./pages/ContentFields'));
const Reports=React.lazy(()=>import('./pages/Reports'));
const PageBuilder=React.lazy(()=>import('./pages/PageBuilder'));
const DashboardBuilder=React.lazy(()=>import('./pages/DashboardBuilder'));
const Preview=React.lazy(()=>import('./pages/TVPreview'));
const ContentManager=React.lazy(()=>import('./pages/ContentManager'));
const Banners=React.lazy(()=>import('./pages/Banners'));
const Notifications=React.lazy(()=>import('./pages/Notifications'));
const BreakingNews=React.lazy(()=>import('./pages/BreakingNews'));
const PhoneRemotes=React.lazy(()=>import('./pages/PhoneRemotes'));
import Profiles from './pages/Profiles';
import Screens from './pages/Screens';
import Schedules from './pages/Schedules';
import Access from './pages/Access';
import Delivery from './pages/Delivery';
import Integrations from './pages/Integrations';
import SettingsPage from './pages/Settings';



function Login({onLogin}: {onLogin: (user: User) => void}) {
  return <AdminLogin initialEmail="admin@madar.local" onSubmit={async (email, password) => {
    const result = await API.login(email, password);
    setToken(result.token);
    onLogin(result.user);
  }} />;
}

function Studio({user,onLogout}:{user:User;onLogout:()=>void}){
 const [view,setView]=useState(()=>parseAdminHash(window.location.hash));
 const [collapsed,setCollapsed]=useState(false);
 const [drawerOpen,setDrawerOpen]=useState(false);
 const [compact,setCompact]=useState(()=>window.matchMedia('(max-width: 900px)').matches);
 const drawerRef=useRef<HTMLDialogElement>(null);
 const menuButtonRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const onHashChange=()=>{setView(parseAdminHash(window.location.hash));setDrawerOpen(false)};
  window.addEventListener('hashchange',onHashChange);
  return ()=>window.removeEventListener('hashchange',onHashChange);
 },[]);
 useEffect(()=>{
  const media=window.matchMedia('(max-width: 900px)');
  const onResize=()=>{setCompact(media.matches);if(!media.matches)setDrawerOpen(false)};
  media.addEventListener('change',onResize);
  return ()=>media.removeEventListener('change',onResize);
 },[]);
 useEffect(()=>{
  const dialog=drawerRef.current;
  if(drawerOpen&&!dialog?.open)dialog?.showModal();
  if(!drawerOpen&&dialog?.open)dialog.close();
 },[drawerOpen]);
 function navigate(id:string){
  const hash=adminHash(id);
  setView(parseAdminHash(hash));
  setDrawerOpen(false);
  if(window.location.hash!==hash)window.location.hash=hash;
 }


 const {data:catalog,isLoading,error}=useQuery({queryKey:['catalog'],queryFn:API.catalog});
 const viewName=navigationItems.find(i=>i.id===view)?.label||view;
 useEffect(()=>{document.title=`${viewName} | MADAR Admin`;window.scrollTo({top:0,left:0,behavior:'auto'})},[viewName]);
 if(isLoading)return <Loading/>;
 if(error||!catalog)return <ErrorBox error={error||'Catalog could not be loaded'}/>;
 function render(){
  if(view.startsWith('master:'))return <Masters key={view} kind={view.slice(7)} catalog={catalog!} role={user.role}/>;
  if(view==='content-fields')return <ContentFields catalog={catalog!} role={user.role}/>;
  if(view==='reports')return <Reports role={user.role}/>;
  if(view==='notifications')return <Notifications role={user.role}/>;
  if(view==='breaking-news')return <BreakingNews role={user.role}/>;
  if(view==='phone-remotes')return <PhoneRemotes role={user.role}/>;
  if(view==='delivery')return <Delivery role={user.role}/>;
  if(view==='integrations')return <Integrations role={user.role}/>;
  if(view==='assets')return <Integrations assets role={user.role}/>;
  if(view==='overview')return <Overview navigate={navigate}/>;
  if(view==='page-builder')return <PageBuilder catalog={catalog!} role={user.role}/>;
  if(view==='dashboard-builder')return <DashboardBuilder catalog={catalog!} role={user.role}/>;
  if(view==='preview')return <Preview catalog={catalog!}/>;
  if(view==='profiles')return <Profiles catalog={catalog!} role={user.role}/>;
  if(view==='screens')return <Screens catalog={catalog!} role={user.role}/>;
  if(view==='schedules')return <Schedules catalog={catalog!} role={user.role}/>;
  if(view==='content:featured')return <Banners catalog={catalog!} role={user.role}/>;
  if(view.startsWith('content:'))return <ContentManager key={view} kind={view.slice(8)} catalog={catalog!} role={user.role}/>;
  if(view==='users'||view==='audit')return <Access mode={view} role={user.role}/>;
  if(view==='settings')return <SettingsPage role={user.role}/>;
  return <Overview navigate={navigate}/>;
 }
 return <div className={`app-shell ${collapsed?'is-collapsed':''}`}>
  <aside id="studio-sidebar" className="sidebar" aria-label="Admin navigation"><div className="sidebar-brand"><span className="brand-symbol"><img className="brand-logo" src="/madar-logo.webp" alt="MADAR"/></span><div className="brand-caption">Madar <small>ADMIN STUDIO</small></div></div><nav className="sidebar-scroll" aria-label="Admin sections"><AdminSectionLinks view={view} navigate={navigate}/></nav><div className="sidebar-bottom"><div className="admin-avatar"><CircleUserRound size={22}/></div><div className="user-info"><strong>{user.name}</strong><span>{user.role.toUpperCase()}</span></div><button title="Sign out" className="icon-btn" onClick={onLogout}><LogOut size={17}/></button></div></aside>
  <dialog ref={drawerRef} id="studio-navigation-dialog" className="navigation-dialog" aria-labelledby="studio-navigation-title" onCancel={()=>setDrawerOpen(false)} onClose={()=>{setDrawerOpen(false);menuButtonRef.current?.focus()}} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)setDrawerOpen(false)}}}>
   <div className="navigation-drawer-content"><div className="navigation-drawer-heading"><div><strong id="studio-navigation-title">All admin sections</strong><small>{navigationItems.length} connected workspaces</small></div><button className="icon-btn" aria-label="Close navigation" autoFocus onClick={()=>setDrawerOpen(false)}><X size={21}/></button></div><nav className="sidebar-scroll" aria-label="Mobile admin sections"><AdminSectionLinks view={view} navigate={navigate}/></nav><button className="navigation-signout" onClick={()=>{setDrawerOpen(false);onLogout()}}><LogOut size={17}/> Sign out</button></div>
  </dialog>
  <div className="app-main"><header className="topbar"><div className="crumb"><button ref={menuButtonRef} className="icon-btn navigation-toggle" title={compact?'Open all admin sections':collapsed?'Expand sidebar':'Collapse sidebar'} aria-label={compact?'Open all admin sections':collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={compact?drawerOpen:!collapsed} aria-controls={compact?'studio-navigation-dialog':'studio-sidebar'} onClick={()=>compact?setDrawerOpen(true):setCollapsed(!collapsed)}>{compact?<Menu size={21}/>:collapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button><span className="crumb-brand">MADAR</span><span className="crumb-sep">/</span><strong>{viewName}</strong></div><div className="top-actions"><AdminSectionJump view={view} navigate={navigate}/><span className="environment-badge">{import.meta.env.VITE_SHOWCASE==='1'?'BROWSER PREVIEW · SAMPLE DATA':'EXPERIENCE STUDIO'}</span><div className="top-avatar" title={user.name}>{user.name[0]}</div></div></header><main className="content-area" id="studio-page">{import.meta.env.VITE_SHOWCASE==='1'&&<div className="showcase-note"><strong>{navigationItems.length} interactive admin sections.</strong> Choose a page using All sections or the navigation menu. Changes stay in this browser; real devices and integrations require the included backend.</div>}<React.Suspense fallback={<Loading/>}>{render()}</React.Suspense></main></div>
 </div>

}

export default function App(){
 const [tokenAvailable,setTokenAvailable]=useState(!!getToken());
 const [loggedUser,setLoggedUser]=useState<User|null>(null);
 const queryClient=useQueryClient();
 const {data:remembered,error,isLoading}=useQuery({queryKey:['current-user',tokenAvailable],queryFn:API.me,enabled:tokenAvailable,retry:false});
 const user=loggedUser||remembered;
 function logout(){API.logout().catch(()=>{});setToken('');setTokenAvailable(false);setLoggedUser(null);queryClient.clear()}
 if(tokenAvailable&&isLoading)return <Loading/>;
 if(!tokenAvailable||!user){if(tokenAvailable&&error)setToken('');return <Login onLogin={u=>{setLoggedUser(u);setTokenAvailable(true)}}/>}
 return <Studio user={user} onLogout={logout}/>;
}
