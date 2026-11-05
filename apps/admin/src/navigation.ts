import {BellRing,Boxes,Building2,CalendarClock,CalendarRange,ChartColumn,Clapperboard,CloudDownload,ConciergeBell,DoorOpen,Eye,FolderOpen,GalleryHorizontal,GraduationCap,History,Landmark,Languages,LayoutDashboard,PencilRuler,LayoutTemplate,MapPin,MapPinned,Megaphone,MonitorCog,MonitorSmartphone,Network,Newspaper,Plug,Presentation,Radio,Satellite,ScrollText,Settings,ShieldAlert,Sparkles,Tags,TextCursorInput,Ticket,Tv,UserCog,type LucideIcon} from 'lucide-react';

// One distinct icon per master data list.
const masterIcons:Record<string,LucideIcon>={buildings:Building2,locations:MapPin,departments:Network,groups:Boxes,rooms:DoorOpen,counters:ConciergeBell,categories:Tags,languages:Languages,providers:Satellite};

export const sections=[
 {label:'WORKSPACE',items:[{id:'overview',label:'Overview',icon:LayoutDashboard}]},
 {label:'TV EXPERIENCE',items:[{id:'page-builder',label:'Page Builder',icon:LayoutTemplate},{id:'dashboard-builder',label:'Dashboard Designer',icon:PencilRuler},{id:'preview',label:'TV Preview',icon:Eye},{id:'profiles',label:'Display Profiles',icon:MonitorCog},{id:'screens',label:'Screens & Devices',icon:MonitorSmartphone},{id:'delivery',label:'Screen Delivery',icon:CloudDownload},{id:'schedules',label:'Screen Schedules',icon:CalendarClock}]},
 {label:'ALERTS & NEWS',items:[{id:'notifications',label:'Send TV Notification',icon:BellRing},{id:'breaking-news',label:'Breaking News',icon:Newspaper}]},
 {label:'CONTENT MANAGEMENT',items:[{id:'assets',label:'Media Assets',icon:FolderOpen},{id:'content:channels',label:'Live TV Channels',icon:Tv},{id:'content:videos',label:'Video Library',icon:Clapperboard},{id:'content:replay',label:'Catch-Up Sources',icon:History},{id:'content:radio',label:'Radio Stations',icon:Radio},{id:'content:featured',label:'Featured Banners',icon:GalleryHorizontal},{id:'content:notices',label:'Official Notices',icon:Megaphone},{id:'content:events',label:'Events & Training',icon:GraduationCap},{id:'content:services',label:'Services & Info',icon:Landmark},{id:'content:visitor',label:'Visitor Guide',icon:MapPinned},{id:'content:media',label:'Media Highlights',icon:Sparkles},{id:'content:alerts',label:'Priority Alerts',icon:ShieldAlert}]},
 {label:'MASTER DATA',items:['buildings','locations','departments','groups','rooms','counters','categories','languages','providers'].map(k=>({id:'master:'+k,label:({groups:'Device groups',providers:'Media providers'} as any)[k]||k[0].toUpperCase()+k.slice(1),icon:masterIcons[k]}))},
 {label:'CONTENT OPERATIONS',items:[{id:'content-fields',label:'Content Fields',icon:TextCursorInput},{id:'content:programmes',label:'Programme Guide',icon:CalendarRange},{id:'content:meetings',label:'Meeting Schedule',icon:Presentation},{id:'content:queueTickets',label:'Queue Tickets',icon:Ticket},{id:'reports',label:'Reports & Insights',icon:ChartColumn}]},
 {label:'ADMINISTRATION',items:[{id:'users',label:'Users & Roles',icon:UserCog},{id:'audit',label:'Audit Trail',icon:ScrollText},{id:'integrations',label:'Integrations',icon:Plug},{id:'settings',label:'System Settings',icon:Settings}]},
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
