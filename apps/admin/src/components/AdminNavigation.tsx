import React from 'react';
import {adminHash,navigationItems,sections} from '../navigation';

type Props={view:string;navigate:(id:string)=>void};

export function AdminSectionLinks({view,navigate}:Props){
 return <>{sections.map(section=><div className="side-group" key={section.label}>
  <span className="side-label">{section.label}</span>
  {section.items.map(item=><a href={adminHash(item.id)} title={item.label} key={item.id} aria-current={view===item.id?'page':undefined} className={`side-link ${view===item.id?'selected':''}`} onClick={event=>{
   if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey){event.preventDefault();navigate(item.id)}
  }}><item.icon size={18}/><span>{item.label}</span>{view===item.id&&<span className="side-active-dot"/>}</a>)}
 </div>)}</>;
}

export function AdminSectionJump({view,navigate}:Props){
 return <label className="section-jump"><span>All sections <small>{navigationItems.length}</small></span><select aria-label="All admin sections" value={view} onChange={event=>navigate(event.target.value)}>
  {sections.map(section=><optgroup key={section.label} label={section.label}>{section.items.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}
 </select></label>;
}
