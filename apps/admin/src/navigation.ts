import {Activity,Airplay,BellRing,Newspaper,BookOpen,CalendarDays,Clapperboard,Clock3,History,Images,Landmark,LayoutDashboard,LayoutTemplate,MapPinned,Megaphone,Monitor,Radio,Settings,ShieldAlert,SlidersHorizontal,SquareStack,Ticket,Users,Wifi} from 'lucide-react';

export const sections=[
 {label:'WORKSPACE',items:[{id:'overview',label:'Overview',icon:LayoutDashboard}]},
 {label:'TV EXPERIENCE',items:[{id:'page-builder',label:'Page Builder',icon:LayoutTemplate},{id:'dashboard-builder',label:'Dashboard Designer',icon:SquareStack},{id:'preview',label:'TV Preview',icon:Monitor},{id:'profiles',label:'Display Profiles',icon:SlidersHorizontal},{id:'screens',label:'Screens & Devices',icon:Airplay},{id:'delivery',label:'Screen Delivery',icon:Activity},{id:'schedules',label:'Screen Schedules',icon:CalendarDays}]},
 {label:'ALERTS & NEWS',items:[{id:'notifications',label:'Send TV Notification',icon:BellRing},{id:'breaking-news',label:'Breaking News',icon:Newspaper}]},
 {label:'CONTENT MANAGEMENT',items:[{id:'assets',label:'Media Assets',icon:Images},{id:'content:channels',label:'Live TV Channels',icon:Wifi},{id:'content:videos',label:'Video Library',icon:Clapperboard},{id:'content:replay',label:'Catch-Up Sources',icon:History},{id:'content:radio',label:'Radio Stations',icon:Radio},{id:'content:featured',label:'Featured Banners',icon:Images},{id:'content:notices',label:'Official Notices',icon:Megaphone},{id:'content:events',label:'Events & Training',icon:CalendarDays},{id:'content:services',label:'Services & Info',icon:Landmark},{id:'content:visitor',label:'Visitor Guide',icon:MapPinned},{id:'content:media',label:'Media Highlights',icon:Images},{id:'content:alerts',label:'Priority Alerts',icon:ShieldAlert}]},
 {label:'MASTER DATA',items:['buildings','locations','departments','groups','rooms','counters','categories','languages','providers'].map(k=>({id:'master:'+k,label:({groups:'Device groups',providers:'Media providers'} as any)[k]||k[0].toUpperCase()+k.slice(1),icon:Landmark}))},
 {label:'CONTENT OPERATIONS',items:[{id:'content-fields',label:'Content Fields',icon:SlidersHorizontal},{id:'content:programmes',label:'Programme Guide',icon:Clock3},{id:'content:meetings',label:'Meeting Schedule',icon:CalendarDays},{id:'content:queueTickets',label:'Queue Tickets',icon:Ticket},{id:'reports',label:'Reports & Insights',icon:Activity}]},
 {label:'ADMINISTRATION',items:[{id:'users',label:'Users & Roles',icon:Users},{id:'audit',label:'Audit Trail',icon:BookOpen},{id:'integrations',label:'Integrations',icon:Wifi},{id:'settings',label:'System Settings',icon:Settings}]},
];

export const navigationItems=sections.flatMap(section=>section.items);
const routeIds=new Set(navigationItems.map(item=>item.id));

/** Only known internal destinations can be restored from a bookmark. */
export function parseAdminHash(hash:string):string {
 try {
  const id=decodeURIComponent(hash.replace(/^#\/?/,''));
  return routeIds.has(id)?id:'overview';
 } catch {return 'overview'}
}
export function adminHash(id:string):string {
 return '#/'+encodeURIComponent(routeIds.has(id)?id:'overview');
}
