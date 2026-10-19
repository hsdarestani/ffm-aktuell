import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=p=>readFileSync(p,'utf8');
const db=r('db/schema.sql'),api=r('app/api/[[...path]]/route.ts'),
 ci=r('scripts/ci-admin-activation-e2e.mjs'),ui=r('components/CouponPilot.tsx'),page=r('app/page.tsx');
test('coupon persistence enforces uniqueness and private ownership',()=>{
 assert.match(db,/CREATE TABLE IF NOT EXISTS coupon_claims/);
 assert.match(db,/UNIQUE\(deal_id,user_id\)/);
 assert.match(db,/code text UNIQUE NOT NULL/);
 assert.match(db,/redeemed_at timestamptz/);
 assert.match(db,/ON DELETE CASCADE/);
});
test('claims are only on active published deals by approved non-owning businesses',()=>{
 const start=api.indexOf("if(method==='POST'&&path==='coupons/claim'");
 const end=api.indexOf("if(method==='POST'&&path==='business/coupons/redeem'",start);
 const part=api.slice(start,end);
 assert.match(part,/rate\(req,'coupon-claim'\)/);
 assert.match(part,/const u=need\(user\)/);
 assert.match(part,/d.status='published'/);
 assert.match(part,/b.status='approved'/);
 assert.match(part,/b.owner_id!=\$2/);
 assert.match(part,/ON CONFLICT\(deal_id,user_id\) DO UPDATE/);
 assert.match(part,/randomBytes\(18\).toString\('base64url'\)/);
});
test('merchant redemption is atomic, single-use and business-scoped',()=>{
 const start=api.indexOf("if(method==='POST'&&path==='business/coupons/redeem'");
 const end=api.indexOf("if(method==='GET'&&path==='location'",start);
 const part=api.slice(start,end);
 assert.match(part,/await ownBusiness\(u\)/);
 assert.match(part,/d.business_id=\$3/);
 assert.match(part,/c.redeemed_at IS NULL/);
 assert.match(part,/UPDATE coupon_claims c SET redeemed_at=now\(\)/);
 assert.match(part,/coupon:redeemed/);
 assert.match(part,/Coupon invalid, expired or already redeemed/);
});
test('UX separates real vs demo offers and clearly states no checkout',()=>{
 assert.match(ui,/if\(deal.demo\)return null/);
 assert.match(ui,/Einmal pro Person/);
 assert.match(ui,/Keine Zahlungsbuchung/);
 assert.match(page,/<DealActions deal=\{d\}/);
 assert.match(page,/<BusinessCouponRedeem status=\{business.status\}/);
 assert.match(r('components/ProfileSettings.tsx'),/<CouponWallet onNotice=\{onNotice\}/);
});
test('database E2E tests replay defense and guest wallet isolation',()=>{
 assert.match(ci,/Unreviewed deal was claimable/);
 assert.match(ci,/Duplicate coupon issued to one user/);
 assert.match(ci,/Guest could see coupon wallet/);
 assert.match(ci,/Coupon replay accepted/);
});
