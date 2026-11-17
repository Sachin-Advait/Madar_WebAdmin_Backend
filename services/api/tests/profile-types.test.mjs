import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {seed} from '../src/seed.mjs';
import {one,rows} from '../src/db.mjs';
import {profileTypes,validateProfile} from '../src/domain.mjs';

test('Queue Management and Meeting Management profiles exist on new and existing installs',async()=>{
 assert.ok(profileTypes.includes('queue')&&profileTypes.includes('meeting'));
 const db=await openDatabase({memory:true});
 try{
  await seed(db,{demo:true});
  const names=Object.fromEntries((await rows(db,'SELECT id,payload FROM profiles')).map(r=>[r.id,r.payload.name]));
  assert.equal(names.queue,'Queue Management');assert.equal(names.meeting,'Meeting Management');
  // An install from before these types gets them once on the next start.
  await db.query("DELETE FROM releases WHERE profile_id IN ('queue','meeting')");
  await db.query("DELETE FROM layout_versions WHERE profile_id IN ('queue','meeting')");
  await db.query("DELETE FROM layouts WHERE profile_id IN ('queue','meeting')");
  await db.query("DELETE FROM profiles WHERE id IN ('queue','meeting')");
  await db.query("DELETE FROM settings WHERE key='profileTypesQueueMeeting'");
  await seed(db,{demo:true});
  const queue=await one(db,"SELECT payload FROM profiles WHERE id='queue'");
  assert.equal(queue.payload.profileType,'queue');
  assert.ok(await one(db,"SELECT version FROM releases WHERE profile_id='meeting'"));
  // Once added, a profile the admin deletes later is not brought back.
  await db.query("DELETE FROM releases WHERE profile_id='queue'");await db.query("DELETE FROM layout_versions WHERE profile_id='queue'");await db.query("DELETE FROM layouts WHERE profile_id='queue'");await db.query("DELETE FROM profiles WHERE id='queue'");
  await seed(db,{demo:true});
  assert.ok(!await one(db,"SELECT id FROM profiles WHERE id='queue'"));
  validateProfile({...queue.payload});
 }finally{await db.close()}
});
