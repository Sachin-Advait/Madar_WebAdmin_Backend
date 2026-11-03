import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {adminHash,navigationItems,parseAdminHash,sections} from '../src/navigation.ts';

// Render the actual shared sidebar/dropdown components without a browser or DOM shim.
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/components/AdminNavigation.tsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',jsx:'automatic'});
const module={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {AdminSectionLinks,AdminSectionJump}=module.exports;

test('every admin destination has a valid bookmark and is distinct',()=>{
 assert.equal(navigationItems.length,38);
 assert.equal(new Set(navigationItems.map(item=>item.id)).size,38);
 for(const item of navigationItems)assert.equal(parseAdminHash(adminHash(item.id)),item.id);
});

test('content and master bookmarks preserve collection names and reject unknown routes',()=>{
 assert.equal(parseAdminHash('#/content%3AqueueTickets'),'content:queueTickets');
 assert.equal(parseAdminHash('#/master:providers'),'master:providers');
 for(const hash of ['','#','#/missing','#/%E0%A4%A','#/https://example.com','#/content:unknown','#/master:unknown'])assert.equal(parseAdminHash(hash),'overview');
 assert.equal(adminHash('not-an-admin-section'),'#/overview');
});

test('the always-available section picker contains all groups and destinations',()=>{
 const html=renderToStaticMarkup(React.createElement(AdminSectionJump,{view:'reports',navigate:()=>{}}));
 assert.match(html,/aria-label="All admin sections"/);
 assert.equal((html.match(/<option /g)||[]).length,38);
 assert.equal((html.match(/<optgroup /g)||[]).length,sections.length);
 assert.match(html,/<option value="reports" selected="">Reports &amp; Insights<\/option>/);
 for(const item of navigationItems)assert.ok(html.includes(`value="${item.id}"`));
});

test('sidebar and drawer render real links with one accessible current page',()=>{
 const html=renderToStaticMarkup(React.createElement(AdminSectionLinks,{view:'content:videos',navigate:()=>{}}));
 assert.equal((html.match(/<a /g)||[]).length,38);
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.match(html,/href="#\/content%3Avideos" title="Video Library" aria-current="page"/);
 for(const item of navigationItems)assert.ok(html.includes(`href="${adminHash(item.id)}"`));
});
